/**
 * Capacités de rôle et zones — ÉTAPE 7 (points d'extension, vides à l'étape 2).
 *
 * À remplir à l'étape 7 :
 *   - updateAbilities  : bouclier (pilier), sprint boosté (ailier), pose de zone (demi) ;
 *   - updateZones      : durée de vie des zones de ralentissement ;
 *   - speedMultiplier  : bouclier levé, sprint boosté, zone de ralentissement adverse.
 */

import type { MatchState, PlayerState } from './types';
import type { TickInput } from './input';

/** Étape 7 — activation et durée des capacités (ABILITY). Vide pour l'instant. */
export function updateAbilities(_state: MatchState, _inputs: readonly TickInput[]): void {
  // ÉTAPE 7 : abilityCd, abilityTicks, événement 'ability'.
}

/** Étape 7 — zones (ralentissement) : durée de vie. Vide pour l'instant. */
export function updateZones(_state: MatchState): void {
  // ÉTAPE 7.
}

/**
 * Étape 7 — multiplicateur de vitesse de course lié aux capacités et aux zones
 * (SHIELD_SPEED_MULT, BOOST_SPEED_MULT, SLOW_ZONE_SPEED_MULT). Neutre pour l'instant.
 */
export function abilitySpeedMultiplier(_state: MatchState, _p: PlayerState): number {
  return 1;
}

/** Étape 7 — multiplicateur d'accélération (BOOST_ACCEL_MULT pendant le sprint boosté). Neutre pour l'instant. */
export function abilityAccelMultiplier(_state: MatchState, _p: PlayerState): number {
  return 1;
}
