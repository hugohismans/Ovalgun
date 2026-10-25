/**
 * Bots et mêlée (étape 7, src/bots/scrumBrain.ts) : situations construites (entrée dans la zone, tir sur les adversaires
 * de la zone, majorité confortable, zone tenue pendant l'approche, reprise du jeu à la résolution) et matchs complets
 * bots contre bots (des mêlées sur plusieurs seeds, toutes résolues, avec des bots dans la zone).
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  BOT_ROLE_HYSTERESIS_M,
  BOT_SCRUM_APPROACH_SEC,
  BOT_SCRUM_THREAT_MARGIN,
  Buttons,
  countInZone,
  createMatch,
  scrumMaxTicks,
  scrumRadius,
  secToTicks,
  startPlayNow,
  step,
  type MatchState,
  type PlayerInput,
  type TeamSize,
} from '../../src/sim';
import { botInput, createBotMemory, type BotMemory } from '../../src/bots';
import { scrumApproaching } from '../../src/bots/scrumBrain';
import { matchConfig, runBotMatch } from './helpers';

/** Match en jeu, terrain plat, tous les joueurs actifs rangés au fond (hors scène), ballon libre posé au centre. */
function scene(teamSize: TeamSize, seed = 5): MatchState {
  const s = createMatch(matchConfig(teamSize, seed));
  startPlayNow(s);
  s.field.features = [];
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 2 + p.id * 2, y: 0, z: (p.team === 0 ? -1 : 1) * (s.field.length / 2 - 2) };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  const b = s.ball;
  b.mode = 'loose';
  b.carrierId = -1;
  b.lastTeam = -1;
  b.pos = { x: 0, y: BALL_RADIUS, z: 0 };
  b.vel = { x: 0, y: 0, z: 0 };
  b.looseTicks = 0;
  s.events = [];
  return s;
}

/** Place le joueur `id` en (x, z). */
function place(s: MatchState, id: number, x: number, z: number): void {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = Math.atan2(0 - x, 0 - z);
}

/** Déclenche une mêlée au centre au prochain tick (ballon libre depuis assez longtemps, joueurs déjà placés). */
function armScrum(s: MatchState): void {
  s.ball.looseTicks = 89;
}

/** Simule `n` ticks, tous les joueurs pilotés par des bots ; `onTick` après chaque step. */
function simulate(s: MatchState, n: number, memories: BotMemory[], onTick?: (s: MatchState, inputs: PlayerInput[]) => boolean | void): void {
  for (let t = 0; t < n; t++) {
    const inputs = s.players.map((p) => botInput(memories[p.id], s, p.id));
    step(s, inputs);
    if (onTick?.(s, inputs) === true) return;
  }
}

const memoriesFor = (s: MatchState, seed = 5): BotMemory[] => s.players.map((p) => createBotMemory(p.id, 'normal', seed));

