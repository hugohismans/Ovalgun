/**
 * Logique d'entrée pure : verrouillage des appuis brefs, Shift appui/maintien, fusion des déplacements.
 */
import { describe, expect, it } from 'vitest';
import { composeInput, keyboardMove, mergeMove, PressLatch, TapHoldState, type InputParts } from '../../src/input/inputLogic';
import { actionBit, actionsForKey, DEFAULT_KEYMAP } from '../../src/input/keymap';
import { SPRINT_HOLD_DELAY_SEC } from '../../src/sim/constants';
import { Buttons } from '../../src/sim/types';

describe('PressLatch', () => {
  it('un appui relâché entre deux ticks est vu au tick suivant, une seule fois', () => {
    const l = new PressLatch();
    l.setHeld(0b1);
    l.setHeld(0);
    expect(l.sample()).toBe(0b1);
    expect(l.sample()).toBe(0);
  });

  it('un bouton maintenu reste vu à chaque tick', () => {
    const l = new PressLatch();
    l.setHeld(0b10);
    expect(l.sample()).toBe(0b10);
    expect(l.sample()).toBe(0b10);
    l.setHeld(0);
    expect(l.sample()).toBe(0);
  });

  it('reset : aucun appui en attente, et les boutons encore enfoncés sont ignorés jusqu’au relâchement', () => {
    const l = new PressLatch();
    l.setHeld(0b11);
    l.reset(0b01);
    expect(l.sample()).toBe(0);
    l.setHeld(0b01); // toujours enfoncé : ignoré
    expect(l.sample()).toBe(0);
    l.setHeld(0); // relâché
    l.setHeld(0b01); // nouvel appui : vu
    expect(l.sample()).toBe(0b01);
  });
});

describe('TapHoldState, esquive à l’enfoncement (KEYBOARD_DODGE_ON_RELEASE = false)', () => {
  const make = (): TapHoldState => new TapHoldState(SPRINT_HOLD_DELAY_SEC, false);
  it('front d’appui => tap pendant UN échantillon', () => {
    const s = make();
    s.press(10);
    expect(s.sample(10.01)).toEqual({ tap: true, hold: false });
    expect(s.sample(10.04)).toEqual({ tap: false, hold: false });
  });

  it('maintien au-delà du délai => hold tant que la touche est enfoncée', () => {
    const s = make();
    s.press(0);
    s.sample(0.01);
    expect(s.sample(SPRINT_HOLD_DELAY_SEC - 0.01).hold).toBe(false);
    expect(s.sample(SPRINT_HOLD_DELAY_SEC + 0.01).hold).toBe(true);
    expect(s.sample(2).hold).toBe(true);
    s.release(2.05);
    expect(s.sample(2.1)).toEqual({ tap: false, hold: false });
  });

  it('appui bref entre deux ticks : l’esquive est quand même émise, sans sprint', () => {
    const s = make();
    s.press(1);
    s.release(1.01);
    expect(s.sample(1.03)).toEqual({ tap: true, hold: false });
  });

  it('la répétition clavier ne relance ni l’esquive ni le délai', () => {
    const s = make();
    s.press(0);
    s.sample(0.01);
    s.press(0.2); // auto-repeat
    expect(s.sample(0.21)).toEqual({ tap: false, hold: true });
  });

  it('reset annule une esquive en attente', () => {
    const s = make();
    s.press(0);
    s.reset();
    expect(s.sample(0.5)).toEqual({ tap: false, hold: false });
  });
});

describe('TapHoldState, esquive au relâchement (défaut) : maintenir pour sprinter ne consomme pas l’esquive', () => {
  it('maintien : sprint après le délai, et AUCUNE esquive (ni au début, ni au relâchement)', () => {
    const s = new TapHoldState();
    s.press(0);
    expect(s.sample(0.01)).toEqual({ tap: false, hold: false });
    expect(s.sample(SPRINT_HOLD_DELAY_SEC + 0.01)).toEqual({ tap: false, hold: true });
    s.release(1);
    expect(s.sample(1.01)).toEqual({ tap: false, hold: false });
  });

  it('appui bref : esquive au relâchement, une seule fois', () => {
    const s = new TapHoldState();
    s.press(0);
    expect(s.sample(0.03).tap).toBe(false);
    s.release(0.08);
    expect(s.sample(0.1)).toEqual({ tap: true, hold: false });
    expect(s.sample(0.13)).toEqual({ tap: false, hold: false });
  });

  it('appui bref entre deux ticks : esquive au tick suivant', () => {
    const s = new TapHoldState();
    s.press(1);
    s.release(1.02);
    expect(s.sample(1.03)).toEqual({ tap: true, hold: false });
  });

  it('relâchement sans appui (touche enfoncée avant le focus) : rien', () => {
    const s = new TapHoldState();
    s.release(1);
    expect(s.sample(1.01)).toEqual({ tap: false, hold: false });
  });
});

