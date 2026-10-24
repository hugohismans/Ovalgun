/**
 * Intersections segment / capsule et segment / terrain pour les projectiles (étape 5). Fonctions PURES.
 *
 * Un projectile parcourt un segment par tick (300 m/s = 10 m par tick) : on calcule le PREMIER instant
 * t ∈ [0, 1] du segment où il entre dans une capsule de joueur ou dans le relief. Le test est exact
 * (aucun « tunnel ») pour les capsules, le sol plat, les murets et les rampes ; les buttes (relief lisse)
 * sont échantillonnées tous les PROJECTILE_MOUND_SAMPLE_STEP puis affinées par dichotomie.
 *
 * Repère local d'un relief orienté : voir field.ts (lz = dx·sin r + dz·cos r ; lx = dx·cos r − dz·sin r).
 * La rotation est une isométrie : les paramètres t calculés en coordonnées locales valent en monde.
 */

import { PROJECTILE_MOUND_SAMPLE_STEP } from './constants';
import { featureSupport } from './field';
import type { FieldLayout, MoundFeature, RampFeature, WallFeature } from './types';
import type { Vec3 } from './vec';

/** Tolérance numérique (pas une valeur de gameplay). */
const EPS = 1e-12;
/** Itérations de dichotomie pour affiner le contact avec une butte (précision ≈ pas / 2^n). */
const MOUND_BISECT_STEPS = 10;

/**
 * Vrai si le point `a` est dans la capsule verticale (mêmes paramètres que segmentCapsuleEntry) et que la direction
 * `dir` s'éloigne de son axe (produit scalaire ≥ 0 avec a − point le plus proche de l'axe) : un tir qui PART de
 * l'intérieur d'une capsule (adversaire collé à l'épaule du tireur) et s'en éloigne ne la traverse pas.
 */
export function startsInsideLeaving(a: Vec3, dir: Vec3, base: Vec3, height: number, radius: number): boolean {
  const y0 = base.y + radius;
  const y1 = base.y + Math.max(height - radius, radius);
  const cy = a.y < y0 ? y0 : a.y > y1 ? y1 : a.y;
  const ax = a.x - base.x;
  const ay = a.y - cy;
  const az = a.z - base.z;
  if (ax * ax + ay * ay + az * az > radius * radius) return false;
  return ax * dir.x + ay * dir.y + az * dir.z >= 0;
}

/** Premier t ∈ [0, 1] d'entrée du segment [a, a + d] dans la sphère (centre c, rayon r), ou −1. */
function sphereEntry(a: Vec3, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const qx = a.x - cx;
  const qy = a.y - cy;
  const qz = a.z - cz;
  const A = dx * dx + dy * dy + dz * dz;
  if (A < EPS) return -1;
  const B = 2 * (qx * dx + qy * dy + qz * dz);
  const C = qx * qx + qy * qy + qz * qz - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Premier instant t ∈ [0, 1] où le segment [a, b] entre dans la capsule VERTICALE d'un joueur (pieds `base`,
 * hauteur totale `height`, rayon `radius` : axe de base.y + r à base.y + max(height − r, r)), ou −1.
 * Si `a` est déjà dans la capsule, renvoie 0. Exact (cylindre + deux demi-sphères).
 */
