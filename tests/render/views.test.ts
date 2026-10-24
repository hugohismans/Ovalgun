/**
 * Vues Three.js (sans WebGL : on ne lit que le graphe de scène) : rotation du ballon interpolée,
 * posture basse fidèle à la hitbox de la sim.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BallView } from '../../src/render/BallView';
import { fxForEvent, FxView } from '../../src/render/FxView';
import { FX } from '../../src/render/palette';
import { PassIndicatorView } from '../../src/render/PassIndicatorView';
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

describe('effets et indicateurs du porteur (étape 4)', () => {
  it('fxForEvent : un effet par événement du porteur, ancré sur le bon joueur ; rien pour les autres', () => {
    const s = match();
    s.players[4].pos = { x: 3, y: 0, z: -2 };
    const c = fxForEvent({ type: 'catch', playerId: 4, fromId: 0, intercepted: true }, s);
    expect(c?.rings).toBe(FX.intercept);
    expect(c?.ground).toEqual({ x: 3, y: 0, z: -2 });
    expect(fxForEvent({ type: 'catch', playerId: 4, fromId: 3, intercepted: false }, s)?.rings).toBe(FX.catch);
    expect(fxForEvent({ type: 'pickup', playerId: 1 }, s)?.rings).toBe(FX.pickup);
    expect(fxForEvent({ type: 'kick', playerId: 1 }, s)?.rings).toBe(FX.kick);
    expect(fxForEvent({ type: 'dive', playerId: 1 }, s)?.rings).toBe(FX.dive);
    expect(fxForEvent({ type: 'pass', fromId: 1, toId: 2 }, s)?.rings).toBe(FX.pass);
    expect(fxForEvent({ type: 'pass_denied', playerId: 1 }, s)?.rings).toBe(FX.passDenied);
    expect(fxForEvent({ type: 'jump', playerId: 1, air: false }, s)).toBeNull();
    expect(fxForEvent({ type: 'pickup', playerId: 99 }, s)).toBeNull();
  });

  it('FxView : les anneaux apparaissent, grandissent puis disparaissent ; le pool recycle sans planter', () => {
    const s = match();
    const fx = new FxView();
    const cam = new THREE.PerspectiveCamera();
    for (let i = 0; i < 40; i++) fx.handle({ type: 'kick', playerId: 0 }, s, 0);
    fx.update(0.05, cam);
    const visible = fx.group.children.filter((m) => m.visible);
    expect(visible.length).toBeGreaterThan(0);
    fx.update(5, cam);
    expect(fx.group.children.filter((m) => m.visible)).toEqual([]);
    fx.dispose();
  });

  it('PassIndicatorView : flèche au-dessus de la cible, éventail vert ; sans cible, éventail rouge et pas de flèche', () => {
    const v = new PassIndicatorView();
    const base = {
      visible: true,
      team: 0 as const,
      carrierFeet: { x: 0, y: 0, z: 0 },
      carrierGround: 0,
      aim: { x: 0, z: -1 },
      targetFeet: { x: 4, y: 0, z: -6 },
      targetHeight: PLAYER_HEIGHT,
      kickLanding: { x: 0, y: 0, z: 30 },
    };
    v.update(base, 0);
    const [arrow, fan] = v.group.children;
    const chevron = v.group.children[5];
    expect(v.group.visible).toBe(true);
    expect(arrow.visible).toBe(true);
    expect(chevron.visible).toBe(true); // receveur hors champ (derrière) : chevron au sol pointé vers lui
    expect(Math.atan2(chevron.position.x, chevron.position.z)).toBeCloseTo(Math.atan2(4, -6), 6);
    expect(arrow.position.x).toBeCloseTo(4, 9);
    expect(arrow.position.y).toBeGreaterThan(PLAYER_HEIGHT);
    const fanMat = (fan as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const green = fanMat.color.getHex();
    v.update({ ...base, targetFeet: null }, 0.1);
    expect(arrow.visible).toBe(false);
    expect(chevron.visible).toBe(false);
    expect(fanMat.color.getHex()).not.toBe(green);
    v.update({ ...base, visible: false }, 0.2);
    expect(v.group.visible).toBe(false);
    v.dispose();
  });

  it('PlayerView : coque d’invulnérabilité visible seulement pendant l’invulnérabilité (plongeon)', () => {
    const s = match();
    const p = s.players[0];
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, true);
    const frame = { feet: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, ground: 0, carrier: true };
    const pose = v.root.children[0].children[0];
    const shell = pose.children[pose.children.length - 1];
    v.update(p, frame, 1 / 60, 0);
    expect(shell.visible).toBe(false);
    p.move = 'dive';
    p.invulnTicks = 5;
    v.update(p, frame, 1 / 60, 0.1);
    expect(shell.visible).toBe(true);
    p.invulnTicks = 0;
    v.update(p, frame, 1 / 60, 0.2);
    expect(shell.visible).toBe(false);
    assets.dispose();
  });
});
