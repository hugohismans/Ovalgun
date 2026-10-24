/**
 * Maths de la caméra épaule (PURES, testées) — docs/ARCHITECTURE.md §3.
 *
 *   aimOrigin = pieds + AIM_ORIGIN_HEIGHT + SHOULDER_OFFSET vers right(yaw)   (fonction de la sim)
 *   camPos    = aimOrigin − aimDir(yaw, pitch) × distance
 *
 * La caméra regarde selon aimDir : le centre de l'écran (réticule) est donc EXACTEMENT sur la droite
 * de tir de la sim, quelle que soit la distance. Collision : si la caméra passe sous le sol (relief
 * compris, + CAMERA_GROUND_MARGIN), elle est rapprochée LE LONG DE LA MÊME DROITE.
 */

import {
  aimDir,
  aimOrigin,
  CAMERA_BLEND_RATE,
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
  /** Distance effective (après collision). */
  distance: number;
}

/** Pas de recherche (m) du rapprochement de la caméra en cas de collision avec le sol. */
const COLLISION_STEP = 0.05;

/** Position de la caméra épaule pour des pieds / une orientation / une distance voulue. */
export function shoulderPose(field: FieldLayout, feet: Vec3, yaw: number, pitch: number, wantedDistance: number): ShoulderPose {
  const origin = aimOrigin(feet, yaw);
  const dir = aimDir(yaw, pitch);
  let d = Math.max(CAMERA_MIN_DISTANCE, wantedDistance);
  const posAt = (dist: number): Vec3 => ({ x: origin.x - dir.x * dist, y: origin.y - dir.y * dist, z: origin.z - dir.z * dist });
  let pos = posAt(d);
  while (d > CAMERA_MIN_DISTANCE && pos.y < groundHeight(field, pos.x, pos.z) + CAMERA_GROUND_MARGIN) {
    d = Math.max(CAMERA_MIN_DISTANCE, d - COLLISION_STEP);
    pos = posAt(d);
  }
  return { origin, dir, pos, distance: d };
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
export function cameraTargets(mode: CameraMode): { distance: number; fov: number } {
  const aiming = mode.aiming && !mode.carrier;
  const distance = mode.carrier ? CAMERA_DISTANCE_CARRY : aiming ? CAMERA_DISTANCE_AIM : CAMERA_DISTANCE;
  const base = mode.carrier ? CAMERA_FOV_CARRY : aiming ? CAMERA_FOV_AIM : CAMERA_FOV;
  const speedBonus = Math.min(CAMERA_FOV_SPEED_MAX_BONUS, CAMERA_FOV_SPEED_GAIN * Math.max(0, mode.speed - mode.runSpeed));
  const fov = base + (aiming ? 0 : speedBonus);
  return { distance, fov };
}

/** Lissage exponentiel indépendant du framerate (raideur CAMERA_BLEND_RATE). */
export const blendToward = (current: number, target: number, dt: number, rate: number = CAMERA_BLEND_RATE): number =>
  target + (current - target) * Math.exp(-rate * Math.max(0, dt));
