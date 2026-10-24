/**
 * Entrées : entrée neutre, fabrique pratique, et lecture d'une entrée pour un tick.
 *
 * Les entrées viennent du client (clavier/souris, manette) ou des bots, et plus tard du
 * réseau : la simulation les ASSAINIT (valeurs non finies, hors bornes, bits inconnus)
 * pour qu'aucune entrée ne puisse corrompre l'état (NaN) ni le rendre non déterministe.
 *
 * Entrée analogique (manette) : `moveX/moveY` peuvent avoir une norme < 1 (stick peu
 * incliné) ; la vitesse cible est alors réduite (voir MOVE_INPUT_FULL_SPEED). Une norme > 1
 * (diagonale clavier, stick carré) est ramenée à 1.
 */

import { PITCH_MAX_DEG, PITCH_MIN_DEG } from './constants';
import { Buttons, type InputFrame, type PlayerInput, type PlayerState } from './types';
import { clamp, wrapAngle } from './vec';

/** Entrée neutre : aucun mouvement, aucun bouton, orientation (0, 0). */
export const NEUTRAL_INPUT: Readonly<PlayerInput> = Object.freeze({ moveX: 0, moveY: 0, yaw: 0, pitch: 0, buttons: 0 });

/** Crée une entrée complète à partir d'un objet partiel (le reste = neutre). */
export const makeInput = (partial: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, ...partial });

/** Masque de tous les bits de boutons connus. */
export const ALL_BUTTONS: number = Object.values(Buttons).reduce((m, b) => m | b, 0);

export const PITCH_MIN = (PITCH_MIN_DEG * Math.PI) / 180;
export const PITCH_MAX = (PITCH_MAX_DEG * Math.PI) / 180;

/** Entrée d'un joueur pour le tick courant, assainie. Transitoire : n'est PAS stockée dans l'état. */
export interface TickInput {
  /** Déplacement local normalisé si sa norme dépasse 1. */
  moveX: number;
  moveY: number;
  /** Norme du déplacement (0..1). */
  moveMag: number;
  /** Boutons maintenus. */
  buttons: number;
  /** Fronts montants de ce tick (`buttons & ~lastButtons`). */
  pressed: number;
  /**
   * Faux si l'entrée du joueur manquait ce tick (perte de paquet, bot en retard) : `lastButtons`
   * n'est alors pas mis à jour, pour qu'un bouton toujours maintenu au tick suivant ne crée pas
   * de faux front montant (double saut involontaire).
   */
  present: boolean;
}

const finiteOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Lit l'entrée du joueur pour ce tick : entrée manquante = neutre en gardant yaw/pitch ;
 * applique l'orientation (yaw ramené dans ]-PI, PI], pitch borné) et renvoie l'entrée assainie.
 */
export function readTickInput(p: PlayerState, inputs: InputFrame): TickInput {
  const raw = inputs[p.id];
  if (raw === undefined || raw === null) {
    return { moveX: 0, moveY: 0, moveMag: 0, buttons: 0, pressed: 0, present: false };
  }
  p.yaw = wrapAngle(finiteOr(raw.yaw, p.yaw));
  p.pitch = clamp(finiteOr(raw.pitch, p.pitch), PITCH_MIN, PITCH_MAX);
  let mx = clamp(finiteOr(raw.moveX, 0), -1, 1);
  let my = clamp(finiteOr(raw.moveY, 0), -1, 1);
  let mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
    mag = 1;
  }
  const buttons = (finiteOr(raw.buttons, 0) | 0) & ALL_BUTTONS;
  return { moveX: mx, moveY: my, moveMag: mag, buttons, pressed: buttons & ~p.lastButtons, present: true };
}

/** Teste un bit de bouton. */
export const has = (mask: number, button: number): boolean => (mask & button) !== 0;
