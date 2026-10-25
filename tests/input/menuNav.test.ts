/**
 * Navigation des menus à la manette (étape 8) : fronts, répétition, stick, boutons déjà enfoncés, reset.
 */
import { describe, expect, it } from 'vitest';
import { leftGame, MenuNavReader, stickDirection } from '../../src/input/menuNav';
import type { GamepadLike } from '../../src/input/gamepad';
import { MENU_NAV_REPEAT_DELAY_SEC, MENU_NAV_REPEAT_SEC } from '../../src/sim';

function pad(id = 'pad'): GamepadLike & { press(i: number, d: boolean): void; axes: number[] } {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  return {
    id,
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons,
    press(i: number, d: boolean) {
      buttons[i] = { pressed: d, value: d ? 1 : 0 };
    },
  };
}

describe('MenuNavReader', () => {
  it('rien au branchement, puis un front par appui (A, B, Start, LB, RB, croix)', () => {
    const p = pad();
    const r = new MenuNavReader();
    expect(r.update(p, 0)).toEqual([]);
    p.press(0, true);
    expect(r.update(p, 0.1)).toEqual(['confirm']);
    expect(r.update(p, 0.2)).toEqual([]);
    p.press(0, false);
    p.press(1, true);
    p.press(9, true);
    expect(r.update(p, 0.3)).toEqual(['back', 'start']);
    p.press(1, false);
    p.press(9, false);
    p.press(4, true);
    p.press(13, true);
    expect(r.update(p, 0.4)).toEqual(['down', 'prev']);
  });

  it('un bouton enfoncé au branchement n’agit qu’après relâchement', () => {
    const p = pad();
    p.press(0, true);
    const r = new MenuNavReader();
    expect(r.update(p, 0)).toEqual([]);
    expect(r.update(p, 0.1)).toEqual([]);
    p.press(0, false);
    r.update(p, 0.2);
    p.press(0, true);
    expect(r.update(p, 0.3)).toEqual(['confirm']);
  });

  it('direction maintenue : répétition après le délai, puis à intervalle régulier', () => {
    const p = pad();
    const r = new MenuNavReader();
    r.update(p, 0);
    p.press(15, true);
    expect(r.update(p, 1)).toEqual(['right']);
    expect(r.update(p, 1 + MENU_NAV_REPEAT_DELAY_SEC - 0.01)).toEqual([]);
    expect(r.update(p, 1 + MENU_NAV_REPEAT_DELAY_SEC + 0.001)).toEqual(['right']);
    expect(r.update(p, 1 + MENU_NAV_REPEAT_DELAY_SEC + 0.002)).toEqual([]);
    expect(r.update(p, 1 + MENU_NAV_REPEAT_DELAY_SEC + MENU_NAV_REPEAT_SEC + 0.002)).toEqual(['right']);
    p.press(15, false);
    expect(r.update(p, 3)).toEqual([]);
  });

  it('stick gauche : axe dominant au-delà du seuil (Y + = bas), zone morte respectée', () => {
    expect(stickDirection(0.1, 0.1)).toBeNull();
    expect(stickDirection(0.9, 0.2)).toBe('right');
    expect(stickDirection(-0.2, -0.9)).toBe('up');
    expect(stickDirection(0, 0.95)).toBe('down');
    const p = pad();
    const r = new MenuNavReader();
    r.update(p, 0);
    p.axes[0] = -0.9;
    expect(r.update(p, 0.1)).toEqual(['left']);
  });

  it('reset : la direction et les boutons encore maintenus sont ignorés jusqu’au relâchement', () => {
    const p = pad();
    const r = new MenuNavReader();
    r.update(p, 0);
    p.press(9, true);
    p.press(12, true);
    expect(r.update(p, 0.1)).toEqual(['up', 'start']);
    r.reset(p);
    expect(r.update(p, 2)).toEqual([]);
    p.press(9, false);
    p.press(12, false);
    expect(r.update(p, 2.1)).toEqual([]);
    p.press(12, true);
    expect(r.update(p, 2.2)).toEqual(['up']);
  });

  it('manette débranchée : rien, et un rebranchement ne crée pas de faux front', () => {
    const p = pad();
    const r = new MenuNavReader();
    r.update(p, 0);
    expect(r.update(null, 0.1)).toEqual([]);
    p.press(0, true);
    expect(r.update(p, 0.2)).toEqual([]);
  });

  it('stick maintenu en jeu puis pause (reset à la sortie du jeu) : aucune répétition avant relâchement', () => {
    // Correction de l'étape 8 : le stick de course maintenu en jeu répète « up » toutes les MENU_NAV_REPEAT_SEC (intentions
    // jetées en jeu) ; sans reset à la sortie du jeu, ces répétitions faisaient défiler le focus du menu de pause.
    const p = pad();
    const r = new MenuNavReader();
    r.update(p, 0);
    p.axes[1] = -1;
    let t = 0.1;
    expect(r.update(p, t)).toEqual(['up']);
    for (; t < 3; t += 1 / 60) r.update(p, t); // en jeu : répétitions en cours
    p.press(9, true); // Start : pause
    r.update(p, t);
    expect(leftGame(true, false)).toBe(true);
    r.reset(p);
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      expect(r.update(p, t)).toEqual([]);
    }
    p.axes[1] = 0;
    p.press(9, false);
    expect(r.update(p, (t += 0.1))).toEqual([]);
    p.axes[1] = -1;
    expect(r.update(p, (t += 0.1))).toEqual(['up']);
  });

  it('leftGame : vrai seulement à la sortie du jeu', () => {
    expect(leftGame(true, false)).toBe(true);
    expect(leftGame(false, false)).toBe(false);
    expect(leftGame(false, true)).toBe(false);
    expect(leftGame(true, true)).toBe(false);
  });
});
