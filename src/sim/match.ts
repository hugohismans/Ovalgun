/**
 * Création du match et pas de simulation.
 *
 * `step(state, inputs, dt)` MUTE l'état en place et le renvoie. Ordre des opérations
 * (contrat, docs/ARCHITECTURE.md §2) :
 *
 *   1. events = [], tick++
 *   2. Phase : décompte kickoff -> play ; décompte try -> remise en jeu        (rules.ts)
 *      'ended' : seules les entrées (visée) et lastButtons sont traitées, puis retour (rien d'autre n'avance)
 *   3. Entrées : par joueur (ordre des ids), entrée assainie, fronts montants, yaw/pitch
 *   4. Minuteries : cooldowns… (player.ts) ; statut down/getting_up, rechargement, délai de
 *      régénération (combat.ts) ; durée / cooldown des capacités (abilities.ts)
 *   5. Actions : capacité (abilities.ts : sprint boosté, bouclier, pose de zone), porteur : passe / coup de pied (carrier.ts), tir (combat.ts ; le
 *      porteur du DÉBUT du tick n'utilise pas son arme, même s'il vient de lâcher le ballon)
 *   6. Projectiles : déplacement balayé, collisions, boucliers, dégâts, explosions et knockback
 *      (projectiles.ts, shield.ts, explosion.ts)
 *      — AVANT le déplacement : les capsules sont testées là où le tireur les voyait en tirant ;
 *      puis décompte de l'invulnérabilité (player.ts, tickInvulnerability)
 *   7. Déplacement (player.ts / body.ts ; plongeon du porteur : carrier.ts), puis séparation entre joueurs,
 *      puis essai du porteur qui vient de franchir la ligne (rules.ts : avant les plaquages de l'étape 8)
 *   8. Stabilité : plaquages (lâcher du ballon), régénération                 (stability.ts)
 *   9. Ballon : porteur ou physique (ball.ts), puis ramassage / réception / interception (carrier.ts)
 *  10. Zones de ralentissement : durée de vie (abilities.ts, étape 7) ; mêlée (scrum.ts)
 *  11. Règles (tick joué seulement) : essai, puis chrono, dernière minute, fin (rules.ts)
 *  12. lastButtons = buttons (sauf entrée manquante : pas de faux front montant au tick suivant)
 *
 * Phases figées (kickoff / try / ended) : seule la visée est appliquée aux joueurs.
 */

import { tickAbilityTimers, updateAbilities, updateZones } from './abilities';
import { updateBall } from './ball';
import { separatePlayers } from './body';
import { updateBallPickup, updateCarrierActions } from './carrier';
import { updateShooting, updateStatusTimers } from './combat';
import { BALL_DROP_HEIGHT, BALL_RADIUS, FIRST_KICKOFF_FREEZE_SEC, FIRST_KICKOFF_TEAM, MATCH_DURATION_SEC, ROLES, TICK_DT } from './constants';
import { createField } from './field';
import { updateProjectiles } from './projectiles';
import { readTickInput, type TickInput } from './input';
import { tickInvulnerability, tickPlayerTimers, updatePlayerMovement } from './player';
import { seedToInt } from './prng';
import { isFrozenPhase, setupKickoff, updatePhase, updateRules, updateTryAfterMovement } from './rules';
import { updateScrum } from './scrum';
import { updateStability } from './stability';
import { secToTicks } from './time';
import type { BallState, InputFrame, MatchConfig, MatchState, PlayerState, Role, TeamId } from './types';

const VALID_ROLES: readonly Role[] = ['pilier', 'ailier', 'demi'];

