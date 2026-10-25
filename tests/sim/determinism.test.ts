/**
 * Déterminisme : même seed + mêmes entrées => même état, octet pour octet (JSON.stringify).
 */
import { describe, expect, it } from 'vitest';
import { Buttons, cloneState, debugGiveBall, hashState, step, type InputFrame, type MatchEventType, type MatchState, type PlayerInput, type TeamSize } from '../../src/sim';
import { createTurret } from '../../src/bots/turret';
import type { InputProvider } from '../../src/bots';
import { findBadValues, newMatch, scriptedEvents, scriptedInputs } from './helpers';

const TICKS = 1800;

function simulate(
  teamSize: TeamSize,
  seed: number,
  opts: { roundTripEvery?: number; inputSeed?: number; checkValues?: boolean } = {},
): {
  state: MatchState;
  hashes: string[];
  ballTrace: string[];
  eventCounts: Partial<Record<MatchEventType, number>>;
  bad: string[];
  zoneTicks: number;
  shieldTicks: number;
} {
  let s = newMatch(teamSize, seed);
  // Graine des entrées scriptées : choisie pour que passes ET réceptions arrivent aussi avec les grenades, boucliers et
  // zones de l'étape 7 (les explosions repoussent les receveurs).
  const frames = scriptedInputs(opts.inputSeed ?? 99, teamSize * 2, TICKS);
  const hashes: string[] = [];
  const ballTrace: string[] = [];
  const eventCounts: Partial<Record<MatchEventType, number>> = {};
  const bad: string[] = [];
  let zoneTicks = 0;
  let shieldTicks = 0;
  for (let t = 0; t < TICKS; t++) {
    scriptedEvents(s, t);
    if (opts.roundTripEvery && t % opts.roundTripEvery === 0) s = cloneState(s);
    step(s, frames[t]);
    for (const e of s.events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
    if (t % 100 === 0) hashes.push(hashState(s));
    if (t % 10 === 0) ballTrace.push(JSON.stringify(s.ball));
    if (opts.checkValues && t % 5 === 0 && bad.length === 0) bad.push(...findBadValues(s).map((b) => `tick ${s.tick}: ${b}`));
    if (s.zones.length > 0) zoneTicks++;
    if (s.players.some((p) => p.role === 'pilier' && p.abilityTicks > 0)) shieldTicks++;
  }
  return { state: s, hashes, ballTrace, eventCounts, bad, zoneTicks, shieldTicks };
}

describe.each([3, 5] as const)('déterminisme, équipes de %i', (teamSize) => {
  const ref = simulate(teamSize, 42, { checkValues: true });

  it('même seed + mêmes entrées => JSON identique sur 1800 ticks', () => {
    const again = simulate(teamSize, 42);
    expect(again.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(ref.state));
  });

  it('les entrées scriptées exercent vraiment les systèmes (sauts, esquives, glissades, rebonds, passes, coups de pied, plongeons…)', () => {
    for (const type of ['jump', 'land', 'dodge', 'slide', 'bounce', 'pickup', 'dive', 'kick', 'shot', 'reload', 'projectile_end', 'explosion', 'ability'] as const) {
      expect(ref.eventCounts[type] ?? 0, type).toBeGreaterThan(0);
    }
    // Porteur (étape 4) : des passes PARTENT et des ballons en vol sont ATTRAPÉS (réception / interception, stats).
    expect(ref.eventCounts.pass ?? 0, 'pass').toBeGreaterThan(0);
    expect(ref.eventCounts.catch ?? 0, 'catch').toBeGreaterThan(0);
    // Étape 7 : grenades (explosions), boucliers levés et zones de ralentissement font partie du déterminisme étendu.
    expect(ref.zoneTicks, 'zones').toBeGreaterThan(0);
    expect(ref.shieldTicks, 'boucliers').toBeGreaterThan(0);
    // Les joueurs ont réellement bougé.
    const start = newMatch(teamSize, 42);
    const moved = ref.state.players.filter((p, i) => Math.hypot(p.pos.x - start.players[i].pos.x, p.pos.z - start.players[i].pos.z) > 3);
    expect(moved.length).toBeGreaterThan(teamSize);
  });

  it('seeds différentes => états différents (rebonds seedés du ballon)', () => {
    const other = simulate(teamSize, 43);
    expect(other.state.rng).not.toBe(ref.state.rng);
    // Trajectoire du ballon (tous les 10 ticks). Depuis l'étape 6, une remise en jeu après un essai replace le ballon
    // à l'identique quelle que soit la seed : on compare donc toute la trajectoire, pas seulement l'état final.
    expect(other.ballTrace).not.toEqual(ref.ballTrace);
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

/**
 * Combat (étape 5) : l'équipe 1 est pilotée par des tourelles d'entraînement (src/bots/turret.ts, qui visent et
 * tirent vraiment), l'équipe 0 par les entrées scriptées ; des porteurs sont forcés dans l'équipe 0 pour que des
 * plaquages fassent lâcher le ballon. Les tourelles sont recréées à chaque exécution (mémoire hors MatchState).
 */
function simulateCombat(teamSize: TeamSize, seed: number, roundTripEvery = 0) {
  let s = newMatch(teamSize, seed);
  for (const f of s.field.features) f.height = Math.min(f.height, 0.5); // reliefs bas : lignes de tir dégagées
  const frames = scriptedInputs(777, teamSize * 2, TICKS);
  const turrets = new Map<number, InputProvider>();
  for (const p of s.players) if (p.team === 1) turrets.set(p.id, createTurret(seed, p.id));
  const counts: Partial<Record<MatchEventType, number>> = {};
  const hashes: string[] = [];
  const bad: string[] = [];
  for (let t = 0; t < TICKS; t++) {
    if (t % 150 === 20) {
      // Porteur forcé de l'équipe 0, replacé à 10 m devant l'ailier-tourelle adverse (intervention scriptée identique).
      const k = s.players[((t / 150) | 0) % teamSize];
      const gunner = s.players.find((p) => p.team === 1 && p.role === 'ailier');
      if (gunner !== undefined && k.status === 'active') k.pos = { x: gunner.pos.x, y: 0, z: gunner.pos.z - 10 };
      debugGiveBall(s, k.id);
    }
    if (roundTripEvery && t % roundTripEvery === 0) s = cloneState(s);
    const frame: Record<number, PlayerInput | undefined> = { ...frames[t] };
    // Le porteur forcé garde le ballon (ni passe ni coup de pied) en piétinant : il finit plaqué et le lâche.
    const c = s.ball.mode === 'carried' ? frame[s.ball.carrierId] : undefined;
    if (c !== undefined) {
      frame[s.ball.carrierId] = { ...c, moveX: c.moveX * 0.2, moveY: c.moveY * 0.2, buttons: c.buttons & ~(Buttons.PASS | Buttons.KICK | Buttons.SLIDE) };
    }
    for (const [id, bot] of turrets) frame[id] = bot(s, id);
    step(s, frame as InputFrame);
    for (const e of s.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (t % 100 === 0) hashes.push(hashState(s));
    if (t % 7 === 0 && bad.length === 0) bad.push(...findBadValues(s).map((b) => `tick ${s.tick}: ${b}`));
  }
  return { state: s, counts, hashes, bad };
}

describe.each([3, 5] as const)('déterminisme avec tir (tourelles), équipes de %i', (teamSize) => {
  const ref = simulateCombat(teamSize, 21);

  it('même seed + mêmes entrées => JSON identique ; aller-retour JSON en cours de route => idem', () => {
    const again = simulateCombat(teamSize, 21);
    expect(again.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(ref.state));
    const rt = simulateCombat(teamSize, 21, 41);
    expect(rt.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(rt.state)).toBe(JSON.stringify(ref.state));
  });

  it('le combat est vraiment exercé : tirs, touches, plaquages, relevés, ballons lâchés, rechargements', () => {
    for (const type of ['shot', 'hit', 'tackled', 'getup', 'drop', 'reload', 'projectile_end'] as const) {
      expect(ref.counts[type] ?? 0, type).toBeGreaterThan(0);
    }
    expect(ref.bad).toEqual([]);
    const tackles = ref.state.players.reduce((n, p) => n + p.stats.tackles, 0);
    expect(tackles).toBeGreaterThan(0);
    expect(ref.state.players.every((p) => p.stats.shotsHit <= p.stats.shotsFired)).toBe(true);
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
