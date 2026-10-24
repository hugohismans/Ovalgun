/**
 * GameSession : colle côté client entre la simulation, les entrées et le rendu.
 *
 *  - Boucle à pas fixe (TICK_DT, `FixedStepLoop` de loop.ts, pure et testée) ; au plus
 *    MAX_CATCHUP_TICKS ticks rattrapés par frame (au-delà, le retard est abandonné).
 *  - État précédent (cloneState AVANT step) + état courant => interpolation par le rendu,
 *    alpha = accumulateur / TICK_DT.
 *  - Entrées : humain (joueur 0) via InputManager, une fois par tick ; autres joueurs via
 *    `inputProviders` (contrat `InputProvider` de src/bots : (état, id) -> entrée) ou entrée neutre
 *    qui garde leur visée.
 *  - Pause : pointer lock perdu au clavier (sauf ?debug), Start à la manette, manette active débranchée
 *    (sauf ?debug).
 *  - `onFrame(snapshot)` pour l'UI (vitesse, mode de mouvement, cooldowns…).
 */

import {
  aimOrigin,
  Buttons,
  cloneState,
  createMatch,
  isCarrier,
  makeInput,
  playerHeight,
  ROLES,
  step,
  ticksToSec,
  type InputFrame,
  type MatchState,
  type MoveMode,
  type PlayerInput,
  type PlayerStatus,
  type Role,
  type TeamSize,
} from '../sim';
import type { InputProvider } from '../bots';
import type { AssistCandidate } from '../input/aimAssist';
import type { GamepadStyle } from '../input/gamepadMap';
import { Haptics } from '../input/haptics';
import { InputManager, type InputDevice } from '../input/InputManager';
import { lerpPos } from '../render/interpolate';
import { Renderer } from '../render/Renderer';
import { FixedStepLoop, MAX_FRAME_DT } from './loop';
import { assignRoles } from './roles';

export interface SessionOptions {
  teamSize: TeamSize;
  humanRole: Role;
  seed: number;
  training?: boolean;
  /** Mode debug (?debug) : clavier sans pointer lock, pas de pause, session exposée sur window. */
  debug?: boolean;
}

/** Instantané pour l'UI, produit à chaque frame. */
export interface FrameSnapshot {
  tick: number;
  paused: boolean;
  pointerLocked: boolean;
  activeDevice: InputDevice;
  gamepadConnected: boolean;
  gamepadStyle: GamepadStyle;
  /** Une manette est branchée mais sans mapping « standard » : elle est ignorée. */
  gamepadIgnored: boolean;
  /** Vitesse horizontale du joueur humain (m/s). */
  speed: number;
  move: MoveMode;
  status: PlayerStatus;
  onGround: boolean;
  carrier: boolean;
  aiming: boolean;
  sprinting: boolean;
  /** Cooldowns restants (s). */
  dodgeCd: number;
  slideCd: number;
  diveCd: number;
  abilityCd: number;
  stability: number;
  stabilityMax: number;
  role: Role;
  /** Images par seconde (lissées). */
  fps: number;
  /** Cible de l'aide à la visée (-1 : aucune). */
  assistTarget: number;
}

export class GameSession {
  /** Id du joueur humain. */
  readonly humanId = 0;
  state: MatchState;
  prev: MatchState;
  readonly input: InputManager;
  readonly renderer: Renderer;
  readonly haptics = new Haptics();
  /** Producteurs d'entrées des autres joueurs (bots, étape 6), appelés avec (état, id). Absent => entrée neutre. */
  readonly inputProviders = new Map<number, InputProvider>();
  onFrame: ((s: FrameSnapshot) => void) | null = null;

  paused: boolean;
  private readonly debug: boolean;
  private raf = 0;
  private running = false;
  private lastTime = -1;
  private readonly loopStep = new FixedStepLoop();
  private fps = 60;
  private readonly onResize = (): void => this.renderer.resize();
  private readonly candidates: AssistCandidate[] = [];
  private readonly tmpFeet = { x: 0, y: 0, z: 0 };

