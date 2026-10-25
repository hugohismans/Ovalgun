/**
 * Navigation spatiale du focus dans les menus (étape 8), PURE et testée : à partir des rectangles des éléments
 * focalisables (coordonnées écran), choisit le prochain élément dans une direction (croix / stick de la manette,
 * flèches du clavier).
 *
 * Règle : un candidat est dans la direction s'il est entièrement de ce côté (à TOL près), ou si son centre est de ce
 * côté ET qu'il chevauche l'élément courant sur l'axe secondaire (une carte légèrement surélevée à côté reste « à
 * droite », pas « en haut » ; un bouton plus haut et décalé n'est pas « à gauche »). Score = distance sur l'axe principal
 * (de bord à bord, au moins 0) + ALIGN_WEIGHT × écart sur l'axe secondaire (0 si les projections se recouvrent)
 * + CENTER_WEIGHT × décalage des centres sur l'axe secondaire (entre deux candidats alignés, le plus centré).
 * Égalité : ordre du document (plus petit index).
 * Aucun candidat : en vertical, on boucle (le plus éloigné dans la direction opposée, le mieux aligné) — une liste de
 * boutons se parcourt en rond à la manette ; en horizontal, on reste sur place.
 */

import type { NavDirection } from '../../input/menuNav';

export interface NavRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Poids de l'écart sur l'axe secondaire. ↑ = on préfère encore plus les éléments alignés. */
const ALIGN_WEIGHT = 2.5;
/** Poids du décalage des centres sur l'axe secondaire. */
const CENTER_WEIGHT = 0.3;
/** Tolérance (px) : deux centres plus proches que ça sur l'axe principal sont « au même niveau ». */
const EPS = 1;
/** Tolérance (px) du test « entièrement de ce côté » (bords qui se touchent, arrondis). */
const TOL = 4;

const cx = (r: NavRect): number => r.x + r.w / 2;
const cy = (r: NavRect): number => r.y + r.h / 2;

/** Écart entre deux intervalles [a0, a1] et [b0, b1] (0 s'ils se recouvrent). */
const gap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

/** Le candidat `c` est-il du côté `dir` de `cur` ? */
function inDirection(cur: NavRect, c: NavRect, dir: NavDirection): boolean {
  const vOverlap = gap(cur.y, cur.y + cur.h, c.y, c.y + c.h) === 0;
  const hOverlap = gap(cur.x, cur.x + cur.w, c.x, c.x + c.w) === 0;
  switch (dir) {
    case 'right':
      return c.x >= cur.x + cur.w - TOL || (cx(c) > cx(cur) + EPS && vOverlap);
    case 'left':
      return c.x + c.w <= cur.x + TOL || (cx(c) < cx(cur) - EPS && vOverlap);
    case 'down':
      return c.y >= cur.y + cur.h - TOL || (cy(c) > cy(cur) + EPS && hOverlap);
    case 'up':
      return c.y + c.h <= cur.y + TOL || (cy(c) < cy(cur) - EPS && hOverlap);
  }
}

function score(cur: NavRect, c: NavRect, dir: NavDirection): number {
  const horizontal = dir === 'left' || dir === 'right';
  const primary = horizontal
    ? dir === 'right'
      ? Math.max(0, c.x - (cur.x + cur.w))
      : Math.max(0, cur.x - (c.x + c.w))
    : dir === 'down'
      ? Math.max(0, c.y - (cur.y + cur.h))
      : Math.max(0, cur.y - (c.y + c.h));
  const secondary = horizontal ? gap(cur.y, cur.y + cur.h, c.y, c.y + c.h) : gap(cur.x, cur.x + cur.w, c.x, c.x + c.w);
  const centerOffset = horizontal ? Math.abs(cy(c) - cy(cur)) : Math.abs(cx(c) - cx(cur));
  return primary + ALIGN_WEIGHT * secondary + CENTER_WEIGHT * centerOffset;
}

/**
 * Index du prochain élément dans `rects` depuis l'élément d'index `current` (−1 : aucun focus => le premier élément
 * en haut à gauche), ou `current` s'il n'y a nulle part où aller.
 */
export function nextFocusIndex(rects: readonly NavRect[], current: number, dir: NavDirection): number {
  if (rects.length === 0) return -1;
  if (current < 0 || current >= rects.length) return firstFocusIndex(rects);
  const cur = rects[current];
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === current || !inDirection(cur, rects[i], dir)) continue;
    const s = score(cur, rects[i], dir);
    if (s < bestScore - 1e-9) {
      bestScore = s;
      best = i;
    }
  }
  if (best >= 0) return best;
  if (dir === 'left' || dir === 'right') return current;
  // Boucle verticale : le plus éloigné dans l'autre sens, le mieux aligné.
  const back: NavDirection = dir === 'down' ? 'up' : 'down';
  let wrap = current;
  let wrapScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === current || !inDirection(cur, rects[i], back)) continue;
    const r = rects[i];
    const far = dir === 'down' ? cy(r) : -cy(r); // le plus haut pour « bas », le plus bas pour « haut »
    const s = far + ALIGN_WEIGHT * gap(cur.x, cur.x + cur.w, r.x, r.x + r.w);
    if (s < wrapScore - 1e-9) {
      wrapScore = s;
      wrap = i;
    }
  }
  return wrap;
}

/** Premier élément « en haut à gauche » (lignes à EPS près, puis gauche), −1 si la liste est vide. */
export function firstFocusIndex(rects: readonly NavRect[]): number {
  let best = -1;
  for (let i = 0; i < rects.length; i++) {
    if (best < 0) {
      best = i;
      continue;
    }
    const a = rects[i];
    const b = rects[best];
    if (a.y < b.y - EPS || (Math.abs(a.y - b.y) <= EPS && a.x < b.x)) best = i;
  }
  return best;
}
