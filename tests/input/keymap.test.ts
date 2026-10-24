/**
 * Keymap : liaisons par défaut (codes physiques), masques d'actions, libellés AZERTY / disposition réelle.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_BUTTONS,
  ACTIONS,
  actionBit,
  actionLabel,
  actionsForKey,
  actionsForMouse,
  bindingLabel,
  DEFAULT_KEYMAP,
  type Keymap,
} from '../../src/input/keymap';
import { Buttons } from '../../src/sim/types';

describe('keymap', () => {
  it('chaque action a au moins une liaison, aucune touche Ctrl', () => {
    for (const a of ACTIONS) {
      expect(DEFAULT_KEYMAP[a].length).toBeGreaterThan(0);
      for (const b of DEFAULT_KEYMAP[a]) if (b.kind === 'key') expect(b.code).not.toMatch(/Control/);
    }
  });

  it('liaisons par défaut (KeyboardEvent.code) : ZQSD/A en AZERTY', () => {
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyW')).toBe(actionBit('forward'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyA')).toBe(actionBit('left'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyQ')).toBe(actionBit('ability'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'ShiftLeft')).toBe(actionBit('dodgeSprint'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyC')).toBe(actionBit('slide'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyE')).toBe(actionBit('pass'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyF')).toBe(actionBit('kick'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyR')).toBe(actionBit('reload'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyP')).toBe(0);
    expect(actionsForMouse(DEFAULT_KEYMAP, 0)).toBe(actionBit('fire'));
    expect(actionsForMouse(DEFAULT_KEYMAP, 2)).toBe(actionBit('aim'));
  });

  it('les actions bouton émettent les bons bits', () => {
    expect(ACTION_BUTTONS.jump).toBe(Buttons.JUMP);
    expect(ACTION_BUTTONS.fire).toBe(Buttons.FIRE);
    expect(ACTION_BUTTONS.aim).toBe(Buttons.AIM);
    expect(ACTION_BUTTONS.forward).toBeUndefined();
    expect(ACTION_BUTTONS.dodgeSprint).toBeUndefined();
  });

  it('remapping : une keymap fournie remplace la disposition par défaut', () => {
    const custom: Keymap = { ...DEFAULT_KEYMAP, jump: [{ kind: 'key', code: 'KeyV' }] };
    expect(actionsForKey(custom, 'KeyV')).toBe(actionBit('jump'));
    expect(actionsForKey(custom, 'Space')).toBe(0);
  });

  it('libellés : AZERTY par défaut, disposition réelle si fournie', () => {
    expect(actionLabel(DEFAULT_KEYMAP, 'forward')).toBe('Z');
    expect(actionLabel(DEFAULT_KEYMAP, 'left')).toBe('Q');
    expect(actionLabel(DEFAULT_KEYMAP, 'ability')).toBe('A');
    expect(actionLabel(DEFAULT_KEYMAP, 'jump')).toBe('Espace');
    expect(actionLabel(DEFAULT_KEYMAP, 'fire')).toBe('Clic gauche');
    const qwerty = new Map([
      ['KeyW', 'w'],
      ['KeyA', 'a'],
      ['KeyQ', 'q'],
    ]);
    expect(actionLabel(DEFAULT_KEYMAP, 'forward', qwerty)).toBe('W');
    expect(actionLabel(DEFAULT_KEYMAP, 'ability', qwerty)).toBe('Q');
    expect(bindingLabel({ kind: 'key', code: 'Space' }, qwerty)).toBe('Espace');
  });
});
