/**
 * Mêlée (étape 7, src/sim/scrum.ts) : déclenchement (ballon libre depuis SCRUM_LOOSE_SEC, N joueurs actifs de chaque
 * camp dans le rayon), ballon immobile et non ramassable, décompte (plaqués exclus), résolution à la majorité,
 * prolongation « premier qui mène », tirage seedé, ballon donné au bon joueur, chrono, nettoyage, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_PICKUP_RADIUS,
  BALL_RADIUS,
  cloneState,
  countInZone,
  debugGiveBall,
  debugResetBall,
  FIELD_SCALE_3V3,
  hashState,
  inScrumZone,
  makeInput,
  rand,
  SCRUM_CAPTURE_SEC,
  SCRUM_LOOSE_SEC,
  SCRUM_MIN_PLAYERS_3V3,
  SCRUM_MIN_PLAYERS_5V5,
  SCRUM_RADIUS,
  SCRUM_TIE_EXTRA_SEC,
  scrumInOvertime,
  scrumRadius,
  scrumTicksLeft,
  secToTicks,
  setupKickoff,
  step,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type PlayerState,
  type TeamSize,
} from '../../src/sim';
import { findBadValues, newMatch, scriptedInputs } from './helpers';

const LOOSE = secToTicks(SCRUM_LOOSE_SEC);
const CAPTURE = secToTicks(SCRUM_CAPTURE_SEC);
const EXTRA = secToTicks(SCRUM_TIE_EXTRA_SEC);
const NONE: InputFrame = {};

/** Équipe d'un joueur par id. */
const teamOf = (s: MatchState, team: 0 | 1): PlayerState[] => s.players.filter((p) => p.team === team);

/**
 * Match « en jeu », ballon LIBRE posé au repos au centre (looseTicks = 0), `n0` joueurs de l'équipe 0 et `n1` de
 * l'équipe 1 placés autour du ballon à `dist` m (dans le rayon, hors du cercle de ramassage), les autres rangés loin
 * sur les côtés (hors du rayon). Aucune entrée : les joueurs restent en place.
 */
function scrumSetup(teamSize: TeamSize, n0: number, n1: number, dist = 3, seed = 1): MatchState {
  const s = newMatch(teamSize, seed);
  const b = s.ball;
  b.mode = 'loose';
  b.pos = { x: 0, y: BALL_RADIUS, z: 0 };
  b.vel = { x: 0, y: 0, z: 0 };
  b.looseTicks = 0;
  b.spinRate = 0;
  b.tumbleRate = 0;
  const near = [...teamOf(s, 0).slice(0, n0), ...teamOf(s, 1).slice(0, n1)];
  near.forEach((p, i) => {
    const a = (2 * Math.PI * i) / near.length;
    p.pos = { x: Math.sin(a) * dist, y: 0, z: Math.cos(a) * dist };
    p.vel = { x: 0, y: 0, z: 0 };
  });
  let k = 0;
  for (const p of s.players) {
    if (near.includes(p)) continue;
    p.pos = { x: (k % 2 === 0 ? -1 : 1) * (s.field.width / 2 - 2), y: 0, z: -6 + 4 * Math.floor(k / 2) };
    p.vel = { x: 0, y: 0, z: 0 };
    k++;
  }
  for (const p of s.players) p.pickupBlockTicks = 0;
  s.events = [];
  return s;
}

/** Simule jusqu'au déclenchement (LOOSE ticks) et renvoie l'état (mêlée en cours, ticks = 0). */
function startScrum(s: MatchState): MatchState {
  for (let t = 0; t < LOOSE; t++) step(s, NONE);
  expect(s.scrum).not.toBeNull();
  return s;
}

/** Simule `n` ticks sans entrée ; renvoie les événements de mêlée vus (avec le tick relatif, 1..n). */
function runTicks(s: MatchState, n: number, before?: (t: number) => void): { t: number; e: MatchEvent }[] {
  const seen: { t: number; e: MatchEvent }[] = [];
  for (let t = 1; t <= n; t++) {
    before?.(t);
    step(s, NONE);
    for (const e of s.events) if (e.type.startsWith('scrum')) seen.push({ t, e });
  }
  return seen;
}