/** Valide la configuration et la normalise (tous les champs renseignés : aucun `undefined` dans l'état). */
export function normalizeConfig(config: MatchConfig): Required<MatchConfig> {
  if (config.teamSize !== 3 && config.teamSize !== 5) {
    throw new Error(`teamSize invalide : ${String(config.teamSize)} (attendu 3 ou 5)`);
  }
  if (!Number.isFinite(config.seed)) throw new Error('seed invalide (nombre fini attendu)');
  for (const team of [0, 1] as const) {
    const roles = config.roles[team];
    if (!Array.isArray(roles) || roles.length !== config.teamSize) {
      throw new Error(`roles[${team}] doit contenir exactement ${config.teamSize} rôles`);
    }
    for (const r of roles) {
      if (!VALID_ROLES.includes(r)) throw new Error(`rôle inconnu : ${String(r)}`);
    }
  }
  const durationSec = config.durationSec ?? MATCH_DURATION_SEC;
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('durationSec invalide');
  const first = config.firstKickoffTeam ?? FIRST_KICKOFF_TEAM;
  if (first !== 0 && first !== 1) throw new Error('firstKickoffTeam invalide');
  const receivers = config.kickoffReceivers ?? [-1, -1];
  for (const r of receivers) {
    if (!Number.isInteger(r) || r < -1 || r >= config.teamSize) throw new Error(`kickoffReceivers invalide : ${String(r)}`);
  }
  return {
    teamSize: config.teamSize,
    seed: config.seed,
    roles: [[...config.roles[0]], [...config.roles[1]]],
    durationSec,
    training: config.training ?? false,
    firstKickoffTeam: first,
    kickoffReceivers: [receivers[0], receivers[1]],
  };
}

/** Joueur neuf (stats, stabilité pleine, chargeur plein, aucun cooldown). Position fixée ensuite par la formation. */
export function createPlayer(id: number, team: TeamId, role: Role): PlayerState {
  const stats = ROLES[role];
  return {
    id,
    team,
    role,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: team === 0 ? 0 : Math.PI,
    pitch: 0,
    onGround: true,
    airTicks: 0,
    airJumpsUsed: 0,
    jumpBufferTicks: 0,
    dodgeBufferTicks: 0,
    move: 'run',
    moveTicks: 0,
    moveDir: { x: 0, y: 0, z: 1 },
    moveSpeed: 0,
    climbTargetY: 0,
    dodgeCd: 0,
    slideCd: 0,
    diveCd: 0,
    invulnTicks: 0,
    stability: stats.stabilityMax,
    regenDelayTicks: 0,
    status: 'active',
    statusTicks: 0,
    lastHitBy: -1,
    fireCd: 0,
    ammo: stats.weapon.magazine,
    reloadTicks: 0,
    abilityCd: 0,
    abilityTicks: 0,
    pickupBlockTicks: 0,
    lastButtons: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    stats: { tries: 0, tackles: 0, passes: 0, interceptions: 0, shotsFired: 0, shotsHit: 0 },
  };
}

