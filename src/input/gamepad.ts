/**
 * Manette (Gamepad API, disposition « standard »).
 *
 * - Fonctions pures (zones mortes radiales, courbe, boost, bascule de sprint) : testées sous Node.
 * - `GamepadInput` : état d'UNE manette, alimenté par un objet `GamepadLike` (vrai `Gamepad` du
 *   navigateur ou fausse manette de test) : déplacement, vitesses de caméra, boutons verrouillés.
 * - `GamepadPicker` : choisit LA manette lue parmi celles connectées (la dernière « standard » qui a
 *   servi, gardée tant qu'elle est connectée) ; signale une manette détectée mais non « standard ».
 * - `readGamepads()` : seule fonction qui touche `navigator` (la connexion / déconnexion à chaud est
 *   naturellement gérée en interrogeant à chaque frame).
 *
 * La caméra manette est intégrée à la fréquence du RENDU (dt de frame) pour la fluidité ; seuls
 * les boutons et le déplacement sont échantillonnés au tick.
 */

import {
  GAMEPAD_ACTIVITY_THRESHOLD,
  GAMEPAD_AIM_LOOK_MULT,
  GAMEPAD_LOOK_BOOST_DELAY_SEC,
  GAMEPAD_LOOK_BOOST_MULT,
  GAMEPAD_LOOK_BOOST_RAMP_SEC,
  GAMEPAD_LOOK_BOOST_MIN_HORIZONTAL,
  GAMEPAD_LOOK_BOOST_THRESHOLD,
  GAMEPAD_LOOK_CURVE,
  GAMEPAD_LOOK_DEADZONE,
  GAMEPAD_LOOK_OUTER_DEADZONE,
  GAMEPAD_LOOK_PITCH_SPEED_DEG,
  GAMEPAD_LOOK_YAW_SPEED_DEG,
  GAMEPAD_MOVE_DEADZONE,
  GAMEPAD_MOVE_OUTER_DEADZONE,
  GAMEPAD_TRIGGER_THRESHOLD,
  Buttons,
} from '../sim';
import {
  DEFAULT_GAMEPAD_MAP,
  detectGamepadStyle,
  padActionBit,
  padActionsToButtons,
  readPadActions,
  type GamepadMap,
  type GamepadStyle,
  type PadButtonLike,
} from './gamepadMap';
import { PressLatch } from './inputLogic';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------

/** Stick après zone morte : composantes remises à l'échelle et norme (0..1). */
export interface StickValue {
  x: number;
  y: number;
  mag: number;
}

/**
 * Zone morte RADIALE avec remise à l'échelle : sous `deadzone` (norme), rien ; au-delà, la norme
 * est ramenée linéairement de [deadzone, 1 − outer] à [0, 1] (pas de saut au bord de la zone morte),
 * direction conservée (pas d'effet « croix » d'une zone morte par axe). Norme bornée à 1.
 * `outer` (zone morte extérieure) : un stick usé qui plafonne sous 1 atteint quand même 1.
 */
export function radialDeadzone(x: number, y: number, deadzone: number, outer = 0): StickValue {
  const fx = Number.isFinite(x) ? x : 0;
  const fy = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(fx, fy);
  if (m <= deadzone || m < 1e-9) return { x: 0, y: 0, mag: 0 };
  const span = Math.max(1e-6, 1 - deadzone - Math.max(0, outer));
  const scaled = Math.min(1, (m - deadzone) / span);
  const k = scaled / m;
  return { x: fx * k, y: fy * k, mag: scaled };
}

/** Courbe de réponse du stick de caméra : précision au centre, vitesse en bout de course. */
export const lookCurve = (mag: number, exponent: number = GAMEPAD_LOOK_CURVE): number =>
  Math.pow(Math.min(1, Math.max(0, mag)), exponent);

/**
 * Boost de rotation en bout de course : stick maintenu au-delà de GAMEPAD_LOOK_BOOST_THRESHOLD ET
 * surtout horizontal (|x| ≥ GAMEPAD_LOOK_BOOST_MIN_HORIZONTAL × norme : le boost ne s'applique qu'au
 * lacet), le multiplicateur monte de 1 à GAMEPAD_LOOK_BOOST_MULT après GAMEPAD_LOOK_BOOST_DELAY_SEC,
 * en GAMEPAD_LOOK_BOOST_RAMP_SEC. Retombe à 1 dès que le stick quitte le bout de course horizontal.
 */
export class LookBoost {
  private heldSec = 0;

