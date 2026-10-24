/**
 * Sérialisation de l'état : copie profonde et empreinte (tests de déterminisme, plus tard
 * vérification client/serveur). L'état étant 100 % JSON, JSON est la référence.
 */

import type { MatchState } from './types';

/** Copie profonde JSON-safe de l'état (équivalent à un aller-retour réseau). */
export const cloneState = (state: MatchState): MatchState => JSON.parse(JSON.stringify(state)) as MatchState;

/** Empreinte FNV-1a 32 bits d'une chaîne, en hexadécimal (8 caractères). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Empreinte de l'état complet (FNV-1a sur JSON.stringify). */
export const hashState = (state: MatchState): string => fnv1a(JSON.stringify(state));
