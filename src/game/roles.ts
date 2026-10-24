/**
 * Composition des équipes au lancement (pure, testée).
 * Le joueur humain est le joueur 0 de l'équipe 0 avec le rôle choisi ; les autres rôles sont
 * répartis pilier / ailier / demi (un de chaque en 3v3, doublons autorisés en 5v5, cf. cahier des
 * charges). L'équipe adverse a la même composition (équité).
 */

import type { Role, TeamSize } from '../sim';

export const ROLE_ORDER: readonly Role[] = ['pilier', 'ailier', 'demi'];

export function assignRoles(teamSize: TeamSize, humanRole: Role): [Role[], Role[]] {
  const team0: Role[] = [humanRole, ...ROLE_ORDER.filter((r) => r !== humanRole)];
  for (let k = 0; team0.length < teamSize; k++) team0.push(ROLE_ORDER[k % ROLE_ORDER.length]);
  return [team0, [...team0]];
}
