/**
 * Réglages du joueur (étape 8), PURS et testés : sensibilités (souris, manette, en visée), inversions Y, aide à la visée
 * manette, caméra (FOV, distance, hauteur, effet de vitesse), qualité graphique, compteur d'images par seconde,
 * vibrations, volume général et volume de la musique. La
 * session les applique à chaud à l'InputManager, à la caméra et aux vibrations (`GameSession.applySettings`) ; l'UI les
 * édite et les mémorise (localStorage, src/ui/logic/storage.ts).
 *
 * `sanitizeSettings` accepte N'IMPORTE QUELLE valeur (JSON relu du stockage, éventuellement corrompu ou d'une ancienne
 * version) et rend des réglages valides : champs manquants => défaut, nombres bornés et ramenés au pas du curseur.
 */

import {
  CAMERA_FOV,
  SETTINGS_AIM_SENSITIVITY_MAX,
  SETTINGS_AIM_SENSITIVITY_MIN,
  SETTINGS_CAMERA_DISTANCE_MAX,
  SETTINGS_CAMERA_DISTANCE_MIN,
  SETTINGS_CAMERA_HEIGHT_MAX,
  SETTINGS_CAMERA_HEIGHT_MIN,
  SETTINGS_CAMERA_STEP,
  SETTINGS_FOV_MAX,
  SETTINGS_FOV_MIN,
  SETTINGS_FOV_STEP,
  SETTINGS_SENSITIVITY_MAX,
  SETTINGS_SENSITIVITY_MIN,
  SETTINGS_SENSITIVITY_STEP,
} from '../sim';
import { DEFAULT_INPUT_SETTINGS, DEFAULT_RUMBLE } from '../input/InputManager';
import type { QualityLevel } from '../render/palette';

/** Qualité graphique choisie : un niveau fixe, ou Auto (game/autoQuality.ts). */
export type QualitySetting = 'auto' | QualityLevel;
const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'bas', 'moyen', 'haut'];

// Pour l'UI (qui n'importe pas la sim) : bornes et pas des curseurs.
export {
  SETTINGS_AIM_SENSITIVITY_MAX,
  SETTINGS_AIM_SENSITIVITY_MIN,
  SETTINGS_CAMERA_DISTANCE_MAX,
  SETTINGS_CAMERA_DISTANCE_MIN,
  SETTINGS_CAMERA_HEIGHT_MAX,
  SETTINGS_CAMERA_HEIGHT_MIN,
  SETTINGS_CAMERA_STEP,
  SETTINGS_FOV_MAX,
  SETTINGS_FOV_MIN,
  SETTINGS_FOV_STEP,
  SETTINGS_SENSITIVITY_MAX,
  SETTINGS_SENSITIVITY_MIN,
  SETTINGS_SENSITIVITY_STEP,
} from '../sim';

export interface PlayerSettings {
  /** Multiplicateur de la sensibilité souris (1 = MOUSE_SENSITIVITY). */
  mouseSensitivity: number;
  /** Multiplicateur de la vitesse de caméra au stick droit (1 = GAMEPAD_LOOK_*_SPEED_DEG). */
  padSensitivity: number;
  /** Multiplicateur supplémentaire en visée, souris et manette (1 = MOUSE_AIM_SENSITIVITY_MULT / GAMEPAD_AIM_LOOK_MULT). */
  aimSensitivity: number;
  /** Inverser l'axe vertical de la caméra à la manette. */
  invertY: boolean;
  /** Inverser l'axe vertical de la caméra à la souris. */
  invertMouseY: boolean;
  /** Aide à la visée manette. */
  aimAssist: boolean;
  /** Champ de vision vertical de base (degrés ; CAMERA_FOV par défaut, porteur et visée décalés d'autant). */
  fov: number;
  /** Multiplicateur de la distance de la caméra (1 = CAMERA_DISTANCE*). */
  cameraDistance: number;
  /** Hauteur de la caméra ajoutée à l'épaule (m, signée ; 0 = caméra sur la droite de tir). */
  cameraHeight: number;
  /** FOV qui s'élargit avec la vitesse (sprint, esquive). */
  speedFov: boolean;
  /** Qualité graphique (résolution, foule, détails de la ville). */
  quality: QualitySetting;
  /** Compteur d'images par seconde affiché en jeu. */
  showFps: boolean;
  /** Vibrations de la manette. */
  rumble: boolean;
  /** Volume général 0..1. */
  volume: number;
  /** Volume de la musique du menu 0..1 (relatif au volume général). */
  musicVolume: number;
}

