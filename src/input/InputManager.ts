/**
 * InputManager : clavier/souris (pointer lock) + manette -> UN SEUL PlayerInput par tick.
 *
 * - Clavier lu par `KeyboardEvent.code` via une Keymap (données, remappable).
 * - Souris : pointer lock au clic ; yaw/pitch accumulés depuis movementX/Y à chaque événement
 *   (souris vers la droite => yaw diminue ; pitch borné comme la sim). La caméra lit `yaw`/`pitch`
 *   à chaque frame : visée réactive au framerate, indépendante du tick.
 * - Manette : interrogée à chaque frame (`frame(dt)`), la caméra au stick est intégrée au dt de frame.
 * - Fusion : boutons en OU, déplacement = le plus grand des deux (à égalité le périphérique actif),
 *   yaw/pitch communs. « Périphérique actif » = dernier utilisé de façon significative (UI, pause).
 * - Appuis brefs verrouillés (PressLatch) : un appui + relâché entre deux ticks est vu au tick suivant.
 * - Shift : appui bref => DODGE pendant un tick (au relâchement par défaut, KEYBOARD_DODGE_ON_RELEASE),
 *   maintien > SPRINT_HOLD_DELAY_SEC => SPRINT.
 * - Porteur (`setCarrier`) : il ne vise pas — la visée ne rapproche pas la caméra et ne change pas les sensibilités.
 *   Passe finale (CARRIER_AUTO_SPRINT) : il sprinte automatiquement et Maj esquive à l'enfoncement.
 * - Tout est relâché sur blur / perte du pointer lock / pause.
 * - Mode debug (?debug) : le clavier et les clics sont acceptés sans pointer lock (tests Playwright).
 * - Étape 8 : réglages du joueur appliqués à chaud (`applySettings` : sensibilités, inversion Y, aide à la visée) ;
 *   `gameplayActive` (faux dans les menus : le clavier ne pilote plus le joueur et n'empêche plus les actions par défaut
 *   des touches, il sert seulement à choisir le périphérique actif) ; `pointerLockAllowed` (le canvas ne capte pas le
 *   pointer lock quand un menu est ouvert) ; intentions de navigation des menus à la manette (`consumeMenuIntents`,
 *   menuNav.ts) ; demande de pointer lock en cours (`lockPending`).
 */

import {
  AIM_ASSIST_ENABLED,
  AIM_ASSIST_MIN_INPUT,
  CARRIER_AUTO_SPRINT,
  clamp,
  GAMEPAD_INVERT_Y,
  GAMEPAD_RUMBLE,
  MOUSE_AIM_SENSITIVITY_MULT,
  MOUSE_SENSITIVITY,
  PITCH_MAX,
  PITCH_MIN,
  wrapAngle,
  type PlayerInput,
} from '../sim';
import { AimAssist, NO_ASSIST, type AimAssistQuery, type AimAssistResult } from './aimAssist';
import { GamepadInput, GamepadPicker, readGamepads, type GamepadLike } from './gamepad';
import { DEFAULT_GAMEPAD_MAP, type GamepadMap } from './gamepadMap';
import { composeInput, PressLatch, TapHoldState } from './inputLogic';
import { actionBit, actionsForKey, actionsForMouse, DEFAULT_KEYMAP, type Keymap } from './keymap';
import { MenuNavReader, type MenuIntent } from './menuNav';

export type InputDevice = 'keyboard' | 'gamepad';

export interface InputManagerOptions {
  keymap?: Keymap;
  gamepadMap?: GamepadMap;
  /** Accepter le clavier / les clics sans pointer lock (?debug). */
  debug?: boolean;
  /** Source des manettes (tests) ; défaut : `navigator.getGamepads()`. La manette lue est choisie par GamepadPicker. */
  gamepadsSource?: () => ReadonlyArray<GamepadLike | null>;
}

/** Déplacement de souris (px) au-delà duquel la souris redevient le périphérique actif. */
const MOUSE_ACTIVITY_PX = 4;

