/**
 * Persistance (étape 8) : localStorage absent, qui jette, contenu corrompu ; réglages et choix relus validés.
 */
import { describe, expect, it } from 'vitest';
import { browserStorage, loadJson, saveJson, STORAGE_KEYS, type StorageLike } from '../../src/ui/logic/storage';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/game/settings';
import { DEFAULT_SETUP, sanitizeSetup } from '../../src/game/launch';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('storage', () => {
  it('aller-retour JSON', () => {
    const s = new MemoryStorage();
    expect(saveJson(s, STORAGE_KEYS.settings, { a: 1 })).toBe(true);
    expect(loadJson(s, STORAGE_KEYS.settings)).toEqual({ a: 1 });
    expect(loadJson(s, 'absent')).toBeNull();
  });

  it('stockage absent ou qui jette : valeurs par défaut, aucune exception', () => {
    expect(loadJson(null, STORAGE_KEYS.setup)).toBeNull();
    expect(saveJson(null, STORAGE_KEYS.setup, 1)).toBe(false);
    expect(loadJson(throwing, STORAGE_KEYS.setup)).toBeNull();
    expect(saveJson(throwing, STORAGE_KEYS.setup, 1)).toBe(false);
    expect(sanitizeSettings(loadJson(throwing, STORAGE_KEYS.settings))).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSetup(loadJson(null, STORAGE_KEYS.setup))).toEqual(DEFAULT_SETUP);
  });

  it('contenu corrompu : null (puis valeurs par défaut)', () => {
    const s = new MemoryStorage();
    s.setItem(STORAGE_KEYS.settings, '{pas du json');
    expect(loadJson(s, STORAGE_KEYS.settings)).toBeNull();
    expect(sanitizeSettings(loadJson(s, STORAGE_KEYS.settings))).toEqual(DEFAULT_SETTINGS);
  });

  it('sans window (Node) : browserStorage renvoie null', () => {
    expect(browserStorage()).toBeNull();
  });
});
