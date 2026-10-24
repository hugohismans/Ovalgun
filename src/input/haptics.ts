/**
 * Vibrations de la manette, déclenchées par la session sur les événements du joueur LOCAL.
 *
 * Table événement -> effet : `rumbleCueFor` (pure, testée) ; intensités et durées dans
 * GAMEPAD_RUMBLE_EFFECTS (src/sim/constants.ts). Lecture via
 * `gamepad.vibrationActuator?.playEffect('dual-rumble', …)`, en tolérant son absence (Firefox,
 * Safari, manettes sans moteurs) : une vibration ratée ne doit jamais casser la boucle de jeu.
 *
 * Événements branchés dès l'étape 3 : atterrissage brutal. Les autres (tir reçu, plaquage,
 * réception, essai) seront émis par la simulation aux étapes 4 à 6 : la table est déjà prête.
 */

import {
  GAMEPAD_RUMBLE,
  GAMEPAD_RUMBLE_EFFECTS,
  RUMBLE_HARD_LANDING_SPEED,
  type MatchEvent,
  type RumbleCue,
  type TeamId,
} from '../sim';

/** Signal de vibration correspondant à un événement pour le joueur local, ou null. */
export function rumbleCueFor(e: MatchEvent, localId: number, localTeam: TeamId): RumbleCue | null {
  switch (e.type) {
    case 'hit':
      return e.targetId === localId ? 'hitTaken' : null;
    case 'tackled':
      if (e.targetId === localId) return 'tackled';
      return e.byId === localId ? 'tackleDealt' : null;
    case 'catch':
    case 'pickup':
      return e.playerId === localId ? 'catch' : null;
    case 'scrum_won':
      return e.playerId === localId ? 'catch' : null;
    case 'try':
      return e.team === localTeam ? 'try' : 'tryConceded';
    case 'land':
      return e.playerId === localId && e.speed >= RUMBLE_HARD_LANDING_SPEED ? 'hardLanding' : null;
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

  /** Traite les événements d'un tick. `pad` = manette active (un `Gamepad` ; null : rien). */
  handleEvents(events: readonly MatchEvent[], localId: number, localTeam: TeamId, nowSec: number, pad: object | null): void {
    if (!this.enabled || pad === null) return;
    for (const e of events) {
      const cue = rumbleCueFor(e, localId, localTeam);
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