describe('composeInput (assemblage du PlayerInput d’un tick)', () => {
  const BASE: InputParts = {
    keyboardActions: 0,
    shift: { tap: false, hold: false },
    gamepadButtons: 0,
    gamepadMove: { x: 0, y: 0 },
    gamepadActive: false,
    yaw: 0.5,
    pitch: -0.1,
  };

  it('clavier : déplacement, boutons, Shift (DODGE / SPRINT), orientation commune', () => {
    const inp = composeInput({
      ...BASE,
      keyboardActions: actionBit('forward') | actionBit('right') | actionBit('jump') | actionBit('aim'),
      shift: { tap: true, hold: true },
    });
    expect(inp).toEqual({
      moveX: 1,
      moveY: 1,
      yaw: 0.5,
      pitch: -0.1,
      buttons: Buttons.JUMP | Buttons.AIM | Buttons.DODGE | Buttons.SPRINT,
    });
  });

  it('manette : boutons en OU avec le clavier, déplacement le plus grand', () => {
    const inp = composeInput({
      ...BASE,
      keyboardActions: actionBit('fire'),
      gamepadButtons: Buttons.JUMP | Buttons.SPRINT,
      gamepadMove: { x: 0.2, y: 0.9 },
      gamepadActive: true,
    });
    expect(inp.buttons).toBe(Buttons.FIRE | Buttons.JUMP | Buttons.SPRINT);
    expect([inp.moveX, inp.moveY]).toEqual([0.2, 0.9]);
    // Le clavier à fond l'emporte sur un stick peu incliné.
    const kb = composeInput({ ...BASE, keyboardActions: actionBit('back'), gamepadMove: { x: 0.3, y: 0 }, gamepadActive: true });
    expect([kb.moveX, kb.moveY]).toEqual([0, -1]);
  });

  it('rien d’enfoncé : entrée neutre qui garde l’orientation', () => {
    expect(composeInput(BASE)).toEqual({ moveX: 0, moveY: 0, yaw: 0.5, pitch: -0.1, buttons: 0 });
  });
});

describe('déplacement clavier et fusion', () => {
  it('touches opposées s’annulent, diagonale non normalisée (la sim le fait)', () => {
    expect(keyboardMove(true, false, false, true)).toEqual({ x: 1, y: 1 });
    expect(keyboardMove(true, true, true, false)).toEqual({ x: -1, y: 0 });
  });

  it('le plus grand déplacement l’emporte, sans addition', () => {
    expect(mergeMove({ x: 0, y: 1 }, { x: 0.3, y: 0.2 }, true)).toEqual({ x: 0, y: 1 });
    expect(mergeMove({ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, false)).toEqual({ x: 0.3, y: 0.2 });
    // À égalité : le périphérique actif.
    expect(mergeMove({ x: 1, y: 0 }, { x: 0, y: 1 }, true)).toEqual({ x: 0, y: 1 });
    expect(mergeMove({ x: 1, y: 0 }, { x: 0, y: 1 }, false)).toEqual({ x: 1, y: 0 });
  });
});

describe('actions du porteur au clavier (étape 4)', () => {
  it('E = PASS, F = KICK, C = SLIDE (plongeon du porteur) : un appui bref entre deux ticks est émis au tick suivant', () => {
    const base = { shift: { tap: false, hold: false }, gamepadButtons: 0, gamepadMove: { x: 0, y: 0 }, gamepadActive: false, yaw: 0, pitch: 0 };
    for (const [code, bit] of [
      ['KeyE', Buttons.PASS],
      ['KeyF', Buttons.KICK],
      ['KeyC', Buttons.SLIDE],
    ] as const) {
      const latch = new PressLatch();
      const actions = actionsForKey(DEFAULT_KEYMAP, code);
      latch.setHeld(actions);
      latch.setHeld(0); // relâchée avant le tick
      expect(composeInput({ ...base, keyboardActions: latch.sample() }).buttons, code).toBe(bit);
      expect(composeInput({ ...base, keyboardActions: latch.sample() }).buttons).toBe(0);
    }
  });

  it('G / B (outils de test) n’émettent aucun bit vers la sim', () => {
    const base = { shift: { tap: false, hold: false }, gamepadButtons: 0, gamepadMove: { x: 0, y: 0 }, gamepadActive: false, yaw: 0, pitch: 0 };
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyG')).toBe(actionBit('debugGiveBall'));
    expect(actionsForKey(DEFAULT_KEYMAP, 'KeyB')).toBe(actionBit('debugResetBall'));
    const k = actionBit('debugGiveBall') | actionBit('debugResetBall');
    expect(composeInput({ ...base, keyboardActions: k }).buttons).toBe(0);
  });
});
