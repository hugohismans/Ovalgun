/**
 * Phases et règles du match (étape 6) : coup d'envoi / remise en jeu, essai, chrono, dernière minute, fin.
 *
 * Cycle des phases (docs/ARCHITECTURE.md §2 et §11) :
 *
 *   createMatch ──> 'kickoff' (FIRST_KICKOFF_FREEZE_SEC, joueurs figés, événement 'kickoff' dans l'état initial)
 *                      │ fin du décompte (étape 2 de step) : événement 'play'
 *                      v
 *                   'play' ── essai (étape 11) : TRY_POINTS, événement 'try', ballon 'dead'
 *                      │                        v
 *                      │                     'try' (TRY_PAUSE_SEC, figés) ── fin (étape 2) : remise en jeu,
 *                      │                        kickoffTeam = l'équipe qui a encaissé ──> 'kickoff' (KICKOFF_FREEZE_SEC)
 *                      │ chrono à 0 (étape 11) : événement 'match_end', ballon 'dead'
 *                      v
 *                   'ended' (définitif : step n'avance plus que tick et la visée)
 *
 * Durées exactes : un événement 'kickoff' au tick K est suivi de 'play' au tick K + secToTicks(KICKOFF_FREEZE_SEC)
 * (FIRST_KICKOFF_FREEZE_SEC pour le premier coup d'envoi) ;
 * un 'try' au tick T de la remise en jeu ('kickoff') au tick T + secToTicks(TRY_PAUSE_SEC).
 *
 * Essai vérifié DEUX fois par tick joué : juste après le déplacement (étape 7, updateTryAfterMovement : le porteur qui
 * franchit la ligne marque AVANT les plaquages de l'étape 8 — plaqué au tick où ses pieds passent la ligne, il marque
 * quand même) et à l'étape 11 (ballon ramassé / attrapé dans l'en-but adverse à l'étape 9).
 *
 * Chrono : décompté d'un tick à chaque tick JOUÉ (tick commencé en phase 'play' après l'étape 2, y compris le tick du
 * coup de sifflet et celui d'un essai ; la mêlée de l'étape 7, qui fait partie du jeu), jamais pendant 'kickoff' / 'try',
 * jamais en entraînement (config.training : pas de dernière minute, pas de fin). Ordre de l'étape 11 : essai, PUIS
 * chrono : un essai marqué au tick où le chrono atteint 0 compte (score de 'match_end' compris), et la fin l'emporte
 * sur la pause d'essai (phase 'ended').
 */

import { BALL_RADIUS, KICKOFF_FREEZE_SEC, LAST_MINUTE_SEC, ROLES, TRY_PAUSE_SEC, TRY_POINTS } from './constants';
import { carryPosition } from './ball';
import { giveBall } from './carrier';
import { groundHeight } from './field';
import { placeForKickoff } from './formation';
import { isInOpponentInGoal, opponentTeam } from './queries';
import { secToTicks } from './time';
import type { MatchState, PlayerState, TeamId } from './types';

/** Vrai si les joueurs sont figés (seule la visée est appliquée) : coup d'envoi, pause d'essai, fin. */
export const isFrozenPhase = (state: MatchState): boolean => state.phase !== 'play';

// ---------------------------------------------------------------------------
// Remise en jeu
// ---------------------------------------------------------------------------

/**
 * Remet à zéro l'état TRANSITOIRE d'un joueur (le mouvement l'est par la formation) : debout, stabilité pleine,
 * aucune invulnérabilité, cooldowns à 0, chargeur plein, pas de rechargement, capacité inactive et disponible,
 * ramassage autorisé. Conservés : identité (id, équipe, rôle), stats, `lastButtons` (suivi des fronts montants :
 * un bouton maintenu pendant la remise en jeu ne crée pas de faux appui au coup de sifflet).
 */
function resetPlayerTransient(p: PlayerState): void {
  const role = ROLES[p.role];
  p.dodgeCd = 0;
  p.slideCd = 0;
  p.diveCd = 0;
  p.invulnTicks = 0;
  p.stability = role.stabilityMax;
  p.regenDelayTicks = 0;
  p.status = 'active';
  p.statusTicks = 0;
  p.lastHitBy = -1;
  p.fireCd = 0;
  p.ammo = role.weapon.magazine;
  p.reloadTicks = 0;
  p.abilityCd = 0;
  p.abilityTicks = 0;
  p.pickupBlockTicks = 0;
}

