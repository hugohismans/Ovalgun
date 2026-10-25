/** Composition des équipes au lancement (étape 7 : un de chaque rôle en 3v3, 1 pilier / 2 ailiers / 2 demis en 5v5). */
import { describe, expect, it } from 'vitest';
import { assignRoles, defaultComposition, parseRole, ROLE_ORDER } from '../../src/game/roles';
import { createMatch } from '../../src/sim/match';
import { TEAM_ROLES_3V3, TEAM_ROLES_5V5 } from '../../src/sim/constants';

const sorted = (r: readonly string[]): string[] => [...r].sort();

describe('assignRoles', () => {
  it('3v3 : humain = joueur 0 avec son rôle, un de chaque rôle par équipe', () => {
    for (const human of ROLE_ORDER) {
      const [a, b] = assignRoles(3, human);
      expect(a[0]).toBe(human);
      expect(sorted(a)).toEqual(['ailier', 'demi', 'pilier']);
      expect(b).toEqual(a);
    }
    expect(sorted(TEAM_ROLES_3V3)).toEqual(['ailier', 'demi', 'pilier']);
  });

  it('5v5 : composition par défaut 1 pilier, 2 ailiers, 2 demis quel que soit le rôle choisi ; mêmes compositions ; match valide', () => {
    expect(sorted(TEAM_ROLES_5V5)).toEqual(['ailier', 'ailier', 'demi', 'demi', 'pilier']);
    for (const human of ROLE_ORDER) {
      const roles = assignRoles(5, human);
      expect(roles[0]).toHaveLength(5);
      expect(roles[0][0]).toBe(human);
      expect(sorted(roles[0])).toEqual(sorted(defaultComposition(5)));
      expect(roles[1]).toEqual(roles[0]);
      const s = createMatch({ teamSize: 5, seed: 1, roles });
      expect(s.players[0].role).toBe(human);
      expect(s.players[5].role).toBe(human);
    }
  });

  it('?role= : pilier / ailier / demi, sinon le rôle par défaut', () => {
    expect(parseRole('pilier', 'ailier')).toBe('pilier');
    expect(parseRole('demi', 'ailier')).toBe('demi');
    expect(parseRole('ailier', 'demi')).toBe('ailier');
    expect(parseRole(null, 'ailier')).toBe('ailier');
    expect(parseRole('gardien', 'ailier')).toBe('ailier');
  });
});
