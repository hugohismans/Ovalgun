/**
 * Visée des bots (PURE, partagée par la tourelle de l'étape 5 et les bots de l'étape 6) : avance sur une cible
 * qui court, angles de tir vers un point.
 *
 * Les projectiles d'un tick sont testés contre les capsules du DÉBUT du tick (docs/ARCHITECTURE.md §10) : une
 * balle tirée sur l'état que le bot lit parcourt `speed × TICK_DT` par tick pendant que la cible avance de
 * `vel × TICK_DT`. Viser la position prévue à `distance / speed` secondes (temps de vol) suffit, à moins d'un tick
 * près (absorbé par le rayon de la capsule et PROJECTILE_HIT_RADIUS).
 */

import { aimOrigin, playerHeight, type PlayerState, type Vec3 } from '../sim';

/**
 * Point visé sur `target` (centre de sa capsule) depuis l'origine de visée `origin`, avancé de `leadFraction`
 * × (vitesse horizontale de la cible × temps de vol à `speed` m/s). Deux passes : le temps de vol dépend du point.
 * `leadFraction` = 0 : position actuelle ; 1 : position prévue à l'arrivée de la balle.
 */
export function leadAimPoint(origin: Vec3, target: PlayerState, speed: number, leadFraction: number): Vec3 {
  const cx = target.pos.x;
  const cy = target.pos.y + playerHeight(target) / 2;
  const cz = target.pos.z;
  let px = cx;
  let pz = cz;
  if (speed > 0 && leadFraction > 0) {
    for (let i = 0; i < 2; i++) {
      const d = Math.sqrt((px - origin.x) ** 2 + (cy - origin.y) ** 2 + (pz - origin.z) ** 2);
      const lead = (d / speed) * leadFraction;
      px = cx + target.vel.x * lead;
      pz = cz + target.vel.z * lead;
    }
  }
  return { x: px, y: cy, z: pz };
}

/**
 * Yaw / pitch qui font partir le tir de `me` (depuis aimOrigin) vers le point `p`. Deux passes : l'origine de
 * visée dépend du yaw (décalage d'épaule).
 */
export function aimAnglesTo(me: PlayerState, p: Vec3): { yaw: number; pitch: number } {
  let yaw = Math.atan2(p.x - me.pos.x, p.z - me.pos.z);
  let pitch = 0;
  for (let i = 0; i < 2; i++) {
    const o = aimOrigin(me.pos, yaw);
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    yaw = Math.atan2(dx, dz);
    pitch = Math.atan2(p.y - o.y, Math.sqrt(dx * dx + dz * dz));
  }
  return { yaw, pitch };
}

/**
 * Angle d'élévation (rad) qui envoie un projectile de vitesse `speed` et de gravité `g` (parabole exacte) à la distance
 * horizontale `dist` avec un dénivelé `dy` (> 0 : plus haut) ; arc bas (`high` faux, plus rapide) ou arc haut (« en
 * cloche », passe au-dessus d'un obstacle). null si le point est hors de portée. Sans gravité : visée directe. PURE.
 */
export function ballisticPitch(dist: number, dy: number, speed: number, g: number, high: boolean): number | null {
  if (g <= 0) return Math.atan2(dy, dist);
  if (dist < 1e-6) return null;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dist * dist + 2 * dy * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return Math.atan((v2 + (high ? root : -root)) / (g * dist));
}

/** Tir balistique : regard (yaw, pitch) et durée de vol (s) jusqu'au point visé. */
export interface BallisticAim {
  yaw: number;
  pitch: number;
  time: number;
}

/**
 * Regard qui fait partir un projectile balistique de `me` (depuis aimOrigin, décalage d'épaule compris : deux passes)
 * vers le point `p`, arc bas ou haut ; null hors de portée. PURE.
 */
export function ballisticAimTo(me: PlayerState, p: Vec3, speed: number, g: number, high: boolean): BallisticAim | null {
  let yaw = Math.atan2(p.x - me.pos.x, p.z - me.pos.z);
  let res: BallisticAim | null = null;
  for (let i = 0; i < 2; i++) {
    const o = aimOrigin(me.pos, yaw);
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    yaw = Math.atan2(dx, dz);
    const pitch = ballisticPitch(dist, p.y - o.y, speed, g, high);
    if (pitch === null) return null;
    res = { yaw, pitch, time: dist / Math.max(1e-6, speed * Math.cos(pitch)) };
  }
  return res;
}
