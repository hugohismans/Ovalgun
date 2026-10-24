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
export { aimOrigin, cooldownTicks, isCarrier, playerHeight, targetRunSpeed, wishDirection } from './player';
// Ballon (position du ballon porté, partagée avec le rendu).
export { carryPosition } from './ball';
// Porteur (étape 4) : visée assistée et trajectoires (pures, lues par le rendu / les bots), outils de test.
export {
  backwardZ,
  ballSpeedMult,
  ballisticVelocity,
  canCarrierAct,
  debugGiveBall,
  debugResetBall,
  kickLaunch,
  passAimDirection,
  planPass,
  predictBallLanding,
  selectPassTarget,
  type PassPlan,
  type PassTarget,
} from './carrier';
// Tir, projectiles, stabilité, capacités (étape 5) : règles PURES lues par le rendu, le HUD et les bots.
export { canShoot, fireIntervalTicks, fireOverridesSprint, spreadDirection, weaponImplemented } from './combat';
export { damageAmount, damageFalloff, isHittable } from './stability';
export { segmentCapsuleEntry, segmentTerrainEntry } from './raycast';
export { abilityActive, abilityImplemented } from './abilities';
// Sérialisation.
export { cloneState, hashState, fnv1a } from './serialize';