/** Plaque (au sol, pour longtemps) un joueur, sans passer par les tirs. */
function knockDown(p: PlayerState): void {
  p.status = 'down';
  p.statusTicks = 10_000;
  p.stability = 0;
}

describe('mêlée : déclenchement', () => {
  it('rien avant SCRUM_LOOSE_SEC, déclenchement exact au tick, ballon au sol au centre (3v3)', () => {
    const s = scrumSetup(3, SCRUM_MIN_PLAYERS_3V3, SCRUM_MIN_PLAYERS_3V3);
    for (let t = 1; t < LOOSE; t++) {
      step(s, NONE);
      expect(s.scrum).toBeNull();
      expect(s.ball.mode).toBe('loose');
      expect(s.ball.looseTicks).toBe(t);
    }
    step(s, NONE);
    expect(s.scrum).not.toBeNull();
    const sc = s.scrum!;
    expect(s.events).toContainEqual({ type: 'scrum_start', pos: { x: 0, y: 0, z: 0 } });
    expect(sc.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(sc.radius).toBeCloseTo(SCRUM_RADIUS * s.field.scale, 12);
    expect(sc.radius).toBe(scrumRadius(s));
    expect(sc.ticks).toBe(0);
    expect(sc.counts).toEqual([2, 2]);
    expect(s.ball.mode).toBe('scrum');
    expect(s.ball.pos).toEqual({ x: 0, y: BALL_RADIUS, z: 0 });
    expect(s.ball.looseTicks).toBe(0);
    expect(findBadValues(JSON.parse(JSON.stringify(s)) as unknown)).toEqual([]);
  });

  it('5v5 : il faut SCRUM_MIN_PLAYERS_5V5 de chaque côté', () => {
    const n = SCRUM_MIN_PLAYERS_5V5;
    for (const [a, b, expected] of [
      [n, n - 1, false],
      [n - 1, n, false],
      [n, n, true],
      [5, 2, false],
    ] as const) {
      const s = scrumSetup(5, a, b, 4);
      runTicks(s, LOOSE + 30);
      expect(s.scrum !== null || s.ball.mode === 'carried', `${a} contre ${b}`).toBe(expected);
    }
  });

  it('3v3 : pas de mêlée si N non atteint d\'un côté, même longtemps', () => {
    for (const [a, b] of [
      [2, 1],
      [1, 2],
      [3, 1],
      [0, 3],
    ] as const) {
      const s = scrumSetup(3, a, b);
      const ev = runTicks(s, LOOSE * 3);
      expect(ev).toEqual([]);
      expect(s.scrum).toBeNull();
      expect(s.ball.mode).toBe('loose');
    }
  });

  it('rayon : un joueur juste dehors ne compte pas, juste dedans compte (horizontal, échelle du terrain)', () => {
    const r = SCRUM_RADIUS * FIELD_SCALE_3V3;
    const outside = scrumSetup(3, 2, 2, r + 0.05);
    runTicks(outside, LOOSE + 5);
    expect(outside.scrum).toBeNull();
    const inside = scrumSetup(3, 2, 2, r - 0.05);
    for (const p of inside.players) p.pos.y = 0;
    runTicks(inside, LOOSE);
    expect(inside.scrum).not.toBeNull();
  });

  it('les joueurs plaqués / qui se relèvent ne comptent pas pour le déclenchement', () => {
    const s = scrumSetup(3, 2, 2);
    knockDown(teamOf(s, 1)[0]);
    runTicks(s, LOOSE + 10);
    expect(s.scrum).toBeNull();
    const g = scrumSetup(3, 2, 2);
    const p = teamOf(g, 0)[1];
    p.status = 'getting_up';
    p.statusTicks = 10_000;
    runTicks(g, LOOSE + 10);
    expect(g.scrum).toBeNull();
  });

  it('un ballon ramassé n\'est jamais pris en mêlée ; une passe / un coup de pied en vol ne compte pas comme libre', () => {
    const s = scrumSetup(3, 2, 2);
    s.ball.looseTicks = LOOSE + 50;
    s.players[0].pos = { x: 0.5, y: 0, z: 0 }; // dans le cercle de ramassage
    step(s, NONE);
    expect(s.ball.mode).toBe('carried');
    expect(s.scrum).toBeNull();
    const k = scrumSetup(3, 2, 2);
    k.ball.mode = 'kick';
    k.ball.looseTicks = 0;
    k.ball.pos = { x: 0, y: 20, z: 0 };
    k.ball.vel = { x: 0, y: 0.1, z: 0 };
    step(k, NONE);
    expect(k.ball.looseTicks).toBe(0);
  });

  it('pas de mêlée pendant une phase figée (coup d\'envoi, pause d\'essai)', () => {
    for (const phase of ['kickoff', 'try'] as const) {
      const s = scrumSetup(3, 3, 3);
      s.phase = phase;
      s.phaseTicks = 1000;
      s.ball.looseTicks = LOOSE * 2;
      runTicks(s, 30);
      expect(s.scrum).toBeNull();
      expect(s.ball.mode).toBe('loose');
    }
  });
});

describe('mêlée : zone de capture', () => {
  it('ballon immobile et non ramassable, même si un joueur lui rentre dedans', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    const p = s.players[0];
    p.pos = { x: -2, y: 0, z: 0 };
    const pos = { ...s.ball.pos };
    for (let t = 0; t < 20; t++) {
      step(s, { 0: makeInput({ moveY: 1, yaw: Math.PI / 2 }) }); // court vers +X : traverse le ballon
      expect(s.ball.mode).toBe('scrum');
      expect(s.ball.pos).toEqual(pos);
      expect(s.ball.vel).toEqual({ x: 0, y: 0, z: 0 });
      expect(s.events.some((e) => e.type === 'pickup')).toBe(false);
    }
    expect(p.pos.x).toBeGreaterThan(1); // il est bien passé sur le ballon
    // Directement sur le ballon, immobile : toujours rien.
    p.pos = { x: s.ball.pos.x, y: 0, z: s.ball.pos.z };
    p.vel = { x: 0, y: 0, z: 0 };
    step(s, NONE);
    expect(s.ball.mode).toBe('scrum');
  });

  it('le décompte suit les joueurs actifs dans la zone ; un plaqué sort du décompte', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    step(s, NONE);
    expect(s.scrum!.ticks).toBe(1);
    expect(s.scrum!.counts).toEqual([2, 2]);
    knockDown(teamOf(s, 1)[0]);
    step(s, NONE);
    expect(s.scrum!.counts).toEqual([2, 1]);
    const third = teamOf(s, 0)[2];
    third.pos = { x: 1, y: 0, z: -2 };
    step(s, NONE);
    expect(s.scrum!.counts).toEqual([3, 1]);
    expect(s.scrum!.counts).toEqual(countInZone(s, 0, 0, s.scrum!.radius));
    // inScrumZone (HUD « tu comptes ») : exactement les joueurs du décompte (plaqué exclu, bord compris).
    const edge = teamOf(s, 1)[1];
    edge.pos = { x: s.scrum!.radius, y: 0, z: 0 };
    step(s, NONE);
    const sc = s.scrum!;
    for (const team of [0, 1] as const) expect(teamOf(s, team).filter((p) => inScrumZone(p, sc)).length).toBe(sc.counts[team]);
    expect(inScrumZone(edge, sc)).toBe(true);
    expect(inScrumZone(teamOf(s, 1)[0], sc)).toBe(false); // au sol, dans le disque
  });

  it('résolution exacte après SCRUM_CAPTURE_SEC : majorité, ballon au joueur le plus proche du centre', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    const [a, b] = teamOf(s, 0);
    a.pos = { x: 2.5, y: 0, z: 1 };
    b.pos = { x: -1, y: 0, z: 1.2 }; // le plus proche du centre
    teamOf(s, 0)[2].pos = { x: -2, y: 0, z: -2 };
    const ev = runTicks(s, CAPTURE);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toEqual({ t: CAPTURE, e: { type: 'scrum_won', team: 0, playerId: b.id } });
    expect(s.scrum).toBeNull();
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(b.id);
    expect(s.ball.looseTicks).toBe(0);
    expect(s.ball.lastTeam).toBe(0);
  });

  it('égalité de distance au centre : le plus petit id reçoit le ballon', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    knockDown(teamOf(s, 0)[0]);
    knockDown(teamOf(s, 0)[1]);
    const [x, y] = teamOf(s, 1);
    x.pos = { x: 2, y: 0, z: 0 };
    y.pos = { x: -2, y: 0, z: 0 };
    const ev = runTicks(s, CAPTURE);
    expect(ev.map((v) => v.e)).toEqual([{ type: 'scrum_won', team: 1, playerId: Math.min(x.id, y.id) }]);
  });

  it('dernière minute : durée de capture inchangée', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    s.lastMinute = true;
    teamOf(s, 1)[2].pos = { x: 0, y: 0, z: 2 };
    const ev = runTicks(s, CAPTURE);
    expect(ev.map((v) => v.t)).toEqual([CAPTURE]);
  });

  it('égalité : prolongation, la première équipe qui mène gagne aussitôt', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    const leaveAt = CAPTURE + 7;
    const ev = runTicks(s, CAPTURE + EXTRA, (t) => {
      if (t === CAPTURE) {
        // Dernier tick de la capture : égalité.
        expect(s.scrum).not.toBeNull();
      }
      if (t === leaveAt) teamOf(s, 0)[0].pos = { x: 15, y: 0, z: 0 }; // l'équipe 0 sort un joueur
      if (t > CAPTURE && t < leaveAt) {
        expect(s.scrum).not.toBeNull();
        expect(scrumInOvertime(s.scrum!)).toBe(true);
      }
    });
    expect(ev.map((v) => [v.t, v.e.type, v.e.type === 'scrum_won' ? v.e.team : -1])).toEqual([[leaveAt, 'scrum_won', 1]]);
  });

  it('égalité jusqu\'au bout : tirage seedé reproductible (un seul tirage state.rng), les deux issues existent', () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const s = startScrum(scrumSetup(3, 2, 2, 3, seed));
      const copy = cloneState(s);
      const rng = { rng: s.rng };
      const expected = rand(rng) < 0.5 ? 0 : 1;
      const ev = runTicks(s, CAPTURE + EXTRA);
      expect(ev).toHaveLength(1);
      expect(ev[0].t).toBe(CAPTURE + EXTRA);
      const e = ev[0].e;
      if (e.type !== 'scrum_won') throw new Error('scrum_won attendu');
      expect(e.team).toBe(expected);
      expect(s.rng).toBe(rng.rng);
      expect(s.players[e.playerId].team).toBe(expected);
      winners.add(e.team);
      // Reproductible.
      runTicks(copy, CAPTURE + EXTRA);
      expect(hashState(copy)).toBe(hashState(s));
    }
    expect(winners).toEqual(new Set([0, 1]));
  });

  it('0 contre 0 à la fin : pas de tirage, ballon rendu libre au centre (puis re-déclenchement impossible tout de suite)', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    for (const p of s.players) knockDown(p);
    const rng = s.rng;
    const ev = runTicks(s, CAPTURE + EXTRA);
    expect(ev.map((v) => [v.t, v.e])).toEqual([[CAPTURE + EXTRA, { type: 'scrum_released', pos: { x: 0, y: 0, z: 0 } }]]);
    expect(s.rng).toBe(rng);
    expect(s.scrum).toBeNull();
    expect(s.ball.mode).toBe('loose');
    expect(s.ball.looseTicks).toBe(0);
    expect(s.ball.pos).toEqual({ x: 0, y: BALL_RADIUS, z: 0 });
  });

  it('après la résolution, pas de nouvelle mêlée avant SCRUM_LOOSE_SEC de ballon libre', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    teamOf(s, 0)[2].pos = { x: 0, y: 0, z: -2.5 };
    runTicks(s, CAPTURE);
    expect(s.ball.mode).toBe('carried');
    // Le porteur lâche le ballon sur place (plaqué) : le décompte de ballon libre repart de 0.
    s.ball.mode = 'loose';
    s.ball.carrierId = -1;
    s.ball.vel = { x: 0, y: 0, z: 0 };
    s.ball.pos = { x: 0, y: BALL_RADIUS, z: 0 };
    for (const p of s.players) if (Math.hypot(p.pos.x, p.pos.z) < BALL_PICKUP_RADIUS + 0.2) p.pos = { x: p.pos.x + 2.2, y: 0, z: p.pos.z };
    const ev = runTicks(s, LOOSE - 1);
    expect(ev).toEqual([]);
  });

  it('le chrono tourne pendant la mêlée', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    const clock = s.clockTicks;
    runTicks(s, 40);
    expect(s.scrum).not.toBeNull();
    expect(s.clockTicks).toBe(clock - 40);
    expect(scrumTicksLeft(s.scrum!)).toBe(CAPTURE - 40);
  });

  it('mêlée gagnée par l\'attaque dans l\'en-but adverse : essai (ballon porté dans l\'en-but)', () => {
    const s = scrumSetup(3, 2, 2);
    const z = s.field.tryLineZ + 2;
    s.ball.pos = { x: 0, y: BALL_RADIUS, z };
    for (const p of s.players) if (Math.hypot(p.pos.x, p.pos.z) < 4) p.pos = { x: p.pos.x, y: 0, z: p.pos.z + z };
    startScrum(s);
    teamOf(s, 0)[2].pos = { x: 1, y: 0, z: z + 1 };
    const score = s.score[0];
    runTicks(s, CAPTURE);
    expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['scrum_won', 'try']));
    expect(s.score[0]).toBe(score + 5);
  });
});

