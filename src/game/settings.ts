/**
 * Réglages du joueur (étape 8), PURS et testés : sensibilité souris, sensibilité caméra manette, inversion Y, aide à la
 * visée manette, vibrations, volume (réservé : pas encore de son). La session les applique à chaud à l'InputManager et
 * aux vibrations (`GameSession.applySettings`) ; l'UI les édite et les mémorise (localStorage, src/ui/logic/storage.ts).
 *
 * `sanitizeSettings` accepte N'IMPORTE QUELLE valeur (JSON relu du stockage, éventuellement corrompu ou d'une ancienne
 * version) et rend des réglages valides : champs manquants => défaut, nombres bornés et ramenés au pas du curseur.
 */

import { SETTINGS_SENSITIVITY_MAX, SETTINGS_SENSITIVITY_MIN, SETTINGS_SENSITIVITY_STEP } from '../sim';
import { DEFAULT_INPUT_SETTINGS, DEFAULT_RUMBLE } from '../input/InputManager';

// Pour l'UI (qui n'importe pas la sim) : bornes et pas des curseurs de sensibilité.
export { SETTINGS_SENSITIVITY_MAX, SETTINGS_SENSITIVITY_MIN, SETTINGS_SENSITIVITY_STEP } from '../sim';

export interface PlayerSettings {
  /** Multiplicateur de la sensibilité souris (1 = MOUSE_SENSITIVITY). */
  mouseSensitivity: number;
  /** Multiplicateur de la vitesse de caméra au stick droit (1 = GAMEPAD_LOOK_*_SPEED_DEG). */
  padSensitivity: number;
  /** Inverser l'axe vertical de la caméra (souris non concernée : manette seulement). */
  invertY: boolean;
  /** Aide à la visée manette. */
  aimAssist: boolean;
  /** Vibrations de la manette. */
  rumble: boolean;
  /** Volume général 0..1 (réservé : pas encore de son). */
  volume: number;
}

/** Volume par défaut (réservé). */
const DEFAULT_VOLUME = 0.8;
/** Pas du curseur de volume (exporté pour l'UI). */
export const VOLUME_STEP = 0.05;

export const DEFAULT_SETTINGS: Readonly<PlayerSettings> = Object.freeze({
  mouseSensitivity: DEFAULT_INPUT_SETTINGS.mouseSensitivity,
  padSensitivity: DEFAULT_INPUT_SETTINGS.padSensitivity,
  invertY: DEFAULT_INPUT_SETTINGS.invertY,
  aimAssist: DEFAULT_INPUT_SETTINGS.aimAssist,
  rumble: DEFAULT_RUMBLE,
  volume: DEFAULT_VOLUME,
});

/** Nombre borné à [min, max] et ramené au pas `step` (depuis min) ; valeur non finie => `fallback`. */
export function snapToStep(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Arrondi décimal (0,1 + 0,2…) pour un JSON propre et un affichage stable.
  return Math.min(max, Math.round(snapped * 1e6) / 1e6);
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Réglages valides à partir de n'importe quelle valeur (voir l'en-tête). */
export function sanitizeSettings(raw: unknown): PlayerSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const sens = (v: unknown, f: number): number => snapToStep(v, SETTINGS_SENSITIVITY_MIN, SETTINGS_SENSITIVITY_MAX, SETTINGS_SENSITIVITY_STEP, f);
  return {
    mouseSensitivity: sens(o.mouseSensitivity, d.mouseSensitivity),
    padSensitivity: sens(o.padSensitivity, d.padSensitivity),
    invertY: bool(o.invertY, d.invertY),
    aimAssist: bool(o.aimAssist, d.aimAssist),
    rumble: bool(o.rumble, d.rumble),
    volume: snapToStep(o.volume, 0, 1, VOLUME_STEP, d.volume),
  };
}