const BIT_DODGE_SPRINT = actionBit('dodgeSprint');
const BIT_AIM = actionBit('aim');
const BIT_DEBUG_GIVE = actionBit('debugGiveBall');
const BIT_DEBUG_RESET = actionBit('debugResetBall');

/**
 * Réglages du joueur appliqués par l'InputManager (étape 8). Les sensibilités sont des multiplicateurs des constantes
 * (MOUSE_SENSITIVITY, GAMEPAD_LOOK_*_SPEED_DEG) ; 1 = valeurs de constants.ts.
 */
export interface InputSettings {
  mouseSensitivity: number;
  padSensitivity: number;
  invertY: boolean;
  aimAssist: boolean;
}

export const DEFAULT_INPUT_SETTINGS: Readonly<InputSettings> = {
  mouseSensitivity: 1,
  padSensitivity: 1,
  invertY: GAMEPAD_INVERT_Y,
  aimAssist: AIM_ASSIST_ENABLED,
};

/** Vibrations activées par défaut (réglage du joueur, appliqué par la session à Haptics). */
export const DEFAULT_RUMBLE = GAMEPAD_RUMBLE;

/** Demandes des outils de test (G / B au clavier, View / croix ↓ à la manette) depuis le dernier appel. */
export interface DebugRequests {
  giveBall: boolean;
  resetBall: boolean;
}

export class InputManager {
  /** Orientation courante (rad), partagée souris / manette, lue par la caméra à chaque frame. */
  yaw = 0;
  pitch = 0;
  /** Dernier périphérique utilisé de façon significative. */
  activeDevice: InputDevice = 'keyboard';
  pointerLocked = false;
  /** Aide à la visée manette (désactivable). */
  readonly aimAssist = new AimAssist();
  /** Dernier résultat de l'aide à la visée (debug / HUD). */
  lastAssist: AimAssistResult = NO_ASSIST;
  readonly gamepad: GamepadInput;

  /** Appelé quand le pointer lock change (la session décide de la pause). */
  onPointerLockChange: ((locked: boolean) => void) | null = null;
  /** Appelé quand la fenêtre perd le focus (alt-tab, clic hors de la page) : la session met en pause (passe finale). */
  onFocusLost: (() => void) | null = null;
  /** Appelé quand le périphérique actif change (glyphes de l'UI). */
  onDeviceChange: ((device: InputDevice) => void) | null = null;
  /**
   * Le joueur local est en jeu (ni menu, ni pause, ni écran de fin) : le clavier et la souris le pilotent. Faux : une
   * touche ne fait que rendre le clavier actif (glyphes), sans empêcher son action par défaut (Tab, Espace, flèches des
   * menus).
   */
  gameplayActive = true;
  /** Un clic sur le canvas peut demander le pointer lock (faux quand un menu est ouvert). */
  pointerLockAllowed = true;
  /** Une demande de pointer lock est en cours (ni accordée, ni refusée). */
  lockPending = false;
  /** Réglages du joueur (étape 8), modifiables à chaud. */
  readonly settings: InputSettings = { ...DEFAULT_INPUT_SETTINGS };

