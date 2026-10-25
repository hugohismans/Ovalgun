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
 *  - `onFrame(snapshot)` pour l'UI (vitesse, mode de mouvement, cooldowns, cible de passe, retour texte…).
 *  - Après chaque step : événements -> vibrations (haptics), effets visuels (renderer.handleEvents), retours
 *    texte temporaires (feedback.ts).
 *  - Outils de test (?debug ou entraînement seulement) : G / View = ballon pour moi, B = ballon au centre,
 *    appliqués ENTRE deux ticks via debugGiveBall / debugResetBall de la sim (jamais d'écriture directe dans l'état).
 *  - Étape 5 : retours de visée (combatHud.ts : hitmarker, direction des tirs reçus, vignette) et mini-HUD
 *    (stabilité, munitions, capacité) dans l'instantané.
 *  - Étape 6 : boucle de match complète (coup d'envoi, essai, remise en jeu, chrono, fin) ; HUD de match
 *    (matchHud.ts : score, chrono, « 3, 2, 1, JOUEZ ! », bannière d'essai, dernière minute, écran de fin) dans
 *    l'instantané. À chaque remise en jeu, la caméra du joueur local est retournée vers l'en-but adverse. À la fin :
 *    pointer lock relâché (sans mise en pause), A / Entrée / bouton « Rejouer » => `restart()` (nouveau match).
 *    Producteurs d'entrées (bots) installés par `installProviders()` à chaque match.
 *  - Étape 6 (bots) : chaque joueur non humain (coéquipiers ET adversaires) est piloté par un bot (src/bots, createBot)
 *    de la difficulté choisie (`difficulty`, ?difficulty=facile|normal|difficile), qui sait quel joueur est humain
 *    (`externalIds`) ; le joueur humain reçoit le ballon aux coups d'envoi de son équipe (`kickoffReceivers`) ; `passive`
 *    (?dummies=off) : joueurs passifs (entrée neutre). `autopilot` (?debug&autopilot) : le joueur 0 est aussi un bot (match bots contre bots
 *    observé depuis sa caméra ; clavier / souris / manette ignorés pour lui).
 *  - Étape 7 (mêlée) : rien de spécifique ici — les événements de la mêlée passent par les mêmes canaux (HUD de match :
 *    décompte, « MÊLÉE ! », « Mêlée gagnée par … » ; vibrations ; zone de capture dessinée par le rendu).
 */

import {
  abilityActive,
  abilityImplemented,
  aimOrigin,
  attackYaw,
  Buttons,
  canShoot,
  cloneState,
  createMatch,
  debugGiveBall,
  debugResetBall,
  isCarrier,
  CARRIER_DODGE_COOLDOWN_SEC,
  cooldownTicks,
  DODGE_COOLDOWN_SEC,
  GETUP_DURATION_SEC,
  makeInput,
  playerHeight,
  ROLES,
  step,
  TICK_RATE,
  ticksToSec,
  weaponImplemented,
  type InputFrame,
  type MatchState,
  type MoveMode,
  type PlayerInput,
  type PlayerStatus,
  type BotDifficulty,
  type Role,
  type TeamSize,
  DEFAULT_BOT_DIFFICULTY,
  lerpAngle,
} from '../sim';
import type { InputProvider } from '../bots';
import { createBot } from '../bots';
import { aimAssistApplies, type AssistCandidate } from '../input/aimAssist';
import type { GamepadStyle } from '../input/gamepadMap';
import { Haptics } from '../input/haptics';
import { CombatHud, type CombatHudFrame } from './combatHud';
import { FEEDBACK_SEC, feedbackFor, type Feedback } from './feedback';
import { MatchHud, type MatchHudFrame } from './matchHud';
import { InputManager, type InputDevice } from '../input/InputManager';
import { lerpPos } from '../render/interpolate';
import { STYLE } from '../render/palette';
import { Renderer } from '../render/Renderer';
import { FixedStepLoop, MAX_FRAME_DT } from './loop';
import { assignRoles } from './roles';

// Pour l'UI (qui n'importe pas la sim) : difficulté des bots et taille d'équipe lues dans l'URL.
export { DEFAULT_BOT_DIFFICULTY, type BotDifficulty, type TeamSize } from '../sim';

export interface SessionOptions {
  teamSize: TeamSize;
  humanRole: Role;
  seed: number;
  training?: boolean;
  /** Mode debug (?debug) : clavier sans pointer lock, pas de pause, session exposée sur window. */
  debug?: boolean;
  /** Difficulté des bots (défaut : DEFAULT_BOT_DIFFICULTY ; ?difficulty=facile|normal|difficile). */
  difficulty?: BotDifficulty;
  /** Joueurs non humains passifs (entrée neutre qui garde leur visée) au lieu de bots (?dummies=off) : réglage du plaquage. */
  passive?: boolean;
  /** Le joueur 0 est aussi piloté par un bot (?debug&autopilot) : match bots contre bots, vu depuis sa caméra. */
  autopilot?: boolean;
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
  /** Stabilité basse (sous STYLE.stabilityBarLowFraction) : jauge rouge dans le HUD. */
  stabilityLow: boolean;
  /** Temps restant au sol / à se relever (s), 0 si actif. */
  statusSec: number;
  role: Role;
  /** Arme (étape 5) : munitions, chargeur, rechargement (progression 0..1, -1 hors rechargement), tir possible. */
  ammo: number;
  magazine: number;
  reloadProgress: number;
  canShoot: boolean;
  /**
   * Capacité : nom, implémentée, temps actif restant (s : sprint boosté, bouclier ; pour le demi, vie restante de SA
   * zone), durée et cooldown totaux (s), indication contextuelle (« appuie à nouveau pour baisser » bouclier levé).
   */
  abilityLabel: string;
  abilityImplemented: boolean;
  abilityActiveSec: number;
  abilityHint: string;
  abilityDurationSec: number;
  abilityCooldownSec: number;
  dodgeCooldownSec: number;
  /** Retours de visée : hitmarker, direction des tirs reçus, vignette. */
  combat: CombatHudFrame;
  /** Images par seconde (lissées). */
  fps: number;
  /** Cible de l'aide à la visée (-1 : aucune). */
  assistTarget: number;
  /** Cible de la passe assistée affichée (-1 : aucune ou pas porteur). */
  passTarget: number;
  /** Retour texte temporaire en cours (null : aucun) ; `seq` change à chaque nouveau message. */
  feedback: (Feedback & { seq: number }) | null;
  /** Outils de test disponibles (?debug ou entraînement). */
  debugTools: boolean;
  /** Étape 6 : score, chrono, coup d'envoi, essai, dernière minute, écran de fin. */
  match: MatchHudFrame;
}

export class GameSession {
  /** Id du joueur humain. */
  readonly humanId = 0;
  state: MatchState;
  prev: MatchState;
  readonly input: InputManager;
  readonly renderer: Renderer;
  readonly haptics = new Haptics();
  readonly combatHud = new CombatHud();
  readonly matchHud = new MatchHud();
  /** Producteurs d'entrées des autres joueurs (bots, étape 6), appelés avec (état, id). Absent => entrée neutre. */
  readonly inputProviders = new Map<number, InputProvider>();
  onFrame: ((s: FrameSnapshot) => void) | null = null;

  paused: boolean;
  private readonly options: SessionOptions;
  /** Nombre de matchs relancés (la seed du match suivant en dépend : options.seed + matchIndex). */
  private matchIndex = 0;
  private readonly debug: boolean;
  /** Outils de test (ballon pour moi / au centre) : seulement en ?debug ou en entraînement. */
  readonly debugTools: boolean;
  private pendingGiveBall = false;
  private pendingResetBall = false;
  private feedback: Feedback | null = null;
  private feedbackUntil = 0;
  private feedbackSeq = 0;
  private raf = 0;
  private running = false;
  private lastTime = -1;
  private readonly loopStep = new FixedStepLoop();
  private fps = 60;
  private readonly onResize = (): void => this.renderer.resize();
  private readonly candidates: AssistCandidate[] = [];
  private readonly tmpFeet = { x: 0, y: 0, z: 0 };

  constructor(canvas: HTMLCanvasElement, options: SessionOptions) {
    this.options = options;
    this.debug = options.debug ?? false;
    this.debugTools = this.debug || (options.training ?? false);
    this.state = this.newMatch();
    this.prev = cloneState(this.state);
    this.renderer = new Renderer(canvas);
    this.renderer.setMatch(this.state, this.humanId);
    this.input = new InputManager(canvas, { debug: this.debug });
    const me = this.state.players[this.humanId];
    this.input.setOrientation(me.yaw, me.pitch);
    this.input.onPointerLockChange = (locked) => {
      if (locked) this.setPaused(false);
      else if (!this.debug && this.input.activeDevice === 'keyboard' && !this.ended) this.setPaused(true);
    };
    this.paused = !this.debug;
    this.installProviders();
    for (const p of this.state.players) {
      this.candidates.push({ id: p.id, team: p.team, status: p.status, x: 0, y: 0, z: 0, height: 0 });
    }
    window.addEventListener('resize', this.onResize);
    if (this.debug) (window as unknown as { __ovalgun?: { session: GameSession } }).__ovalgun = { session: this };
  }

  /** Vrai quand le match est terminé (écran de fin). */
  get ended(): boolean {
    return this.state.phase === 'ended';
  }

  /** Nouveau match (seed = options.seed + matchIndex), en phase de coup d'envoi. */
  private newMatch(): MatchState {
    const o = this.options;
    // Le joueur humain reçoit le ballon aux coups d'envoi de son équipe (sinon il ne le touchait jamais : le receveur
    // par défaut est le plus central de la formation, toujours un bot). En autopilote : défaut (le plus central).
    const humanIndex = this.humanId % o.teamSize;
    const humanTeam = this.humanId < o.teamSize ? 0 : 1;
    const receivers: [number, number] = [-1, -1];
    if (!this.autopilot) receivers[humanTeam] = humanIndex;
    return createMatch({
      teamSize: o.teamSize,
      seed: o.seed + this.matchIndex,
      roles: assignRoles(o.teamSize, o.humanRole),
      training: o.training ?? false,
      kickoffReceivers: receivers,
    });
  }

  /** Vrai si le joueur 0 est piloté par un bot (?debug&autopilot). */
  get autopilot(): boolean {
    return this.options.autopilot ?? false;
  }

  /**
   * Producteurs d'entrées des joueurs non humains (coéquipiers ET adversaires ; le joueur 0 aussi en autopilote),
   * recréés à chaque match : un bot par joueur (createBot), mémoire et PRNG propres dérivés de la seed du match et de
   * l'id. `passive` : aucun bot (entrée neutre qui garde la visée, voir tick()).
   */
  private installProviders(): void {
    this.inputProviders.clear();
    if (this.options.passive ?? false) return;
    const seed = this.options.seed + this.matchIndex;
    const difficulty = this.options.difficulty ?? DEFAULT_BOT_DIFFICULTY;
    // Les bots savent quel joueur est humain : ils se répartissent les rôles (pression, course au ballon, repli…)
    // sans compter sur lui (bots/tactics.ts). En autopilote, tout le monde est un bot.
    const externalIds = this.autopilot ? [] : [this.humanId];
    for (const p of this.state.players) {
      if (p.id !== this.humanId || this.autopilot) this.inputProviders.set(p.id, createBot(p.id, difficulty, seed, { externalIds }));
    }
  }

  /**
   * Relance un match (bouton « Rejouer » / A sur l'écran de fin) : nouvel état, nouveaux producteurs d'entrées, rendu
   * reconstruit, HUD remis à zéro, entrées relâchées (le A qui relance ne fait pas sauter). Au clavier, l'UI demande
   * ensuite le pointer lock (`requestPlay`, dans le geste utilisateur).
   */
  restart(): void {
    this.matchIndex++;
    this.state = this.newMatch();
    this.prev = cloneState(this.state);
    this.renderer.setMatch(this.state, this.humanId);
    this.installProviders();
    this.combatHud.reset();
    this.matchHud.reset();
    this.feedback = null;
    this.pendingGiveBall = false;
    this.pendingResetBall = false;
    this.input.releaseAll();
    const me = this.state.players[this.humanId];
    this.input.setOrientation(me.yaw, me.pitch);
    this.loopStep.reset();
    // Au clavier (hors ?debug), on attend le pointer lock demandé par l'UI : l'overlay de pause sert de repli.
    if (!this.debug && this.input.activeDevice === 'keyboard') this.setPaused(true);
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
    // Manette active débranchée en jeu (batterie, câble) : pause, comme sur console (pas sur l'écran de fin).
    if (padLost && !this.paused && !this.debug && !this.ended) this.setPaused(true);
    if (this.input.consumePauseRequest() && !this.ended) this.setPaused(!this.paused);
    const confirm = this.input.consumeConfirm();
    if (confirm && this.paused) this.setPaused(false);
    else if (confirm && this.ended && this.matchHud.canReplay(now)) this.restart();
    const me = this.state.players[this.humanId];
    this.input.setCarrier(isCarrier(this.state, me));

    const dbg = this.input.consumeDebugRequests();
    if (this.debugTools && !this.paused) {
      this.pendingGiveBall ||= dbg.giveBall;
      this.pendingResetBall ||= dbg.resetBall;
    }

    if (!this.paused) {
      this.input.frame(dt, this.assistQuery());
      const n = this.loopStep.advance(dt);
      for (let i = 0; i < n; i++) this.tick(now);
    }

    const alpha = this.loopStep.alpha;
    this.renderer.render(this.prev, this.state, alpha, this.view(alpha), dt, now);
    this.onFrame?.(this.snapshot());
  };

  /**
   * Regard de la caméra locale : celui de la souris / manette (non interpolé, visée réactive) ; en autopilote, celui du
   * bot (yaw / pitch du joueur 0 interpolés entre les deux derniers ticks).
   */
  private view(alpha: number): { localId: number; yaw: number; pitch: number; aiming: boolean } {
    if (!this.autopilot) return { localId: this.humanId, yaw: this.input.yaw, pitch: this.input.pitch, aiming: this.input.aiming };
    const pc = this.state.players[this.humanId];
    const pp = this.prev.players[this.humanId] ?? pc;
    return {
      localId: this.humanId,
      yaw: lerpAngle(pp.yaw, pc.yaw, alpha),
      pitch: pp.pitch + (pc.pitch - pp.pitch) * alpha,
      aiming: (pc.lastButtons & Buttons.AIM) !== 0,
    };
  }

  /** Un tick de simulation : outils de test en attente, entrées de tous les joueurs, puis step. */
  private tick(nowSec: number): void {
    this.applyDebugTools(nowSec);
    this.prev = cloneState(this.state);
    const frame: Record<number, PlayerInput> = {};
    for (const p of this.state.players) {
      if (p.id === this.humanId && !this.autopilot) {
        frame[p.id] = this.input.sample();
        continue;
      }
      const provider = this.inputProviders.get(p.id);
      frame[p.id] = provider !== undefined ? provider(this.state, p.id) : makeInput({ yaw: p.yaw, pitch: p.pitch });
    }
    step(this.state, frame as InputFrame);
    const me = this.state.players[this.humanId];
    const events = this.state.events;
    this.matchHud.handleEvents(events, this.state, nowSec);
    for (const e of events) {
      // Remise en jeu : la caméra du joueur local regarde l'en-but adverse (la sim applique ce yaw au tick suivant).
      if (e.type === 'kickoff') this.input.setOrientation(attackYaw(me.team), 0);
      // Fin du match : tout est relâché, la souris redevient libre pour l'écran de fin (sans mise en pause).
      if (e.type === 'match_end') {
        this.input.releaseAll();
        this.input.exitPointerLock();
      }
    }
    this.haptics.handleEvents(events, me.id, me.team, nowSec, this.input.activeDevice === 'gamepad' ? this.input.activeGamepad : null, me.pos);
    this.renderer.handleEvents(events, this.state, nowSec, this.prev);
    this.combatHud.handleEvents(events, this.state, this.humanId, nowSec);
    for (const e of events) {
      const fb = feedbackFor(e, this.state, this.humanId);
      if (fb !== null) this.showFeedback(fb, nowSec);
    }
  }

  /**
   * Outils de test (avant la copie `prev` du tick : le ballon « saute » sans traînée interpolée).
   * Passent par les fonctions pures de la sim (debugGiveBall / debugResetBall), déterministes.
   */
  private applyDebugTools(nowSec: number): void {
    // Refusés hors du jeu (pause d'essai, fin ; « au centre » aussi pendant le décompte) : pas de message alors.
    if (this.pendingResetBall && debugResetBall(this.state)) {
      this.showFeedback({ text: 'Ballon au centre', kind: 'info' }, nowSec);
    }
    if (this.pendingGiveBall && debugGiveBall(this.state, this.humanId)) {
      this.showFeedback({ text: 'Ballon pour toi', kind: 'info' }, nowSec);
    }
    this.pendingGiveBall = false;
    this.pendingResetBall = false;
  }

  private showFeedback(fb: Feedback, nowSec: number): void {
    this.feedback = fb;
    this.feedbackUntil = nowSec + FEEDBACK_SEC;
    this.feedbackSeq++;
  }

  /** Contexte de l'aide à la visée (positions interpolées), ou null quand elle ne s'applique pas. */
  private assistQuery(): Parameters<InputManager['frame']>[1] {
    const s = this.state;
    const me = s.players[this.humanId];
    if (!aimAssistApplies(s, me)) return null; // ne tire pas (au sol, porteur, bouclier levé…) ou tir en cloche
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
    const role = ROLES[me.role];
    const reloadTotal = Math.max(1, cooldownTicks(s, role.weapon.reloadSec));
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
      stabilityMax: role.stabilityMax,
      stabilityLow: me.stability <= role.stabilityMax * STYLE.stabilityBarLowFraction,
      statusSec: me.status === 'active' ? 0 : ticksToSec(me.statusTicks) + (me.status === 'down' ? GETUP_DURATION_SEC : 0),
      role: me.role,
      ammo: me.ammo,
      magazine: role.weapon.magazine,
      reloadProgress: me.reloadTicks > 0 ? Math.min(1, 1 - me.reloadTicks / reloadTotal) : -1,
      canShoot: canShoot(s, me) && weaponImplemented(role.weapon),
      abilityLabel: role.ability.label,
      abilityImplemented: abilityImplemented(me),
      abilityActiveSec: abilityActive(me) ? ticksToSec(me.abilityTicks) : this.ownZoneSec(me.id),
      abilityHint: me.role === 'pilier' && abilityActive(me) ? 'appuie à nouveau pour baisser' : '',
      abilityDurationSec: role.ability.duration,
      abilityCooldownSec: cooldownTicks(s, role.ability.cooldown) / TICK_RATE,
      dodgeCooldownSec: cooldownTicks(s, isCarrier(s, me) ? CARRIER_DODGE_COOLDOWN_SEC : DODGE_COOLDOWN_SEC) / TICK_RATE,
      combat: this.combatHud.frame(this.lastTime, me, this.input.yaw, s),
      fps: this.fps,
      assistTarget: this.input.lastAssist.targetId,
      passTarget: this.renderer.passTargetId,
      feedback: this.feedback !== null && this.lastTime < this.feedbackUntil ? { ...this.feedback, seq: this.feedbackSeq } : null,
      debugTools: this.debugTools,
      match: this.matchHud.frame(s, this.humanId, this.lastTime),
    };
  }

  /** Vie restante (s) de la zone de ralentissement posée par `id` (0 : aucune). */
  private ownZoneSec(id: number): number {
    for (const z of this.state.zones) if (z.ownerId === id) return ticksToSec(z.ttl);
    return 0;
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