export function segmentCapsuleEntry(a: Vec3, b: Vec3, base: Vec3, height: number, radius: number): number {
  const y0 = base.y + radius;
  const y1 = base.y + Math.max(height - radius, radius);
  // Départ dans la capsule ?
  const cy = a.y < y0 ? y0 : a.y > y1 ? y1 : a.y;
  const ax = a.x - base.x;
  const az = a.z - base.z;
  const ay = a.y - cy;
  if (ax * ax + ay * ay + az * az <= radius * radius) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  let best = -1;
  // Paroi du cylindre (entrée par le côté, entre les deux centres des demi-sphères).
  const A = dx * dx + dz * dz;
  if (A > EPS) {
    const B = 2 * (ax * dx + az * dz);
    const C = ax * ax + az * az - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t >= 0 && t <= 1) {
        const y = a.y + dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // Demi-sphères (les « bouchons » plats du cylindre sont à l'intérieur des sphères).
  const tLow = sphereEntry(a, dx, dy, dz, base.x, y0, base.z, radius);
  if (tLow >= 0 && (best < 0 || tLow < best)) best = tLow;
  if (y1 > y0) {
    const tHigh = sphereEntry(a, dx, dy, dz, base.x, y1, base.z, radius);
    if (tHigh >= 0 && (best < 0 || tHigh < best)) best = tHigh;
  }
  return best;
}

/**
 * Clipping de Cyrus-Beck du segment local (p0 + t·d) contre un polyèdre convexe donné par ses demi-espaces
 * n·p ≤ k (tableau plat [nx, ny, nz, k, …]). Renvoie le t d'entrée ∈ [0, 1] (0 si p0 est dedans), ou −1.
 */
function convexEntry(px: number, py: number, pz: number, dx: number, dy: number, dz: number, planes: readonly number[]): number {
  let tE = 0;
  let tL = 1;
  for (let i = 0; i < planes.length; i += 4) {
    const nx = planes[i];
    const ny = planes[i + 1];
    const nz = planes[i + 2];
    const k = planes[i + 3];
    const num = k - (nx * px + ny * py + nz * pz);
    const den = nx * dx + ny * dy + nz * dz;
    if (Math.abs(den) < EPS) {
      if (num < 0) return -1; // parallèle et dehors
      continue;
    }
    const t = num / den;
    if (den < 0) {
      if (t > tE) tE = t; // entrée
    } else if (t < tL) {
      tL = t; // sortie
    }
    if (tE > tL) return -1;
  }
  return tE;
}

/** Entrée dans un muret (boîte) ou une rampe (coin : boîte coupée par le plan de la pente), ou −1. */
function orientedEntry(f: WallFeature | RampFeature, a: Vec3, b: Vec3): number {
  const s = Math.sin(f.rotation);
  const c = Math.cos(f.rotation);
  const ax = a.x - f.x;
  const az = a.z - f.z;
  const lx0 = ax * c - az * s;
  const lz0 = ax * s + az * c;
  const dxw = b.x - a.x;
  const dzw = b.z - a.z;
  const dlx = dxw * c - dzw * s;
  const dlz = dxw * s + dzw * c;
  const dy = b.y - a.y;
  const hx = f.kind === 'ramp' ? f.width / 2 : f.thickness / 2;
  const hz = f.length / 2;
  // Demi-espaces : |lx| ≤ hx, |lz| ≤ hz, y ≥ 0, et dessus (y ≤ h pour un muret ; sous la pente pour une rampe :
  // y ≤ h·(lz + hz) / (2·hz)  <=>  y − (h / 2hz)·lz ≤ h / 2).
  const planes =
    f.kind === 'wall' || hz <= 0
      ? [1, 0, 0, hx, -1, 0, 0, hx, 0, 0, 1, hz, 0, 0, -1, hz, 0, -1, 0, 0, 0, 1, 0, f.height]
      : [1, 0, 0, hx, -1, 0, 0, hx, 0, 0, 1, hz, 0, 0, -1, hz, 0, -1, 0, 0, 0, 1, -f.height / (2 * hz), f.height / 2];
  return convexEntry(lx0, a.y, lz0, dlx, dy, dlz, planes);
}

/**
 * Entrée dans une butte : le segment est d'abord borné au cylindre vertical de la butte (et sous son sommet),
 * puis échantillonné tous les PROJECTILE_MOUND_SAMPLE_STEP ; le premier échantillon sous le relief est affiné
 * par dichotomie avec le précédent. Renvoie t ∈ [0, 1] ou −1.
 */
function moundEntry(f: MoundFeature, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const ax = a.x - f.x;
  const az = a.z - f.z;
  let t0 = 0;
  let t1 = 1;
  const A = dx * dx + dz * dz;
  const C = ax * ax + az * az - f.radius * f.radius;
  if (A > EPS) {
    const B = 2 * (ax * dx + az * dz);
    const disc = B * B - 4 * A * C;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    t0 = Math.max(t0, (-B - sq) / (2 * A));
    t1 = Math.min(t1, (-B + sq) / (2 * A));
  } else if (C >= 0) {
    return -1;
  }
  // Sous le sommet de la butte seulement.
  if (Math.abs(dy) < EPS) {
    if (a.y > f.height) return -1;
  } else {
    const tTop = (f.height - a.y) / dy;
    if (dy > 0) t1 = Math.min(t1, tTop); // monte : sous le sommet jusqu'à tTop
    else t0 = Math.max(t0, tTop); // descend : sous le sommet à partir de tTop
  }
  if (t0 > t1) return -1;
  const below = (t: number): boolean => a.y + dy * t <= featureSupport(f, a.x + dx * t, a.z + dz * t, 0);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const n = Math.max(1, Math.ceil(((t1 - t0) * len) / PROJECTILE_MOUND_SAMPLE_STEP));
  let prev = t0;
  if (below(t0)) return t0;
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < MOUND_BISECT_STEPS; k++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prev = t;
  }
  return -1;
}

/**
 * Premier instant t ∈ [0, 1] où le segment [a, b] touche le relief (sol plat y = 0, buttes, rampes, murets) ou
 * franchit vers l'extérieur un mur invisible du terrain (|x| = width / 2, |z| = length / 2) ; −1 sinon.
 * Un départ déjà hors d'un mur invisible (origine de visée décalée de l'épaule d'un joueur collé au bord)
 * n'est pas arrêté par ce mur : seul un franchissement de l'intérieur vers l'extérieur compte.
 */
export function segmentTerrainEntry(field: FieldLayout, a: Vec3, b: Vec3): number {
  let best = -1;
  const take = (t: number): void => {
    if (t >= 0 && t <= 1 && (best < 0 || t < best)) best = t;
  };
  // Sol plat.
  if (a.y <= 0) take(0);
  else if (b.y < 0) take(a.y / (a.y - b.y));
  // Murs invisibles (franchissement vers l'extérieur).
  const hw = field.width / 2;
  const hl = field.length / 2;
  if (a.x <= hw && b.x > hw) take((hw - a.x) / (b.x - a.x));
  if (a.x >= -hw && b.x < -hw) take((-hw - a.x) / (b.x - a.x));
  if (a.z <= hl && b.z > hl) take((hl - a.z) / (b.z - a.z));
  if (a.z >= -hl && b.z < -hl) take((-hl - a.z) / (b.z - a.z));
  // Reliefs.
  for (const f of field.features) {
    take(f.kind === 'mound' ? moundEntry(f, a, b) : orientedEntry(f, a, b));
  }
  return best;
}
