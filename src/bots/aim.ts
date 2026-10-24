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
