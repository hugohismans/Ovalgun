/** Composition des équipes au lancement. */
import { describe, expect, it } from 'vitest';
import { assignRoles } from '../../src/game/roles';
import { createMatch } from '../../src/sim/match';

describe('assignRoles', () => {
  it('3v3 : humain = joueur 0 avec son rôle, un de chaque rôle par équipe', () => {
    for (const human of ['pilier', 'ailier', 'demi'] as const) {
      const [a, b] = assignRoles(3, human);
      expect(a[0]).toBe(human);
      expect([...a].sort()).toEqual(['ailier', 'demi', 'pilier']);
      expect([...b].sort()).toEqual(['ailier', 'demi', 'pilier']);
    }
  });

  it('5v5 : 5 rôles par équipe, mêmes compositions, match valide', () => {
    const roles = assignRoles(5, 'demi');
    expect(roles[0]).toHaveLength(5);
    expect(roles[0][0]).toBe('demi');
    expect([...roles[1]].sort()).toEqual([...roles[0]].sort());
    const s = createMatch({ teamSize: 5, seed: 1, roles });
    expect(s.players[0].role).toBe('demi');
  });
});