function createBall(): BallState {
  return {
    pos: { x: 0, y: BALL_DROP_HEIGHT + BALL_RADIUS, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    mode: 'loose',
    carrierId: -1,
    throwerId: -1,
    passTargetId: -1,
    aimTargetId: -1,
    flightTicks: 0,
    lastTeam: -1,
    looseTicks: 0,
    spin: 0,
    tumble: 0,
    spinRate: 0,
    tumbleRate: 0,
  };
}

/**
 * Crée un match prêt à jouer (étape 6) : phase 'kickoff' de FIRST_KICKOFF_FREEZE_SEC (coup d'envoi reçu par
 * config.firstKickoffTeam, placement
 * et ballon porté : rules.ts, setupKickoff), chrono plein, score nul. L'événement 'kickoff' du coup d'envoi est
 * déjà dans `state.events` (le client le lit avant le premier step ; step vide la liste comme d'habitude).
 * Aucun tirage aléatoire : `rng` vaut la seed normalisée.
 */
export function createMatch(config: MatchConfig): MatchState {
  const cfg = normalizeConfig(config);
  const field = createField(cfg.teamSize);
  const players: PlayerState[] = [];
  for (const team of [0, 1] as const) {
    for (let i = 0; i < cfg.teamSize; i++) {
      players.push(createPlayer(team * cfg.teamSize + i, team, cfg.roles[team][i]));
    }
  }
  const state: MatchState = {
    version: 1,
    config: cfg,
    field,
    tick: 0,
    phase: 'kickoff',
    phaseTicks: 0,
    clockTicks: secToTicks(cfg.durationSec),
    lastMinute: false,
    score: [0, 0],
    kickoffTeam: cfg.firstKickoffTeam,
    players,
    ball: createBall(),
    projectiles: [],
    zones: [],
    scrum: null,
    nextEntityId: 1,
    rng: seedToInt(cfg.seed),
    events: [],
  };
  setupKickoff(state, cfg.firstKickoffTeam, FIRST_KICKOFF_FREEZE_SEC);
  return state;
}

/**
 * Avance la simulation d'un tick (TICK_DT). Mute `state` et le renvoie.
 * `dt` n'existe que pour la forme de l'API : toute autre valeur que TICK_DT est refusée
 * (le déterminisme repose sur un pas fixe).
 */
export function step(state: MatchState, inputs: InputFrame, dt: number = TICK_DT): MatchState {
  if (Math.abs(dt - TICK_DT) > 1e-9) throw new Error(`step : dt doit valoir TICK_DT (${TICK_DT}), reçu ${dt}`);

  // 1.
  state.events = [];
  state.tick++;
  // 2.
  updatePhase(state);
  const frozen = isFrozenPhase(state);
  const played = state.phase === 'play'; // tick joué (chrono), même si un essai passe la phase à 'try' en cours de tick
  // 3. (state.players est rangé par id croissant : index = id)
  const tickInputs: TickInput[] = state.players.map((p) => readTickInput(p, inputs));
  if (state.phase === 'ended') {
    // Match terminé : seule la visée suit les entrées (et lastButtons, étape 12) ; rien d'autre n'avance.
    storeLastButtons(state, tickInputs);
    return state;
  }
  // 4.
  for (const p of state.players) tickPlayerTimers(p);
  updateStatusTimers(state);
  tickAbilityTimers(state);
  // 5.
  if (!frozen) {
    const carrierAtStart = state.ball.mode === 'carried' ? state.ball.carrierId : -1;
    updateAbilities(state, tickInputs);
    updateCarrierActions(state, tickInputs);
    updateShooting(state, tickInputs, carrierAtStart);
  }
  // 6. (avant le déplacement : positions du début du tick, celles que le tireur voyait)
  updateProjectiles(state);
  tickInvulnerability(state); // après les projectiles : ils voient l'invulnérabilité du tick précédent
  // 7.
  for (const p of state.players) updatePlayerMovement(state, p, tickInputs[p.id], frozen);
  separatePlayers(state);
  updateTryAfterMovement(state); // porteur qui vient de franchir la ligne : essai AVANT les plaquages de l'étape 8
  // 8.
  updateStability(state);
  // 9. (position et mode du ballon avant sa physique : réception balayée sur le segment parcouru)
  const ballFrom = { x: state.ball.pos.x, y: state.ball.pos.y, z: state.ball.pos.z };
  const ballFromMode = state.ball.mode;
  updateBall(state);
  updateBallPickup(state, ballFrom, ballFromMode);
  // 10.
  updateZones(state);
  updateScrum(state);
  // 11.
  updateRules(state, played);
  // 12.
  storeLastButtons(state, tickInputs);
  return state;
}

/** Étape 12 de `step` : boutons maintenus mémorisés (sauf entrée manquante : pas de faux front montant au tick suivant). */
function storeLastButtons(state: MatchState, tickInputs: readonly TickInput[]): void {
  for (const p of state.players) {
    const ti = tickInputs[p.id];
    if (ti.present) p.lastButtons = ti.buttons;
  }
}
