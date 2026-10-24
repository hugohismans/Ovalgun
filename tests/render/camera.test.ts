/**
 * Caméra épaule : le centre de l'écran est sur la droite de tir de la sim, collision avec le sol le
 * long de la même droite, cibles de distance / FOV, interpolation des angles.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { blendToward, cameraTargets, shoulderPose } from '../../src/render/cameraMath';
import { lerpPos, lerpYaw } from '../../src/render/interpolate';
import { ShoulderCamera } from '../../src/render/ShoulderCamera';
import {
  AIM_ORIGIN_HEIGHT,
  CAMERA_DISTANCE,
  CAMERA_DISTANCE_AIM,
  CAMERA_DISTANCE_CARRY,
  CAMERA_FOV,
  CAMERA_FOV_AIM,
  CAMERA_FOV_CARRY,
  CAMERA_FOV_SPEED_GAIN,
  CAMERA_FOV_SPEED_MAX_BONUS,
  CAMERA_GROUND_MARGIN,
  DODGE_SPEED,
  PLAYER_RADIUS,
  SHOULDER_OFFSET,
} from '../../src/sim/constants';
import { createField, groundHeight } from '../../src/sim/field';
import { aimOrigin } from '../../src/sim/player';
import type { FieldLayout } from '../../src/sim/types';
import { aimDir, right } from '../../src/sim/vec';

const flat: FieldLayout = { ...createField(5), features: [] };
const MODE = { aiming: false, carrier: false, speed: 0, runSpeed: 8 };

describe('caméra épaule', () => {
  it('origine de visée : pieds + hauteur + épaule droite', () => {
    const o = aimOrigin({ x: 1, y: 0.5, z: 2 }, 0.7);
    const r = right(0.7);
    expect(o.x).toBeCloseTo(1 + r.x * SHOULDER_OFFSET, 12);
    expect(o.y).toBeCloseTo(0.5 + AIM_ORIGIN_HEIGHT, 12);
    expect(o.z).toBeCloseTo(2 + r.z * SHOULDER_OFFSET, 12);
  });

  it('la droite de tir (= centre de l’écran) passe à au moins 0,25 m du bord de la capsule : le réticule ne colle pas à la tête', () => {
    expect(SHOULDER_OFFSET - PLAYER_RADIUS).toBeGreaterThanOrEqual(0.25);
  });

  it('la droite caméra -> centre de l’écran passe par l’origine de visée, dans la direction du tir', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.3],
      [-2.5, -0.4],
      [3.1, 0.9],
    ]) {
      const feet = { x: 3, y: 0, z: -5 };
      const p = shoulderPose(flat, feet, yaw, pitch, CAMERA_DISTANCE);
      const o = aimOrigin(feet, yaw);
      const d = aimDir(yaw, pitch);
      expect(p.dir).toEqual(d);
      // pos + dir * distance = origine de visée.
      expect(p.pos.x + d.x * p.distance).toBeCloseTo(o.x, 9);
      expect(p.pos.y + d.y * p.distance).toBeCloseTo(o.y, 9);
      expect(p.pos.z + d.z * p.distance).toBeCloseTo(o.z, 9);
    }
  });

  it('caméra Three.js : un point lointain de la droite de tir se projette au centre de l’écran', () => {
    const cam = new ShoulderCamera(16 / 9);
    const feet = { x: -4, y: 0, z: 7 };
    const yaw = 0.8;
    const pitch = 0.25;
    cam.update(flat, feet, yaw, pitch, MODE, 1);
    cam.camera.updateMatrixWorld();
    const o = aimOrigin(feet, yaw);
    const d = aimDir(yaw, pitch);
    for (const t of [5, 20, 60]) {
      const v = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t).project(cam.camera);
      expect(Math.abs(v.x)).toBeLessThan(1e-6);
      expect(Math.abs(v.y)).toBeLessThan(1e-6);
    }
  });

  it('collision : la caméra reste au-dessus du sol (relief compris), sur la même droite', () => {
    const field = createField(5);
    const mound = field.features.find((f) => f.kind === 'mound');
    if (mound === undefined) throw new Error('butte attendue');
    // Joueur au pied de la butte, regardant vers le haut, butte derrière lui.
    const feet = { x: mound.x, y: 0, z: mound.z + mound.radius + 0.5 };
    const pitch = 0.9;
    const p = shoulderPose(field, feet, 0, pitch, CAMERA_DISTANCE_CARRY);
    expect(p.distance).toBeLessThan(CAMERA_DISTANCE_CARRY);
    expect(p.pos.y).toBeGreaterThanOrEqual(groundHeight(field, p.pos.x, p.pos.z) + CAMERA_GROUND_MARGIN - 1e-9);
    const o = aimOrigin(feet, 0);
    expect(p.pos.y + p.dir.y * p.distance).toBeCloseTo(o.y, 9);
    // Sur terrain plat, regard horizontal : pas de rapprochement.
    expect(shoulderPose(flat, feet, 0, 0, CAMERA_DISTANCE).distance).toBeCloseTo(CAMERA_DISTANCE, 12);
  });

  it('distance / FOV : plus reculée en portant le ballon, plus proche en visée, FOV élargi par la vitesse', () => {
    expect(cameraTargets(MODE)).toEqual({ distance: CAMERA_DISTANCE, fov: CAMERA_FOV });
    expect(cameraTargets({ ...MODE, carrier: true })).toEqual({ distance: CAMERA_DISTANCE_CARRY, fov: CAMERA_FOV_CARRY });
    expect(cameraTargets({ ...MODE, aiming: true })).toEqual({ distance: CAMERA_DISTANCE_AIM, fov: CAMERA_FOV_AIM });
    // Le porteur ne vise pas : la visée ne rapproche pas sa caméra (cahier des charges).
    expect(cameraTargets({ ...MODE, carrier: true, aiming: true })).toEqual({ distance: CAMERA_DISTANCE_CARRY, fov: CAMERA_FOV_CARRY });
    expect(cameraTargets({ ...MODE, speed: 12 }).fov).toBeGreaterThan(CAMERA_FOV);
    expect(CAMERA_DISTANCE_AIM).toBeLessThan(CAMERA_DISTANCE);
    expect(CAMERA_DISTANCE_CARRY).toBeGreaterThan(CAMERA_DISTANCE);
  });

  it('bonus de FOV lié à la vitesse plafonné (pas de pulsation de +14° à chaque esquive)', () => {
    const dodge = cameraTargets({ ...MODE, speed: DODGE_SPEED });
    expect(dodge.fov).toBeCloseTo(CAMERA_FOV + CAMERA_FOV_SPEED_MAX_BONUS, 9);
    const small = cameraTargets({ ...MODE, speed: MODE.runSpeed + 1 });
    expect(small.fov).toBeCloseTo(CAMERA_FOV + CAMERA_FOV_SPEED_GAIN, 9);
  });

  it('lissage indépendant du framerate', () => {
    const one = blendToward(0, 10, 0.1);
    const two = blendToward(blendToward(0, 10, 0.05), 10, 0.05);
    expect(one).toBeCloseTo(two, 12);
    expect(blendToward(3, 10, 0)).toBe(3);
  });
});

describe('interpolation', () => {
  it('angles par le plus court chemin (pas de tour complet en passant ±π)', () => {
    const a = lerpYaw(3.0, -3.0, 0.5);
    expect(Math.abs(Math.cos(a) - Math.cos(Math.PI))).toBeLessThan(1e-3);
    expect(lerpYaw(0.2, 0.6, 0.25)).toBeCloseTo(0.3, 12);
  });

  it('positions en lerp, téléportation non interpolée', () => {
    const out = { x: 0, y: 0, z: 0 };
    lerpPos(out, { x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: -1 }, 0.5);
    expect(out).toEqual({ x: 0.5, y: 1, z: -0.5 });
    lerpPos(out, { x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 0.5);
    expect(out).toEqual({ x: 30, y: 0, z: 0 });
  });
});
