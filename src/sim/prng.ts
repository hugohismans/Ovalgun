/**
 * PRNG déterministe (mulberry32). L'état est un entier 32 bits stocké dans un
 * objet sérialisable (`MatchState.rng` pour la simulation, mémoire propre pour
 * chaque bot). JAMAIS de Math.random dans src/sim ni src/bots.
 */

export interface RngHolder {
  rng: number;
}

/** Flottant uniforme dans [0, 1). Fait avancer l'état. */
export function rand(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Flottant uniforme dans [lo, hi). */
export const randRange = (h: RngHolder, lo: number, hi: number): number => lo + (hi - lo) * rand(h);

/** Flottant uniforme dans [-1, 1). */
export const randSigned = (h: RngHolder): number => rand(h) * 2 - 1;

/** Entier uniforme dans [0, n). */
export const randInt = (h: RngHolder, n: number): number => Math.floor(rand(h) * n);

/** Normalise une seed quelconque en entier 32 bits. */
export const seedToInt = (seed: number): number => (Math.floor(seed) | 0) ^ 0x9e3779b9;

/** Dérive une seed indépendante à partir d'une seed et d'un sel (ex. id de bot). */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}
