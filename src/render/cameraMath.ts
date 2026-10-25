/**
 * Maths de la caméra épaule (PURES, testées) — docs/ARCHITECTURE.md §3.
 *
 *   aimOrigin = pieds + AIM_ORIGIN_HEIGHT + SHOULDER_OFFSET vers right(yaw)   (fonction de la sim)
 *   camPos    = aimOrigin − aimDir(yaw, pitch) × distance
 *
 * La caméra regarde selon aimDir : le centre de l'écran (réticule) est donc EXACTEMENT sur la droite
 * de tir de la sim, quelle que soit la distance. Collision : si la caméra passe sous le sol (relief
 * compris, + CAMERA_GROUND_MARGIN), elle est rapprochée LE LONG DE LA MÊME DROITE.
 *
 * Passe finale :
 *  - collision BALAYÉE : on cherche le premier point du segment origine -> caméra sous le relief (+ marge), pas
 *    seulement l'extrémité (avant : 0,5 à 0,7 % des poses près d'une butte ou d'une rampe avaient la ligne de vue dans
 *    le relief, jusqu'à 0,67 m) ;
 *  - `raise` (porteur local, CAMERA_CARRY_RAISE) : pivot monté de `raise` à la verticale de l'origine de visée, même
 *    direction. Le porteur ne tire pas ; avec raise = 0 (tous les autres cas), l'invariant du réticule est intact.
 */

import {
  aimDir,
  aimOrigin,
  CAMERA_BLEND_RATE,
  CAMERA_CARRY_RAISE,
  CAMERA_DISTANCE,
  CAMERA_DISTANCE_AIM,
  CAMERA_DISTANCE_CARRY,
  CAMERA_FOV,
  CAMERA_FOV_AIM,
  CAMERA_FOV_CARRY,
  CAMERA_FOV_SPEED_GAIN,
  CAMERA_FOV_SPEED_MAX_BONUS,
  CAMERA_GROUND_MARGIN,
  CAMERA_MIN_DISTANCE,
  groundHeight,
  type FieldLayout,
  type Vec3,
} from '../sim';

export interface ShoulderPose {
  /** Origine de visée (point de départ des tirs). */
  origin: Vec3;
  /** Direction de visée unitaire (= direction de la caméra). */
  dir: Vec3;
  /** Position de la caméra. */
  pos: Vec3;
  /** Distance effective (après collision), mesurée depuis le pivot (origine de visée + `raise`). */
  distance: number;
  /** Hauteur ajoutée au pivot (m, porteur local) ; 0 : caméra exactement sur la droite de tir. */
  raise: number;
}

/**
 * Pas d'échantillonnage (m) du segment pivot -> caméra pour la collision balayée (technique : ≤ 0,1 m, la ligne de vue
 * ne peut entrer que de quelques centimètres dans l'arête d'un muret entre deux échantillons).
 */
const COLLISION_SAMPLE = 0.1;

/**
 * Position de la caméra épaule pour des pieds / une orientation / une distance voulue. `raise` (m, ≥ 0) : pivot monté
 * à la verticale de l'origine de visée (porteur local) ; 0 = caméra sur la droite de tir (§3).
 */
export function shoulderPose(field: FieldLayout, feet: Vec3, yaw: number, pitch: number, wantedDistance: number, raise = 0): ShoulderPose {
  const origin = aimOrigin(feet, yaw);
  const dir = aimDir(yaw, pitch);
  const lift = Math.max(0, raise);
  const px = origin.x;
  const py = origin.y + lift;
  const pz = origin.z;
  const want = Math.max(CAMERA_MIN_DISTANCE, wantedDistance);
  const blocked = (dist: number): boolean => {
    const x = px - dir.x * dist;
    const z = pz - dir.z * dist;
    return py - dir.y * dist < groundHeight(field, x, z) + CAMERA_GROUND_MARGIN;
  };
  // Premier échantillon du segment pivot -> caméra voulue qui passe sous le relief (+ marge) : la caméra se place sur
  // l'échantillon libre précédent. Le pivot lui-même (≥ AIM_ORIGIN_HEIGHT au-dessus des pieds) n'est pas testé.
  let d = want;
  const n = Math.max(1, Math.ceil(want / COLLISION_SAMPLE));
  const stepLen = want / n;
  for (let i = 1; i <= n; i++) {
    if (blocked(stepLen * i)) {
      d = Math.max(CAMERA_MIN_DISTANCE, stepLen * (i - 1));
      break;
    }
  }
  const pos = { x: px - dir.x * d, y: py - dir.y * d, z: pz - dir.z * d };
  return { origin, dir, pos, distance: d, raise: lift };
}

/** Situation du joueur local qui pilote distance et FOV. */
export interface CameraMode {
  aiming: boolean;
  carrier: boolean;
  /** Vitesse horizontale (m/s) et vitesse de course de base du rôle (bonus de FOV au-delà). */
  speed: number;
  runSpeed: number;
}

/**
 * Distance et FOV visés pour une situation (avant lissage). Le port du ballon PRIME sur la visée
 * (cahier des charges : « plus reculée quand on porte le ballon (on ne vise pas) »). Bonus de FOV lié
 * à la vitesse plafonné à CAMERA_FOV_SPEED_MAX_BONUS (pas de pulsation à chaque esquive).
 */
export function cameraTargets(mode: CameraMode): { distance: number; fov: number; raise: number } {
  const aiming = mode.aiming && !mode.carrier;
  const distance = mode.carrier ? CAMERA_DISTANCE_CARRY : aiming ? CAMERA_DISTANCE_AIM : CAMERA_DISTANCE;
  const base = mode.carrier ? CAMERA_FOV_CARRY : aiming ? CAMERA_FOV_AIM : CAMERA_FOV;
  const speedBonus = Math.min(CAMERA_FOV_SPEED_MAX_BONUS, CAMERA_FOV_SPEED_GAIN * Math.max(0, mode.speed - mode.runSpeed));
  const fov = base + (aiming ? 0 : speedBonus);
  // Passe finale : le porteur voit par-dessus son propre corps (CAMERA_CARRY_RAISE).
  const raise = mode.carrier ? CAMERA_CARRY_RAISE : 0;
  return { distance, fov, raise };
}

/** Lissage exponentiel indépendant du framerate (raideur CAMERA_BLEND_RATE). */
export const blendToward = (current: number, target: number, dt: number, rate: number = CAMERA_BLEND_RATE): number =>
  target + (current - target) * Math.exp(-rate * Math.max(0, dt));
