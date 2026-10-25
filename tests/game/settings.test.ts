/**
 * Réglages du joueur et paramètres de lancement (étape 8) : validation, bornes, pas, URL de debug.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, snapToStep } from '../../src/game/settings';
import { debugFlagsFromParams, DEFAULT_SETUP, sanitizeSetup, setupFromParams } from '../../src/game/launch';
import {
  CAMERA_FOV,
  SETTINGS_AIM_SENSITIVITY_MAX,
  SETTINGS_CAMERA_DISTANCE_MIN,
  SETTINGS_FOV_MAX,
  SETTINGS_SENSITIVITY_MAX,
  SETTINGS_SENSITIVITY_MIN,
} from '../../src/sim';

describe('sanitizeSettings', () => {
  it('valeurs par défaut pour n’importe quoi', () => {
    for (const v of [null, undefined, 3, 'x', [], {}]) expect(sanitizeSettings(v)).toEqual(DEFAULT_SETTINGS);
  });

  it('sensibilités bornées et ramenées au pas ; booléens stricts ; JSON propre', () => {
    const s = sanitizeSettings({ mouseSensitivity: 99, padSensitivity: 0.0001, invertY: 'oui', aimAssist: false, rumble: false, volume: 0.333 });
    expect(s.mouseSensitivity).toBe(SETTINGS_SENSITIVITY_MAX);
    expect(s.padSensitivity).toBe(SETTINGS_SENSITIVITY_MIN);
    expect(s.invertY).toBe(DEFAULT_SETTINGS.invertY);
    expect(s.aimAssist).toBe(false);
    expect(s.rumble).toBe(false);
    expect(s.volume).toBe(0.35);
    expect(sanitizeSettings({ mouseSensitivity: 1.23 }).mouseSensitivity).toBe(1.25);
    expect(sanitizeSettings({ mouseSensitivity: Number.NaN }).mouseSensitivity).toBe(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('caméra et visée : bornes, pas, booléens ; anciens réglages complétés par les défauts', () => {
    const s = sanitizeSettings({ fov: 140, cameraDistance: 0.1, cameraHeight: 0.33, aimSensitivity: 9, invertMouseY: true, speedFov: 'non' });
    expect(s.fov).toBe(SETTINGS_FOV_MAX);
    expect(s.cameraDistance).toBe(SETTINGS_CAMERA_DISTANCE_MIN);
    expect(s.cameraHeight).toBe(0.35);
    expect(s.aimSensitivity).toBe(SETTINGS_AIM_SENSITIVITY_MAX);
    expect(s.invertMouseY).toBe(true);
    expect(s.speedFov).toBe(true);
    expect(sanitizeSettings({ fov: 71.6 }).fov).toBe(72);
    expect(Object.is(sanitizeSettings({ cameraHeight: -0.0001 }).cameraHeight, 0)).toBe(true);
    const old = sanitizeSettings({ mouseSensitivity: 2, volume: 0.5 });
    expect(old).toMatchObject({ fov: CAMERA_FOV, cameraDistance: 1, cameraHeight: 0, aimSensitivity: 1, invertMouseY: false, speedFov: true });
  });

  it('snapToStep : pas depuis le minimum, sans erreur d’arrondi visible', () => {
    expect(snapToStep(0.3, 0, 1, 0.1, 0)).toBe(0.3);
    expect(snapToStep(-5, 0, 1, 0.1, 0)).toBe(0);
    expect(snapToStep('1', 0, 1, 0.1, 0.5)).toBe(0.5);
  });
});

describe('launch', () => {
  const params = (q: string) => new URLSearchParams(q);

  it('sanitizeSetup : valeurs relues validées, champs invalides => base', () => {
    expect(sanitizeSetup({ teamSize: 5, role: 'pilier', difficulty: 'difficile', training: true })).toEqual({ teamSize: 5, role: 'pilier', difficulty: 'difficile', training: true });
    expect(sanitizeSetup({ teamSize: 4, role: 'gardien', difficulty: 'expert', training: 'oui' })).toEqual(DEFAULT_SETUP);
  });

  it('URL par-dessus les choix mémorisés (debug) ; paramètres absents conservés', () => {
    const base = { teamSize: 5 as const, role: 'demi' as const, difficulty: 'facile' as const, training: false };
    expect(setupFromParams(params(''), base)).toEqual(base);
    expect(setupFromParams(params('?size=3&role=pilier&difficulty=difficile&training'), base)).toEqual({ teamSize: 3, role: 'pilier', difficulty: 'difficile', training: true });
    expect(setupFromParams(params('?training=0'), { ...base, training: true }).training).toBe(false);
  });

  it('drapeaux de debug : ?debug lance sans menu (sauf ?menu), durée et autopilote en debug seulement', () => {
    expect(debugFlagsFromParams(params(''))).toEqual({ debug: false, showMenu: true, autopilot: false, passive: false, durationSec: 0 });
    expect(debugFlagsFromParams(params('?debug'))).toMatchObject({ debug: true, showMenu: false });
    expect(debugFlagsFromParams(params('?debug&menu')).showMenu).toBe(true);
    expect(debugFlagsFromParams(params('?debug&autopilot&duration=20&dummies=off'))).toMatchObject({ autopilot: true, durationSec: 20, passive: true });
    expect(debugFlagsFromParams(params('?autopilot&duration=20'))).toMatchObject({ autopilot: false, durationSec: 0 });
    expect(debugFlagsFromParams(params('?debug&duration=-3')).durationSec).toBe(0);
  });
});
