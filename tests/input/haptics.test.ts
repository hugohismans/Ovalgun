/**
 * Vibrations : table événement -> signal pour le joueur local, priorités, tolérance à l'absence d'actionneur.
 */
import { describe, expect, it } from 'vitest';
import { Haptics, rumbleCueFor } from '../../src/input/haptics';
import { GAMEPAD_RUMBLE_EFFECTS, RUMBLE_EXPLOSION_NEAR_MULT, RUMBLE_HARD_LANDING_SPEED } from '../../src/sim/constants';

describe('rumbleCueFor', () => {
  it('ne concerne que le joueur local', () => {
    expect(rumbleCueFor({ type: 'hit', targetId: 0, sourceId: 4, amount: 6, pos: { x: 0, y: 0, z: 0 } }, 0, 0)).toBe('hitTaken');
    expect(rumbleCueFor({ type: 'hit', targetId: 2, sourceId: 4, amount: 6, pos: { x: 0, y: 0, z: 0 } }, 0, 0)).toBeNull();
    expect(rumbleCueFor({ type: 'tackled', targetId: 0, byId: 4 }, 0, 0)).toBe('tackled');
    expect(rumbleCueFor({ type: 'tackled', targetId: 4, byId: 0 }, 0, 0)).toBe('tackleDealt');
    expect(rumbleCueFor({ type: 'catch', playerId: 0, fromId: 1, intercepted: false }, 0, 0)).toBe('catch');
    expect(rumbleCueFor({ type: 'pickup', playerId: 0 }, 0, 0)).toBe('catch');
    expect(rumbleCueFor({ type: 'pickup', playerId: 1 }, 0, 0)).toBeNull();
    // Interceptions (étape 4) : réussie par le joueur local, ou subie (sa passe / son coup de pied).
    expect(rumbleCueFor({ type: 'catch', playerId: 0, fromId: 4, intercepted: true }, 0, 0)).toBe('interceptionMade');
    expect(rumbleCueFor({ type: 'catch', playerId: 4, fromId: 0, intercepted: true }, 0, 0)).toBe('interceptionSuffered');
    expect(rumbleCueFor({ type: 'catch', playerId: 1, fromId: 0, intercepted: false }, 0, 0)).toBeNull(); // passe réussie
    expect(rumbleCueFor({ type: 'catch', playerId: 4, fromId: 2, intercepted: true }, 0, 0)).toBeNull(); // pas sa passe
    expect(rumbleCueFor({ type: 'try', team: 0, scorerId: 1 }, 0, 0)).toBe('try');
    expect(rumbleCueFor({ type: 'try', team: 1, scorerId: 4 }, 0, 0)).toBe('tryConceded');
    expect(rumbleCueFor({ type: 'try', team: 1, scorerId: 4 }, 4, 1)).toBe('try'); // équipe 1 : son équipe marque
    expect(rumbleCueFor({ type: 'match_end', score: [5, 0] }, 0, 0)).toBe('matchEnd');
    expect(rumbleCueFor({ type: 'kickoff', team: 0 }, 0, 0)).toBeNull();
    expect(rumbleCueFor({ type: 'land', playerId: 0, speed: RUMBLE_HARD_LANDING_SPEED + 1 }, 0, 0)).toBe('hardLanding');
    expect(rumbleCueFor({ type: 'land', playerId: 0, speed: 2 }, 0, 0)).toBeNull();
    expect(rumbleCueFor({ type: 'jump', playerId: 0, air: false }, 0, 0)).toBeNull();
  });

  it('étape 7 : son bouclier qui bloque (léger) ; explosion proche (moyen), pas une explosion lointaine', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(rumbleCueFor({ type: 'blocked', targetId: 0, sourceId: 4, pos: o }, 0, 0)).toBe('shieldBlock');
    expect(rumbleCueFor({ type: 'blocked', targetId: 3, sourceId: 4, pos: o }, 0, 0)).toBeNull();
    const r = 3.5;
    const near = { type: 'explosion', ownerId: 4, pos: { x: r * RUMBLE_EXPLOSION_NEAR_MULT - 0.1, y: 0, z: 0 }, radius: r } as const;
    const far = { type: 'explosion', ownerId: 4, pos: { x: r * RUMBLE_EXPLOSION_NEAR_MULT + 0.1, y: 0, z: 0 }, radius: r } as const;
    expect(rumbleCueFor(near, 0, 0, o)).toBe('explosionNear');
    expect(rumbleCueFor(far, 0, 0, o)).toBeNull();
    expect(rumbleCueFor(near, 0, 0)).toBeNull(); // position du joueur local inconnue
    expect(GAMEPAD_RUMBLE_EFFECTS.shieldBlock.strong + GAMEPAD_RUMBLE_EFFECTS.shieldBlock.weak).toBeLessThan(
      GAMEPAD_RUMBLE_EFFECTS.explosionNear.strong + GAMEPAD_RUMBLE_EFFECTS.explosionNear.weak,
    );
  });
});

describe('rumbleCueFor : mêlée (étape 7)', () => {
  it('déclenchement pour tous ; résolution gagnée / perdue selon son équipe', () => {
    expect(rumbleCueFor({ type: 'scrum_start', pos: { x: 0, y: 0, z: 0 } }, 0, 0)).toBe('scrumStart');
    expect(rumbleCueFor({ type: 'scrum_start', pos: { x: 0, y: 0, z: 0 } }, 4, 1)).toBe('scrumStart');
    expect(rumbleCueFor({ type: 'scrum_won', team: 0, playerId: 2 }, 0, 0)).toBe('scrumWon');
    expect(rumbleCueFor({ type: 'scrum_won', team: 0, playerId: 0 }, 0, 0)).toBe('scrumWon');
    expect(rumbleCueFor({ type: 'scrum_won', team: 1, playerId: 4 }, 0, 0)).toBe('scrumLost');
    expect(rumbleCueFor({ type: 'scrum_released', pos: { x: 0, y: 0, z: 0 } }, 0, 0)).toBeNull();
    for (const cue of ['scrumStart', 'scrumWon', 'scrumLost'] as const) {
      const fx = GAMEPAD_RUMBLE_EFFECTS[cue];
      expect(fx.durationSec).toBeGreaterThan(0);
      expect(fx.strong + fx.weak).toBeGreaterThan(0);
    }
  });
});

describe('Haptics', () => {
  it('joue via dual-rumble, respecte les priorités, tolère l’absence d’actionneur', () => {
    const calls: string[] = [];
    const pad = {
      vibrationActuator: {
        playEffect: (type: string) => {
          calls.push(type);
          return Promise.resolve('complete');
        },
      },
    };
    const h = new Haptics();
    h.enabled = true;
    expect(h.play('tackled', 0, pad)).toBe(true);
    expect(h.play('hitTaken', 0.1, pad)).toBe(false); // plaquage en cours, plus prioritaire
    expect(h.play('hitTaken', 1, pad)).toBe(true); // terminé
    expect(calls).toEqual(['dual-rumble', 'dual-rumble']);
    expect(h.play('tackled', 2, {})).toBe(false);
    expect(h.play('tackled', 2, null)).toBe(false);
    h.enabled = false;
    expect(h.play('try', 3, pad)).toBe(false);
  });
});