/**
 * Coup d'envoi / remise en jeu reçu par `receivingTeam` : phase 'kickoff' pendant secToTicks(freezeSec) ticks
 * (KICKOFF_FREEZE_SEC par défaut : remise en jeu ; createMatch passe FIRST_KICKOFF_FREEZE_SEC), `kickoffTeam` =
 * `receivingTeam`, événement 'kickoff'.
 *  - Placement (formation.ts, placeForKickoff) : l'équipe qui reçoit devant sa propre ligne d'essai, l'autre derrière
 *    la médiane, tous tournés vers l'en-but adverse ; ballon PORTÉ par le receveur désigné de l'équipe qui reçoit
 *    (config.kickoffReceivers, défaut : le plus central).
 *  - Remis à zéro : mouvement et état transitoire de tous les joueurs (resetPlayerTransient), projectiles, zones et
 *    mêlée (étape 7), ballon (lanceur, cibles, vol, rotations).
 *  - Conservés : score, chrono, dernière minute, tick, stats, `rng` (aucun tirage), `nextEntityId` (ids uniques).
 * Appelée par createMatch et à la fin de la pause d'essai (étape 2 de step).
 */
export function setupKickoff(state: MatchState, receivingTeam: TeamId, freezeSec: number = KICKOFF_FREEZE_SEC): void {
  const carrierId = placeForKickoff(state, receivingTeam);
  for (const p of state.players) resetPlayerTransient(p);
  state.projectiles = [];
  state.zones = [];
  state.scrum = null;
  const b = state.ball;
  b.throwerId = -1;
  b.spin = 0;
  b.tumble = 0;
  giveBall(state, state.players[carrierId]);
  state.phase = 'kickoff';
  state.phaseTicks = Math.max(1, secToTicks(freezeSec));
  state.kickoffTeam = receivingTeam;
  state.events.push({ type: 'kickoff', team: receivingTeam });
}

/**
 * OUTIL DE TEST / RÉGLAGE : saute le décompte du coup d'envoi (phase 'play' immédiatement, sans événement 'play').
 * Les placements et le ballon ne changent pas. À appeler ENTRE deux `step`. Sans effet hors de 'kickoff'.
 * Renvoie vrai si la phase a changé.
 */
export function startPlayNow(state: MatchState): boolean {
  if (state.phase !== 'kickoff') return false;
  state.phase = 'play';
  state.phaseTicks = 0;
  return true;
}

// ---------------------------------------------------------------------------
// Étape 2 de step : décomptes de phase
// ---------------------------------------------------------------------------

/**
 * Étape 2 de `step` : décomptes de phase.
 *  - 'kickoff' : à 0, phase 'play' et événement 'play' (ce tick est déjà joué : les joueurs bougent).
 *  - 'try' : à 0, remise en jeu (setupKickoff) reçue par `kickoffTeam` (l'équipe qui a encaissé).
 *  - 'play', 'ended' : rien.
 */
export function updatePhase(state: MatchState): void {
  if (state.phase === 'kickoff') {
    if (state.phaseTicks > 0) state.phaseTicks--;
    if (state.phaseTicks === 0) {
      state.phase = 'play';
      state.events.push({ type: 'play' });
    }
  } else if (state.phase === 'try') {
    if (state.phaseTicks > 0) state.phaseTicks--;
    if (state.phaseTicks === 0) setupKickoff(state, state.kickoffTeam);
  }
}

// ---------------------------------------------------------------------------
// Étape 11 de step : essai, chrono, dernière minute, fin
// ---------------------------------------------------------------------------

/** Ballon mort, posé au sol sous sa position (essai aplati, fin du match) : immobile, sans porteur. */
function killBall(state: MatchState, x: number, z: number): void {
  const b = state.ball;
  b.mode = 'dead';
  b.carrierId = -1;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.looseTicks = 0;
  b.pos = { x, y: groundHeight(state.field, x, z) + BALL_RADIUS, z };
  b.vel = { x: 0, y: 0, z: 0 };
  b.spinRate = 0;
  b.tumbleRate = 0;
}

