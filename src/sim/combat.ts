/**
 * Armes, projectiles et stabilité — ÉTAPE 5 (points d'extension, vides à l'étape 2).
 *
 * À remplir à l'étape 5 :
 *   - updateStatusTimers : down -> getting_up -> active, invulnérabilité de relevé, rechargement ;
 *   - updateShooting     : tir (FIRE), visée, cadence, dispersion seedée, création de projectiles ;
 *   - updateProjectiles  : déplacement balayé, collisions joueurs / boucliers / terrain, explosions, knockback ;
 *   - updateStability    : plaquage (jauge vide -> 'down', lâcher du ballon), régénération après REGEN_DELAY_SEC.
 */

import type { MatchState } from './types';
import type { TickInput } from './input';

/** Étape 5 — minuteries de statut (down / getting_up) et de rechargement. Vide pour l'instant. */
export function updateStatusTimers(_state: MatchState): void {
  // ÉTAPE 5 : statusTicks, reloadTicks (+ munitions), regenDelayTicks.
}

/** Étape 5 — tir : création des projectiles selon l'arme du rôle. Vide pour l'instant. */
export function updateShooting(_state: MatchState, _inputs: readonly TickInput[]): void {
  // ÉTAPE 5 : le porteur, le sprinteur, le joueur au sol ou bouclier levé ne tirent pas.
}

/** Étape 5 — projectiles : déplacement et collisions. Vide pour l'instant. */
export function updateProjectiles(_state: MatchState): void {
  // ÉTAPE 5.
}

/** Étape 5 — stabilité : plaquages et régénération. Vide pour l'instant. */
export function updateStability(_state: MatchState): void {
  // ÉTAPE 5.
}
