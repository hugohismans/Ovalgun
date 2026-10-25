/**
 * Atlas des panneaux du stade, dessiné en code sur un canvas (aucune image téléchargée) : logo « OVALGUN » des écrans
 * géants (moitié haute) et 12 publicités plates (moitié basse, 2 colonnes × 6 rangées). Sans DOM (tests sous Node),
 * une texture blanche de 1 pixel le remplace.
 */

import * as THREE from 'three';
import { PALETTE } from '../palette';

/** Rectangle de l'atlas en coordonnées de texture (v vers le haut). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface Atlas {
  texture: THREE.Texture;
  screen: UvRect;
  ads: UvRect[];
}

const SIZE = 1024;
const SCREEN_H = 448;
const AD_W = 512;
const AD_H = (SIZE - SCREEN_H) / 6;

/** Publicités inventées : fond, texte, slogan. */
const ADS: readonly (readonly [string, string, string])[] = [
  [PALETTE.teams[0].main, '#ffffff', 'OVALGUN'],
  [PALETTE.teams[1].main, '#ffffff', 'OVALGUN'],
  ['#ffe12e', '#17142a', 'ESSAI !'],
  ['#7b5cff', '#ffffff', 'PLAQUE À DISTANCE'],
  ['#ff4fa3', '#ffffff', 'SPLAT COLA'],
  ['#3dffa0', '#17142a', 'TURBO OVALE'],
  ['#17142a', '#ffe12e', 'GO GO GO'],
  ['#ffffff', '#ff4fa3', 'MÊLÉE MANIA'],
  ['#2bd9ff', '#17142a', 'RUGBY ARCADE'],
  ['#ff3d5a', '#ffffff', 'BOUM !'],
  ['#17142a', '#ffffff', 'ORANGE VS BLEU'],
  ['#ffd23e', '#2a2643', 'SAISON 1'],
];

const rect = (x: number, y: number, w: number, h: number): UvRect => ({ u0: x / SIZE, v0: 1 - (y + h) / SIZE, u1: (x + w) / SIZE, v1: 1 - y / SIZE });

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = '900'): void {
  let s = size;
  ctx.font = `italic ${weight} ${s}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = `italic ${weight} ${s}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
  }
}

function drawScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#17142a';
  ctx.fillRect(0, 0, SIZE, SCREEN_H);
  // Rayures diagonales discrètes.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SIZE, SCREEN_H);
  ctx.clip();
  ctx.fillStyle = '#221d3d';
  for (let x = -SCREEN_H; x < SIZE; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, SCREEN_H);
    ctx.lineTo(x + 32, SCREEN_H);
    ctx.lineTo(x + 32 + SCREEN_H, 0);
    ctx.lineTo(x + SCREEN_H, 0);
    ctx.fill();
  }
  ctx.restore();
  // Bandeaux aux couleurs des équipes.
  ctx.fillStyle = PALETTE.teams[0].main;
  ctx.fillRect(0, 0, SIZE / 2, 22);
  ctx.fillStyle = PALETTE.teams[1].main;
  ctx.fillRect(SIZE / 2, 0, SIZE / 2, 22);
  ctx.fillStyle = PALETTE.teams[1].main;
  ctx.fillRect(0, SCREEN_H - 22, SIZE / 2, 22);
  ctx.fillStyle = PALETTE.teams[0].main;
  ctx.fillRect(SIZE / 2, SCREEN_H - 22, SIZE / 2, 22);
  // Logo : OVAL (orange) + GUN (bleu), contour blanc.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  fitText(ctx, 'OVALGUN', SIZE * 0.84, 230);
  const wOval = ctx.measureText('OVAL').width;
  const wAll = ctx.measureText('OVALGUN').width;
  const x0 = (SIZE - wAll) / 2;
  const y = SCREEN_H * 0.45;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('OVALGUN', x0, y);
  ctx.fillStyle = PALETTE.teams[0].main;
  ctx.fillText('OVAL', x0, y);
  ctx.fillStyle = PALETTE.teams[1].main;
  ctx.fillText('GUN', x0 + wOval, y);
  ctx.textAlign = 'center';
  fitText(ctx, 'RUGBY ARCADE · CHAQUE ARME PLAQUE', SIZE * 0.8, 46, '800');
  ctx.fillStyle = '#ffe12e';
  ctx.fillText('RUGBY ARCADE · CHAQUE ARME PLAQUE', SIZE / 2, SCREEN_H * 0.8);
}

function drawAd(ctx: CanvasRenderingContext2D, x: number, y: number, bg: string, fg: string, text: string, split: boolean): void {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, AD_W, AD_H);
  if (split) {
    ctx.fillStyle = PALETTE.teams[0].main;
    ctx.fillRect(x, y, AD_W / 2, AD_H);
    ctx.fillStyle = PALETTE.teams[1].main;
    ctx.fillRect(x + AD_W / 2, y, AD_W / 2, AD_H);
  }
  // Liseré haut et bas.
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x, y + 4, AD_W, 5);
  ctx.fillRect(x, y + AD_H - 9, AD_W, 5);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, text, AD_W * 0.86, 62);
  ctx.fillStyle = fg;
  ctx.fillText(text, x + AD_W / 2, y + AD_H / 2 + 2);
}

export function createAtlas(): Atlas {
  const ads: UvRect[] = [];
  for (let i = 0; i < ADS.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    // Demi-texel de marge pour éviter les fuites entre panneaux voisins au filtrage.
    ads.push(rect(col * AD_W + 1, SCREEN_H + row * AD_H + 1, AD_W - 2, AD_H - 2));
  }
  const screen = rect(1, 1, SIZE - 2, SCREEN_H - 2);
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    return { texture: tex, screen, ads };
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    drawScreen(ctx);
    for (let i = 0; i < ADS.length; i++) {
      const [bg, fg, text] = ADS[i];
      drawAd(ctx, (i % 2) * AD_W, SCREEN_H + Math.floor(i / 2) * AD_H, bg, fg, text, text === 'ORANGE VS BLEU');
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, screen, ads };
}
