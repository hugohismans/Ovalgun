/**
 * Boucle à pas fixe du client (FixedStepLoop) : ticks par frame, rattrapage borné, alpha.
 */
import { describe, expect, it } from 'vitest';
import { FixedStepLoop, MAX_CATCHUP_TICKS, MAX_FRAME_DT } from '../../src/game/loop';
import { TICK_DT } from '../../src/sim/constants';

describe('FixedStepLoop', () => {
  it('60 Hz : un tick toutes les deux frames, alpha alterne', () => {
    const l = new FixedStepLoop();
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += l.advance(1 / 60);
    // 1 s de temps réel = 30 ticks (à l'arrondi flottant près sur la dernière frame).
    expect(Math.abs(ticks - 30)).toBeLessThanOrEqual(1);
    expect(l.alpha).toBeGreaterThanOrEqual(0);
    expect(l.alpha).toBeLessThan(1);
  });

  it('144 Hz : jamais plus d’un tick par frame, alpha croissant entre deux ticks', () => {
    const l = new FixedStepLoop();
    let prevAlpha = -1;
    for (let i = 0; i < 4; i++) {
      expect(l.advance(1 / 144)).toBe(0);
      expect(l.alpha).toBeGreaterThan(prevAlpha);
      prevAlpha = l.alpha;
    }
    expect(l.advance(1 / 144)).toBe(1);
  });

  it('gros à-coup : au plus MAX_CATCHUP_TICKS ticks, le retard est abandonné', () => {
    const l = new FixedStepLoop();
    expect(l.advance(MAX_FRAME_DT)).toBe(MAX_CATCHUP_TICKS);
    expect(l.acc).toBeLessThan(TICK_DT);
    // Onglet gelé 10 s : borné à MAX_FRAME_DT, pas de spirale.
    expect(l.advance(10)).toBe(MAX_CATCHUP_TICKS);
    expect(l.advance(0)).toBe(0);
  });

  it('dt invalide ou négatif ignoré ; reset vide l’accumulateur', () => {
    const l = new FixedStepLoop();
    expect(l.advance(Number.NaN)).toBe(0);
    expect(l.advance(-1)).toBe(0);
    l.advance(TICK_DT * 0.5);
    expect(l.alpha).toBeCloseTo(0.5, 9);
    l.reset();
    expect(l.alpha).toBe(0);
  });
});
