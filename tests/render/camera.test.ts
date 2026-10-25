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
  CAMERA_CARRY_RAISE,
  CAMERA_FOV,
  CAMERA_FOV_AIM,
  CAMERA_FOV_CARRY,
  CAMERA_FOV_SPEED_GAIN,
  CAMERA_FOV_SPEED_MAX_BONUS,
  CAMERA_GROUND_MARGIN,
  CAMERA_MIN_DISTANCE,
  CARRIER_SPEED_MULT,
  DODGE_SPEED,
  ROLES,
  SPRINT_SPEED_MULT,
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
    expect(cameraTargets(MODE)).toEqual({ distance: CAMERA_DISTANCE, fov: CAMERA_FOV, raise: 0 });
    expect(cameraTargets({ ...MODE, carrier: true })).toEqual({ distance: CAMERA_DISTANCE_CARRY, fov: CAMERA_FOV_CARRY, raise: CAMERA_CARRY_RAISE });
    expect(cameraTargets({ ...MODE, aiming: true })).toEqual({ distance: CAMERA_DISTANCE_AIM, fov: CAMERA_FOV_AIM, raise: 0 });
    // Le porteur ne vise pas : la visée ne rapproche pas sa caméra (cahier des charges).
    expect(cameraTargets({ ...MODE, carrier: true, aiming: true })).toEqual({
      distance: CAMERA_DISTANCE_CARRY,
      fov: CAMERA_FOV_CARRY,
      raise: CAMERA_CARRY_RAISE,
    });
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

  it('passe finale : FOV qui s’ouvre au sprint du porteur et ne pulse presque plus à l’esquive', () => {
    const run = ROLES.ailier.runSpeed;
    const sprint = cameraTargets({ aiming: false, carrier: true, speed: run * SPRINT_SPEED_MULT * CARRIER_SPEED_MULT, runSpeed: run });
    const dodge = cameraTargets({ aiming: false, carrier: true, speed: DODGE_SPEED, runSpeed: run });
    expect(sprint.fov - CAMERA_FOV_CARRY).toBeGreaterThan(4); // ≈ +5,5° (avant : +2,2°)
    expect(dodge.fov - sprint.fov).toBeLessThan(1); // ≈ +0,5° au-dessus du sprint (avant : +3,8°)
  });

  it('passe finale : pivot du porteur monté (CAMERA_CARRY_RAISE), même direction ; revient EXACTEMENT sur la droite de tir', () => {
    const feet = { x: 2, y: 0, z: -3 };
    const p = shoulderPose(flat, feet, 0.4, 0, CAMERA_DISTANCE_CARRY, CAMERA_CARRY_RAISE);
    const o = aimOrigin(feet, 0.4);
    expect(p.dir).toEqual(aimDir(0.4, 0));
    expect(p.raise).toBe(CAMERA_CARRY_RAISE);
    expect(p.pos.y).toBeCloseTo(o.y + CAMERA_CARRY_RAISE, 9);
    // Tête du porteur sous l'horizon : un défenseur droit devant à 20 m (pieds à tête) est entièrement au-dessus d'elle.
    const head = { x: feet.x, y: feet.y + 1.8, z: feet.z };
    const toHead = Math.atan2(head.y - p.pos.y, Math.hypot(head.x - p.pos.x, head.z - p.pos.z));
    expect(toHead * (180 / Math.PI)).toBeLessThan(-8);
    // Caméra Three.js : monte en portant, redescend après la passe et retrouve la droite de tir au millimètre près.
    const cam = new ShoulderCamera(16 / 9);
    for (let i = 0; i < 60; i++) cam.update(flat, feet, 0.4, 0.1, { ...MODE, carrier: true }, 1 / 60);
    expect(cam.raise).toBeGreaterThan(CAMERA_CARRY_RAISE * 0.99);
    for (let i = 0; i < 120; i++) cam.update(flat, feet, 0.4, 0.1, MODE, 1 / 60);
    expect(cam.raise).toBe(0);
    cam.camera.updateMatrixWorld();
    const d = aimDir(0.4, 0.1);
    const v = new THREE.Vector3(o.x + d.x * 30, o.y + d.y * 30, o.z + d.z * 30).project(cam.camera);
    expect(Math.abs(v.x)).toBeLessThan(1e-6);
    expect(Math.abs(v.y)).toBeLessThan(1e-6);
  });

  it('passe finale : collision balayée — la ligne de vue origine -> caméra ne traverse jamais le relief', () => {
    // Pire enfoncement de la ligne de vue sous le relief (m) ; tolérance : arête d'un muret entre deux échantillons.
    let worst = -Infinity;
    for (const size of [3, 5] as const) {
      const field = createField(size);
      let checked = 0;
      for (const f of field.features) {
        for (let dx = -6; dx <= 6; dx += 1.5) {
          for (let dz = -6; dz <= 6; dz += 1.5) {
            const feet = { x: f.x + dx, y: 0, z: f.z + dz };
            feet.y = groundHeight(field, feet.x, feet.z);
            for (let k = 0; k < 8; k++) {
              const yaw = (k / 8) * Math.PI * 2;
              for (const pitchDeg of [5, 20, 35]) {
                for (const want of [CAMERA_DISTANCE, CAMERA_DISTANCE_CARRY]) {
                  const p = shoulderPose(field, feet, yaw, (pitchDeg * Math.PI) / 180, want);
                  if (p.distance <= CAMERA_MIN_DISTANCE + 1e-9) continue; // rien de mieux possible
                  const o = { x: p.origin.x, y: p.origin.y + p.raise, z: p.origin.z };
                  for (let i = 1; i <= 40; i++) {
                    const t = i / 40;
                    const x = o.x + (p.pos.x - o.x) * t;
                    const z = o.z + (p.pos.z - o.z) * t;
                    worst = Math.max(worst, groundHeight(field, x, z) - (o.y + (p.pos.y - o.y) * t));
                  }
                  checked++;
                }
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(1000);
    }
    expect(worst).toBeLessThan(0.1);
    // Exemple de l'audit : à côté d'une butte, en regardant vers le haut, la butte ne couvre plus le bas de l'écran.
    const field = createField(5);
    const mound = field.features.find((f) => f.kind === 'mound');
    if (mound === undefined) throw new Error('butte attendue');
    const feet = { x: mound.x, y: 0, z: mound.z + mound.radius + 0.8 };
    const p = shoulderPose(field, feet, 0, (25 * Math.PI) / 180, CAMERA_DISTANCE_CARRY);
    expect(p.pos.y).toBeGreaterThanOrEqual(groundHeight(field, p.pos.x, p.pos.z) + CAMERA_GROUND_MARGIN - 1e-9);
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