  update(stick: StickValue, dt: number, enabled: boolean): number {
    const horizontal = Math.abs(stick.x) >= GAMEPAD_LOOK_BOOST_MIN_HORIZONTAL * stick.mag;
    if (enabled && stick.mag >= GAMEPAD_LOOK_BOOST_THRESHOLD && horizontal) this.heldSec += dt;
    else this.heldSec = 0;
    return this.multiplier;
  }

  get multiplier(): number {
    const t = this.heldSec - GAMEPAD_LOOK_BOOST_DELAY_SEC;
    if (t <= 0) return 1;
    const k = GAMEPAD_LOOK_BOOST_RAMP_SEC > 0 ? Math.min(1, t / GAMEPAD_LOOK_BOOST_RAMP_SEC) : 1;
    return 1 + (GAMEPAD_LOOK_BOOST_MULT - 1) * k;
  }

  reset(): void {
    this.heldSec = 0;
  }
}

/** Options de la conversion stick -> vitesse angulaire. */
export interface LookRateOptions {
  /** Visée (gâchette gauche) : vitesse × GAMEPAD_AIM_LOOK_MULT. */
  aiming: boolean;
  /** Multiplicateur de boost (LookBoost), appliqué au lacet seulement. */
  boost: number;
  /** Multiplicateur de l'aide à la visée (1 = aucune). */
  assist: number;
  invertY: boolean;
}

/**
 * Vitesses angulaires (rad/s) pour un stick de caméra déjà passé en zone morte.
 * Stick à droite => yaw diminue (même convention que la souris) ; stick vers le haut (axe Y < 0)
 * => pitch augmente (regarder en haut), sauf inversion.
 */
export function stickLookRates(stick: StickValue, opts: LookRateOptions): { yawRate: number; pitchRate: number } {
  if (stick.mag <= 0) return { yawRate: 0, pitchRate: 0 };
  const curved = lookCurve(stick.mag);
  const k = curved / stick.mag; // direction conservée, norme courbée
  const mult = (opts.aiming ? GAMEPAD_AIM_LOOK_MULT : 1) * opts.assist;
  return {
    yawRate: -stick.x * k * GAMEPAD_LOOK_YAW_SPEED_DEG * DEG * opts.boost * mult,
    pitchRate: -stick.y * k * GAMEPAD_LOOK_PITCH_SPEED_DEG * DEG * mult * (opts.invertY ? -1 : 1),
  };
}

/**
 * Sprint en bascule sur L3 : un appui l'active (ou le coupe) ; il s'annule tout seul quand le
 * stick revient au centre (zone morte) ou en visée — sauf pour le porteur, qui ne vise pas (une
 * gâchette effleurée ne doit pas couper sa course).
 * Le TIR ne l'annule pas (étape 5) : la bascule reste active et c'est la simulation qui ignore le sprint
 * tant que l'arme tire vraiment (fireOverridesSprint), exactement comme Maj maintenu au clavier. Le sprint
 * reprend donc tout seul entre deux rafales, pendant un rechargement, ou si l'arme ne peut pas tirer.
 */
export class SprintToggle {
  active = false;

  update(togglePressed: boolean, moveMag: number, aiming: boolean, carrier = false): boolean {
    if (togglePressed) this.active = !this.active;
    if (moveMag <= 0 || (!carrier && aiming)) this.active = false;
    return this.active;
  }

  reset(): void {
    this.active = false;
  }
}

// ---------------------------------------------------------------------------
// État d'une manette
// ---------------------------------------------------------------------------

/** Sous-ensemble de `Gamepad` utilisé (permet d'injecter une fausse manette dans les tests). */
export interface GamepadLike {
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly PadButtonLike[];
}

const PAUSE_BIT = padActionBit('pause');
const DEBUG_GIVE_BALL_BIT = padActionBit('debugGiveBall');
const DEBUG_RESET_BALL_BIT = padActionBit('debugResetBall');
const SPRINT_BIT = padActionBit('sprintToggle');
const AIM_BIT = padActionBit('aim');

/** État d'une manette, mis à jour à chaque frame par `update()`. */
export class GamepadInput {
  connected = false;
  id = '';
  style: GamepadStyle = 'xbox';
  /** Déplacement après zone morte (+y = avant). */
  move: StickValue = { x: 0, y: 0, mag: 0 };
  /** Stick de caméra après zone morte (axe Y brut : + = bas). */
  look: StickValue = { x: 0, y: 0, mag: 0 };
  /** Vrai si la manette a été utilisée de façon significative à la dernière frame. */
  active = false;
  /** Actions manette maintenues (bits padActionBit). */
  heldActions = 0;
  /**
   * Le joueur local porte le ballon (fourni par la session à chaque frame) : il ne vise pas, donc la
   * gâchette de visée ne ralentit pas la caméra et ne coupe pas le sprint L3.
   */
  carrier = false;

