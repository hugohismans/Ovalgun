/**
 * Vues Three.js (sans WebGL : on ne lit que le graphe de scène) : rotation du ballon interpolée,
 * posture basse fidèle à la hitbox de la sim.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BallView } from '../../src/render/BallView';
import { CombatFxView, grenadePoint, inFlightTracer, tracerPoint } from '../../src/render/CombatFxView';
import { fxForEvent, FxView } from '../../src/render/FxView';
import { FX, PALETTE, STYLE } from '../../src/render/palette';
import { PassIndicatorView } from '../../src/render/PassIndicatorView';
import { PlayerAssets, PlayerView } from '../../src/render/PlayerView';
import { ScrumView, scrumGauge } from '../../src/render/ScrumView';
import { ZoneView } from '../../src/render/ZoneView';
import {
  PLAYER_HEIGHT,
  PLAYER_LOW_HEIGHT,
  PLAYER_RADIUS,
  SHIELD_DISTANCE,
  SHIELD_HALF_ANGLE_DEG,
  SHIELD_HEIGHT,
  TICK_DT,
} from '../../src/sim/constants';
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
    const body = v.root.children[0].children[0].children[0].children[0]; // yawGroup > fallGroup > pose > corps
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
    // Étape 6 : essai, ancré sur le marqueur.
    expect(fxForEvent({ type: 'try', team: 1, scorerId: 4 }, s)?.rings).toBe(FX.try);
    expect(fxForEvent({ type: 'try', team: 1, scorerId: 4 }, s)?.ground).toEqual({ x: 3, y: 0, z: -2 });
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
    const pose = v.root.children[0].children[0].children[0]; // yawGroup > fallGroup > pose
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

describe('combat (étape 5)', () => {
  it('fxForEvent : plaquage, relevé, capacité ancrés sur le bon joueur', () => {
    const s = match();
    s.players[4].pos = { x: 2, y: 0, z: 5 };
    expect(fxForEvent({ type: 'tackled', targetId: 4, byId: 0 }, s)?.rings).toBe(FX.tackled);
    expect(fxForEvent({ type: 'tackled', targetId: 4, byId: 0 }, s)?.ground).toEqual({ x: 2, y: 0, z: 5 });
    expect(fxForEvent({ type: 'getup', playerId: 4 }, s)?.rings).toBe(FX.getup);
    expect(fxForEvent({ type: 'ability', playerId: 0, role: 'ailier' }, s)?.rings).toBe(FX.ability);
  });

  it('PlayerView : couché au sol (étoiles), se relève ; barre de stabilité des autres seulement ; clignote quand touché', () => {
    const s = match();
    const p = s.players[3];
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const frame = { feet: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, ground: 0, carrier: false };
    const body = v.root.children[0].children[0].children[0].children[0];
    const settle = (t0: number) => {
      for (let i = 0; i < 90; i++) v.update(p, frame, 1 / 60, t0 + i / 60);
      v.root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(body, true);
    };
    // Barre : invisible jauge pleine, visible entamée.
    settle(0);
    expect(v.bar.visible).toBe(false);
    p.stability = 40;
    settle(2);
    expect(v.bar.visible).toBe(true);
    // Au sol : couché (moins haut qu'un rayon et demi), posé sur le sol, sans barre.
    p.status = 'down';
    p.statusTicks = 50;
    const lying = settle(4);
    expect(lying.max.y).toBeLessThan(PLAYER_RADIUS * 2 + 0.15);
    expect(lying.min.y).toBeGreaterThan(-0.1);
    expect(lying.getSize(new THREE.Vector3()).z).toBeGreaterThan(PLAYER_HEIGHT - 0.2);
    expect(v.bar.visible).toBe(false);
    // Relevé terminé : debout.
    p.status = 'active';
    p.statusTicks = 0;
    expect(settle(6).getSize(new THREE.Vector3()).y).toBeCloseTo(PLAYER_HEIGHT, 1);
    // Clignotement.
    const mat = (body as THREE.Mesh).material as THREE.MeshToonMaterial;
    v.flash(10);
    v.update(p, frame, 1 / 60, 10.01);
    expect(mat.emissiveIntensity).toBeGreaterThan(0);
    v.update(p, frame, 1 / 60, 11);
    expect(mat.emissiveIntensity).toBe(0);
    // Le joueur humain n'a pas de barre au-dessus de lui.
    const me = new PlayerView(assets, 0, 0, 'ailier', true);
    me.update({ ...s.players[0], stability: 10 }, frame, 1 / 60, 0);
    expect(me.bar.visible).toBe(false);
    v.dispose();
    me.dispose();
    assets.dispose();
  });

  it('traceurs : interpolés entre deux ticks, partent du canon et rejoignent la trajectoire', () => {
    const proj = {
      id: 1,
      kind: 'bullet' as const,
      ownerId: 0,
      team: 0 as const,
      pos: { x: 0, y: 1.6, z: 10 },
      vel: { x: 0, y: 0, z: 150 },
      ttl: 80,
      traveled: 10,
      damage: 6,
    };
    const spec = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, head: 0, kind: 'bullet' as const, ownerYaw: 0 };
    inFlightTracer(proj, 1, 0, spec);
    expect(spec.head).toBeCloseTo(10, 9);
    expect(spec.origin.z).toBeCloseTo(0, 9);
    inFlightTracer(proj, 0, 0, spec);
    expect(spec.head).toBeCloseTo(5, 9);
    const out = { x: 0, y: 0, z: 0 };
    tracerPoint(spec, STYLE.tracerConvergeDist + 1, out);
    expect(out).toEqual({ x: 0, y: 1.6, z: STYLE.tracerConvergeDist + 1 });
    tracerPoint(spec, 0, out);
    expect(out.y).toBeCloseTo(1.6 + STYLE.muzzleUp, 9);
    expect(out.z).toBeCloseTo(STYLE.muzzleForward, 9);
  });

  it('CombatFxView : un traceur par projectile en vol + les projectiles terminés au dernier tick', () => {
    const prev = match();
    prev.projectiles.push({ id: 7, kind: 'bullet', ownerId: 0, team: 0, pos: { x: 0, y: 1.6, z: 5 }, vel: { x: 0, y: 0, z: 150 }, ttl: 80, traveled: 5, damage: 6 });
    const curr = cloneState(prev);
    curr.projectiles = [{ id: 8, kind: 'bullet', ownerId: 3, team: 1, pos: { x: 0, y: 1.6, z: -5 }, vel: { x: 0, y: 0, z: -150 }, ttl: 80, traveled: 5, damage: 6 }];
    const fx = new CombatFxView();
    fx.handleEvents(
      [
        { type: 'projectile_end', projectileId: 7, ownerId: 0, kind: 'bullet', pos: { x: 0, y: 1.6, z: 8 }, reason: 'player' },
        { type: 'hit', targetId: 4, sourceId: 0, amount: 6, pos: { x: 0, y: 1.6, z: 8 } },
        { type: 'shot', playerId: 3, kind: 'bullet', pos: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } },
        { type: 'tackled', targetId: 4, byId: 0 },
      ],
      curr,
      prev,
      0,
    );
    const cam = new THREE.PerspectiveCamera();
    fx.update(curr, 0.5, cam, 1 / 60, 0.01);
    const visible = fx.group.children.filter((c) => c.visible);
    // 2 traceurs + flash + étincelles + éclat.
    expect(visible.length).toBeGreaterThanOrEqual(2 + 1 + 1 + 1);
    fx.update(curr, 0.5, cam, 1 / 60, 5);
    fx.handleEvents([], curr, curr, 5);
    fx.update({ ...curr, projectiles: [] }, 0.5, cam, 1 / 60, 5.01);
    expect(fx.group.children.filter((c) => c.visible)).toHaveLength(0);
    fx.dispose();
  });

  it('CombatFxView : deux ticks dans la même frame, les fins de projectiles du premier tick sont aussi dessinées', () => {
    const s0 = match();
    const proj = (id: number, z: number) => ({ id, kind: 'bullet' as const, ownerId: 0, team: 0 as const, pos: { x: 0, y: 1.6, z }, vel: { x: 0, y: 0, z: 300 }, ttl: 80, traveled: z, damage: 5 });
    s0.projectiles = [proj(7, 5), proj(9, 2)];
    const s1 = cloneState(s0);
    s1.projectiles = [proj(9, 12)];
    const s2 = cloneState(s1);
    s2.projectiles = [];
    const end = (id: number, z: number) => ({ type: 'projectile_end' as const, projectileId: id, ownerId: 0, kind: 'bullet' as const, pos: { x: 0, y: 1.6, z }, reason: 'terrain' as const });
    const fx = new CombatFxView();
    const cam = new THREE.PerspectiveCamera();
    const tracers = () => fx.group.children.slice(0, STYLE.tracerPoolSize).filter((c) => c.visible).length;
    // Frame lente : deux ticks (7 finit au premier, 9 au second), puis une seule image.
    fx.handleEvents([end(7, 9)], s1, s0, 0);
    fx.handleEvents([end(9, 15)], s2, s1, 0);
    fx.update(s2, 0.5, cam, 1 / 30, 0.01);
    expect(tracers()).toBe(2);
    // Image suivante sans nouveau tick : seule la fin du dernier tick reste (elle suit alpha).
    fx.update(s2, 0.9, cam, 1 / 60, 0.02);
    expect(tracers()).toBe(1);
    // Nouveau tick sans événement : plus rien.
    fx.handleEvents([], s2, s2, 0.03);
    fx.update(s2, 0.1, cam, 1 / 60, 0.03);
    expect(tracers()).toBe(0);
    fx.dispose();
  });

  it('PlayerView : le corps couché garde le lacet du plaquage (il ne tourne pas avec la visée du plaqué)', () => {
    const s = match();
    const p = s.players[3];
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, true);
    const yawGroup = v.root.children[0];
    const frame = (yaw: number) => ({ feet: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, ground: 0, carrier: false });
    v.update(p, frame(0.4), 1 / 60, 0);
    expect(yawGroup.rotation.y).toBeCloseTo(0.4, 9);
    p.status = 'down';
    p.statusTicks = 50;
    v.update(p, frame(0.5), 1 / 60, 0.1);
    v.update(p, frame(2.5), 1 / 60, 0.2);
    expect(yawGroup.rotation.y).toBeCloseTo(0.5, 9);
    p.status = 'getting_up';
    v.update(p, frame(-1), 1 / 60, 0.3);
    expect(yawGroup.rotation.y).toBeCloseTo(0.5, 9);
    p.status = 'active';
    v.update(p, frame(-1), 1 / 60, 0.4);
    expect(yawGroup.rotation.y).toBeCloseTo(-1, 9);
    v.dispose();
    assets.dispose();
  });
});


describe('pilier et demi (étape 7)', () => {
  it('PlayerView : bouclier du pilier visible seulement levé, même géométrie que la sim, flash quand il bloque', () => {
    const s = match();
    const p = s.players[2]; // pilier de l'équipe 0
    expect(p.role).toBe('pilier');
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const frame = { feet: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, ground: 0, carrier: false };
    const shield = v.root.children[0].children.find((c) => c.type === 'Group' && c.children.some((m) => m.type === 'LineSegments'));
    expect(shield).toBeDefined();
    for (let i = 0; i < 30; i++) v.update(p, frame, 1 / 60, i / 60);
    expect(shield?.visible).toBe(false);
    p.abilityTicks = 30;
    for (let i = 0; i < 30; i++) v.update(p, frame, 1 / 60, 1 + i / 60);
    expect(shield?.visible).toBe(true);
    v.root.updateMatrixWorld(true);
    const panel = shield?.children[0] as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(panel, true);
    expect(box.max.z).toBeCloseTo(SHIELD_DISTANCE, 2); // devant (yaw 0 = +Z), à SHIELD_DISTANCE de l'axe
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(SHIELD_HEIGHT, 2);
    expect(box.max.x).toBeCloseTo(SHIELD_DISTANCE * Math.sin((SHIELD_HALF_ANGLE_DEG * Math.PI) / 180), 2);
    const mat = panel.material as THREE.MeshBasicMaterial;
    const calm = mat.opacity;
    v.shieldFlash(2);
    v.update(p, frame, 1 / 60, 2.01);
    expect(mat.opacity).toBeGreaterThan(calm + 0.2);
    // Un ailier n'a pas de bouclier.
    const a = new PlayerView(assets, 0, 0, 'ailier', false);
    expect(a.root.children[0].children.some((c) => c.type === 'Group' && c.children.some((m) => m.type === 'LineSegments'))).toBe(false);
    v.dispose();
    a.dispose();
    assets.dispose();
  });

  it('grenadePoint : position interpolée sur la parabole (alpha 1 = état courant, alpha 0 = un tick plus tôt)', () => {
    const g = { id: 1, kind: 'grenade' as const, ownerId: 1, team: 0 as const, pos: { x: 1, y: 3, z: 10 }, vel: { x: 0, y: 4, z: 30 }, ttl: 80, traveled: 10, damage: 0 };
    const out = { x: 0, y: 0, z: 0 };
    grenadePoint(g, 18, 1, 0, out);
    expect(out).toEqual({ x: 1, y: 3, z: 10 });
    grenadePoint(g, 18, 0, 0, out);
    expect(out.z).toBeCloseTo(10 - 30 * TICK_DT, 9);
    expect(out.y).toBeCloseTo(3 - 4 * TICK_DT - 0.5 * 18 * TICK_DT * TICK_DT, 9);
  });

  it('CombatFxView : grenade en vol (sphère + traînée), explosion (boule + onde) qui s’estompe ; pas de traceur prolongé pour une grenade', () => {
    const prev = match();
    const curr = cloneState(prev);
    curr.projectiles = [{ id: 5, kind: 'grenade', ownerId: 1, team: 0, pos: { x: 0, y: 2, z: 5 }, vel: { x: 0, y: 3, z: 30 }, ttl: 80, traveled: 5, damage: 0 }];
    const fx = new CombatFxView();
    const cam = new THREE.PerspectiveCamera();
    fx.handleEvents(
      [
        { type: 'explosion', ownerId: 1, pos: { x: 3, y: 0, z: 3 }, radius: 3.5 },
        { type: 'projectile_end', projectileId: 4, ownerId: 1, kind: 'grenade', pos: { x: 3, y: 0, z: 3 }, reason: 'terrain' },
      ],
      curr,
      prev,
      0,
    );
    fx.update(curr, 0.5, cam, 1 / 60, 0.05);
    const tracers = fx.group.children.slice(0, STYLE.tracerPoolSize).filter((c) => c.visible).length;
    expect(tracers).toBe(0);
    const visible = fx.group.children.filter((c) => c.visible);
    // Grenade (groupe) + traînée + boule + onde (+ étincelles du relief).
    expect(visible.length).toBeGreaterThanOrEqual(4);
    fx.update({ ...curr, projectiles: [] }, 0.5, cam, 1 / 60, 5);
    expect(fx.group.children.filter((c) => c.visible)).toHaveLength(0);
    fx.dispose();
  });

  it('ZoneView : une zone affichée par zone de l’état, couleur de son équipe, qui disparaît avec elle ; aperçus du joueur local', () => {
    const s = match();
    s.zones = [
      { id: 3, kind: 'slow', ownerId: 1, team: 0, pos: { x: 0, y: 0, z: 5 }, radius: 4.5, ttl: 100 },
      { id: 4, kind: 'slow', ownerId: 4, team: 1, pos: { x: 6, y: 0, z: -5 }, radius: 4.5, ttl: 3 },
    ];
    const zv = new ZoneView();
    zv.update(s, { zone: { x: 1, y: 0, z: 2 }, grenade: null, team: 0 }, 1);
    const groups = zv.group.children.filter((c) => c.type === 'Group' && c.visible);
    expect(groups).toHaveLength(2);
    expect(groups[0].position.z).toBeCloseTo(5, 6);
    const disc = groups[1].children[0] as THREE.Mesh;
    expect((disc.material as THREE.MeshBasicMaterial).color.getHexString()).toBe(new THREE.Color(PALETTE.teams[1].main).getHexString());
    expect(zv.group.children.filter((c) => c.type === 'Mesh' && c.visible)).toHaveLength(1); // aperçu de zone seul
    s.zones = [];
    zv.update(s, { zone: null, grenade: { x: 0, y: 0, z: 9 }, team: 0 }, 2);
    expect(zv.group.children.filter((c) => c.type === 'Group' && c.visible)).toHaveLength(0);
    expect(zv.group.children.filter((c) => c.type === 'Mesh' && c.visible)).toHaveLength(1); // aperçu de grenade seul
    zv.dispose();
  });
});

describe('Mêlée (étape 7) : jauge et zone de capture', () => {
  const scrum = (ticks: number, counts: [number, number]) => ({ center: { x: 3, y: 0.2, z: -4 }, radius: 4.2, ticks, counts });

  it('scrumGauge : progression de la capture puis de la prolongation, répartition, équipe qui mène, temps restant', () => {
    const g0 = scrumGauge(scrum(0, [2, 2]));
    expect(g0).toEqual({ progress: 0, overtime: false, share0: 0.5, leader: -1, secLeft: 3 });
    const g = scrumGauge(scrum(45, [3, 1]), 0.5);
    expect(g.progress).toBeCloseTo(45.5 / 90, 9);
    expect(g.share0).toBeCloseTo(0.75, 9);
    expect(g.leader).toBe(0);
    expect(g.secLeft).toBeCloseTo((90 - 45.5) / 30, 9);
    const ot = scrumGauge(scrum(90 + 30, [1, 1]));
    expect(ot.overtime).toBe(true);
    expect(ot.progress).toBeCloseTo(0.5, 9);
    expect(ot.secLeft).toBeCloseTo(1, 9);
    expect(scrumGauge(scrum(10, [0, 0])).share0).toBe(0.5);
    expect(scrumGauge(scrum(10, [0, 2])).leader).toBe(1);
  });

  it('ScrumView : disque au rayon exact, uniforms de la jauge, prolongation dorée, fondu à la couleur du vainqueur', () => {
    const v = new ScrumView();
    v.update(null, 0, 0);
    expect(v.group.visible).toBe(false);
    v.update(scrum(30, [1, 3]), 0, 1);
    v.update(scrum(31, [1, 3]), 0, 1 + STYLE.scrumAppearSec);
    expect(v.group.visible).toBe(true);
    expect(v.group.position.x).toBeCloseTo(3, 9);
    expect(v.group.position.z).toBeCloseTo(-4, 9);
    expect(v.group.scale.x).toBeCloseTo(4.2, 9); // rayon exact (disque unité)
    const disc = v.group.children[0] as THREE.Mesh;
    const u = (disc.material as THREE.ShaderMaterial).uniforms;
    expect(u.uShare.value).toBeCloseTo(0.25, 9);
    expect(u.uProgress.value).toBeCloseTo(31 / 90, 9);
    expect((u.uFill.value as THREE.Color).getHexString()).toBe(new THREE.Color(PALETTE.teams[1].main).getHexString());
    v.update(scrum(100, [2, 2]), 0, 2);
    expect((u.uRim.value as THREE.Color).getHexString()).toBe(new THREE.Color(PALETTE.scrumOvertime).getHexString());
    // Résolution : fondu à la couleur du vainqueur, puis masqué.
    v.handleEvent({ type: 'scrum_won', team: 0, playerId: 1 });
    v.update(null, 0, 3);
    expect(v.group.visible).toBe(true);
    expect((u.uFill.value as THREE.Color).getHexString()).toBe(new THREE.Color(PALETTE.teams[0].main).getHexString());
    v.update(null, 0, 3 + STYLE.scrumFadeSec + 0.01);
    expect(v.group.visible).toBe(false);
    v.dispose();
  });

  it('fxForEvent : onde au centre au déclenchement, sur le joueur qui reçoit le ballon à la résolution', () => {
    const s = match();
    const start = fxForEvent({ type: 'scrum_start', pos: { x: 1, y: 0, z: 2 } }, s);
    expect(start?.rings).toBe(FX.scrumStart);
    expect(start?.ground).toEqual({ x: 1, y: 0, z: 2 });
    const won = fxForEvent({ type: 'scrum_won', team: 0, playerId: 1 }, s);
    expect(won?.rings).toBe(FX.scrumWon);
    expect(won?.ground).toBe(s.players[1].pos);
  });
});