  constructor(canvas: HTMLCanvasElement, options: SessionOptions) {
    this.debug = options.debug ?? false;
    this.state = createMatch({
      teamSize: options.teamSize,
      seed: options.seed,
      roles: assignRoles(options.teamSize, options.humanRole),
      training: options.training ?? false,
    });
    this.prev = cloneState(this.state);
    this.renderer = new Renderer(canvas);
    this.renderer.setMatch(this.state, this.humanId);
    this.input = new InputManager(canvas, { debug: this.debug });
    const me = this.state.players[this.humanId];
    this.input.setOrientation(me.yaw, me.pitch);
    this.input.onPointerLockChange = (locked) => {
      if (locked) this.setPaused(false);
      else if (!this.debug && this.input.activeDevice === 'keyboard') this.setPaused(true);
    };
    this.paused = !this.debug;
    for (const p of this.state.players) {
      this.candidates.push({ id: p.id, team: p.team, status: p.status, x: 0, y: 0, z: 0, height: 0 });
    }
    window.addEventListener('resize', this.onResize);
    if (this.debug) (window as unknown as { __ovalgun?: { session: GameSession } }).__ovalgun = { session: this };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Bouton « Jouer » de l'overlay : pointer lock au clavier, reprise directe à la manette / en debug. */
  requestPlay(): void {
    if (this.debug || this.input.activeDevice === 'gamepad') this.setPaused(false);
    this.input.requestPointerLock();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.input.releaseAll();
    if (paused) {
      // L'accumulateur est conservé : l'image figée reste celle de la frame en cours (pas de recul d'un tick).
      this.input.exitPointerLock();
    } else {
      // Reprise : on repart de l'état affiché (prev = courant, alpha = 0), sans saut en arrière.
      this.prev = cloneState(this.state);
      this.loopStep.reset();
    }
  }

  private readonly loop = (t: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = t / 1000;
    const dt = this.lastTime < 0 ? 0 : Math.min(MAX_FRAME_DT, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const padLost = this.input.pollGamepad();
    // Manette active débranchée en jeu (batterie, câble) : pause, comme sur console.
    if (padLost && !this.paused && !this.debug) this.setPaused(true);
    if (this.input.consumePauseRequest()) this.setPaused(!this.paused);
    if (this.input.consumeConfirm() && this.paused) this.setPaused(false);
    const me = this.state.players[this.humanId];
    this.input.setCarrier(isCarrier(this.state, me));

    if (!this.paused) {
      this.input.frame(dt, this.assistQuery());
      const n = this.loopStep.advance(dt);
      for (let i = 0; i < n; i++) this.tick(now);
    }

    const alpha = this.loopStep.alpha;
    this.renderer.render(
      this.prev,
      this.state,
      alpha,
      { localId: this.humanId, yaw: this.input.yaw, pitch: this.input.pitch, aiming: this.input.aiming },
      dt,
      now,
    );
    this.onFrame?.(this.snapshot());
  };

  /** Un tick de simulation : entrées de tous les joueurs, puis step. */
  private tick(nowSec: number): void {
    this.prev = cloneState(this.state);
    const frame: Record<number, PlayerInput> = {};
    for (const p of this.state.players) {
      if (p.id === this.humanId) {
        frame[p.id] = this.input.sample();
        continue;
      }
      const provider = this.inputProviders.get(p.id);
      frame[p.id] = provider !== undefined ? provider(this.state, p.id) : makeInput({ yaw: p.yaw, pitch: p.pitch });
    }
    step(this.state, frame as InputFrame);
    const me = this.state.players[this.humanId];
    this.haptics.handleEvents(this.state.events, me.id, me.team, nowSec, this.input.activeDevice === 'gamepad' ? this.input.activeGamepad : null);
  }

  /** Contexte de l'aide à la visée (positions interpolées), ou null quand elle ne s'applique pas. */
  private assistQuery(): Parameters<InputManager['frame']>[1] {
    const s = this.state;
    const me = s.players[this.humanId];
    if (me.status !== 'active' || isCarrier(s, me)) return null;
    const alpha = this.loopStep.alpha;
    for (let i = 0; i < s.players.length; i++) {
      const pc = s.players[i];
      const pp = this.prev.players[i] ?? pc;
      const c = this.candidates[i];
      lerpPos(this.tmpFeet, pp.pos, pc.pos, alpha);
      c.status = pc.status;
      c.x = this.tmpFeet.x;
      c.y = this.tmpFeet.y;
      c.z = this.tmpFeet.z;
      c.height = playerHeight(pc);
    }
    const mine = this.candidates[this.humanId];
    return {
      candidates: this.candidates,
      selfId: me.id,
      selfTeam: me.team,
      origin: aimOrigin(mine, this.input.yaw),
      range: ROLES[me.role].weapon.range,
    };
  }

  private snapshot(): FrameSnapshot {
    const s = this.state;
    const me = s.players[this.humanId];
    return {
      tick: s.tick,
      paused: this.paused,
      pointerLocked: this.input.pointerLocked,
      activeDevice: this.input.activeDevice,
      gamepadConnected: this.input.gamepad.connected,
      gamepadStyle: this.input.gamepad.style,
      gamepadIgnored: this.input.gamepadIgnored,
      speed: Math.hypot(me.vel.x, me.vel.z),
      move: me.move,
      status: me.status,
      onGround: me.onGround,
      carrier: isCarrier(s, me),
      aiming: this.input.aiming,
      sprinting: this.input.gamepad.sprinting || (me.lastButtons & Buttons.SPRINT) !== 0,
      dodgeCd: ticksToSec(me.dodgeCd),
      slideCd: ticksToSec(me.slideCd),
      diveCd: ticksToSec(me.diveCd),
      abilityCd: ticksToSec(me.abilityCd),
      stability: me.stability,
      stabilityMax: ROLES[me.role].stabilityMax,
      role: me.role,
      fps: this.fps,
      assistTarget: this.input.lastAssist.targetId,
    };
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.renderer.dispose();
    const w = window as unknown as { __ovalgun?: { session: GameSession } };
    if (w.__ovalgun?.session === this) delete w.__ovalgun;
  }
}
