/**
 * Portraits des classes pour le menu (passe-plat vers le rendu : l'UI n'importe que src/game et src/input).
 * Calculés une seule fois par session de page.
 */

import { renderCharacterPortraits } from '../render/characters/portraits';
import type { Role } from '../sim';

let cached: Promise<Partial<Record<Role, string>>> | null = null;

export function characterPortraits(): Promise<Partial<Record<Role, string>>> {
  cached ??= renderCharacterPortraits().catch(() => ({}));
  return cached;
}
