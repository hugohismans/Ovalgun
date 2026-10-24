/**
 * Déterminisme : même seed + mêmes entrées => même état, octet pour octet (JSON.stringify).
 */
import { describe, expect, it } from 'vitest';
import { cloneState, hashState, step, type MatchEventType, type MatchState, type TeamSize } from '../../src/sim';
import { findBadValues, newMatch, scriptedEvents, scriptedInputs } from './helpers';

const TICKS = 1800;

function simulate(
  teamSize: TeamSize,
  seed: number,
  opts: { roundTripEvery?: number; inputSeed?: number; checkValues?: boolean } = {},
): { state: MatchState; hashes: string[]; eventCounts: Partial<Record<MatchEventType, number>>; bad: string[] } {
  let s = newMatch(teamSize, seed);
  const frames = scriptedInputs(opts.inputSeed ?? 1234, teamSize * 2, TICKS);
  const hashes: string[] = [];
  const eventCounts: Partial<Record<MatchEventType, number>> = {};
  const bad: string[] = [];
  for (let t = 0; t < TICKS; t++) {
    scriptedEvents(s, t);
    if (opts.roundTripEvery && t % opts.roundTripEvery === 0) s = cloneState(s);
    step(s, frames[t]);
    for (const e of s.events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
    if (t % 100 === 0) hashes.push(hashState(s));
    if (opts.checkValues && t % 5 === 0 && bad.length === 0) bad.push(...findBadValues(s).map((b) => `tick ${s.tick}: ${b}`));
  }
  return { state: s, hashes, eventCounts, bad };
}

describe.each([3, 5] as const)('déterminisme, équipes de %i', (teamSize) => {
  const ref = simulate(teamSize, 42, { checkValues: true });

  it('même seed + mêmes entrées => JSON identique sur 1800 ticks', () => {
    const again = simulate(teamSize, 42);
    expect(again.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(ref.state));
  });

  it('les entrées scriptées exercent vraiment les systèmes (sauts, esquives, glissades, rebonds, passes, coups de pied, plongeons…)', () => {
    for (const type of ['jump', 'land', 'dodge', 'slide', 'bounce', 'pickup', 'dive', 'kick'] as const) {
      expect(ref.eventCounts[type] ?? 0, type).toBeGreaterThan(0);
    }
    // Porteur (étape 4) : des passes PARTENT et des ballons en vol sont ATTRAPÉS (réception / interception, stats).
    expect(ref.eventCounts.pass ?? 0, 'pass').toBeGreaterThan(0);
    expect(ref.eventCounts.catch ?? 0, 'catch').toBeGreaterThan(0);
    // Les joueurs ont réellement bougé.
    const start = newMatch(teamSize, 42);
    const moved = ref.state.players.filter((p, i) => Math.hypot(p.pos.x - start.players[i].pos.x, p.pos.z - start.players[i].pos.z) > 3);
    expect(moved.length).toBeGreaterThan(teamSize);
  });

  it('seeds différentes => états différents (rebonds seedés du ballon)', () => {
    const other = simulate(teamSize, 43);
    expect(other.state.rng).not.toBe(ref.state.rng);
    expect(JSON.stringify(other.state.ball)).not.toBe(JSON.stringify(ref.state.ball));
    // Dès les premiers ticks, la trajectoire du ballon diffère.
    const a = newMatch(teamSize, 1);
    const b = newMatch(teamSize, 2);
    for (let t = 0; t < 30; t++) {
      step(a, {});
      step(b, {});
    }
    expect(a.ball.pos).not.toEqual(b.ball.pos);
  });

  it('aller-retour cloneState / JSON en cours de route => même résultat', () => {
    const rt = simulate(teamSize, 42, { roundTripEvery: 37 });
    expect(rt.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(rt.state)).toBe(JSON.stringify(ref.state));
  });

  it('aucun NaN / Infinity / undefined / objet non JSON dans l’état, même avec des entrées corrompues', () => {
    expect(ref.bad).toEqual([]);
    expect(findBadValues(ref.state)).toEqual([]);
    // cloneState est une vraie copie profonde.
    const c = cloneState(ref.state);
    expect(JSON.stringify(c)).toBe(JSON.stringify(ref.state));
    c.players[0].pos.x += 1;
    c.ball.vel.y += 1;
    expect(c.players[0].pos.x).not.toBe(ref.state.players[0].pos.x);
    expect(c.ball.vel.y).not.toBe(ref.state.ball.vel.y);
  });

  it('step mute en place et renvoie le même objet ; tick incrémenté', () => {
    const s = newMatch(teamSize, 9);
    const r = step(s, {});
    expect(r).toBe(s);
    expect(s.tick).toBe(1);
  });
});

describe('contrat de step', () => {
  it('refuse un dt différent de TICK_DT', () => {
    const s = newMatch(3, 1);
    expect(() => step(s, {}, 1 / 60)).toThrow();
  });

  it('createMatch valide la configuration', async () => {
    const { createMatch } = await import('../../src/sim');
    expect(() => createMatch({ teamSize: 3, seed: 1, roles: [['pilier'], ['demi', 'demi', 'demi']] })).toThrow();
    expect(() =>
      createMatch({ teamSize: 4 as TeamSize, seed: 1, roles: [['pilier'], ['demi']] }),
    ).toThrow();
  });

  it("createMatch ne laisse aucun champ optionnel à undefined dans l'état", () => {
    const s = newMatch(5, 3);
    expect(findBadValues(s)).toEqual([]);
    expect(s.config.durationSec).toBeGreaterThan(0);
    expect(typeof s.config.training).toBe('boolean');
  });

  it('createMatch ne crée aucun -0 (joueur central quand teamSize est impair)', () => {
    for (const size of [3, 5] as const) {
      for (const seed of [1, 2, 3]) expect(findBadValues(newMatch(size, seed), 'state', [], true)).toEqual([]);
    }
  });
});