  private readonly keymap: Keymap;
  private readonly debug: boolean;
  private readonly gamepadsSource: () => ReadonlyArray<GamepadLike | null>;
  private readonly picker = new GamepadPicker();
  /** Le joueur local porte le ballon (il ne vise pas). */
  private carrier = false;
  private readonly heldKeys = new Map<string, number>(); // code -> masque d'actions
  private readonly heldMouse = new Map<number, number>(); // bouton -> masque d'actions
  private readonly latch = new PressLatch();
  private readonly shift = new TapHoldState();
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  /** Actions des outils de test pressées depuis le dernier `consumeDebugRequests` (masque actionBit). */
  private debugPressed = 0;
  private lastPad: GamepadLike | null = null;
  private readonly menuNav = new MenuNavReader();
  private menuIntents: MenuIntent[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: InputManagerOptions = {},
  ) {
    this.keymap = opts.keymap ?? DEFAULT_KEYMAP;
    this.debug = opts.debug ?? false;
    this.gamepad = new GamepadInput(opts.gamepadMap ?? DEFAULT_GAMEPAD_MAP);
    this.gamepadsSource = opts.gamepadsSource ?? readGamepads;
    this.aimAssist.enabled = this.settings.aimAssist;

    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(canvas, 'mousedown', (e) => this.onMouseButton(e as MouseEvent, true));
    this.listen(window, 'mouseup', (e) => this.onMouseButton(e as MouseEvent, false));
    this.listen(document, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(canvas, 'click', () => {
      if (this.pointerLockAllowed) this.requestPointerLock();
    });
    this.listen(document, 'pointerlockchange', () => this.onLockChange());
    this.listen(document, 'pointerlockerror', () => {
      this.lockPending = false;
    });
    this.listen(window, 'blur', () => {
      this.releaseAll();
      this.onFocusLost?.();
    });
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  private listen(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  /** Applique des réglages du joueur (étape 8), à chaud : sensibilités, inversion Y, aide à la visée. */
  applySettings(s: Partial<InputSettings>): void {
    Object.assign(this.settings, s);
    this.aimAssist.enabled = this.settings.aimAssist;
    if (!this.settings.aimAssist) this.aimAssist.reset();
  }

  /** Initialise l'orientation (yaw/pitch du joueur au début du match). */
  setOrientation(yaw: number, pitch: number): void {
    this.yaw = wrapAngle(yaw);
    this.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX);
  }

  /** Demande le pointer lock (doit être appelé dans un geste utilisateur : clic). */
  requestPointerLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    this.lockPending = true;
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise)
        r.catch(() => {
          this.lockPending = false;
        });
    } catch {
      // Navigateur sans pointer lock (ou refusé) : on reste en pause clavier.
      this.lockPending = false;
    }
  }

  /** Relâche le pointer lock (pause demandée depuis la manette, fin de session). */
  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Vrai si le clavier / la souris doivent être pris en compte. */
  private get acceptsKeyboard(): boolean {
    return this.pointerLocked || this.debug;
  }

  private setDevice(d: InputDevice): void {
    if (this.activeDevice === d) return;
    this.activeDevice = d;
    this.onDeviceChange?.(d);
  }

  private recomputeHeld(): void {
    let mask = 0;
    for (const m of this.heldKeys.values()) mask |= m;
    for (const m of this.heldMouse.values()) mask |= m;
    this.latch.setHeld(mask);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.gameplayActive) {
      // Menus : la touche sert seulement à rendre le clavier actif ; son action par défaut est conservée.
      if (down) this.setDevice('keyboard');
      if (!down && this.heldKeys.delete(e.code)) this.recomputeHeld();
      return;
    }
    const actions = actionsForKey(this.keymap, e.code);
    if (actions === 0) return;
    if (!down) {
      if (this.heldKeys.delete(e.code)) this.recomputeHeld();
      if ((actions & BIT_DODGE_SPRINT) !== 0 && !this.anyHeld(BIT_DODGE_SPRINT)) this.shift.release(nowSec());
      return;
    }
    if (!this.acceptsKeyboard) return;
    e.preventDefault(); // Espace (défilement), flèches…
    this.setDevice('keyboard');
    if (e.repeat || this.heldKeys.has(e.code)) return;
    this.debugPressed |= actions & (BIT_DEBUG_GIVE | BIT_DEBUG_RESET);
    this.heldKeys.set(e.code, actions);
    if ((actions & BIT_DODGE_SPRINT) !== 0) this.shift.press(nowSec());
    this.recomputeHeld();
  }

  private anyHeld(bit: number): boolean {
    for (const m of this.heldKeys.values()) if ((m & bit) !== 0) return true;
    for (const m of this.heldMouse.values()) if ((m & bit) !== 0) return true;
    return false;
  }

  private onMouseButton(e: MouseEvent, down: boolean): void {
    const actions = actionsForMouse(this.keymap, e.button);
    if (!down) {
      if (this.heldMouse.delete(e.button)) this.recomputeHeld();
      if ((actions & BIT_DODGE_SPRINT) !== 0 && !this.anyHeld(BIT_DODGE_SPRINT)) this.shift.release(nowSec());
      return;
    }
    if (!this.gameplayActive) {
      this.setDevice('keyboard');
      return;
    }
    if (actions === 0 || !this.acceptsKeyboard) return;
    this.setDevice('keyboard');
    this.heldMouse.set(e.button, actions);
    if ((actions & BIT_DODGE_SPRINT) !== 0) this.shift.press(nowSec());
    this.recomputeHeld();
  }

  private onMouseMove(e: MouseEvent): void {
    const dx = e.movementX;
    const dy = e.movementY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (!this.pointerLocked) {
      // Menus : la souris redevient le périphérique actif (glyphes clavier), sans tourner la caméra.
      if (!this.gameplayActive && Math.abs(dx) + Math.abs(dy) >= MOUSE_ACTIVITY_PX) this.setDevice('keyboard');
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) >= MOUSE_ACTIVITY_PX) this.setDevice('keyboard');
    const sens = MOUSE_SENSITIVITY * this.settings.mouseSensitivity * (this.aiming ? MOUSE_AIM_SENSITIVITY_MULT : 1);
    this.yaw = wrapAngle(this.yaw - dx * sens);
    this.pitch = clamp(this.pitch - dy * sens, PITCH_MIN, PITCH_MAX);
  }

  private onLockChange(): void {
    const locked = document.pointerLockElement === this.canvas;
    this.lockPending = false;
    if (locked === this.pointerLocked) return;
    this.pointerLocked = locked;
    if (locked) this.setDevice('keyboard');
    else this.releaseKeyboard();
    this.onPointerLockChange?.(locked);
  }

  /** Relâche clavier/souris (sans toucher à la manette). */
  private releaseKeyboard(): void {
    this.debugPressed = 0;
    this.heldKeys.clear();
    this.heldMouse.clear();
    this.latch.reset();
    this.shift.reset();
  }

  /** Tout relâcher : clavier, souris et manette (blur, pause, reprise). */
  releaseAll(): void {
    this.releaseKeyboard();
    this.gamepad.reset();
    this.aimAssist.reset();
  }

  /** Manette actuellement lue (null si aucune) — pour les vibrations. */
  get activeGamepad(): GamepadLike | null {
    return this.lastPad;
  }

  /**
   * Indique si le joueur local porte le ballon (à chaque frame, par la session). Le porteur ne vise
   * pas : clic droit / gâchette gauche ne rapprochent pas la caméra, ne ralentissent pas la caméra et
   * ne coupent pas le sprint L3. Avec CARRIER_AUTO_SPRINT, il sprinte sans Maj ni L3 et Maj esquive à l'enfoncement.
   */
  setCarrier(carrier: boolean): void {
    this.carrier = carrier;
    this.gamepad.carrier = carrier;
    // Passe finale : le porteur sprinte tout seul, Maj ne sert plus qu'à esquiver — dès l'enfoncement.
    this.shift.dodgeOnPress = carrier && CARRIER_AUTO_SPRINT;
  }

  /** Vrai si la visée est maintenue (clic droit ou gâchette gauche) — jamais pour le porteur. */
  get aiming(): boolean {
    return ((this.latch.held & BIT_AIM) !== 0 && !this.carrier) || this.gamepad.aiming;
  }

  /** Une manette est branchée mais n'a pas le mapping « standard » (non prise en charge) : l'UI le signale. */
  get gamepadIgnored(): boolean {
    return this.picker.nonStandard;
  }

  /**
   * Interroge la manette (à chaque frame, même en pause : Start / A doivent être lus).
   * Ne fait tourner aucune caméra : voir `frame()`.
   * Renvoie vrai si la manette ACTIVE vient d'être débranchée (batterie, câble) : le périphérique
   * actif repasse au clavier et la session met en pause.
   */
  pollGamepad(): boolean {
    const wasConnected = this.gamepad.connected;
    const pad = this.picker.pick(this.gamepadsSource());
    this.lastPad = pad;
    this.gamepad.update(pad);
    if (this.gamepad.active) this.setDevice('gamepad');
    const intents = this.menuNav.update(pad, nowSec());
    if (intents.length > 0) {
      this.setDevice('gamepad');
      for (const i of intents) this.menuIntents.push(i);
    }
    if (wasConnected && !this.gamepad.connected && this.activeDevice === 'gamepad') {
      this.setDevice('keyboard');
      return true;
    }
    return false;
  }

  /**
   * Avance la caméra manette d'une frame (à appeler en jeu, après `pollGamepad`).
   * `assistQuery` : contexte de l'aide à la visée (null : pas d'aide, ex. porteur qui ne tire pas).
   */
  frame(dt: number, assistQuery: Omit<AimAssistQuery, 'yaw' | 'pitch' | 'dt' | 'inputActive'> | null): void {
    if (!this.gamepad.connected) {
      this.lastAssist = NO_ASSIST;
      return;
    }
    let assist: AimAssistResult = NO_ASSIST;
    if (assistQuery !== null && this.activeDevice === 'gamepad') {
      const inputActive = this.gamepad.look.mag >= AIM_ASSIST_MIN_INPUT || this.gamepad.move.mag >= AIM_ASSIST_MIN_INPUT;
      assist = this.aimAssist.update({ ...assistQuery, yaw: this.yaw, pitch: this.pitch, dt, inputActive });
    } else {
      this.aimAssist.reset();
    }
    this.lastAssist = assist;
    const { yawRate, pitchRate } = this.gamepad.lookRates(dt, assist.slowdown, this.settings.invertY);
    const k = this.settings.padSensitivity;
    this.yaw = wrapAngle(this.yaw + yawRate * k * dt + assist.yawCorrection);
    this.pitch = clamp(this.pitch + pitchRate * k * dt + assist.pitchCorrection, PITCH_MIN, PITCH_MAX);
  }

  /**
   * Intentions de navigation des menus à la manette (croix / stick, A, B, Start, LB / RB) depuis le dernier appel.
   * La session les transmet à l'UI quand un menu est ouvert, et les jette en jeu.
   */
  consumeMenuIntents(): MenuIntent[] {
    if (this.menuIntents.length === 0) return EMPTY_INTENTS;
    const out = this.menuIntents;
    this.menuIntents = [];
    return out;
  }

  /** Oublie les appuis de navigation en cours (changement d'écran) : un bouton encore enfoncé n'agit plus. */
  resetMenuNav(): void {
    this.menuIntents = [];
    this.menuNav.reset(this.lastPad);
  }

  /** Vrai une fois après Start (pause / reprise). */
  consumePauseRequest(): boolean {
    return this.gamepad.consumePause();
  }

  /**
   * Outils de test (G / View = ballon pour moi, B / croix ↓ = ballon au centre),
   * pressés depuis le dernier appel. La session ne les applique qu'en ?debug ou en entraînement.
   */
  consumeDebugRequests(): DebugRequests {
    const k = this.debugPressed;
    this.debugPressed = 0;
    const padGive = this.gamepad.consumeDebugGiveBall();
    const padReset = this.gamepad.consumeDebugResetBall();
    return { giveBall: padGive || (k & BIT_DEBUG_GIVE) !== 0, resetBall: padReset || (k & BIT_DEBUG_RESET) !== 0 };
  }

  /** Vrai une fois après A / Croix. */
  consumeConfirm(): boolean {
    return this.gamepad.consumeConfirm();
  }

  /** Entrée du joueur humain pour UN tick (à appeler une fois par tick). Assemblage pur : `composeInput`. */
  sample(): PlayerInput {
    return composeInput({
      keyboardActions: this.latch.sample(),
      shift: this.shift.sample(nowSec()),
      gamepadButtons: this.gamepad.sampleButtons(),
      gamepadMove: this.gamepad.move,
      gamepadActive: this.activeDevice === 'gamepad',
      autoSprint: this.carrier && CARRIER_AUTO_SPRINT,
      yaw: this.yaw,
      pitch: this.pitch,
    });
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners.length = 0;
    this.exitPointerLock();
    this.releaseAll();
  }
}

const EMPTY_INTENTS: MenuIntent[] = [];

/** Horloge client (s) : durée d'appui de Shift, répétition de la navigation des menus (jamais dans la sim). */
const nowSec = (): number => performance.now() / 1000;
