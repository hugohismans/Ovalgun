/**
 * Composition des équipes au lancement (pure, testée).
 * Le joueur humain est le joueur 0 de l'équipe 0 avec le rôle choisi. Composition par défaut (constants.ts) : en 3v3,
 * un de chaque rôle (TEAM_ROLES_3V3, cahier des charges) ; en 5v5, doublons autorisés : 1 pilier, 2 ailiers, 2 demis
 * (TEAM_ROLES_5V5, justification dans constants.ts). Le rôle de l'humain est retiré une fois de la composition et
 * placé en tête (index 0 : il reste à la même place de la formation) ; les autres gardent l'ordre de la composition.
 * L'équipe adverse a la même composition, dans le même ordre (équité).
 */

import { TEAM_ROLES_3V3, TEAM_ROLES_5V5, type Role, type TeamSize } from '../sim';

/** Les trois rôles, dans l'ordre d'affichage. */
export const ROLE_ORDER: readonly Role[] = ['pilier', 'ailier', 'demi'];

/** Composition par défaut d'une équipe pour une taille donnée. */
export const defaultComposition = (teamSize: TeamSize): readonly Role[] => (teamSize === 3 ? TEAM_ROLES_3V3 : TEAM_ROLES_5V5);

export function assignRoles(teamSize: TeamSize, humanRole: Role): [Role[], Role[]] {
  const rest = [...defaultComposition(teamSize)];
  const i = rest.indexOf(humanRole);
  // Le rôle choisi est toujours dans la composition par défaut ; sinon (composition modifiée), il remplace le dernier.
  rest.splice(i >= 0 ? i : rest.length - 1, 1);
  const team0: Role[] = [humanRole, ...rest];
  return [team0, [...team0]];
}

/** Lit un rôle (paramètre d'URL ?role=pilier|ailier|demi en attendant le menu de l'étape 8) ; défaut : `fallback`. */
export function parseRole(value: string | null, fallback: Role): Role {
  return value === 'pilier' || value === 'ailier' || value === 'demi' ? value : fallback;
}
