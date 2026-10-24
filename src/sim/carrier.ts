/**
 * Le porteur du ballon — ÉTAPE 4 (points d'extension, volontairement vides à l'étape 2).
 *
 * À remplir à l'étape 4 :
 *   - updateCarrierActions : passe arrière assistée (PASS), coup de pied (KICK) ;
 *   - tryStartDive         : plongeon (SLIDE pressé par le porteur), mouvements 'dive' / 'dive_recover' ;
 *   - updateDiveMovement   : vitesse pendant le plongeon et la récupération au sol ;
 *   - updateBallPickup     : ramassage du ballon libre (cercle au sol), réception / interception en vol.
 */

import type { MatchState, PlayerState, Vec3 } from './types';
import type { TickInput } from './input';

/**
 * Étape 4 — actions du porteur (passe, coup de pied), appelée à l'étape 5 de `step`
 * (après les minuteries, avant le déplacement). Vide pour l'instant.
 */
export function updateCarrierActions(_state: MatchState, _inputs: readonly TickInput[]): void {
  // ÉTAPE 4 : passe arrière assistée (cône terrain, visée assistée, cloche) et coup de pied.
}

/**
 * Étape 4 — plongeon du porteur. Appelée par le déplacement quand le PORTEUR presse SLIDE
 * (pour les autres joueurs, SLIDE = glissade). Doit, le cas échéant, passer `p.move` à 'dive',
 * régler moveTicks / moveDir / invulnTicks / diveCd et émettre l'événement 'dive'.
 * Renvoie vrai si le plongeon a démarré. Pour l'instant : ne fait rien.
 */
export function tryStartDive(_state: MatchState, _p: PlayerState, _wishDir: Vec3): boolean {
  // ÉTAPE 4 : DIVE_SPEED, DIVE_DURATION_SEC, DIVE_INVULN_SEC, DIVE_RECOVER_SEC, DIVE_COOLDOWN_SEC.
  return false;
}

/**
 * Étape 4 — vitesse horizontale pendant 'dive' / 'dive_recover'. Tant que le plongeon
 * n'existe pas, un joueur qui se trouverait dans ces modes revient simplement en course.
 * Renvoie vrai si le joueur est toujours en plongeon (sinon le déplacement applique la course).
 */
export function updateDiveMovement(_state: MatchState, p: PlayerState): boolean {
  // ÉTAPE 4 : dash avant puis récupération quasi immobile.
  p.move = 'run';
  p.moveTicks = 0;
  return false;
}

/**
 * Étape 4 — ramassage du ballon libre (premier joueur dans BALL_PICKUP_RADIUS),
 * réception / interception des passes et coups de pied (BALL_CATCH_RADIUS, BALL_CATCH_REACH_ABOVE),
 * en respectant `pickupBlockTicks`. Appelée après la physique du ballon. Vide pour l'instant.
 */
export function updateBallPickup(_state: MatchState): void {
  // ÉTAPE 4.
}
