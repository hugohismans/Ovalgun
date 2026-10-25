/**
 * Logique de salon (pure, testée, partagée client / serveur) : placement des joueurs dans les équipes, puis
 * construction de la configuration du match (rôles, joueurs humains, bots qui complètent).
 */

import { TEAM_ROLES_3V3, TEAM_ROLES_5V5, type MatchConfig, type Role, type TeamId, type TeamSize } from '../../sim';
import type { LobbyConfig, LobbyPlayer } from './protocol';

/** Équipe d'un nouvel arrivant : la moins remplie en humains (égalité : équipe 0). */
export function teamForNewPlayer(players: readonly LobbyPlayer[], teamSize: TeamSize): TeamId | null {
  const n0 = players.filter((p) => p.team === 0).length;
  const n1 = players.filter((p) => p.team === 1).length;
  if (n0 >= teamSize && n1 >= teamSize) return null;
  if (n0 >= teamSize) return 1;
  if (n1 >= teamSize) return 0;
  return n1 < n0 ? 1 : 0;
}

/** Vrai si un joueur peut rejoindre cette équipe (place libre ou il y est déjà). */
export function canJoinTeam(players: readonly LobbyPlayer[], playerId: string, team: TeamId, teamSize: TeamSize): boolean {
  return players.filter((p) => p.team === team && p.id !== playerId).length < teamSize;
}

export interface MatchSetup {
  config: MatchConfig;
  /** Id de connexion -> id de joueur dans la simulation. */
  playerIds: Record<string, number>;
  /** Ids de simulation pilotés par des bots. */
  botIds: number[];
}

/**
 * Rôles d'une équipe : chaque humain garde son rôle (retiré de la composition par défaut s'il y figure, sinon à la place
 * du dernier rôle restant : doublons possibles) ; les bots prennent les rôles restants. Humains en tête.
 */
function teamRoles(humanRoles: readonly Role[], teamSize: TeamSize): Role[] {
  const rest = [...(teamSize === 3 ? TEAM_ROLES_3V3 : TEAM_ROLES_5V5)];
  for (const r of humanRoles) {
    const i = rest.indexOf(r);
    rest.splice(i >= 0 ? i : rest.length - 1, 1);
  }
  return [...humanRoles, ...rest].slice(0, teamSize);
}

export function buildMatchSetup(players: readonly LobbyPlayer[], cfg: LobbyConfig, seed: number): MatchSetup {
  const size = cfg.teamSize;
  const playerIds: Record<string, number> = {};
  const botIds: number[] = [];
  const roles: [Role[], Role[]] = [[], []];
  const receivers: [number, number] = [-1, -1];
  for (const team of [0, 1] as const) {
    const humans = players.filter((p) => p.team === team).slice(0, size);
    roles[team] = teamRoles(
      humans.map((h) => h.role),
      size,
    );
    humans.forEach((h, i) => {
      playerIds[h.id] = team * size + i;
    });
    for (let i = humans.length; i < size; i++) botIds.push(team * size + i);
    // Le premier humain de l'équipe reçoit le ballon à ses coups d'envoi.
    if (humans.length > 0) receivers[team] = 0;
  }
  return {
    config: { teamSize: size, seed, roles, kickoffReceivers: receivers },
    playerIds,
    botIds,
  };
}
