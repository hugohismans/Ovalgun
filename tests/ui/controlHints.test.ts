/**
 * Aides de contrôle (étape 8) : glyphes selon le périphérique actif et la famille de manette, libellés AZERTY ou
 * disposition réelle, structure du panneau des contrôles.
 */
import { describe, expect, it } from 'vitest';
import { CONTROL_GROUPS, CONTROLS, controlGlyphs, keyGlyphs, padButtonGlyph, padGlyphs } from '../../src/ui/logic/controlHints';
import { ACTIONS } from '../../src/input/keymap';
import { GAMEPAD_ACTIONS } from '../../src/input/gamepadMap';

describe('controlHints', () => {
  it('clavier : libellés AZERTY par défaut (positions physiques)', () => {
    expect(keyGlyphs('move').map((g) => g.label)).toEqual(['Z', 'Q', 'S', 'D']);
    expect(keyGlyphs('ability')).toEqual([{ kind: 'key', label: 'A' }]);
    expect(keyGlyphs('jump')[0].label).toBe('Espace');
    expect(keyGlyphs('fire')[0]).toMatchObject({ kind: 'mouse', button: 0 });
    expect(keyGlyphs('pause')[0].label).toBe('Échap');
  });

  it('clavier : disposition réelle quand le navigateur la donne (QWERTY)', () => {
    const qwerty = new Map([
      ['KeyW', 'w'],
      ['KeyA', 'a'],
      ['KeyS', 's'],
      ['KeyD', 'd'],
      ['KeyQ', 'q'],
    ]);
    expect(keyGlyphs('move', qwerty).map((g) => g.label)).toEqual(['W', 'A', 'S', 'D']);
    expect(keyGlyphs('ability', qwerty)[0].label).toBe('Q');
  });

  it('manette : glyphes Xbox et PlayStation selon la famille détectée', () => {
    expect(padGlyphs('jump', 'xbox')).toEqual([{ kind: 'pad', index: 0, label: 'A', style: 'xbox' }]);
    expect(padGlyphs('jump', 'playstation')[0].label).toBe('✕');
    expect(padGlyphs('dodge', 'playstation')[0].label).toBe('○');
    expect(padGlyphs('pass', 'playstation')[0].label).toBe('R1');
    expect(padGlyphs('move', 'xbox')).toEqual([{ kind: 'stick', side: 'L', label: 'Stick G' }]);
    expect(padGlyphs('sprint', 'xbox')[0].label).toBe('L3');
    expect(padButtonGlyph(9, 'playstation').label).toBe('Options');
  });

  it('périphérique actif : clavier ou manette', () => {
    expect(controlGlyphs('reload', 'keyboard', 'xbox')[0].label).toBe('R');
    expect(controlGlyphs('reload', 'gamepad', 'xbox')[0].label).toBe('Y');
    expect(controlGlyphs('dive', 'gamepad', 'playstation')[0].label).toBe('□');
  });

  it('panneau : chaque action de la keymap et du mapping manette est couverte par une ligne', () => {
    const keys = new Set(Object.values(CONTROLS).flatMap((c) => c.keys));
    const pads = new Set(Object.values(CONTROLS).flatMap((c) => c.pad));
    for (const a of ACTIONS) expect(keys.has(a), a).toBe(true);
    for (const a of GAMEPAD_ACTIONS) expect(pads.has(a), a).toBe(true);
    const ids = CONTROL_GROUPS.flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Object.keys(CONTROLS).length);
  });
});