describe('bots : mêlée construite', () => {
  it('les bots hors de la zone y entrent pour peser sur le décompte (5v5)', () => {
    const s = scene(5);
    // 3 contre 3 autour du ballon (déclenchement), les 4 autres à ~12 m.
    for (const [i, id] of [0, 1, 2, 5, 6, 7].entries()) {
      const a = (i * Math.PI) / 3;
      place(s, id, Math.sin(a) * 3, Math.cos(a) * 3);
    }
    place(s, 3, -12, -4);
    place(s, 4, 12, -4);
    place(s, 8, -12, 4);
    place(s, 9, 12, 4);
    armScrum(s);
    const mems = memoriesFor(s);
    let started = false;
    let maxIn: [number, number] = [0, 0];
    simulate(s, 70, mems, (st) => {
      if (st.events.some((e) => e.type === 'scrum_start')) started = true;
      if (st.scrum !== null) {
        const c = countInZone(st, st.scrum.center.x, st.scrum.center.z, st.scrum.radius);
        maxIn = [Math.max(maxIn[0], c[0]), Math.max(maxIn[1], c[1])];
      }
    });
    expect(started).toBe(true);
    // Au moins un renfort de chaque camp est entré (3 au départ).
    expect(maxIn[0]).toBeGreaterThanOrEqual(4);
    expect(maxIn[1]).toBeGreaterThanOrEqual(4);
  });

  it('majorité confortable : pas tous dans la zone, les autres se placent pour la suite', () => {
    const s = scene(5);
    // Équipe 0 : 4 joueurs autour du ballon + 1 ; équipe 1 : 3 dans la zone au déclenchement, puis 2 plaqués.
    for (const [i, id] of [0, 1, 2, 3, 5, 6, 7].entries()) {
      const a = (i * 2 * Math.PI) / 7;
      place(s, id, Math.sin(a) * 3.5, Math.cos(a) * 3.5);
    }
    place(s, 4, 9, -3);
    place(s, 8, -20, 25);
    place(s, 9, 20, 25);
    armScrum(s);
    const mems = memoriesFor(s);
    simulate(s, 1, mems);
    expect(s.scrum).not.toBeNull();
    for (const id of [6, 7]) {
      const p = s.players[id];
      p.status = 'down';
      p.statusTicks = 10_000;
      p.stability = 0;
    }
    // Équipe 1 : un seul joueur actif près de la zone => l'équipe 0 en garde 1 + BOT_SCRUM_LEAD_MARGIN = 3 dedans.
    simulate(s, 15, mems);
    expect(s.scrum).not.toBeNull();
    const roles = [0, 1, 2, 3, 4].map((id) => mems[id].decision.role);
    expect(roles.filter((r) => r === 'scrum')).toHaveLength(3);
    expect(roles.filter((r) => r === 'support' || r === 'space')).toHaveLength(2); // l'équipe mène : soutien pour la suite
  });

  it('les bots tirent sur les adversaires de la zone (et en plaquent)', () => {
    const s = scene(3);
    place(s, 0, -2.5, -2); // ailier
    place(s, 1, 2.5, -2); // pilier
    place(s, 3, -2.5, 2); // ailier
    place(s, 4, 2.5, 2); // pilier
    place(s, 2, -10, -14);
    place(s, 5, 10, 14);
    armScrum(s);
    const mems = memoriesFor(s);
    let firedAtZone = 0;
    let tackledInScrum = 0;
    simulate(s, 90, mems, (st, inputs) => {
      if (st.scrum === null) return;
      for (const p of st.players) {
        const tid = mems[p.id].decision.shootId;
        if ((inputs[p.id].buttons & Buttons.FIRE) !== 0 && tid >= 0 && st.players[tid].team !== p.team) firedAtZone++;
      }
      for (const e of st.events) if (e.type === 'tackled') tackledInScrum++;
    });
    expect(firedAtZone).toBeGreaterThan(10);
    expect(tackledInScrum).toBeGreaterThan(0);
  });

  it('approche : à égalité ou en majorité, on tient la zone sans ramasser le ballon : la mêlée se déclenche', () => {
    const s = scene(3);
    place(s, 0, -3, -3);
    place(s, 1, 3, -3);
    place(s, 3, -3, 3);
    place(s, 4, 3, 3);
    place(s, 2, -14, -10);
    place(s, 5, 14, 10);
    s.ball.looseTicks = 40; // approche (≥ BOT_SCRUM_APPROACH_SEC)
    const mems = memoriesFor(s);
    let picked = false;
    let started = false;
    simulate(s, 70, mems, (st) => {
      if (st.events.some((e) => e.type === 'pickup')) picked = true;
      if (st.events.some((e) => e.type === 'scrum_start')) started = true;
      return started || picked;
    });
    expect(picked).toBe(false);
    expect(started).toBe(true);
  });

  it('approche en infériorité numérique : on va chercher le ballon', () => {
    const s = scene(3);
    place(s, 0, -3, -3);
    place(s, 3, -3, 3);
    place(s, 4, 3, 3);
    place(s, 5, 0, 4);
    place(s, 1, -14, -18);
    place(s, 2, 14, -18);
    s.ball.looseTicks = 40;
    const mems = memoriesFor(s);
    simulate(s, 2, mems);
    expect(mems[0].decision.role).toBe('chase');
  });

  it('à la résolution, jeu normal : le gagnant porte le ballon, plus personne ne joue la mêlée', () => {
    const s = scene(3);
    place(s, 0, -2.5, -2);
    place(s, 1, 2.5, -2);
    place(s, 2, 0, -3);
    place(s, 3, -2.5, 2);
    place(s, 4, 2.5, 2);
    place(s, 5, 10, 14);
    armScrum(s);
    const mems = memoriesFor(s);
    let wonAt = -1;
    simulate(s, 200, mems, (st) => {
      if (wonAt < 0 && st.events.some((e) => e.type === 'scrum_won')) wonAt = st.tick;
      return wonAt >= 0 && st.tick >= wonAt + 30;
    });
    expect(wonAt).toBeGreaterThan(0);
    if (s.ball.mode === 'carried') expect(mems[s.ball.carrierId].decision.role).toBe('carrier');
    for (const m of mems) expect(m.decision.role).not.toBe('scrum');
  });

  it('approche : hystérésis à la sortie (un adversaire qui rôde sur le bord ne fait pas basculer l\'alerte)', () => {
    const s = scene(3);
    s.ball.looseTicks = secToTicks(BOT_SCRUM_APPROACH_SEC);
    const me = s.players[0];
    const reach = scrumRadius(s) + BOT_SCRUM_THREAT_MARGIN;
    place(s, 3, 0, reach + BOT_ROLE_HYSTERESIS_M / 2);
    expect(scrumApproaching(s, me, 0, 0)).toBe(false); // pas encore d'alerte : seuil normal
    expect(scrumApproaching(s, me, 0, 0, true)).toBe(true); // alerte en cours : elle tient jusqu'au seuil élargi
    place(s, 3, 0, reach + BOT_ROLE_HYSTERESIS_M + 0.1);
    expect(scrumApproaching(s, me, 0, 0, true)).toBe(false);
    place(s, 3, 0, reach - 0.1);
    expect(scrumApproaching(s, me, 0, 0)).toBe(true);
    s.ball.looseTicks = secToTicks(BOT_SCRUM_APPROACH_SEC) - 1;
    expect(scrumApproaching(s, me, 0, 0, true)).toBe(false); // trop tôt : jamais
  });

  it('le bot ne modifie jamais l\'état pendant une mêlée', () => {
    const s = scene(3);
    place(s, 0, -2.5, -2);
    place(s, 1, 2.5, -2);
    place(s, 3, -2.5, 2);
    place(s, 4, 2.5, 2);
    armScrum(s);
    const mems = memoriesFor(s);
    simulate(s, 1, mems);
    expect(s.scrum).not.toBeNull();
    for (let t = 0; t < 40; t++) {
      const before = JSON.stringify(s);
      const inputs = s.players.map((p) => botInput(mems[p.id], s, p.id));
      expect(JSON.stringify(s)).toBe(before);
      step(s, inputs);
    }
  });
});

