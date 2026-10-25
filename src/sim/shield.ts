/**
 * Bouclier frontal du pilier (étape 7) : géométrie et règles PURES, partagées par les projectiles, les explosions,
 * le rendu et les bots.
 *
 * Géométrie (identique dans la sim et le rendu) : un ARC de cylindre vertical de rayon SHIELD_DISTANCE autour de
 * l'axe du pilier, sur ±SHIELD_HALF_ANGLE_DEG autour de son regard (yaw), des pieds jusqu'à SHIELD_HEIGHT.
 *
 * Deux règles (docs/ARCHITECTURE.md §13) :
 *  1. SURFACE : un projectile adverse qui ENTRE dans cette surface depuis l'extérieur est détruit (il protège aussi
 *     les coéquipiers qui sont derrière) ; de même, une explosion dont la ligne de vue vers un joueur traverse la
 *     surface ne lui fait rien (knockback réduit). Un tir qui part de l'intérieur du cylindre ou qui le traverse par
 *     l'arrière n'est pas arrêté par la surface.
 *  2. ARC FRONTAL : le pilier lui-même ne subit aucun projectile ni explosion venant de son arc frontal (direction
 *     horizontale de la source à moins de SHIELD_HALF_ANGLE_DEG de son regard), même s'il a contourné le bord de la
 *     surface (tir rasant, tir collé). Les tirs dans le dos le touchent normalement.
 * Le bouclier n'est levé que par un pilier ACTIF dont la capacité est en cours (abilityTicks > 0).
 */

import { SHIELD_DISTANCE, SHIELD_HALF_ANGLE_DEG, SHIELD_HEIGHT } from './constants';
import type { PlayerState } from './types';
import type { Vec3 } from './vec';

/** Cosinus du demi-angle de l'arc protégé. */
const COS_HALF = Math.cos((SHIELD_HALF_ANGLE_DEG * Math.PI) / 180);
/** Tolérance numérique (pas une valeur de gameplay). */
const EPS = 1e-12;

/** Vrai si le bouclier de `p` est levé (pilier actif, capacité en cours). */
export const shieldUp = (p: PlayerState): boolean => p.role === 'pilier' && p.abilityTicks > 0 && p.status === 'active';

/**
 * Vrai si la direction horizontale (dx, dz), DEPUIS le pilier VERS la source (tireur, explosion, point d'entrée), est
 * dans son arc frontal (règle 2). Direction nulle (source à la verticale) : faux. Ne regarde pas si le bouclier est levé.
 */
export function shieldArcCovers(p: PlayerState, dx: number, dz: number): boolean {
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-9) return false;
  return (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / l >= COS_HALF;
}

/**
 * Vrai si le bouclier de `p` est levé et que le point (x, z) est dans son arc frontal (PURE : bots, rendu). Un tireur
 * placé là ne peut pas toucher le pilier de face.
 */
export const shieldFacing = (p: PlayerState, x: number, z: number): boolean =>
  shieldUp(p) && shieldArcCovers(p, x - p.pos.x, z - p.pos.z);

/**
 * Premier instant t ∈ [0, 1] où le segment [a, b] ENTRE dans la surface du bouclier de `p` depuis l'extérieur du
 * cylindre (règle 1), ou −1. Ne vérifie pas que le bouclier est levé (voir shieldUp). Départ dans le cylindre (tir
 * collé), point d'entrée hors de l'arc ou hors de la hauteur du bouclier : −1.
 */
export function segmentShieldEntry(a: Vec3, b: Vec3, p: PlayerState): number {
  const ax = a.x - p.pos.x;
  const az = a.z - p.pos.z;
  const r = SHIELD_DISTANCE;
  const C = ax * ax + az * az - r * r;
  if (C <= 0) return -1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const A = dx * dx + dz * dz;
  if (A < EPS) return -1;
  const B = 2 * (ax * dx + az * dz);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return -1;
  const y = a.y + (b.y - a.y) * t;
  if (y < p.pos.y || y > p.pos.y + SHIELD_HEIGHT) return -1;
  return shieldArcCovers(p, ax + dx * t, az + dz * t) ? t : -1;
}

/**
 * Point de la surface du bouclier de `p` dans la direction horizontale (dx, dz) (depuis le pilier), à la hauteur `y`
 * bornée au bouclier : position de l'événement 'blocked' quand la règle 2 s'applique. Direction nulle : devant (yaw).
 */
export function shieldPoint(p: PlayerState, dx: number, dz: number, y: number): Vec3 {
  let l = Math.sqrt(dx * dx + dz * dz);
  let ux = dx;
  let uz = dz;
  if (l < 1e-9) {
    ux = Math.sin(p.yaw);
    uz = Math.cos(p.yaw);
    l = 1;
  }
  const cy = Math.min(p.pos.y + SHIELD_HEIGHT, Math.max(p.pos.y, y));
  return { x: p.pos.x + (ux / l) * SHIELD_DISTANCE, y: cy, z: p.pos.z + (uz / l) * SHIELD_DISTANCE };
}