describe('mêlée : nettoyage et déterminisme', () => {
  it('remise en jeu, fin de match et outils de test effacent la mêlée', () => {
    const k = startScrum(scrumSetup(3, 2, 2));
    setupKickoff(k, 1);
    expect(k.scrum).toBeNull();
    expect(k.ball.mode).toBe('carried');

    const e = startScrum(scrumSetup(3, 2, 2));
    e.clockTicks = 2;
    runTicks(e, 2);
    expect(e.phase).toBe('ended');
    expect(e.scrum).toBeNull();
    expect(e.ball.mode).toBe('dead');

    const g = startScrum(scrumSetup(3, 2, 2));
    expect(debugGiveBall(g, 0)).toBe(true);
    expect(g.scrum).toBeNull();
    step(g, NONE);
    expect(g.scrum).toBeNull();
    expect(g.ball.mode).toBe('carried');

    const r = startScrum(scrumSetup(3, 2, 2));
    expect(debugResetBall(r)).toBe(true);
    expect(r.scrum).toBeNull();
    expect(r.ball.mode).toBe('loose');
  });

  it('sécurité : une mêlée dont le ballon n\'est plus en mêlée est oubliée', () => {
    const s = startScrum(scrumSetup(3, 2, 2));
    s.ball.mode = 'loose';
    step(s, NONE);
    expect(s.scrum).toBeNull();
  });

  it('déterministe : même état + mêmes entrées => même état, aller-retour JSON en pleine mêlée (3v3 et 5v5)', () => {
    for (const size of [3, 5] as const) {
      const s = scrumSetup(size, size === 3 ? 3 : 4, size === 3 ? 3 : 4, 3.5, 11);
      const frames = scriptedInputs(5, s.players.length, 400);
      // Les entrées scriptées commencent après le déclenchement (sinon quelqu'un ramasse le ballon).
      runTicks(s, LOOSE);
      expect(s.scrum).not.toBeNull();
      const a = cloneState(s);
      const b = JSON.parse(JSON.stringify(s)) as MatchState;
      let starts = 0;
      for (const st of [a, b]) {
        for (const f of frames) {
          step(st, f);
          for (const e of st.events) if (e.type === 'scrum_won' || e.type === 'scrum_released') starts++;
        }
      }
      expect(hashState(a)).toBe(hashState(b));
      expect(starts).toBeGreaterThanOrEqual(2); // résolue dans les deux copies
      expect(findBadValues(a, 'state', [], true)).toEqual([]);
    }
  });
});