/** Volumes par défaut. */
const DEFAULT_VOLUME = 0.8;
const DEFAULT_MUSIC_VOLUME = 0.7;
/** Pas du curseur de volume (exporté pour l'UI). */
export const VOLUME_STEP = 0.05;

export const DEFAULT_SETTINGS: Readonly<PlayerSettings> = Object.freeze({
  mouseSensitivity: DEFAULT_INPUT_SETTINGS.mouseSensitivity,
  padSensitivity: DEFAULT_INPUT_SETTINGS.padSensitivity,
  aimSensitivity: DEFAULT_INPUT_SETTINGS.aimSensitivity,
  invertY: DEFAULT_INPUT_SETTINGS.invertY,
  invertMouseY: DEFAULT_INPUT_SETTINGS.invertMouseY,
  aimAssist: DEFAULT_INPUT_SETTINGS.aimAssist,
  fov: CAMERA_FOV,
  cameraDistance: 1,
  cameraHeight: 0,
  speedFov: true,
  quality: 'auto',
  showFps: false,
  rumble: DEFAULT_RUMBLE,
  volume: DEFAULT_VOLUME,
  musicVolume: DEFAULT_MUSIC_VOLUME,
});

/** Nombre borné à [min, max] et ramené au pas `step` (depuis min) ; valeur non finie => `fallback`. */
export function snapToStep(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Arrondi décimal (0,1 + 0,2…) pour un JSON propre et un affichage stable ; « + 0 » : jamais de −0.
  return Math.min(max, Math.round(snapped * 1e6) / 1e6) + 0;
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
    aimSensitivity: snapToStep(o.aimSensitivity, SETTINGS_AIM_SENSITIVITY_MIN, SETTINGS_AIM_SENSITIVITY_MAX, SETTINGS_SENSITIVITY_STEP, d.aimSensitivity),
    invertY: bool(o.invertY, d.invertY),
    invertMouseY: bool(o.invertMouseY, d.invertMouseY),
    aimAssist: bool(o.aimAssist, d.aimAssist),
    fov: snapToStep(o.fov, SETTINGS_FOV_MIN, SETTINGS_FOV_MAX, SETTINGS_FOV_STEP, d.fov),
    cameraDistance: snapToStep(o.cameraDistance, SETTINGS_CAMERA_DISTANCE_MIN, SETTINGS_CAMERA_DISTANCE_MAX, SETTINGS_CAMERA_STEP, d.cameraDistance),
    cameraHeight: snapToStep(o.cameraHeight, SETTINGS_CAMERA_HEIGHT_MIN, SETTINGS_CAMERA_HEIGHT_MAX, SETTINGS_CAMERA_STEP, d.cameraHeight),
    speedFov: bool(o.speedFov, d.speedFov),
    quality: QUALITY_SETTINGS.includes(o.quality as QualitySetting) ? (o.quality as QualitySetting) : d.quality,
    showFps: bool(o.showFps, d.showFps),
    rumble: bool(o.rumble, d.rumble),
    volume: snapToStep(o.volume, 0, 1, VOLUME_STEP, d.volume),
    musicVolume: snapToStep(o.musicVolume, 0, 1, VOLUME_STEP, d.musicVolume),
  };
}
