/**
 * Phases et règles du match.
 *
 * Étape 2 : seul le décompte 'kickoff' -> 'play' est en place (il ne sert pas encore : le
 * prototype démarre directement en 'play').
 * ÉTAPE 6 : décompte 'try' -> remise en jeu (placement via formation.ts), essai, chrono,
 * dernière minute, fin de match, mode entraînement.
 */

import type { MatchState } from './types';

/** Vrai si les joueurs sont figés (seule la visée est appliquée). */
export const isFrozenPhase = (state: MatchState): boolean => state.phase !== 'play';

/** Étape 2 de `step` : décomptes de phase. */
export function updatePhase(state: MatchState): void {
  if (state.phase === 'kickoff') {
    if (state.phaseTicks > 0) state.phaseTicks--;
    if (state.phaseTicks === 0) {
      state.phase = 'play';
      state.events.push({ type: 'play' });
    }
  }
  // ÉTAPE 6 : phase 'try' -> remise en jeu à la fin de TRY_PAUSE_SEC.
}

/** Étape 11 de `step` — ÉTAPE 6 : essai, chrono, dernière minute, fin de match. Vide pour l'instant. */
export function updateRules(_state: MatchState): void {
  // ÉTAPE 6 : TRY_POINTS, clockTicks, LAST_MINUTE_SEC, 'match_end', config.training.
}
