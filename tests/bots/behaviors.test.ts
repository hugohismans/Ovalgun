/**
 * Bots de l'étape 6 : comportements sur des situations construites (terrain plat, joueurs hors scène « garés » au
 * sol), pureté (le bot ne modifie jamais l'état), effet de la difficulté (précision, temps de réaction).
 */
import { describe, expect, it } from 'vitest';
import {
  angleDiff,
  BOT_BALL_CHASERS_3V3,
  Buttons,
  createMatch,
  debugGiveBall,
  makeInput,
  startPlayNow,
  step,
  type BotDifficulty,
  type InputFrame,
  type MatchState,
  type PlayerInput,
  type TeamSize,
} from '../../src/sim';
import { botInput, createBot, createBotMemory, type BotDebug, type BotMemory } from '../../src/bots';
import { matchConfig } from './helpers';

/**
 * Situation construite : match en jeu, terrain plat, TOUS les joueurs « garés » (au sol pour longtemps, ignorés
 * par les bots et la sim), ballon libre immobile dans un coin. On réveille ensuite les joueurs de la scène avec place().
 */
function scene(teamSize: TeamSize = 5, seed = 3): MatchState {
  const s = createMatch(matchConfig(teamSize, seed));
  startPlayNow(s);
  s.field.features = [];
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 1 + p.id, y: 0, z: -s.field.length / 2 + 1 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.status = 'down';
    p.statusTicks = 100000;
    p.stability = 0;
  }
  const b = s.ball;
  b.mode = 'loose';
  b.carrierId = -1;
  b.lastTeam = -1;
  b.pos = { x: s.field.width / 2 - 1, y: 0.12, z: s.field.length / 2 - 1 };
  b.vel = { x: 0, y: 0, z: 0 };
  s.events = [];
  return s;
}

/** Réveille le joueur `id` en (x, z), debout, regard `yaw`. */
function place(s: MatchState, id: number, x: number, z: number, yaw = 0): void {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw;
  p.status = 'active';
  p.statusTicks = 0;
  p.stability = 100;
}

interface Run {
  events: MatchState['events'];
  inputs: Record<number, PlayerInput[]>;
}

/**
 * Simule `n` ticks : les joueurs de `botIds` sont pilotés par des bots (mémoires fournies ou neuves), les autres
 * reçoivent `others(t)` (entrée neutre par défaut). `before(t)` est appelé avant chaque tick (manipulations du test).
 * S'arrête dès que `until` est vrai.
 */
function simulate(
  s: MatchState,
  botIds: number[],
  n: number,
  opts: {
    difficulty?: BotDifficulty;
    memories?: Record<number, BotMemory>;
    others?: (t: number) => InputFrame;
    before?: (t: number) => void;
    until?: (s: MatchState) => boolean;
    debug?: (id: number, d: BotDebug, inp: PlayerInput) => void;
  } = {},
): Run {
  const mems: Record<number, BotMemory> = opts.memories ?? {};
  for (const id of botIds) mems[id] ??= createBotMemory(id, opts.difficulty ?? 'normal', 7);
  const events: MatchState['events'] = [];
  const inputs: Record<number, PlayerInput[]> = {};
  for (let t = 0; t < n; t++) {
    opts.before?.(t);
    const frame: Record<number, PlayerInput | undefined> = { ...(opts.others?.(t) ?? {}) };
    for (const id of botIds) {
      const d: BotDebug = { aim: null };
      const inp = botInput(mems[id], s, id, d);
      frame[id] = inp;
      (inputs[id] ??= []).push(inp);
      opts.debug?.(id, d, inp);
    }
    step(s, frame);
    events.push(...s.events);
    if (opts.until?.(s)) break;
  }
  return { events, inputs };
}

