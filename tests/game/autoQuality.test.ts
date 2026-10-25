/**
 * Qualité graphique Auto : baisse d'un niveau par fenêtre trop lente, jamais de remontée, images aberrantes ignorées.
 */
import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../../src/game/autoQuality';
import { AUTO_QUALITY } from '../../src/render/palette';

/** `sec` secondes d'images à `fps`. */
function run(q: AutoQuality, fps: number, sec: number): Array<string | null> {
  const out: Array<string | null> = [];
  for (let t = 0; t < sec * fps; t++) out.push(q.frame(1 / fps));
  return out.filter((x) => x !== null);
}

describe('AutoQuality', () => {
  it('reste en Haut à 60 img/s', () => {
    const q = new AutoQuality();
    expect(run(q, 60, 20)).toEqual([]);
    expect(q.level).toBe('haut');
  });

  it('descend d’un niveau par fenêtre lente, jusqu’à Bas, sans remonter', () => {
    const q = new AutoQuality();
    expect(run(q, 30, AUTO_QUALITY.windowSec + 0.1)).toEqual(['moyen']);
    expect(run(q, 30, AUTO_QUALITY.windowSec + 0.1)).toEqual(['bas']);
    expect(run(q, 20, 20)).toEqual([]);
    expect(run(q, 120, 20)).toEqual([]);
    expect(q.level).toBe('bas');
    q.reset();
    expect(q.level).toBe('haut');
  });

  it('images trop longues (onglet caché, chargement) ignorées', () => {
    const q = new AutoQuality();
    for (let i = 0; i < 100; i++) expect(q.frame(1)).toBeNull();
    expect(q.frame(0)).toBeNull();
    expect(q.frame(Number.NaN)).toBeNull();
    expect(q.level).toBe('haut');
  });
});