  private readonly latch = new PressLatch();
  private readonly sprint = new SprintToggle();
  private readonly boost = new LookBoost();
  private prevActions = 0;
  private prevConfirm = false;
  private pauseRequested = false;
  private confirmRequested = false;
  private debugGiveBallRequested = false;
  private debugResetBallRequested = false;

  constructor(private readonly map: GamepadMap = DEFAULT_GAMEPAD_MAP) {}

  /** Lit l'état de la manette (null = aucune). À appeler une fois par frame. */
  update(pad: GamepadLike | null): void {
    if (pad === null || !pad.connected) {
      if (this.connected) this.reset();
      this.connected = false;
      this.active = false;
      // Plus rien n'est maintenu : sinon une gâchette enfoncée au débranchement laisserait la caméra en visée.
      this.heldActions = 0;
      this.prevActions = 0;
      this.prevConfirm = false;
      return;
    }
    if (!this.connected || pad.id !== this.id) {
      this.connected = true;
      this.id = pad.id;
      this.style = detectGamepadStyle(pad.id);
      // Boutons déjà enfoncés au branchement : pas de faux fronts.
      this.prevActions = readPadActions(this.map, pad.buttons, GAMEPAD_TRIGGER_THRESHOLD);
      this.prevConfirm = pad.buttons[this.map.confirmButton]?.pressed ?? false;
    }
    const ax = pad.axes;
    const mv = radialDeadzone(
      ax[this.map.moveAxes.x] ?? 0,
      ax[this.map.moveAxes.y] ?? 0,
      GAMEPAD_MOVE_DEADZONE,
      GAMEPAD_MOVE_OUTER_DEADZONE,
    );
    this.move = { x: mv.x, y: -mv.y, mag: mv.mag };
    this.look = radialDeadzone(
      ax[this.map.lookAxes.x] ?? 0,
      ax[this.map.lookAxes.y] ?? 0,
      GAMEPAD_LOOK_DEADZONE,
      GAMEPAD_LOOK_OUTER_DEADZONE,
    );

    const actions = readPadActions(this.map, pad.buttons, GAMEPAD_TRIGGER_THRESHOLD);
    const pressed = actions & ~this.prevActions;
    this.prevActions = actions;
    this.heldActions = actions;
    if ((pressed & PAUSE_BIT) !== 0) this.pauseRequested = true;
    if ((pressed & DEBUG_GIVE_BALL_BIT) !== 0) this.debugGiveBallRequested = true;
    if ((pressed & DEBUG_RESET_BALL_BIT) !== 0) this.debugResetBallRequested = true;
    const confirm = pad.buttons[this.map.confirmButton]?.pressed ?? false;
    if (confirm && !this.prevConfirm) this.confirmRequested = true;
    this.prevConfirm = confirm;

    this.sprint.update((pressed & SPRINT_BIT) !== 0, this.move.mag, (actions & AIM_BIT) !== 0, this.carrier);
    this.latch.setHeld(padActionsToButtons(actions));
    // Activité = geste franc (seuil distinct de la zone morte) : une légère dérive ne prend pas la main.
    this.active =
      actions !== 0 || this.move.mag >= GAMEPAD_ACTIVITY_THRESHOLD || this.look.mag >= GAMEPAD_ACTIVITY_THRESHOLD;
  }

  /** Vrai si la visée (gâchette gauche) est maintenue — jamais pour le porteur, qui ne vise pas. */
  get aiming(): boolean {
    return (this.heldActions & AIM_BIT) !== 0 && !this.carrier;
  }

  /** Vrai si le sprint en bascule est actif. */
  get sprinting(): boolean {
    return this.sprint.active;
  }

  /**
   * Vitesses angulaires de caméra pour cette frame (rad/s), boost compris (mis à jour avec `dt`).
   * `assist` : multiplicateur de l'aide à la visée (1 = aucune).
   */
  lookRates(dt: number, assist: number, invertY: boolean): { yawRate: number; pitchRate: number } {
    const aiming = this.aiming;
    const boost = this.boost.update(this.look, dt, !aiming);
    return stickLookRates(this.look, { aiming, boost, assist, invertY });
  }

