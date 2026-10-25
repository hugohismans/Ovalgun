/**
 * Mini-flèche vers le ballon hors champ (étape 8) : projection, bord de l'écran, ballon derrière la caméra, zones évitées.
 */
import { describe, expect, it } from 'vitest';
import { offscreenArrow, rayEnterRect } from '../../src/game/ballArrow';

const W = 1280;
const H = 720;
const T = Math.tan((72 * Math.PI) / 360); // FOV vertical 72°
const IN = { top: 40, right: 40, bottom: 40, left: 40 };

describe('offscreenArrow', () => {
  it('ballon dans le champ : pas de flèche (position projetée au centre pour un point dans l’axe)', () => {
    const a = offscreenArrow(0, 0, -10, T, W, H, IN);
    expect(a.visible).toBe(false);
    expect(a.behind).toBe(false);
    expect(a.x).toBeCloseTo(W / 2, 6);
    expect(a.y).toBeCloseTo(H / 2, 6);
    // Légèrement décalé mais encore visible.
    expect(offscreenArrow(5, 2, -20, T, W, H, IN).visible).toBe(false);
  });

  it('ballon devant mais hors champ à droite : bord droit, angle 0°', () => {
    const a = offscreenArrow(100, 0, -10, T, W, H, IN);
    expect(a.visible).toBe(true);
    expect(a.x).toBeCloseTo(W - IN.right, 6);
    expect(a.y).toBeCloseTo(H / 2, 6);
    expect(a.angleDeg).toBeCloseTo(0, 6);
  });

  it('hors champ en haut à gauche : angle et position cohérents (le rayon touche d’abord le bord le plus proche)', () => {
    const a = offscreenArrow(-30, 30, -10, T, W, H, IN);
    expect(a.visible).toBe(true);
    expect(a.angleDeg).toBeLessThan(-90);
    expect(a.angleDeg).toBeGreaterThan(-180);
    const onTop = Math.abs(a.y - IN.top) < 1e-6;
    const onLeft = Math.abs(a.x - IN.left) < 1e-6;
    expect(onTop || onLeft).toBe(true);
  });

  it('ballon pile derrière la caméra : vers le bas de l’écran, signalé « derrière »', () => {
    const a = offscreenArrow(0, 0, 10, T, W, H, IN);
    expect(a.visible).toBe(true);
    expect(a.behind).toBe(true);
    expect(a.x).toBeCloseTo(W / 2, 6);
    expect(a.y).toBeCloseTo(H - IN.bottom, 6);
    expect(a.angleDeg).toBeCloseTo(90, 6);
  });

  it('ballon derrière et à gauche (au sol, sous la caméra) : flèche à gauche / en bas, pas inversée', () => {
    const a = offscreenArrow(-8, -2, 6, T, W, H, IN);
    expect(a.visible).toBe(true);
    expect(a.behind).toBe(true);
    expect(a.x).toBeLessThan(W / 2);
    expect(a.y).toBeGreaterThan(H / 2);
  });

  it('continuité devant / derrière quand le ballon passe sur le côté', () => {
    const front = offscreenArrow(10, 1, -0.01, T, W, H, IN);
    const back = offscreenArrow(10, 1, 0.01, T, W, H, IN);
    expect(front.visible && back.visible).toBe(true);
    expect(Math.abs(front.angleDeg - back.angleDeg)).toBeLessThan(1);
    expect(Math.abs(front.y - back.y)).toBeLessThan(3);
  });

  it('zones évitées : la flèche s’arrête au bord de la jauge (bas) au lieu du bord de l’écran', () => {
    const gauge = { x: W / 2 - 200, y: H - 150, w: 400, h: 150 };
    const a = offscreenArrow(0, 0, 10, T, W, H, IN, [gauge]);
    expect(a.y).toBeCloseTo(H - 150, 6);
    // En diagonale, le rayon passe à côté : bord de l'écran.
    const b = offscreenArrow(-30, -12, 10, T, W, H, IN, [gauge]);
    expect(b.x < gauge.x || b.y <= gauge.y + 1e-6).toBe(true);
  });

  it('marge des zones évitées : le disque et la pointe ne mordent pas sur le score et son étiquette', () => {
    // Correction de l'étape 8 : ballon au-dessus de l'écran, zone du score de 83 px de haut ; sans marge, le CENTRE de la
    // flèche s'arrêtait au bord (y = 83) et son disque (rayon ≈ 32 px avec la pointe) couvrait l'étiquette sous le score.
    const score = { x: W / 2 - 200, y: 0, w: 400, h: 83 };
    const up = { cx: 0, cy: 30, cz: -10 };
    const a = offscreenArrow(up.cx, up.cy, up.cz, T, W, H, IN, [score]);
    expect(a.y).toBeCloseTo(83, 6);
    const b = offscreenArrow(up.cx, up.cy, up.cz, T, W, H, IN, [score], 32);
    expect(b.y).toBeCloseTo(83 + 32, 6);
    expect(b.angleDeg).toBeCloseTo(-90, 6);
    // Ballon derrière : au-dessus de la jauge, à la marge près.
    const gauge = { x: W / 2 - 200, y: H - 150, w: 400, h: 150 };
    expect(offscreenArrow(0, 0, 10, T, W, H, IN, [gauge], 32).y).toBeCloseTo(H - 150 - 32, 6);
  });

  it('rayEnterRect : entrée, rayon qui manque, origine à l’intérieur', () => {
    const r = { x: 10, y: -1, w: 5, h: 2 };
    expect(rayEnterRect(0, 0, 1, 0, r)).toBeCloseTo(10, 9);
    expect(rayEnterRect(0, 0, -1, 0, r)).toBe(Infinity);
    expect(rayEnterRect(0, 0, 0, 1, r)).toBe(Infinity);
    expect(rayEnterRect(12, 0, 1, 0, r)).toBe(Infinity);
  });

  it('écran dégénéré ou valeurs extrêmes : jamais de NaN', () => {
    const a = offscreenArrow(0, 0, 0, 0, 0, 0, IN);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.angleDeg)).toBe(true);
  });
});
