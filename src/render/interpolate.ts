/**
 * Interpolation entre deux états de la simulation (précédent / courant), PURE et sans
 * allocation (écrit dans des objets de sortie réutilisés). alpha = accumulateur / TICK_DT.
 */

import { lerpAngle, type Vec3 } from '../sim';
import { STYLE } from './palette';

/** Position interpolée ; un saut de plus de STYLE.teleportDist (remise en jeu) n'est pas interpolé. */
export function lerpPos(out: Vec3, prev: Vec3, curr: Vec3, alpha: number): Vec3 {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const dz = curr.z - prev.z;
  if (dx * dx + dy * dy + dz * dz > STYLE.teleportDist * STYLE.teleportDist) {
    out.x = curr.x;
    out.y = curr.y;
    out.z = curr.z;
    return out;
  }
  out.x = prev.x + dx * alpha;
  out.y = prev.y + dy * alpha;
  out.z = prev.z + dz * alpha;
  return out;
}

/** Angle interpolé par le plus court chemin (passage de -PI à PI sans tour complet). */
export const lerpYaw = (prev: number, curr: number, alpha: number): number => lerpAngle(prev, curr, alpha);