  /** Bits `Buttons` pour un tick (appuis brefs verrouillés), sprint en bascule compris. */
  sampleButtons(): number {
    if (!this.connected) return 0;
    return this.latch.sample() | (this.sprint.active ? Buttons.SPRINT : 0);
  }

  /** Vrai une fois après un appui sur Start (pause / reprise). */
  consumePause(): boolean {
    const r = this.pauseRequested;
    this.pauseRequested = false;
    return r;
  }

  /** Vrai une fois après un appui sur View / Share (outil de test « ballon pour moi », ?debug / entraînement). */
  consumeDebugGiveBall(): boolean {
    const r = this.debugGiveBallRequested;
    this.debugGiveBallRequested = false;
    return r;
  }

  /** Vrai une fois après un appui sur la croix ↓ (outil de test « ballon au centre », ?debug / entraînement). */
  consumeDebugResetBall(): boolean {
    const r = this.debugResetBallRequested;
    this.debugResetBallRequested = false;
    return r;
  }

  /** Vrai une fois après un appui sur A / Croix (valider l'overlay). */
  consumeConfirm(): boolean {
    const r = this.confirmRequested;
    this.confirmRequested = false;
    return r;
  }

  /** Tout relâcher (pause, déconnexion). Les boutons encore enfoncés ne recréent pas de front. */
  reset(): void {
    this.latch.reset(padActionsToButtons(this.prevActions));
    this.sprint.reset();
    this.boost.reset();
    this.move = { x: 0, y: 0, mag: 0 };
    this.look = { x: 0, y: 0, mag: 0 };
    this.pauseRequested = false;
    this.confirmRequested = false;
    this.debugGiveBallRequested = false;
    this.debugResetBallRequested = false;
  }
}

// ---------------------------------------------------------------------------
// Navigateur
// ---------------------------------------------------------------------------

/** Vrai si une manette montre un geste franc (bouton enfoncé, gâchette ou stick au-delà du seuil d'activité). */
export function padHasActivity(pad: GamepadLike): boolean {
  for (const b of pad.buttons) if (b.pressed || b.value >= GAMEPAD_TRIGGER_THRESHOLD) return true;
  for (const a of pad.axes) if (Math.abs(a) >= GAMEPAD_ACTIVITY_THRESHOLD) return true;
  return false;
}

/**
 * Choix de LA manette lue parmi celles que renvoie la Gamepad API. On garde la manette courante tant
 * qu'elle est connectée, sauf si une AUTRE manette « standard » montre un geste franc : on bascule alors
 * sur celle-ci (manette virtuelle Steam, seconde manette posée à l'index 0…). Sans manette courante :
 * la première manette standard active, sinon la première standard.
 * `nonStandard` : une manette est connectée mais aucune n'a le mapping « standard » (fréquent sous
 * Firefox / Linux) — l'UI le signale au lieu de rester muette.
 */
export class GamepadPicker {
  private index = -1;
  private id = '';
  nonStandard = false;

  pick(pads: ReadonlyArray<GamepadLike | null>): GamepadLike | null {
    let current: GamepadLike | null = null;
    let firstStandard: GamepadLike | null = null;
    let firstStandardIdx = -1;
    let activeOther: GamepadLike | null = null;
    let activeOtherIdx = -1;
    let anyConnected = false;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p === null || !p.connected) continue;
      anyConnected = true;
      if (p.mapping !== 'standard') continue;
      if (firstStandard === null) {
        firstStandard = p;
        firstStandardIdx = i;
      }
      if (i === this.index && p.id === this.id) current = p;
      else if (activeOther === null && padHasActivity(p)) {
        activeOther = p;
        activeOtherIdx = i;
      }
    }
    this.nonStandard = anyConnected && firstStandard === null;
    let chosen = current;
    let chosenIdx = this.index;
    if (activeOther !== null) {
      chosen = activeOther;
      chosenIdx = activeOtherIdx;
    } else if (chosen === null) {
      chosen = firstStandard;
      chosenIdx = firstStandardIdx;
    }
    this.index = chosen === null ? -1 : chosenIdx;
    this.id = chosen === null ? '' : chosen.id;
    return chosen;
  }
}

/** Manettes vues par le navigateur (tableau vide si la Gamepad API est absente ou refusée). */
export function readGamepads(): ReadonlyArray<Gamepad | null> {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  try {
    return navigator.getGamepads();
  } catch {
    return []; // contexte non sécurisé / politique de permissions
  }
}
