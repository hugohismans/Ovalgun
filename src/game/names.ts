/**
 * Noms affichés des joueurs (étape 8), PURS : « Pilier 1 », « Ailier 2 »… — rôle + rang dans l'équipe (1 = premier
 * joueur de l'équipe, l'humain en solo). Les deux équipes se distinguent par leur couleur (TEAM_COLORS), pas par le nom.
 * Utilisés par le flux d'événements, la bannière d'essai, l'écran de fin et l'indication de passe du HUD.
 */

import { ROLES, type MatchState, type Role, type TeamId } from '../sim';

/** Nom d'un joueur (« Pilier 1 ») ; `#id` si l'id est inconnu. */
export function playerName(state: Readonly<MatchState>, id: number): string {
  const p = state.players[id];
  if (p === undefined) return `#${id}`;
  return `${ROLES[p.role].label} ${(id % state.config.teamSize) + 1}`;
}

/** Joueur tel que l'UI l'affiche (pastille colorée, icône de rôle). */
export interface PlayerTag {
  id: number;
  name: string;
  team: TeamId;
  role: Role;
  /** C'est le joueur local (« Toi »). */
  local: boolean;
}

/** Étiquette d'un joueur pour l'UI (null : id inconnu). `localId` : joueur local, nommé « Toi ». */
export function playerTag(state: Readonly<MatchState>, id: number, localId: number): PlayerTag | null {
  const p = state.players[id];
  if (p === undefined) return null;
  const local = id === localId;
  return { id, name: local ? 'Toi' : playerName(state, id), team: p.team, role: p.role, local };
}