describe('bots : pureté', () => {
  it('le bot ne modifie jamais l’état lu (JSON identique avant / après l’appel), sur un match en cours', () => {
    const s = createMatch(matchConfig(3, 11));
    const bots = s.players.map((p) => createBot(p.id, 'normal', 11));
    for (let t = 0; t < 900; t++) {
      const inputs: PlayerInput[] = [];
      for (const p of s.players) {
        const before = JSON.stringify(s);
        inputs.push(bots[p.id](s, p.id));
        expect(JSON.stringify(s)).toBe(before);
      }
      step(s, inputs);
    }
    expect(s.tick).toBe(900);
  });

  it('mémoire sérialisable, PRNG propre : deux bots de même seed produisent les mêmes entrées', () => {
    const run = (): PlayerInput[] => {
      const s = createMatch(matchConfig(3, 5));
      const mem = s.players.map((p) => createBotMemory(p.id, 'normal', 5));
      const out: PlayerInput[] = [];
      for (let t = 0; t < 300; t++) {
        const inputs = s.players.map((p) => botInput(mem[p.id], s, p.id));
        out.push(inputs[1]);
        step(s, inputs);
      }
      expect(JSON.parse(JSON.stringify(mem))).toEqual(mem);
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('bots : porteur', () => {
  it('pressé par un défenseur devant lui => passe arrière vers le coéquipier démarqué', () => {
    const s = scene();
    place(s, 0, 0, -10);
    place(s, 1, 9, -16); // coéquipier démarqué, derrière à droite
    place(s, 5, 0, -5.5); // défenseur juste devant
    debugGiveBall(s, 0);
    const r = simulate(s, [0], 30, { until: (st) => st.ball.mode === 'pass' });
    const pass = r.events.find((e) => e.type === 'pass');
    expect(pass).toEqual({ type: 'pass', fromId: 0, toId: 1 });
  });

  it('pas pressé => il avance (et sprinte) vers l’en-but adverse, sans passer', () => {
    const s = scene();
    place(s, 0, 0, -10);
    place(s, 1, 9, -16);
    debugGiveBall(s, 0);
    const z0 = s.players[0].pos.z;
    const r = simulate(s, [0], 45);
    expect(r.events.some((e) => e.type === 'pass')).toBe(false);
    expect(s.players[0].pos.z - z0).toBeGreaterThan(12);
    expect(r.inputs[0].some((i) => (i.buttons & Buttons.SPRINT) !== 0)).toBe(true);
  });

  it('encerclé sans passe valable => coup de pied (vers là où son équipe arrive la première)', () => {
    const s = scene(3);
    place(s, 0, 0, -10);
    place(s, 1, 4, 10); // seul coéquipier : devant (hors du cône de passe), près du point de chute
    // Deux défenseurs à moins de BOT_ENCIRCLED_RADIUS, de part et d'autre (hors de la trajectoire : pas de contre).
    place(s, 3, 2.6, -8.2);
    place(s, 4, -2.6, -8.2);
    debugGiveBall(s, 0);
    const r = simulate(s, [0], 30, { until: (st) => st.ball.mode === 'kick' });
    expect(r.events.some((e) => e.type === 'kick' && e.playerId === 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'pass')).toBe(false);
  });

  it('près de la ligne d’essai => plongeon, puis essai', () => {
    const s = scene();
    place(s, 0, 2, s.field.tryLineZ - 4);
    debugGiveBall(s, 0);
    const r = simulate(s, [0], 30, { until: (st) => st.phase === 'try' });
    expect(r.events.some((e) => e.type === 'dive' && e.playerId === 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'try' && e.scorerId === 0)).toBe(true);
  });

  it('équipe 1 aussi : avance vers −Z et plonge dans l’en-but adverse', () => {
    const s = scene();
    place(s, 7, -3, -s.field.tryLineZ + 12, Math.PI);
    debugGiveBall(s, 7);
    const r = simulate(s, [7], 90, { until: (st) => st.phase === 'try' });
    expect(r.events.some((e) => e.type === 'dive' && e.playerId === 7)).toBe(true);
    expect(r.events.some((e) => e.type === 'try' && e.team === 1)).toBe(true);
  });

  it('touché (stabilité qui baisse) => esquive ; sans tir reçu, pas d’esquive', () => {
    const hit = (withHits: boolean): boolean => {
      const s = scene();
      place(s, 0, 0, -20);
      place(s, 5, 15, -20); // tireur sur le côté, loin (pas de contact)
      debugGiveBall(s, 0);
      const r = simulate(s, [0], 90, {
        difficulty: 'difficile',
        before: (t) => {
          if (!withHits) return;
          const p = s.players[0];
          p.stability = 95 - t * 0.3; // un tir reçu à chaque tick (reste au-dessus du seuil de plongeon d'évasion)
          p.lastHitBy = 5;
        },
        until: (st) => st.events.some((e) => e.type === 'dodge'),
      });
      return r.events.some((e) => e.type === 'dodge' && e.playerId === 0);
    };
    expect(hit(true)).toBe(true);
    expect(hit(false)).toBe(false);
  });
});

describe('bots : défense et ballon libre', () => {
  it('le défenseur le plus proche converge vers le porteur et lui tire dessus (avec avance)', () => {
    const s = scene();
    place(s, 7, 0, 12, Math.PI); // porteur adverse (équipe 1), immobile
    place(s, 1, 3, -6); // défenseur pilier de l'équipe 0 (fusil à pompe : il doit s'approcher pour tirer)
    debugGiveBall(s, 7);
    const d0 = Math.hypot(s.players[1].pos.x - s.players[7].pos.x, s.players[1].pos.z - s.players[7].pos.z);
    const r = simulate(s, [1], 60, { before: () => (s.players[7].stability = 100) });
    const d1 = Math.hypot(s.players[1].pos.x - s.players[7].pos.x, s.players[1].pos.z - s.players[7].pos.z);
    expect(d1).toBeLessThan(d0 - 5);
    expect(r.inputs[1].some((i) => (i.buttons & Buttons.FIRE) !== 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'hit' && e.targetId === 7 && e.sourceId === 1)).toBe(true);
  });

  it('marquage : l’autre défenseur se place entre le receveur dangereux et son en-but', () => {
    const s = scene();
    place(s, 7, 0, 10, Math.PI); // porteur adverse
    place(s, 8, 8, 16, Math.PI); // receveur adverse, dans le cône de passe (derrière le porteur)
    place(s, 0, -2, 2); // presser (le plus proche)
    place(s, 1, -4, 0); // presser n°2 (5v5 : deux pressers)
    place(s, 4, 0, -8); // dernier défenseur (repli, armé), déjà sur son point
    place(s, 3, 14, -6); // marqueur
    debugGiveBall(s, 7);
    const mem = { 3: createBotMemory(3, 'normal', 7) };
    simulate(s, [0, 1, 3, 4], 100, { memories: mem, before: () => [7, 8].forEach((id) => (s.players[id].stability = 100)) });
    const m = s.players[3];
    const r = s.players[8];
    expect(mem[3].decision.role).toBe('mark');
    expect(mem[3].decision.markId).toBe(8);
    // Entre le receveur et l'en-but de l'équipe 0 (z plus petit), à quelques mètres.
    expect(m.pos.z).toBeLessThan(r.pos.z);
    expect(Math.hypot(m.pos.x - r.pos.x, m.pos.z - r.pos.z)).toBeLessThan(6);
  });

  it('joueur humain (externe) immobile : les bots ne comptent pas sur lui pour presser le porteur', () => {
    const roles = (externalIds: number[]): string[] => {
      const s = scene(3);
      place(s, 3, 0, 10, Math.PI); // porteur adverse, dans son propre tiers : un seul presseur
      place(s, 0, 2, 5); // humain, le plus proche du porteur, qui ne fait rien
      place(s, 1, -6, 0);
      place(s, 2, 6, -2);
      debugGiveBall(s, 3);
      const mems = { 1: createBotMemory(1, 'normal', 7, externalIds), 2: createBotMemory(2, 'normal', 7, externalIds) };
      simulate(s, [1, 2], 20, { memories: mems, before: () => (s.players[3].stability = 100) });
      return [mems[1].decision.role, mems[2].decision.role];
    };
    // Sans savoir qu'il est humain, les bots lui laissent l'unique place de presseur : personne ne presse.
    expect(roles([])).not.toContain('press');
    // En le sachant, un bot presse.
    expect(roles([0])).toContain('press');
  });

  it('joueur humain (externe) près du ballon libre : les bots vont quand même au ballon', () => {
    const chasers = (externalIds: number[]): number => {
      const s = scene(3);
      s.ball.pos = { x: 0, y: 0.12, z: 0 };
      place(s, 0, 2, 2); // humain, le plus proche du ballon, immobile
      place(s, 1, -6, -6);
      place(s, 2, 7, -5);
      place(s, 3, -9, 12, Math.PI);
      place(s, 4, 10, 11, Math.PI);
      const mems = { 1: createBotMemory(1, 'normal', 7, externalIds), 2: createBotMemory(2, 'normal', 7, externalIds) };
      simulate(s, [1, 2], 12, { memories: mems, before: () => (s.ball.pos = { x: 0, y: 0.12, z: 0 }) });
      return [mems[1], mems[2]].filter((m) => m.decision.role === 'chase').length;
    };
    // 3v3 : BOT_BALL_CHASERS_3V3 places ; l'humain en prend une s'il compte comme un bot.
    expect(chasers([0])).toBe(Math.min(2, BOT_BALL_CHASERS_3V3));
    expect(chasers([])).toBe(Math.min(2, BOT_BALL_CHASERS_3V3) - 1);
  });

  it('ballon en vol => le plus proche va au point de chute et le prend', () => {
    const s = scene(3);
    place(s, 0, -6, -8);
    place(s, 1, 10, -20);
    const b = s.ball;
    b.mode = 'kick';
    b.lastTeam = 1;
    b.throwerId = -1;
    b.pos = { x: 0, y: 2, z: 0 };
    b.vel = { x: -2, y: 9, z: -6 };
    const mems = { 0: createBotMemory(0, 'normal', 7), 1: createBotMemory(1, 'normal', 7) };
    simulate(s, [0, 1], 90, { memories: mems, until: (st) => st.ball.mode === 'carried' });
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(0);
  });
});

describe('bots : difficulté', () => {
  /** Erreur de visée moyenne (deg) au moment du tir sur une cible qui court en travers. */
  function meanAimError(difficulty: BotDifficulty, seed: number): number {
    const s = scene();
    place(s, 7, 0, 14, Math.PI); // cible (porteur adverse) qui va et vient
    place(s, 0, 0, -2); // tireur ailier
    debugGiveBall(s, 7);
    let sum = 0;
    let n = 0;
    simulate(s, [0], 240, {
      memories: { 0: createBotMemory(0, difficulty, seed) },
      others: (t) => ({ 7: makeInput({ yaw: Math.PI, moveX: Math.floor(t / 40) % 2 === 0 ? 1 : -1 }) }),
      before: () => {
        const c = s.players[7];
        c.stability = 100;
        c.pos.z = 14;
        s.players[0].pos = { x: 0, y: 0, z: -2 }; // le tireur reste à 16 m (on mesure la visée, pas la course)
      },
      debug: (_id, d, inp) => {
        if (d.aim === null || (inp.buttons & Buttons.FIRE) === 0) return;
        sum += Math.abs(angleDiff(inp.yaw, d.aim.idealYaw)) * (180 / Math.PI);
        n++;
      },
    });
    expect(n).toBeGreaterThan(10);
    return sum / n;
  }

  it('« facile » est moins précis que « difficile » (erreur de visée moyenne au tir)', () => {
    let easy = 0;
    let hard = 0;
    for (const seed of [1, 2, 3, 4]) {
      easy += meanAimError('facile', seed);
      hard += meanAimError('difficile', seed);
    }
    expect(easy).toBeGreaterThan(hard * 2);
  });

  /** Ticks entre la prise du ballon par l'adversaire et le moment où le défenseur passe en convergence. */
  function reactionTicks(difficulty: BotDifficulty, seed: number): number {
    const s = scene();
    place(s, 7, 0, 12, Math.PI);
    place(s, 1, 2, -4);
    const mem = createBotMemory(1, difficulty, seed);
    simulate(s, [1], 20, { memories: { 1: mem } }); // ballon libre loin : il chasse / se place
    debugGiveBall(s, 7);
    let t = 0;
    simulate(s, [1], 60, {
      memories: { 1: mem },
      until: () => {
        t++;
        return mem.decision.role === 'press';
      },
    });
    return t;
  }

  it('« facile » réagit plus tard que « difficile » à un changement de possession', () => {
    let easy = 0;
    let hard = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      easy += reactionTicks('facile', seed);
      hard += reactionTicks('difficile', seed);
    }
    expect(easy).toBeGreaterThan(hard + 5 * 5); // ≈ 0,55 s contre 0,18 s : au moins 5 ticks d'écart en moyenne
  });
});
