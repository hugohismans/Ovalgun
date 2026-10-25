/**
 * Outils communs aux tests des bots (pas un fichier de test : non collecté par vitest).
 */
import { findBadValues } from '../sim/helpers';
import {
  createMatch,
  hashState,
  step,
  type BotDifficulty,
  type MatchConfig,
  type MatchState,
  type PlayerInput,
  type Role,
  type TeamSize,
} from '../../src/sim';
import { botInput, createBotMemory, type BotMemory } from '../../src/bots';
import { assignRoles } from '../../src/game/roles';

/**
 * Rôles des SCÈNES construites (tests de comportement : ids fixes, 0 ailier, 1 pilier, 2 demi…). Les matchs complets
 * (`runBotMatch`) utilisent la composition du JEU (`gameRoles`), sinon les mesures de rythme ne valent pas pour le jeu
 * (l'ordre décide aussi qui reçoit les coups d'envoi).
 */
export const ROLES_3: [Role[], Role[]] = [
  ['ailier', 'pilier', 'demi'],
  ['ailier', 'pilier', 'demi'],
];
export const ROLES_5: [Role[], Role[]] = [
  ['ailier', 'pilier', 'demi', 'pilier', 'ailier'],
  ['ailier', 'pilier', 'demi', 'pilier', 'ailier'],
];

/** Statistiques d'un match bots contre bots. */
export interface MatchRun {
  state: MatchState;
  hash: string;
  memories: BotMemory[];
  ticks: number;
  /** Compteurs d'événements sur tout le match. */
  events: Record<string, number>;
  /** Passes réussies (stats.passes de tous les joueurs). */
  completedPasses: number;
  /** Changements d'équipe en possession (porteur d'une équipe puis de l'autre). */
  possessionChanges: number;
  /** Plus long blocage d'un bot (ticks où il veut avancer sans y parvenir). */
  maxBlockedTicks: number;
  /** Plus longue période de jeu ('play') avec le ballon libre ou en vol, en ticks. */
  maxLooseTicks: number;
  /** Une valeur non finie a été vue dans l'état. */
  nonFinite: boolean;
  /** Valeurs non sérialisables vues dans l'état (NaN, Infinity, undefined, −0 ; contrôle tous les 30 ticks), 10 au plus. */
  badValues: string[];
  /** Ticks joués ('play'), dont ballon porté ; joueur-ticks joués, dont au sol (down / getting_up). */
  playTicks: number;
  carriedTicks: number;
  playerPlayTicks: number;
  playerDownTicks: number;
  elapsedMs: number;
}

/** Vrai si une valeur non finie (NaN, Infinity) apparaît dans l'objet. */
export function hasNonFinite(v: unknown): boolean {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(hasNonFinite);
  if (v !== null && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasNonFinite);
  return false;
}

export function matchConfig(teamSize: TeamSize, seed: number, extra: Partial<MatchConfig> = {}): MatchConfig {
  return { teamSize, seed, roles: teamSize === 3 ? ROLES_3 : ROLES_5, ...extra };
}

/**
 * Composition du jeu par défaut (game/roles.ts : TEAM_ROLES_3V3 / TEAM_ROLES_5V5, rôle « humain » par défaut — ailier,
 * App.svelte — placé en tête) : 3v3 ailier, pilier, demi ; 5v5 ailier, pilier, ailier, demi, demi. Les deux équipes.
 */
export const gameRoles = (teamSize: TeamSize): [Role[], Role[]] => assignRoles(teamSize, 'ailier');

/**
 * Match complet bots contre bots, composition du jeu (tous les joueurs pilotés par un bot de difficulté `difficulty`, ou une par équipe), jusqu'à 'ended'
 * (ou `maxTicks`). `onTick` est appelé après chaque step.
 */
export function runBotMatch(
  teamSize: TeamSize,
  seed: number,
  difficulty: BotDifficulty | [BotDifficulty, BotDifficulty] = 'normal',
  extra: Partial<MatchConfig> = {},
  onTick?: (s: MatchState, inputs: PlayerInput[], memories: BotMemory[]) => void,
): MatchRun {
  const s = createMatch({ teamSize, seed, roles: gameRoles(teamSize), ...extra });
  const memories = s.players.map((p) => createBotMemory(p.id, typeof difficulty === 'string' ? difficulty : difficulty[p.team], seed));
  const events: Record<string, number> = {};
  let possessionChanges = 0;
  let lastPossession = -1;
  let nonFinite = false;
  let looseTicks = 0;
  let maxLooseTicks = 0;
  const badValues: string[] = [];
  let playTicks = 0;
  let carriedTicks = 0;
  let playerPlayTicks = 0;
  let playerDownTicks = 0;
  const maxTicks = Math.ceil((s.clockTicks + 2000) * 1.5);
  const t0 = performance.now();
  let ticks = 0;
  while (s.phase !== 'ended' && ticks < maxTicks) {
    const inputs = s.players.map((p) => botInput(memories[p.id], s, p.id));
    step(s, inputs);
    ticks++;
    for (const e of s.events) {
      events[e.type] = (events[e.type] ?? 0) + 1;
    }
    if (s.ball.mode === 'carried') {
      const team = s.players[s.ball.carrierId].team;
      if (lastPossession !== -1 && team !== lastPossession) possessionChanges++;
      lastPossession = team;
    }
    looseTicks = s.phase === 'play' && s.ball.mode !== 'carried' ? looseTicks + 1 : 0;
    maxLooseTicks = Math.max(maxLooseTicks, looseTicks);
    if (ticks % 30 === 0 && hasNonFinite(s)) nonFinite = true;
    if (ticks % 30 === 0 && badValues.length < 10) badValues.push(...findBadValues(s, `tick ${s.tick} state`, [], true).slice(0, 10));
    if (s.phase === 'play') {
      playTicks++;
      if (s.ball.mode === 'carried') carriedTicks++;
      for (const p of s.players) {
        playerPlayTicks++;
        if (p.status !== 'active') playerDownTicks++;
      }
    }
    onTick?.(s, inputs, memories);
  }
  // Passes réussies : statistique de la sim (créditée au passeur quand un coéquipier reçoit la passe).
  const completedPasses = s.players.reduce((acc, p) => acc + p.stats.passes, 0);
  return {
    state: s,
    hash: hashState(s),
    memories,
    ticks,
    events,
    completedPasses,
    possessionChanges,
    maxBlockedTicks: Math.max(...memories.map((m) => m.maxBlockedTicks)),
    maxLooseTicks,
    nonFinite: nonFinite || hasNonFinite(s),
    badValues,
    playTicks,
    carriedTicks,
    playerPlayTicks,
    playerDownTicks,
    elapsedMs: performance.now() - t0,
  };
}
