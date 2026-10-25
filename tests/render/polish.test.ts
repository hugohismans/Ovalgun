/**
 * Passe finale (client) : estompage des joueurs près de la caméra, halo d'invulnérabilité, densité des étincelles,
 * éclat de plaquage du joueur local, matériaux transparents en une seule passe, traînée du ballon après une
 * téléportation. Sans WebGL : on ne lit que le graphe de scène et les matériaux.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BallView } from '../../src/render/BallView';
import { CombatFxView } from '../../src/render/CombatFxView';
import { localFade, occluderFade, pointSegmentDistance, segmentSegmentDistance, smoothstep } from '../../src/render/fadeMath';
import { FieldView } from '../../src/render/FieldView';
import { FxView } from '../../src/render/FxView';
import { PALETTE, STYLE } from '../../src/render/palette';
import { PassIndicatorView } from '../../src/render/PassIndicatorView';
import { PlayerAssets, PlayerView } from '../../src/render/PlayerView';
import { passRiskOf } from '../../src/render/Renderer';
import { ScrumView } from '../../src/render/ScrumView';
import { ZoneView } from '../../src/render/ZoneView';
import { BOT_PASS_MIN_OPENNESS, BOT_PASS_MIN_OPENNESS_OWN_THIRD, PLAYER_HEIGHT, PLAYER_RADIUS } from '../../src/sim/constants';
import { createField } from '../../src/sim/field';
import { createMatch } from '../../src/sim/match';
import type { MatchEvent, MatchState } from '../../src/sim/types';

const match = (): MatchState => createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']] });
const frame = (carrier = false) => ({ feet: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, ground: 0, carrier, vel: { x: 0, y: 0, z: 0 }, celebrate: false });

describe('fadeMath', () => {
  it('smoothstep borné, distances point / segment et segment / segment exactes', () => {
    expect(smoothstep(1, 2, 0)).toBe(0);
    expect(smoothstep(1, 2, 3)).toBe(1);
    expect(smoothstep(1, 2, 1.5)).toBeCloseTo(0.5, 12);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 2, z: 0 };
    expect(pointSegmentDistance({ x: 3, y: 1, z: 0 }, a, b)).toBeCloseTo(3, 12);
    expect(pointSegmentDistance({ x: 0, y: 5, z: 4 }, a, b)).toBeCloseTo(5, 12); // au-delà de l'extrémité
    // Segments croisés (distance 1), parallèles (distance 2), disjoints bout à bout.
    expect(segmentSegmentDistance({ x: -1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, a, b)).toBeCloseTo(1, 12);
    expect(segmentSegmentDistance({ x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, a, b)).toBeCloseTo(2, 12);
    expect(segmentSegmentDistance({ x: 0, y: 5, z: 0 }, { x: 0, y: 7, z: 0 }, a, b)).toBeCloseTo(3, 12);
  });

  it('autres joueurs : opaques loin de la caméra, presque invisibles contre elle ; entre la caméra et soi : atténués', () => {
    expect(occluderFade(5, Infinity)).toBe(1);
    expect(occluderFade(STYLE.cameraFadeNear, Infinity)).toBe(0);
    expect(occluderFade(1, Infinity)).toBeGreaterThan(0);
    expect(occluderFade(1, Infinity)).toBeLessThan(1);
    expect(occluderFade(5, 0)).toBeCloseTo(STYLE.lineFadeMin, 12);
    expect(occluderFade(5, STYLE.lineFadeRadius + 0.1)).toBe(1);
    // Joueur local : opaque à la distance de visée (≈ 2,4 m de sa capsule), estompé caméra plaquée contre lui.
    expect(localFade(2.4)).toBe(1);
    expect(localFade(0.3)).toBe(0);
  });
});

describe('PlayerView : estompage (passe finale)', () => {
  it('matériaux propres en alpha hash ; barre et étoiles masquées sous le seuil ; joueur masqué presque transparent', () => {
    const s = match();
    const p = { ...s.players[3], stability: 30 };
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const w = new PlayerView(assets, 4, 1, 'demi', false);
    v.update(p, frame(), 1 / 60, 0);
    v.setFade(1);
    expect(v.bar.visible).toBe(true);
    const mats = new Set<THREE.Material>();
    v.root.traverseVisible((o) => {
      if (o instanceof THREE.Mesh) mats.add(o.material as THREE.Material);
    });
    const wMats = new Set<THREE.Material>();
    w.root.traverse((o) => {
      if (o instanceof THREE.Mesh) wMats.add(o.material as THREE.Material);
    });
    const opaque = [...mats].filter((m) => !m.transparent);
    expect(opaque.length).toBeGreaterThanOrEqual(6); // corps, contour, visière, reflet, arme, signe, poignée
    for (const m of opaque) {
      expect(m.alphaHash).toBe(true);
      expect(wMats.has(m)).toBe(false); // propre à ce joueur
    }
    v.update(p, frame(), 1 / 60, 0.1);
    v.setFade(0.3);
    for (const m of opaque) expect(m.opacity).toBeCloseTo(0.3, 12);
    expect(v.bar.visible).toBe(false);
    expect(v.root.visible).toBe(true);
    v.setFade(0.01);
    expect(v.root.visible).toBe(false);
    v.update(p, frame(), 1 / 60, 0.2);
    v.setFade(1);
    expect(v.root.visible).toBe(true);
    for (const m of opaque) expect(m.opacity).toBe(1);
    v.dispose();
    w.dispose();
    assets.dispose();
  });

  it('axe du corps : vertical debout, horizontal vers l’avant du plaquage une fois couché', () => {
    const s = match();
    const p = s.players[0];
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const f = { ...frame(), feet: { x: 1, y: 0, z: 2 }, yaw: Math.PI / 2 };
    v.update(p, f, 1 / 60, 0);
    const base = { x: 0, y: 0, z: 0 };
    const top = { x: 0, y: 0, z: 0 };
    v.bodyAxis(base, top);
    expect(base).toEqual({ x: 1, y: PLAYER_RADIUS, z: 2 });
    expect(top.y - base.y).toBeCloseTo(PLAYER_HEIGHT - 2 * PLAYER_RADIUS, 6);
    const down = { ...p, status: 'down' as const, statusTicks: 60 };
    for (let i = 0; i < 120; i++) v.update(down, f, 1 / 60, i / 60);
    v.bodyAxis(base, top);
    expect(top.y - base.y).toBeLessThan(0.05);
    expect(top.x - base.x).toBeGreaterThan(PLAYER_HEIGHT - 2 * PLAYER_RADIUS - 0.05); // forward(π/2) = +X
    v.dispose();
    assets.dispose();
  });

  it('halo d’invulnérabilité : couleur claire de l’équipe, faces arrière, pulsation lente ; fixe en « animations réduites »', () => {
    const s = match();
    const p = { ...s.players[4], invulnTicks: 10 };
    const assets = new PlayerAssets();
    const v = new PlayerView(assets, p.id, p.team, p.role, false);
    const pose = v.root.children[0].children[0].children[0];
    const shell = pose.children[pose.children.length - 1] as THREE.Mesh;
    const mat = shell.material as THREE.MeshBasicMaterial;
    v.update(p, frame(), 1 / 60, 0);
    v.setFade(1);
    expect(shell.visible).toBe(true);
    expect(mat.side).toBe(THREE.BackSide);
    expect(mat.color.getHex()).toBe(new THREE.Color(PALETTE.teams[1].light).getHex());
    expect(STYLE.invulnPulseRate / (2 * Math.PI)).toBeLessThan(3); // < 3 flashs / s (WCAG)
    const ops: number[] = [];
    for (let i = 0; i < 30; i++) {
      v.update(p, frame(), 1 / 60, i / 30);
      v.setFade(1);
      ops.push(mat.opacity);
    }
    expect(Math.max(...ops) - Math.min(...ops)).toBeGreaterThan(0.05);
    assets.reducedMotion = true;
    const still: number[] = [];
    for (let i = 0; i < 30; i++) {
      v.update(p, frame(), 1 / 60, i / 30);
      v.setFade(1);
      still.push(mat.opacity);
    }
    expect(Math.max(...still) - Math.min(...still)).toBe(0);
    expect(still[0]).toBeCloseTo(STYLE.invulnOpacity, 12);
    // Joueur estompé : le halo disparaît plus vite que le corps (il délaverait le tramage).
    v.setFade(0.75);
    expect(mat.opacity).toBeGreaterThan(0);
    expect(mat.opacity).toBeLessThan(STYLE.invulnOpacity * 0.75);
    v.setFade(STYLE.fadeDetailsBelow);
    expect(mat.opacity).toBe(0);
    v.dispose();
    assets.dispose();
  });
});

describe('effets de combat (passe finale)', () => {
  const sparksVisible = (fx: CombatFxView): number =>
    fx.group.children.slice(STYLE.tracerPoolSize + STYLE.muzzlePoolSize, STYLE.tracerPoolSize + STYLE.muzzlePoolSize + STYLE.sparkPoolSize).filter((c) => c.visible).length;

  it('une gerbe d’étincelles par joueur touché et par tick (décharge de plombs : 8 impacts, une gerbe)', () => {
    const s = match(); // joueur 2 : pilier (plombs), joueur 0 : ailier (balles)
    const hit = (sourceId: number, targetId: number): MatchEvent => ({ type: 'hit', targetId, sourceId, amount: 5, pos: { x: 0, y: 1, z: 0 } });
    const fx = new CombatFxView();
    const cam = new THREE.PerspectiveCamera();
    fx.handleEvents(Array.from({ length: 8 }, () => hit(2, 4)), s, s, 0);
    fx.update(s, 1, cam, 1 / 60, 0.001);
    expect(sparksVisible(fx)).toBe(STYLE.sparksPerPelletHit);
    // Tick suivant : balle de l'ailier sur un autre joueur + sur le même : une gerbe par cible.
    fx.handleEvents([hit(0, 5), hit(0, 5), hit(0, 3)], s, s, 0.01);
    fx.update(s, 1, cam, 1 / 60, 0.011);
    expect(sparksVisible(fx)).toBe(STYLE.sparksPerPelletHit + 2 * STYLE.sparksPerHit);
    // Plombs dans le relief : une gerbe par tireur et par tick.
    const end: MatchEvent = { type: 'projectile_end', projectileId: 99, ownerId: 2, kind: 'pellet', pos: { x: 0, y: 0, z: 0 }, reason: 'terrain' };
    fx.handleEvents(Array.from({ length: 8 }, () => end), s, s, 0.02);
    fx.update(s, 1, cam, 1 / 60, 0.021);
    expect(sparksVisible(fx)).toBe(STYLE.sparksPerPelletHit + 2 * STYLE.sparksPerHit + STYLE.sparksPerTerrain);
    fx.dispose();
  });

  it('éclat de plaquage réduit quand le plaqué est le joueur local (caméra juste derrière)', () => {
    const s = match();
    const cam = new THREE.PerspectiveCamera();
    const size = (localId: number): number => {
      const fx = new CombatFxView();
      fx.handleEvents([{ type: 'tackled', targetId: 0, byId: 4 }], s, s, 0, localId);
      fx.update(s, 1, cam, 1 / 60, STYLE.tackleBurstSec * 0.9);
      const burst = fx.group.children.find((c) => c.visible && c.scale.x > 0.5);
      const v = burst?.scale.x ?? 0;
      fx.dispose();
      return v;
    };
    expect(size(0)).toBeCloseTo(size(-1) * STYLE.tackleBurstLocalScale, 6);
  });

  it('aucun matériau transparent double face dessiné en deux passes (forceSinglePass partout)', () => {
    const roots: THREE.Object3D[] = [];
    const disposers: Array<() => void> = [];
    const keep = <T extends { dispose(): void }>(v: T, ...objs: THREE.Object3D[]): T => {
      roots.push(...objs);
      disposers.push(() => v.dispose());
      return v;
    };
    const ball = new BallView();
    keep(ball, ball.group);
    const fx = new FxView();
    keep(fx, fx.group);
    const combat = new CombatFxView();
    keep(combat, combat.group);
    const pass = new PassIndicatorView();
    keep(pass, pass.group);
    const scrum = new ScrumView();
    keep(scrum, scrum.group);
    const zones = new ZoneView();
    keep(zones, zones.group);
    const field = new FieldView(createField(5));
    keep(field, field.group);
    const assets = new PlayerAssets();
    const pilier = new PlayerView(assets, 2, 0, 'pilier', false);
    keep(pilier, pilier.root, pilier.groundGroup, pilier.marker, pilier.bar);
    let checked = 0;
    for (const r of roots) {
      r.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const mat = m as THREE.Material;
          if (mat.transparent && mat.side === THREE.DoubleSide) {
            expect(mat.forceSinglePass, `${o.type} ${mat.type}`).toBe(true);
            checked++;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(20);
    for (const d of disposers) d();
    assets.dispose();
  });
});

describe('BallView : traînée (passe finale)', () => {
  it('une téléportation (ballon au centre) coupe la traînée au lieu de tirer un trait à travers le terrain', () => {
    const s = match();
    const b = { ...s.ball, mode: 'loose' as const, vel: { x: 10, y: 0, z: 0 } };
    const v = new BallView();
    const cam = new THREE.Vector3(0, 5, -10);
    const trail = v.group.children.find((c) => c instanceof THREE.Mesh && c.renderOrder === 3) as THREE.Mesh;
    for (let i = 0; i < 10; i++) v.update(b, b, 1, { x: -15 + i * 0.3, y: 1, z: 3 }, null, 0, cam, i / 60);
    expect(trail.geometry.drawRange.count).toBeGreaterThan(0);
    // Tick de la téléportation : ballon précédent à (−12, 1, 3), courant au centre.
    const before = { ...b, pos: { x: -12, y: 1, z: 3 } };
    const after = { ...b, pos: { x: 0, y: 1, z: 0 } };
    v.update(after, before, 1, { x: 0, y: 1, z: 0 }, null, 0, cam, 11 / 60);
    expect(trail.geometry.drawRange.count).toBe(0);
    const next = { ...b, pos: { x: 0.3, y: 1, z: 0 } };
    v.update(next, after, 1, { x: 0.3, y: 1, z: 0 }, null, 0, cam, 12 / 60);
    expect(trail.geometry.drawRange.count).toBeGreaterThan(0); // repart depuis le centre
    // Outil « ballon au centre » (appliqué entre deux ticks : état précédent = courant) : saut depuis la traînée.
    for (let i = 0; i < 10; i++) v.update(next, next, 1, { x: 0.3 + i * 0.3, y: 1, z: 0 }, null, 0, cam, (13 + i) / 60);
    expect(trail.geometry.drawRange.count).toBeGreaterThan(0);
    v.update(after, after, 1, { x: 20, y: 1, z: -8 }, null, 0, cam, 23 / 60);
    expect(trail.geometry.drawRange.count).toBe(0);
    v.reset();
    expect(trail.geometry.drawRange.count).toBe(0);
    v.dispose();
  });
});

describe('passe assistée : risque (passe finale)', () => {
  it('seuils des bots : démarqué / risqué / marqué', () => {
    expect(passRiskOf(1)).toBe(0);
    expect(passRiskOf(BOT_PASS_MIN_OPENNESS)).toBe(0);
    expect(passRiskOf(BOT_PASS_MIN_OPENNESS - 0.01)).toBe(1);
    expect(passRiskOf(BOT_PASS_MIN_OPENNESS_OWN_THIRD)).toBe(1);
    expect(passRiskOf(BOT_PASS_MIN_OPENNESS_OWN_THIRD - 0.01)).toBe(2);
    expect(passRiskOf(0)).toBe(2);
  });
});
