/**
 * Estompage des joueurs qui gênent la caméra épaule (passe finale) — maths PURES, testées.
 *
 *  - Un AUTRE joueur dont le corps passe tout près de la caméra s'estompe progressivement (STYLE.cameraFadeNear ->
 *    STYLE.cameraFadeFar, distance caméra -> surface de sa capsule) : il ne couvre plus la moitié de l'écran.
 *  - Un autre joueur placé entre la caméra et le joueur local (près du segment caméra -> dos du joueur local) est
 *    estompé plus doucement (jusqu'à STYLE.lineFadeMin) : on garde la vue sur son personnage et le réticule.
 *  - Le joueur LOCAL s'estompe quand la caméra vient contre lui (collision avec le sol en regardant en l'air :
 *    STYLE.localFadeNear -> STYLE.localFadeFar).
 * Le rendu applique le résultat par « alpha hash » (tramage stable, passe opaque) : aucun tri, aucune recompilation.
 */

import { STYLE } from './palette';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Interpolation d'Hermite : 0 sous e0, 1 au-delà de e1, douce entre les deux. */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance du point P au segment AB. */
export function pointSegmentDistance(p: Point3, a: Point3, b: Point3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  const dz = p.z - (a.z + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Distance minimale entre les segments P0P1 et Q0Q1 (méthode classique des paramètres bornés). */
export function segmentSegmentDistance(p0: Point3, p1: Point3, q0: Point3, q1: Point3): number {
  const ux = p1.x - p0.x;
  const uy = p1.y - p0.y;
  const uz = p1.z - p0.z;
  const vx = q1.x - q0.x;
  const vy = q1.y - q0.y;
  const vz = q1.z - q0.z;
  const wx = p0.x - q0.x;
  const wy = p0.y - q0.y;
  const wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const eps = 1e-12;
  if (a <= eps) return pointSegmentDistance(p0, q0, q1);
  if (c <= eps) return pointSegmentDistance(q0, p0, p1);
  const den = a * c - b * b;
  let s = den > eps ? Math.min(1, Math.max(0, (b * e - c * d) / den)) : 0;
  let t = (b * s + e) / c;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -d / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - d) / a));
  }
  const dx = wx + ux * s - vx * t;
  const dy = wy + uy * s - vy * t;
  const dz = wz + uz * s - vz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Opacité d'un AUTRE joueur (0..1). `bodyDist` : distance caméra -> surface de sa capsule (m) ; `lineDist` : distance
 * entre l'axe de sa capsule et le segment caméra -> dos du joueur local, moins son rayon (m ; Infinity : sans objet).
 */
export function occluderFade(bodyDist: number, lineDist: number): number {
  const near = smoothstep(STYLE.cameraFadeNear, STYLE.cameraFadeFar, bodyDist);
  const line = STYLE.lineFadeMin + (1 - STYLE.lineFadeMin) * smoothstep(0, STYLE.lineFadeRadius, lineDist);
  return Math.min(near, line);
}

/** Opacité du joueur LOCAL (0..1) selon la distance caméra -> surface de sa capsule (m). */
export function localFade(bodyDist: number): number {
  return smoothstep(STYLE.localFadeNear, STYLE.localFadeFar, bodyDist);
}
