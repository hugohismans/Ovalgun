/**
 * Lectures PURES de l'état du match (étape 6) : sens d'attaque, lignes d'essai, joueurs actifs, possession,
 * point de chute du ballon, chrono. Aucune mutation, aucun aléatoire : utilisées par les règles (rules.ts),
 * les bots (src/bots), le HUD et les tests. Exportées par l'API publique (src/sim/index.ts).
 *
 * Repère (docs/ARCHITECTURE.md §3) : l'équipe 0 attaque vers +Z (marque en z ≥ +tryLineZ), l'équipe 1 vers −Z
 * (marque en z ≤ −tryLineZ).
 */

import { BALL_RADIUS } from './constants';
import { predictBallLanding } from './carrier';
import { groundHeight } from './field';
import { ticksToSec } from './time';
import type { MatchState, PlayerState, TeamId, Vec3 } from './types';

/** Sens d'attaque sur l'axe Z : +1 pour l'équipe 0, −1 pour l'équipe 1 (l'opposé de `backwardZ`). */
export const attackDir = (team: TeamId): 1 | -1 => (team === 0 ? 1 : -1);

/** Yaw qui regarde droit vers l'en-but adverse (0 pour l'équipe 0, π pour l'équipe 1). */
export const attackYaw = (team: TeamId): number => (team === 0 ? 0 : Math.PI);

/** L'autre équipe. */
export const opponentTeam = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

/** Z de la ligne d'essai que `team` DÉFEND (son propre en-but est au-delà). */
export const ownTryLineZ = (state: MatchState, team: TeamId): number => (team === 0 ? 0 - state.field.tryLineZ : state.field.tryLineZ);

/** Z de la ligne d'essai que `team` ATTAQUE (franchie avec le ballon = essai). */
export const opponentTryLineZ = (state: MatchState, team: TeamId): number =>
  team === 0 ? state.field.tryLineZ : 0 - state.field.tryLineZ;

/**
 * Distance (m, le long de Z) qui sépare `z` de la ligne d'essai adverse de `team`. ≤ 0 : on est dans l'en-but
 * adverse (un porteur actif de `team` y marque). Exemple : 0 au ras de la ligne, 2·tryLineZ sur sa propre ligne.
 */
export const distanceToTryLine = (state: MatchState, team: TeamId, z: number): number =>
  (opponentTryLineZ(state, team) - z) * attackDir(team);

/** Vrai si `z` est dans l'en-but ADVERSE de `team`, ligne comprise (règle de l'essai). */
export const isInOpponentInGoal = (state: MatchState, team: TeamId, z: number): boolean => distanceToTryLine(state, team, z) <= 0;

/** Vrai si `z` est dans le PROPRE en-but de `team`, ligne comprise (aucun essai : on y défend). */
export const isInOwnInGoal = (state: MatchState, team: TeamId, z: number): boolean =>
  (z - ownTryLineZ(state, team)) * attackDir(team) <= 0;

/** Joueur en état d'agir : debout (ni plaqué au sol, ni en train de se relever). */
export const isPlayerActive = (p: PlayerState): boolean => p.status === 'active';

/** Joueurs de `team`, par id croissant (nouveau tableau). */
export const teamPlayers = (state: MatchState, team: TeamId): PlayerState[] => state.players.filter((p) => p.team === team);

/** Joueurs ACTIFS de `team`, par id croissant (nouveau tableau). */
export const activePlayers = (state: MatchState, team: TeamId): PlayerState[] =>
  state.players.filter((p) => p.team === team && p.status === 'active');

/** Porteur du ballon, ou null (ballon libre, en vol, mort, en mêlée). */
export function ballCarrier(state: MatchState): PlayerState | null {
  const b = state.ball;
  if (b.mode !== 'carried') return null;
  return state.players[b.carrierId] ?? null;
}

/** Équipe en possession (celle du porteur), −1 si personne ne porte le ballon. Voir aussi `ball.lastTeam`. */
export function possessionTeam(state: MatchState): TeamId | -1 {
  const c = ballCarrier(state);
  return c === null ? -1 : c.team;
}

/** Vrai si le jeu est en cours (phase 'play') : actions, tirs, chrono. Faux pendant coup d'envoi, essai, fin. */
export const isLive = (state: MatchState): boolean => state.phase === 'play';

/**
 * Point où le ballon touchera le sol (bots : se placer sous une chandelle, courir vers un rebond). Ballon en vol
 * (passe, coup de pied) ou libre en l'air : `predictBallLanding` (gravité et traînée exactes, relief sans murets,
 * sans rebond). Ballon au sol, porté, mort ou en mêlée : sa position projetée au sol. Nouveau vecteur.
 */
export function ballLandingPoint(state: MatchState): Vec3 {
  const b = state.ball;
  const ground = groundHeight(state.field, b.pos.x, b.pos.z);
  const airborne = b.pos.y - BALL_RADIUS > ground + 1e-3 || b.vel.y > 1e-3;
  if ((b.mode === 'pass' || b.mode === 'kick' || b.mode === 'loose') && airborne) {
    return predictBallLanding(state.field, b.pos, b.vel);
  }
  return { x: b.pos.x, y: ground, z: b.pos.z };
}

/** Temps restant au chrono (s). */
export const clockSeconds = (state: MatchState): number => ticksToSec(state.clockTicks);

/** Temps restant dans la phase courante (coup d'envoi, pause d'essai), en s ; 0 en 'play' / 'ended'. */
export const phaseSeconds = (state: MatchState): number => ticksToSec(state.phaseTicks);
