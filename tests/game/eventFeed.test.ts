/**
 * Flux d'événements du HUD (étape 8) : plaquages (ballon lâché), interceptions, essais, mêlées ; ton relatif au joueur
 * local, noms, durée de vie et fondu, nombre max de lignes.
 */
import { describe, expect, it } from 'vitest';
import { EventFeed } from '../../src/game/eventFeed';
import { playerName, playerTag } from '../../src/game/names';
import { STYLE } from '../../src/render/palette';
import { createMatch } from '../../src/sim';

const s = createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'pilier', 'demi'], ['ailier', 'pilier', 'demi']] });

describe('names', () => {
  it('rôle + rang dans l’équipe ; « Toi » pour le joueur local', () => {
    expect(playerName(s, 0)).toBe('Ailier 1');
    expect(playerName(s, 4)).toBe('Pilier 2');
    expect(playerName(s, 99)).toBe('#99');
    expect(playerTag(s, 0, 0)).toEqual({ id: 0, name: 'Toi', team: 0, role: 'ailier', local: true });
    expect(playerTag(s, 99, 0)).toBeNull();
  });
});

describe('EventFeed', () => {
  it('plaquage avec ballon lâché, du point de vue du joueur local', () => {
    const f = new EventFeed();
    f.handleEvents(
      [
        { type: 'tackled', targetId: 0, byId: 4 },
        { type: 'drop', playerId: 0 },
      ],
      s,
      0,
      1,
    );
    const [it0] = f.frame(1);
    expect(it0).toMatchObject({ kind: 'tackle', text: 'plaque', extra: 'ballon lâché', team: 1, tone: 'bad', alpha: 1 });
    expect(it0.actor?.name).toBe('Pilier 2');
    expect(it0.target?.name).toBe('Toi');
  });

  it('plaquage sans plaqueur crédité : le plaqué est le sujet', () => {
    const f = new EventFeed();
    f.handleEvents([{ type: 'tackled', targetId: 3, byId: -1 }], s, 0, 0);
    expect(f.frame(0)[0]).toMatchObject({ text: 'est plaqué', target: null, team: 0, tone: 'good' });
    expect(f.frame(0)[0].actor?.id).toBe(3);
  });

  it('interception (pas une réception normale), essai, mêlée gagnée, ballon rendu', () => {
    const f = new EventFeed();
    f.handleEvents(
      [
        { type: 'catch', playerId: 1, fromId: 5, intercepted: false },
        { type: 'catch', playerId: 2, fromId: 5, intercepted: true },
        { type: 'try', team: 1, scorerId: 3 },
        { type: 'scrum_won', team: 0, playerId: 1 },
        { type: 'scrum_released', pos: { x: 0, y: 0, z: 0 } },
      ],
      s,
      0,
      0,
    );
    const items = f.frame(0);
    expect(items.map((i) => i.kind)).toEqual(['interception', 'try', 'scrum', 'scrum']);
    expect(items[0]).toMatchObject({ tone: 'good', text: 'intercepte la passe de' });
    expect(items[1]).toMatchObject({ tone: 'bad', text: 'marque un essai' });
    expect(items[3]).toMatchObject({ tone: 'neutral', actor: null });
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('fondu puis disparition ; au plus STYLE.feedMax lignes', () => {
    const f = new EventFeed();
    f.handleEvents([{ type: 'try', team: 0, scorerId: 0 }], s, 0, 0);
    expect(f.frame(STYLE.feedSec - 0.01)[0].alpha).toBe(1);
    const mid = f.frame(STYLE.feedSec + STYLE.feedFadeSec / 2)[0].alpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(f.frame(STYLE.feedSec + STYLE.feedFadeSec + 0.01)).toEqual([]);
    for (let i = 0; i < STYLE.feedMax + 3; i++) f.handleEvents([{ type: 'tackled', targetId: 3, byId: 0 }], s, 0, 10);
    expect(f.frame(10).length).toBe(STYLE.feedMax);
    f.reset();
    expect(f.frame(10)).toEqual([]);
  });
});
