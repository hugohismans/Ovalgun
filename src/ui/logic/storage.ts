/**
 * Persistance des choix du menu et des réglages (étape 8), PURE et testée : lecture / écriture JSON dans un stockage
 * clé-valeur (localStorage dans le navigateur). Tout est enveloppé dans try/catch : stockage absent (navigation privée,
 * contexte sans `window`), qui jette (quota, cookies bloqués) ou contenu corrompu => on continue avec les valeurs par
 * défaut, sans jamais casser l'UI. La validation des valeurs relues est faite par l'appelant (sanitizeSetup,
 * sanitizeSettings de src/game).
 */

/** Sous-ensemble de `Storage` utilisé (permet d'injecter un faux stockage dans les tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Clés de stockage (versionnées : un changement de format incompatible change la clé). */
export const STORAGE_KEYS = {
  setup: 'ovalgun.setup.v1',
  settings: 'ovalgun.settings.v1',
} as const;

/** Le localStorage du navigateur, ou null s'il est absent / interdit (son simple accès peut jeter). */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Valeur JSON relue (null : absente, illisible, ou stockage indisponible). */
export function loadJson(storage: StorageLike | null, key: string): unknown {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Écrit une valeur JSON ; renvoie faux si le stockage est indisponible ou refuse l'écriture. */
export function saveJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