/**
 * Seeds des matchs complets (2 par taille, au lieu de 4 : le test jouait 8 matchs, la moitié de la durée de la suite),
 * choisies parmi celles qui produisent des mêlées avec la composition du jeu (mesuré : 3v3 3 et 3 mêlées, 5v5 3 et 2 ;
 * ≈ 2,5 et 1,2 mêlées par match en moyenne sur 24 seeds, voir docs/TESTING.md, étape 7) ; on en exige sur chacune.
 */
const SCRUM_SEEDS: Record<TeamSize, readonly number[]> = { 3: [1, 4], 5: [6, 8] };

describe('bots : mêlées en match complet', () => {
  it('bots contre bots : des mêlées sur plusieurs seeds (3v3 et 5v5), toutes résolues, avec des bots dans la zone', { timeout: 120000 }, () => {
    const seedsWithScrum: Record<TeamSize, number> = { 3: 0, 5: 0 };
    for (const size of [3, 5] as const) {
      for (const seed of SCRUM_SEEDS[size]) {
        let starts = 0;
        let ends = 0;
        let cut = 0;
        let longest = 0;
        let inZoneBotTicks = 0;
        let scrumTicks = 0;
        let wasOpen = false;
        const r = runBotMatch(size, seed, 'normal', {}, (s, _inputs, memories) => {
          let endedThisTick = false;
          for (const e of s.events) {
            if (e.type === 'scrum_start') starts++;
            if (e.type === 'scrum_won' || e.type === 'scrum_released') {
              ends++;
              endedThisTick = true;
            }
          }
          // Mêlée encore ouverte au coup de sifflet final : endMatch l'efface (state.scrum = null), sans résolution.
          if (wasOpen && !endedThisTick && s.events.some((e) => e.type === 'match_end')) cut++;
          if (s.scrum !== null) {
            scrumTicks++;
            longest = Math.max(longest, s.scrum.ticks);
            for (const m of memories) if (m.decision.role === 'scrum') inZoneBotTicks++;
            expect(s.scrum.radius).toBeCloseTo(scrumRadius(s), 9);
            expect(s.ball.mode).toBe('scrum');
          }
          wasOpen = s.scrum !== null;
        });
        expect(r.state.phase).toBe('ended');
        expect(r.badValues).toEqual([]);
        // Chaque mêlée se résout (sauf une éventuelle mêlée coupée par la fin du match), au plus capture + prolongation.
        expect(cut).toBeLessThanOrEqual(1);
        expect(ends).toBe(starts - cut);
        expect(longest).toBeLessThanOrEqual(scrumMaxTicks());
        if (starts > 0) {
          seedsWithScrum[size]++;
          // Les bots jouent la zone : en moyenne au moins deux bots dans le rôle « mêlée » pendant la capture.
          expect(inZoneBotTicks / scrumTicks).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(seedsWithScrum[3]).toBeGreaterThanOrEqual(2);
    expect(seedsWithScrum[5]).toBeGreaterThanOrEqual(2);
  });
});
