/**
 * Cartes de rôle du menu (étape 8) : valeurs tirées de ROLES, notes relatives, composition affichée.
 */
import { describe, expect, it } from 'vitest';
import { burstDamage, compositionText, roleCard, roleCards, STAT_PIPS, statRating, teamPreview } from '../../src/game/roleCards';
import { ROLES, TEAM_ROLES_5V5 } from '../../src/sim';

describe('roleCards', () => {
  it('trois cartes dans l’ordre pilier, ailier, demi, avec les textes de ROLES', () => {
    const cards = roleCards();
    expect(cards.map((c) => c.role)).toEqual(['pilier', 'ailier', 'demi']);
    for (const c of cards) {
      expect(c.label).toBe(ROLES[c.role].label);
      expect(c.description).toBe(ROLES[c.role].description);
      expect(c.ability.label).toBe(ROLES[c.role].ability.label);
    }
  });

  it('statistiques : valeurs réelles et notes 1..STAT_PIPS (le meilleur a tout, le moins bon une pastille)', () => {
    const ailier = roleCard('ailier');
    expect(ailier.stats.find((s) => s.id === 'speed')?.value).toBe(ROLES.ailier.runSpeed);
    expect(statRating('speed', 'ailier')).toBe(STAT_PIPS);
    expect(statRating('speed', 'pilier')).toBe(1);
    expect(statRating('damage', 'pilier')).toBe(STAT_PIPS);
    expect(statRating('damage', 'ailier')).toBe(1);
    expect(burstDamage('pilier')).toBeCloseTo(ROLES.pilier.weapon.damage * ROLES.pilier.weapon.pellets, 9);
    expect(burstDamage('demi')).toBe(ROLES.demi.weapon.blastDamageCenter + ROLES.demi.weapon.directHitBonus);
    expect(ailier.stats[0].text).toBe('8,8 m/s');
  });

  it('aperçu de l’équipe : le joueur en tête, les bots complètent (3v3 : un de chaque rôle)', () => {
    expect(teamPreview(3, 'demi')).toEqual(['demi', 'pilier', 'ailier']);
    expect(teamPreview(5, 'pilier').length).toBe(5);
  });
});

describe('compositionText (note du menu, tirée de TEAM_ROLES_*)', () => {
  it('compte chaque rôle de la composition par défaut', () => {
    expect(compositionText(3)).toBe('1 pilier, 1 ailier, 1 demi');
    const n = (r: string): number => TEAM_ROLES_5V5.filter((x) => x === r).length;
    expect(compositionText(5)).toBe(`${n('pilier')} pilier${n('pilier') > 1 ? 's' : ''}, ${n('ailier')} ailiers, ${n('demi')} demis`);
  });
});

