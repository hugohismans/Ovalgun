/**
 * PRNG local du décor (mulberry32) : placement déterministe de la ville, de la foule et du ciel, sans Math.random ni
 * le PRNG de la simulation (le décor ne doit jamais influencer le match).
 */

export interface Rng {
  /** Tirage uniforme dans [0, 1). */
  next(): number;
  /** Tirage uniforme dans [min, max). */
  range(min: number, max: number): number;
  /** Entier uniforme dans [0, n). */
  int(n: number): number;
  /** Élément au hasard d'une liste non vide. */
  pick<T>(list: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T,
  };
}
