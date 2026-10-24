/**
 * API publique de la simulation Ovalgun.
 *
 * Module PUR : aucune dépendance à Three.js, au DOM, à Svelte, à window ou à Node.
 * Voir docs/ARCHITECTURE.md §2 pour le contrat complet.
 */

export * from './types';
export * from './constants';
export * from './vec';
export * from './prng';
export * from './time';

// Terrain (aussi utilisé par le rendu pour construire les maillages).
export {
  createField,
  fieldScaleFor,
  mirrorFeature,
  featureSupport,
  groundHeight,
  supportHeight,
  groundGradient,
  groundNormal,
  faceContact,
  type FaceContact,
} from './field';
// Match.
export { createMatch, createPlayer, normalizeConfig, step } from './match';
export { formationSlot, placeTeamInFormation, resetPlayerAt, type FormationSlot } from './formation';
// Entrées.
export { NEUTRAL_INPUT, makeInput, ALL_BUTTONS, PITCH_MIN, PITCH_MAX, type TickInput } from './input';
// Joueurs (lectures utiles au rendu / HUD / bots).
export { isCarrier, playerHeight, targetRunSpeed, wishDirection } from './player';
// Sérialisation.
export { cloneState, hashState, fnv1a } from './serialize';
