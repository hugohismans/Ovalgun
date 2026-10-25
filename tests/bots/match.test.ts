/**
 * Matchs complets bots contre bots (étape 6) : déterminisme, fin de match, essais, passes, plaquages, coups de pied,
 * changements de possession, aucun blocage durable, durée d'exécution.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { secToTicks } from '../../src/sim';
import { findBadValues } from '../sim/helpers';
import { runBotMatch, type MatchRun } from './helpers';

/** Résumé lisible d'un match (affiché en cas d'échec). */
const summary = (r: MatchRun): string =>
  `score ${r.state.score.join('-')} ticks ${r.ticks} ${JSON.stringify(r.events)} passes ${r.completedPasses} possession ${r.possessionChanges} ` +
  `bloqué ${r.maxBlockedTicks} libre ${r.maxLooseTicks} porté ${(r.carriedTicks / Math.max(1, r.playTicks)).toFixed(2)} ` +
  `au sol ${(r.playerDownTicks / Math.max(1, r.playerPlayTicks)).toFixed(2)} ${Math.round(r.elapsedMs)} ms`;

describe('bots : déterminisme d’un match complet', () => {
  it('même seed, même difficulté => même hash final (deux exécutions complètes)', { timeout: 60000 }, () => {
    const a = runBotMatch(3, 21, 'normal');
    const b = runBotMatch(3, 21, 'normal');
    expect(a.state.phase).toBe('ended');
    expect(b.hash).toBe(a.hash);
    expect(b.memories).toEqual(a.memories);
    // Autre seed : autre match (PRNG du match ET des bots).
    expect(runBotMatch(3, 22, 'normal').hash).not.toBe(a.hash);
  });
});

/**
 * Bornes de rythme (difficulté normale, moyenne sur les seeds) : un match qui ressemble à du rugby arcade. Mesuré
 * (harnais de relecture de l'étape 6, seeds 1 à 4) : 3v3 ≈ 30 essais, ballon porté ≈ 70 % du jeu, ≈ 10 % de joueurs
 * au sol, ≈ 3 coups de pied ; 5v5 ≈ 16 essais, porté ≈ 55 %, ≈ 12 % au sol. Avant correction : porté 31–42 %, au sol
 * 21–30 %, 25–43 coups de pied. En 3v3, le demi (désarmé jusqu'à l'étape 7) pèse plus : plus d'essais qu'en 5v5.
 */
const PACE: Record<3 | 5, { maxTries: number; minCarried: number; maxDown: number; maxKicks: number }> = {
  3: { maxTries: 40, minCarried: 0.6, maxDown: 0.14, maxKicks: 15 },
  5: { maxTries: 25, minCarried: 0.48, maxDown: 0.16, maxKicks: 15 },
};

describe.each([
  [3, 3],
  [5, 5],
] as const)('bots : matchs complets de 6 minutes en %iv%i (difficulté normale)', (size, _same) => {
  const SEEDS = [1, 2, 3];
  let runs: MatchRun[] = [];
  beforeAll(() => {
    runs = SEEDS.map((seed) => runBotMatch(size, seed, 'normal'));
  }, 120000);
  const total = (f: (r: MatchRun) => number): number => runs.reduce((acc, r) => acc + f(r), 0);

  it('chaque match se termine (phase ended), sans NaN ni Infinity, dans un temps raisonnable', () => {
    for (const r of runs) {
      expect(r.state.phase, summary(r)).toBe('ended');
      expect(r.nonFinite, summary(r)).toBe(false);
      // État sans NaN / Infinity / undefined / −0 (contrôlé tous les 30 ticks), mémoires des bots sérialisables.
      expect(r.badValues, summary(r)).toEqual([]);
      expect(findBadValues(r.memories, 'memories', [], true)).toEqual([]);
      expect(JSON.parse(JSON.stringify(r.memories))).toEqual(r.memories);
      // Mesure : un match de 6 min (≈ 11 000 ticks, bots compris) tourne en ~1 s ; seuil large pour une machine chargée.
      expect(r.elapsedMs, summary(r)).toBeLessThan(15000);
    }
  });

  it('du rugby : essais, passes réussies, plaquages, changements de possession, coups de pied', () => {
    const info = runs.map(summary).join('\n');
    expect(total((r) => r.events.try ?? 0), info).toBeGreaterThan(0);
    expect(total((r) => r.completedPasses), info).toBeGreaterThan(0);
    expect(total((r) => r.events.tackled ?? 0), info).toBeGreaterThan(0);
    expect(total((r) => r.events.drop ?? 0), info).toBeGreaterThan(0); // des porteurs plaqués
    expect(total((r) => r.possessionChanges), info).toBeGreaterThan(0);
    expect(total((r) => r.events.kick ?? 0), info).toBeGreaterThanOrEqual(1);
    // Les deux équipes marquent (pas de camp passif).
    expect(runs.some((r) => r.state.score[0] > 0) && runs.some((r) => r.state.score[1] > 0), info).toBe(true);
  });

  it('rythme : essais en nombre raisonnable, ballon surtout porté, peu de joueurs au sol, peu de coups de pied', () => {
    const info = runs.map(summary).join('\n');
    const n = runs.length;
    const pace = PACE[size];
    const tries = total((r) => r.events.try ?? 0) / n;
    expect(tries, info).toBeGreaterThanOrEqual(3);
    expect(tries, info).toBeLessThanOrEqual(pace.maxTries);
    expect(total((r) => r.carriedTicks) / total((r) => r.playTicks), info).toBeGreaterThanOrEqual(pace.minCarried);
    expect(total((r) => r.playerDownTicks) / total((r) => r.playerPlayTicks), info).toBeLessThanOrEqual(pace.maxDown);
    expect(total((r) => r.events.kick ?? 0) / n, info).toBeLessThanOrEqual(pace.maxKicks);
  });

  it('aucun bot bloqué plus de quelques secondes ; aucun ballon abandonné', () => {
    for (const r of runs) {
      expect(r.maxBlockedTicks, summary(r)).toBeLessThan(secToTicks(3));
      // Un coup de pied jusqu'à l'en-but adverse peut rester libre une dizaine de secondes (on court, on se fait plaquer).
      expect(r.maxLooseTicks, summary(r)).toBeLessThan(secToTicks(20));
    }
  });
});

describe('bots : difficulté sur un match complet', () => {
  it('« difficile » bat nettement « facile » (3v3, chaque équipe à tour de rôle)', { timeout: 60000 }, () => {
    let hard = 0;
    let easy = 0;
    for (const seed of [4, 5]) {
      const a = runBotMatch(3, seed, ['facile', 'difficile']);
      const b = runBotMatch(3, seed, ['difficile', 'facile']);
      hard += a.state.score[1] + b.state.score[0];
      easy += a.state.score[0] + b.state.score[1];
    }
    expect(hard).toBeGreaterThan(easy * 2);
  });

  it('niveaux voisins : le plus faible n’est pas écrasé (≥ 15 % des points du plus fort)', { timeout: 60000 }, () => {
    let strong = 0;
    let weak = 0;
    for (const seed of [4, 5]) {
      const a = runBotMatch(3, seed, ['normal', 'difficile']);
      const b = runBotMatch(3, seed, ['difficile', 'normal']);
      strong += a.state.score[1] + b.state.score[0];
      weak += a.state.score[0] + b.state.score[1];
    }
    expect(strong, `${weak}-${strong}`).toBeGreaterThan(weak);
    expect(weak, `${weak}-${strong}`).toBeGreaterThanOrEqual(strong * 0.15);
  });
});
