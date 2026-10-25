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
 *
 * Réglages du joueur (CameraPrefs) : FOV de base, multiplicateur de distance (la caméra reste sur la droite de tir) et
 * hauteur `height` ajoutée au pivot. Avec une hauteur ≠ 0, la caméra n'est plus sur la droite de tir : elle regarde le
 * point de cette droite situé à CAMERA_CONVERGE_DISTANCE devant l'origine de visée (convergence), où le réticule est
 * exact. Hauteur 0 (défaut) : regard = aimDir, invariant exact.
 */

import {
  aimDir,
  aimOrigin,
  CAMERA_BLEND_RATE,
  CAMERA_CARRY_RAISE,
  CAMERA_CONVERGE_DISTANCE,
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
  /** Direction de visée unitaire. */
  dir: Vec3;
  /** Direction du regard de la caméra (unitaire) : = dir sauf hauteur de caméra réglée (convergence). */
  look: Vec3;
  /** Position de la caméra. */
  pos: Vec3;
  /** Distance effective (après collision), mesurée depuis le pivot (origine de visée + `raise`). */
  distance: number;
  /** Hauteur ajoutée au pivot (m : porteur local + réglage) ; 0 : caméra exactement sur la droite de tir. */
  raise: number;
}

/**
 * Pas d'échantillonnage (m) du segment pivot -> caméra pour la collision balayée (technique : ≤ 0,1 m, la ligne de vue
 * ne peut entrer que de quelques centimètres dans l'arête d'un muret entre deux échantillons).
 */
const COLLISION_SAMPLE = 0.1;

/**
 * Position de la caméra épaule pour des pieds / une orientation / une distance voulue. `raise` (m, ≥ 0) : pivot monté
 * à la verticale de l'origine de visée (porteur local), même direction ; `height` (m, réglage du joueur, signé) : pivot
 * décalé verticalement, regard convergent (voir l'en-tête). Les deux à 0 : caméra sur la droite de tir (§3).
 */
export function shoulderPose(field: FieldLayout, feet: Vec3, yaw: number, pitch: number, wantedDistance: number, raise = 0, height = 0): ShoulderPose {
  const origin = aimOrigin(feet, yaw);
  const dir = aimDir(yaw, pitch);
  const carry = Math.max(0, raise);
  const lift = carry + height;
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
  let look = dir;
  if (height !== 0) {
    // Convergence : regard vers le point de la droite de tir (montée du porteur comprise) à CAMERA_CONVERGE_DISTANCE.
    const lx = origin.x + dir.x * CAMERA_CONVERGE_DISTANCE - pos.x;
    const ly = origin.y + carry + dir.y * CAMERA_CONVERGE_DISTANCE - pos.y;
    const lz = origin.z + dir.z * CAMERA_CONVERGE_DISTANCE - pos.z;
    const len = Math.hypot(lx, ly, lz);
    look = { x: lx / len, y: ly / len, z: lz / len };
  }
  return { origin, dir, look, pos, distance: d, raise: lift };
}

/** Réglages de caméra du joueur (PlayerSettings, appliqués par la session au rendu). */
export interface CameraPrefs {
  /** FOV vertical de base (degrés) : remplace CAMERA_FOV, porteur et visée décalés d'autant. */
  fov: number;
  /** Multiplicateur des distances CAMERA_DISTANCE* (la caméra reste sur la droite de tir). */
  distanceScale: number;
  /** Hauteur ajoutée au pivot (m, signée ; regard convergent). */
  height: number;
  /** Bonus de FOV lié à la vitesse (CAMERA_FOV_SPEED_GAIN). */
  speedFov: boolean;
}

export const DEFAULT_CAMERA_PREFS: Readonly<CameraPrefs> = Object.freeze({ fov: CAMERA_FOV, distanceScale: 1, height: 0, speedFov: true });

/** Situation du joueur local qui pilote distance et FOV. */
export interface CameraMode {
  aiming: boolean;
  carrier: boolean;
  /** Vitesse horizontale (m/s) et vitesse de course de base du rôle (bonus de FOV au-delà). */
  speed: number;
  runSpeed: number;
}

/**
 * Distance et FOV visés pour une situation (avant lissage), réglages du joueur appliqués (`prefs`). Le port du ballon PRIME sur la visée
 * (cahier des charges : « plus reculée quand on porte le ballon (on ne vise pas) »). Bonus de FOV lié
 * à la vitesse plafonné à CAMERA_FOV_SPEED_MAX_BONUS (pas de pulsation à chaque esquive).
 */
export function cameraTargets(mode: CameraMode, prefs: Readonly<CameraPrefs> = DEFAULT_CAMERA_PREFS): { distance: number; fov: number; raise: number } {
  const aiming = mode.aiming && !mode.carrier;
  const distance = (mode.carrier ? CAMERA_DISTANCE_CARRY : aiming ? CAMERA_DISTANCE_AIM : CAMERA_DISTANCE) * prefs.distanceScale;
  const base = (mode.carrier ? CAMERA_FOV_CARRY : aiming ? CAMERA_FOV_AIM : CAMERA_FOV) + prefs.fov - CAMERA_FOV;
  const speedBonus = prefs.speedFov ? Math.min(CAMERA_FOV_SPEED_MAX_BONUS, CAMERA_FOV_SPEED_GAIN * Math.max(0, mode.speed - mode.runSpeed)) : 0;
  const fov = base + (aiming ? 0 : speedBonus);
  // Passe finale : le porteur voit par-dessus son propre corps (CAMERA_CARRY_RAISE).
  const raise = mode.carrier ? CAMERA_CARRY_RAISE : 0;
  return { distance, fov, raise };
}

/** Lissage exponentiel indépendant du framerate (raideur CAMERA_BLEND_RATE). */
export const blendToward = (current: number, target: number, dt: number, rate: number = CAMERA_BLEND_RATE): number =>
  target + (current - target) * Math.exp(-rate * Math.max(0, dt));
