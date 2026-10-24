/**
 * Performance : un tick 5v5 doit rester très en dessous du budget (33 ms à 30 Hz) ; seuil
 * généreux de 1 ms en moyenne pour absorber une machine chargée.
 */
import { expect, it } from 'vitest';
import { step } from '../../src/sim';
import { newMatch, scriptedEvents, scriptedInputs } from './helpers';

it('un tick 5v5 prend moins de 1 ms en moyenne', () => {
  const TICKS = 3000;
  const frames = scriptedInputs(99, 10, TICKS);
  const s = newMatch(5, 99);
  for (let t = 0; t < 300; t++) step(s, frames[t]); // chauffe (JIT)
  const t0 = performance.now();
  for (let t = 300; t < TICKS; t++) {
    scriptedEvents(s, t);
    step(s, frames[t]);
  }
  const avg = (performance.now() - t0) / (TICKS - 300);
  expect(avg).toBeLessThan(1);
});
