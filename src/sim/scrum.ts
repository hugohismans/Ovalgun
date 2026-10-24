/**
 * Mêlée — ÉTAPE 7 (point d'extension, vide à l'étape 2).
 *
 * Ballon 'loose' depuis SCRUM_LOOSE_SEC (voir `ball.looseTicks`) avec au moins N joueurs actifs
 * de chaque camp dans SCRUM_RADIUS (×échelle) => ballon 'scrum', zone de capture
 * SCRUM_CAPTURE_SEC, l'équipe la plus nombreuse récupère le ballon (égalité : prolongation puis
 * tirage seedé). Voir docs/ARCHITECTURE.md §4.
 */

import type { MatchState } from './types';

/** Étape 7 — détection et résolution de la mêlée. Vide pour l'instant. */
export function updateScrum(_state: MatchState): void {
  // ÉTAPE 7.
}
