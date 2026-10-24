/**
 * Retours texte temporaires du joueur local (étape 4).
 */
import { describe, expect, it } from 'vitest';
import { feedbackFor } from '../../src/game/feedback';
import { createMatch } from '../../src/sim/match';

const s = createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']] });

describe('feedbackFor', () => {
  it('passe refusée du joueur local : « Aucun coéquipier derrière »', () => {
    expect(feedbackFor({ type: 'pass_denied', playerId: 0 }, s, 0)).toEqual({ text: 'Aucun coéquipier derrière', kind: 'bad' });
    expect(feedbackFor({ type: 'pass_denied', playerId: 1 }, s, 0)).toBeNull();
  });

  it('interceptions : réussie, subie, par son équipe, adverse ; réception normale silencieuse', () => {
    expect(feedbackFor({ type: 'catch', playerId: 0, fromId: 4, intercepted: true }, s, 0)?.text).toBe('Interception !');
    expect(feedbackFor({ type: 'catch', playerId: 4, fromId: 0, intercepted: true }, s, 0)).toEqual({ text: 'Ballon intercepté', kind: 'bad' });
    expect(feedbackFor({ type: 'catch', playerId: 2, fromId: 4, intercepted: true }, s, 0)?.kind).toBe('good');
    expect(feedbackFor({ type: 'catch', playerId: 4, fromId: 1, intercepted: true }, s, 0)?.kind).toBe('bad');
    expect(feedbackFor({ type: 'catch', playerId: 0, fromId: 1, intercepted: false }, s, 0)).toBeNull();
    expect(feedbackFor({ type: 'jump', playerId: 0, air: false }, s, 0)).toBeNull();
  });
});
