/**
 * Vues Three.js (sans WebGL : on ne lit que le graphe de scène) : rotation du ballon interpolée,
 * posture basse fidèle à la hitbox de la sim.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BallView } from '../../src/render/BallView';
import { PlayerAssets, PlayerView } from '../../src/render/PlayerView';
import { PLAYER_HEIGHT, PLAYER_LOW_HEIGHT, PLAYER_RADIUS } from '../../src/sim/constants';
import { createMatch } from '../../src/sim/match';
import { cloneState } from '../../src/sim/serialize';
import type { MatchState } from '../../src/sim/types';

const match = (): MatchState => createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']] });

describe('BallView', () => {
  it('culbute et vrille interpolées entre deux ticks (pas de crans à 30 Hz)', () => {
    const s = match();
    const prev = cloneState(s).ball;
    const curr = cloneState(s).ball;
    prev.spin = 0.1;
    curr.spin = 0.8;
    prev.tumble = 3.0;
    curr.tumble = -2.9; // passage de ±π : plus court chemin
    curr.mode = 'loose';
    const v = new BallView();
    const mesh = v.group.children[0];
    v.update(curr, prev, 0.5, { x: 0, y: 1, z: 0 }, null, 0, new THREE.Vector3(0, 2, -5), 0);
    expect(mesh.rotation.z).toBeCloseTo(0.45, 9);
    const mid = Math.atan2(Math.sin(mesh.rotation.x), Math.cos(mesh.rotation.x));
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.1);
    v.update(curr, prev, 1, { x: 0, y: 1, z: 0 }, null, 0, new THREE.Vector3(0, 2, -5), 0.03);
    expect(mesh.rotation.z).toBeCloseTo(0.8, 9);
    v.dispose();
  });
});

describe('PlayerView', () => {
  it('posture basse : capsule à la hauteur de la hitbox de la sim, sans déborder de 0,9 m devant / derrière', () => {
    const s = match();
    const p = s.players[0];
    p.move = 'slide';
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const frame = { feet: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, ground: 0, carrier: false };
    for (let i = 0; i < 120; i++) v.update(p, frame, 1 / 60, i / 60);
    v.root.updateMatrixWorld(true);
    const body = v.root.children[0].children[0].children[0]; // yawGroup > pose > corps
    const box = new THREE.Box3().setFromObject(body, true); // précis : sommets transformés
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeLessThanOrEqual(PLAYER_LOW_HEIGHT + 0.1);
    expect(size.z / 2).toBeLessThan(PLAYER_RADIUS + 0.25);
    expect(box.min.y).toBeGreaterThan(-0.1); // pas enfoncée dans le sol

    // Debout : pleine hauteur.
    p.move = 'run';
    for (let i = 0; i < 120; i++) v.update(p, frame, 1 / 60, i / 60);
    v.root.updateMatrixWorld(true);
    const standing = new THREE.Box3().setFromObject(body, true).getSize(new THREE.Vector3());
    expect(standing.y).toBeCloseTo(PLAYER_HEIGHT, 2);
    assets.dispose();
  });
});
