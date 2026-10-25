/**
 * Vibrations de la manette, déclenchées par la session sur les événements du joueur LOCAL.
 *
 * Table événement -> effet : `rumbleCueFor` (pure, testée) ; intensités et durées dans
 * GAMEPAD_RUMBLE_EFFECTS (src/sim/constants.ts). Lecture via
 * `gamepad.vibrationActuator?.playEffect('dual-rumble', …)`, en tolérant son absence (Firefox,
 * Safari, manettes sans moteurs) : une vibration ratée ne doit jamais casser la boucle de jeu.
 *
 * Événements branchés : atterrissage brutal (étape 3) ; réception / ramassage du ballon, interception
 * réussie, passe interceptée (étape 4 ; un coup de pied réceptionné par l'adversaire n'en est pas une) ;
 * tir reçu (léger), plaquage subi (fort), plaquage réussi (court) — étape 5 ; essai marqué par son équipe / encaissé,
 * fin du match — étape 6 ; son bouclier qui bloque (léger), explosion proche (moyen, à moins de
 * RUMBLE_EXPLOSION_NEAR_MULT × rayon d'explosion de ses pieds) ; mêlée déclenchée (pour tous), gagnée / perdue par son
 * équipe — étape 7.
 */

import {
  GAMEPAD_RUMBLE,
  GAMEPAD_RUMBLE_EFFECTS,
  RUMBLE_EXPLOSION_NEAR_MULT,
  RUMBLE_HARD_LANDING_SPEED,
  type MatchEvent,
  type RumbleCue,
  type TeamId,
  type Vec3,
} from '../sim';

/**
 * Signal de vibration correspondant à un événement pour le joueur local, ou null. `localFeet` : position des pieds du
 * joueur local (explosion proche) ; sans elle, les explosions ne vibrent pas.
 */
export function rumbleCueFor(e: MatchEvent, localId: number, localTeam: TeamId, localFeet: Vec3 | null = null): RumbleCue | null {
  switch (e.type) {
    case 'hit':
      return e.targetId === localId ? 'hitTaken' : null;
    case 'tackled':
      if (e.targetId === localId) return 'tackled';
      return e.byId === localId ? 'tackleDealt' : null;
    case 'catch':
      if (e.playerId === localId) return e.intercepted ? 'interceptionMade' : 'catch';
      return e.intercepted && e.fromId === localId ? 'interceptionSuffered' : null;
    case 'pickup':
      return e.playerId === localId ? 'catch' : null;
    case 'scrum_start':
      return 'scrumStart';
    case 'scrum_won':
      return e.team === localTeam ? 'scrumWon' : 'scrumLost';
    case 'try':
      return e.team === localTeam ? 'try' : 'tryConceded';
    case 'match_end':
      return 'matchEnd';
    case 'land':
      return e.playerId === localId && e.speed >= RUMBLE_HARD_LANDING_SPEED ? 'hardLanding' : null;
    case 'blocked':
      return e.targetId === localId ? 'shieldBlock' : null;
    case 'explosion': {
      if (localFeet === null) return null;
      const r = e.radius * RUMBLE_EXPLOSION_NEAR_MULT;
      const d2 = (e.pos.x - localFeet.x) ** 2 + (e.pos.y - localFeet.y) ** 2 + (e.pos.z - localFeet.z) ** 2;
      return d2 <= r * r ? 'explosionNear' : null;
    }
    default:
      return null;
  }
}

/** Sous-ensemble de GamepadHapticActuator (absent de nombreux navigateurs). */
interface DualRumbleActuator {
  playEffect(
    type: 'dual-rumble',
    params: { duration: number; startDelay: number; strongMagnitude: number; weakMagnitude: number },
  ): Promise<unknown>;
}

/** Lecteur de vibrations avec priorités (un plaquage n'est pas écrasé par un tir reçu). */
export class Haptics {
  enabled = GAMEPAD_RUMBLE;
  private busyUntil = 0;
  private busyPriority = 0;

  /**
   * Traite les événements d'un tick. `pad` = manette active (un `Gamepad` ; null : rien). `localFeet` : pieds du joueur
   * local (explosions proches).
   */
  handleEvents(
    events: readonly MatchEvent[],
    localId: number,
    localTeam: TeamId,
    nowSec: number,
    pad: object | null,
    localFeet: Vec3 | null = null,
  ): void {
    if (!this.enabled || pad === null) return;
    for (const e of events) {
      const cue = rumbleCueFor(e, localId, localTeam, localFeet);
      if (cue !== null) this.play(cue, nowSec, pad);
    }
  }

  /** Joue un signal si aucun effet plus prioritaire n'est en cours. Renvoie vrai si l'effet a été lancé. */
  play(cue: RumbleCue, nowSec: number, pad: object | null): boolean {
    if (!this.enabled || pad === null) return false;
    const fx = GAMEPAD_RUMBLE_EFFECTS[cue];
    if (fx.strong <= 0 && fx.weak <= 0) return false;
    if (nowSec < this.busyUntil && fx.priority < this.busyPriority) return false;
    const act = (pad as { vibrationActuator?: DualRumbleActuator | null }).vibrationActuator;
    if (act === undefined || act === null || typeof act.playEffect !== 'function') return false;
    this.busyUntil = nowSec + fx.durationSec;
    this.busyPriority = fx.priority;
    try {
      act
        .playEffect('dual-rumble', {
          duration: Math.round(fx.durationSec * 1000),
          startDelay: 0,
          strongMagnitude: fx.strong,
          weakMagnitude: fx.weak,
        })
        .catch(() => undefined);
    } catch {
      return false;
    }
    return true;
  }
}