/**
 * Essai : le PORTEUR actif (en course, glissade, esquive, en l'air ou en PLONGEON : peu importe le mouvement) a les
 * pieds dans l'en-but adverse, ligne comprise (équipe 0 : z ≥ +tryLineZ ; équipe 1 : z ≤ −tryLineZ). Couvre aussi
 * un ballon ramassé / attrapé dans l'en-but adverse ce tick (le ramassage de l'étape 9 précède les règles) : essai
 * immédiat. Dans son propre en-but : rien. Effets : score += TRY_POINTS, stats.tries, événement 'try', ballon mort
 * aplati sous les mains du marqueur, projectiles retirés (rien ne touche pendant la pause), phase 'try' pendant
 * secToTicks(TRY_PAUSE_SEC), puis remise en jeu reçue par l'équipe qui a encaissé.
 */
function checkTry(state: MatchState): void {
  const b = state.ball;
  if (b.mode !== 'carried') return;
  const p = state.players[b.carrierId];
  if (p === undefined || p.status !== 'active' || !isInOpponentInGoal(state, p.team, p.pos.z)) return;
  state.score[p.team] += TRY_POINTS;
  p.stats.tries++;
  state.events.push({ type: 'try', team: p.team, scorerId: p.id });
  const hands = carryPosition(p.pos, p.yaw);
  killBall(state, hands.x, hands.z);
  b.throwerId = p.id;
  b.lastTeam = p.team;
  state.projectiles = [];
  state.phase = 'try';
  state.phaseTicks = secToTicks(TRY_PAUSE_SEC);
  state.kickoffTeam = opponentTeam(p.team);
}

/**
 * Fin du match (chrono à 0) : phase 'ended' (définitive), événement 'match_end' avec le score final (égalité
 * possible), ballon mort posé au sol, projectiles retirés, mêlée en cours oubliée (étape 7), vitesses des joueurs remises à 0 (positions conservées :
 * step ne les fait plus évoluer).
 */
function endMatch(state: MatchState): void {
  const b = state.ball;
  killBall(state, b.pos.x, b.pos.z);
  state.projectiles = [];
  state.scrum = null;
  for (const p of state.players) p.vel = { x: 0, y: 0, z: 0 };
  state.phase = 'ended';
  state.phaseTicks = 0;
  state.events.push({ type: 'match_end', score: [state.score[0], state.score[1]] });
}

/**
 * Essai juste après le déplacement (étape 7 de `step`, avant les plaquages de l'étape 8), en phase 'play' seulement :
 * le porteur dont les pieds viennent de franchir la ligne marque, même si sa jauge a été vidée ce tick (projectile de
 * l'étape 6 : il tombe à l'étape 8, essai accordé). Cahier des charges : « franchir la ligne d'en-but adverse avec
 * le ballon = 5 points ». Ensuite, la phase est 'try' : les étapes 8 à 10 du tick continuent (ballon mort).
 */
export function updateTryAfterMovement(state: MatchState): void {
  if (state.phase === 'play') checkTry(state);
}

/**
 * Étape 11 de `step`, seulement pour un tick JOUÉ (`played` : phase 'play' après l'étape 2, même si un essai vient de
 * passer la phase à 'try' à l'étape 7) : essai (ballon ramassé / attrapé dans l'en-but adverse à l'étape 9), puis
 * chrono (sauf entraînement) : dernière minute (`lastMinute` et événement 'last_minute' UNE fois, dès que
 * clockTicks ≤ secToTicks(LAST_MINUTE_SEC) : cooldownTicks et ballSpeedMult en tiennent compte dès le tick suivant),
 * fin du match à 0.
 */
export function updateRules(state: MatchState, played: boolean): void {
  if (!played) return;
  if (state.phase === 'play') checkTry(state);
  if (state.config.training) return;
  if (state.clockTicks > 0) state.clockTicks--;
  if (!state.lastMinute && state.clockTicks <= secToTicks(LAST_MINUTE_SEC)) {
    state.lastMinute = true;
    state.events.push({ type: 'last_minute' });
  }
  if (state.clockTicks === 0) endMatch(state);
}
