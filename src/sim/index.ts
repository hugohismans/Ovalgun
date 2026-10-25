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
// En ligne : compensation de latence (options de step côté serveur).
export { clampLag, PoseHistory, type StepOptions } from './lagcomp';
export {
  formationSlot,
  kickoffCarrierIndex,
  kickoffDistance,
  placeForKickoff,
  placeTeamInFormation,
  resetPlayerAt,
  type FormationSlot,
} from './formation';
// Phases et règles (étape 6) : remise en jeu, outil « sauter le coup d'envoi » (tests / réglage, entre deux step).
export { isFrozenPhase, setupKickoff, startPlayNow } from './rules';
// Lectures PURES de l'état (étape 6) : pour les bots, le HUD et les tests.
export {
  activePlayers,
  attackDir,
  attackYaw,
  ballCarrier,
  ballLandingPoint,
  clockSeconds,
  distanceToTryLine,
  isInOpponentInGoal,
  isInOwnInGoal,
  isLive,
  isPlayerActive,
  opponentTeam,
  opponentTryLineZ,
  ownTryLineZ,
  phaseSeconds,
  possessionTeam,
  teamPlayers,
} from './queries';
// Entrées.
export { NEUTRAL_INPUT, makeInput, ALL_BUTTONS, PITCH_MIN, PITCH_MAX, type TickInput } from './input';
// Joueurs (lectures utiles au rendu / HUD / bots).
export { aimOrigin, cooldownTicks, dodgeSpeed, isCarrier, playerHeight, targetRunSpeed, wishDirection } from './player';
export { maxRunSpeed } from './momentum';
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
  predictPassCatch,
  selectPassTarget,
  type PassCatchPoint,
  type PassPlan,
  type PassTarget,
} from './carrier';
// Tir, projectiles, stabilité, capacités (étape 5) : règles PURES lues par le rendu, le HUD et les bots.
export { canShoot, fireIntervalTicks, fireOverridesSprint, spreadDirection, weaponImplemented } from './combat';
export { damageAmount, damageFalloff, isHittable } from './stability';
export { segmentCapsuleEntry, segmentTerrainEntry } from './raycast';
export { abilityActive, abilityImplemented, inSlowZone, slowZonePlacement } from './abilities';
// Étape 7 : bouclier du pilier, explosions du demi (règles PURES lues par le rendu, le HUD et les bots).
export { segmentShieldEntry, shieldArcCovers, shieldFacing, shieldPoint, shieldUp } from './shield';
export { blastDistance, hasLineOfSight } from './explosion';
export { predictGrenadeImpact } from './projectiles';
// Étape 7 : mêlée (lectures PURES pour le rendu, le HUD, les bots et les tests).
export {
  countInZone,
  inScrumZone,
  scrumCaptureTicks,
  scrumInOvertime,
  scrumLooseReady,
  scrumMaxTicks,
  scrumMinPlayers,
  scrumRadius,
  scrumTicksLeft,
} from './scrum';
// Sérialisation.
export { cloneState, hashState, fnv1a } from './serialize';
