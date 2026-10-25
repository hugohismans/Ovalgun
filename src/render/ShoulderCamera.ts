/**
 * Caméra épaule à la troisième personne (Three.js). Toutes les maths sont dans cameraMath.ts.
 * Distance et FOV lissés entre course / porteur / visée ; yaw/pitch = valeurs courantes de
 * l'InputManager (non interpolées : visée réactive au framerate). Passe finale : montée du pivot du porteur lissée
 * (CAMERA_CARRY_RAISE).
 */

import * as THREE from 'three';
import { CAMERA_DISTANCE, CAMERA_FOV, type FieldLayout, type Vec3 } from '../sim';
import { blendToward, cameraTargets, shoulderPose, type CameraMode, type ShoulderPose } from './cameraMath';

export class ShoulderCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Distance, FOV et montée du pivot (porteur, passe finale) lissés. */
  distance = CAMERA_DISTANCE;
  fov = CAMERA_FOV;
  raise = 0;
  /** Dernière pose calculée (debug, tests de bout en bout). */
  lastPose: ShoulderPose | null = null;
  private readonly lookTarget = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 900);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Place la caméra derrière l'épaule droite du joueur (pieds interpolés). */
  update(field: FieldLayout, feet: Vec3, yaw: number, pitch: number, mode: CameraMode, dt: number): void {
    const target = cameraTargets(mode);
    this.distance = blendToward(this.distance, target.distance, dt);
    this.fov = blendToward(this.fov, target.fov, dt);
    this.raise = blendToward(this.raise, target.raise, dt);
    // Sous le millimètre, la caméra revient EXACTEMENT sur la droite de tir (§3).
    if (target.raise === 0 && this.raise < 1e-3) this.raise = 0;
    const pose = shoulderPose(field, feet, yaw, pitch, this.distance, this.raise);
    this.lastPose = pose;
    this.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    this.lookTarget.set(pose.pos.x + pose.dir.x, pose.pos.y + pose.dir.y, pose.pos.z + pose.dir.z);
    this.camera.lookAt(this.lookTarget);
    if (Math.abs(this.camera.fov - this.fov) > 1e-3) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
