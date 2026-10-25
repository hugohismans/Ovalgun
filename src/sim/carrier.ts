/**
 * Le porteur du ballon (étape 4) : passe arrière assistée, coup de pied, plongeon, ramassage du ballon
 * libre, réception / interception en vol. Outils de test (debugGiveBall / debugResetBall).
 *
 * Appels depuis `step` (docs/ARCHITECTURE.md §2) :
 *   - étape 5 : updateCarrierActions (PASS puis KICK, fronts montants) ;
 *   - étape 6 : tryStartDive (SLIDE pressé par le porteur), updateDiveMovement ('dive' / 'dive_recover') ;
 *   - étape 9 : updateBallPickup, après la physique du ballon.
 *
 * Fonctions PURES exportées pour le rendu / les bots (aucune mutation) : selectPassTarget (cible de la
 * passe assistée, appelée à chaque frame par le rendu), canCarrierAct, planPass, kickLaunch, predictBallLanding.
 */

import { carryPosition } from './ball';
import {
  BALL_AIR_DRAG,
  BALL_CARRY_HEIGHT,
  BALL_CATCH_RADIUS,
  BALL_CATCH_REACH_ABOVE,
  BALL_DROP_HEIGHT,
  BALL_GRAVITY,
  BALL_KICK_TUMBLE_RATE,
  BALL_PASS_SPIN_RATE,
  BALL_PICKUP_RADIUS,
  BALL_RADIUS,
  BALL_REACH_BELOW,
  DIVE_COOLDOWN_SEC,
  DIVE_DURATION_SEC,
  DIVE_IN_AIR,
  DIVE_INPUT_MIN_FORWARD_COS,
  DIVE_INVULN_SEC,
  DIVE_RECOVER_DECEL,
  DIVE_RECOVER_SEC,
  DIVE_SPEED,
  KICK_CHARGE_DOWN_RADIUS,
  KICK_CHARGE_DOWN_SEC,
  KICK_ELEVATION_DEG,
  KICK_ELEVATION_MAX_DEG,
  KICK_ELEVATION_MIN_DEG,
  KICK_INHERIT_VELOCITY,
  KICK_PICKUP_BLOCK_SEC,
  KICK_PITCH_INFLUENCE,
  KICK_SPEED,
  KICK_START_FORWARD,
  KICK_START_HEIGHT,
  LAST_MINUTE_BALL_SPEED_MULT,
  PASS_AIM_LATERAL_GAIN,
  PASS_CONE_HALF_ANGLE_DEG,
  PASS_IDEAL_RANGE,
  PASS_INTERCEPT_RADIUS,
  PASS_LEAD,
  PASS_LEAD_MAX_SPEED,
  PASS_MAX_FLIGHT_SEC,
  PASS_MAX_RANGE,
  PASS_MIN_FLIGHT_SEC,
  PASS_OPENNESS_RADIUS,
  PASS_PICKUP_BLOCK_SEC,
  PASS_RELEASE_OFFSET,
  PASS_SPEED,
  PASS_TARGET_CATCH_RADIUS,
  PASS_TARGET_HEIGHT,
  PASS_TARGET_STICKY_BONUS,
  PASS_WEIGHT_AIM,
  PASS_WEIGHT_DISTANCE,
  PASS_WEIGHT_OPENNESS,
  PLAYER_RADIUS,
  TICK_DT,
} from './constants';
import { groundHeight, supportHeight } from './field';
import { has, type TickInput } from './input';
import { cooldownTicks, playerHeight } from './playerStatus';
import { secToTicks } from './time';
import { Buttons, type BallMode, type FieldLayout, type MatchState, type PlayerState, type TeamId, type Vec3 } from './types';
import { clamp, forward } from './vec';

const DEG = Math.PI / 180;
/** cos du demi-angle du cône de passe, avec une tolérance numérique (une passe exactement à plat est permise à 90°). */
const PASS_CONE_COS = Math.cos(PASS_CONE_HALF_ANGLE_DEG * DEG) - 1e-9;
/** Tolérance numérique des tests géométriques (m², pas une valeur de gameplay). */
const EPS = 1e-12;
/** Pas d'intégration (s) de la prédiction du point de chute (rendu seulement, pas une valeur de gameplay). */
const PREDICT_DT = 1 / 120;
/** Durée maximale simulée par la prédiction du point de chute (s). */
const PREDICT_MAX_SEC = 6;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Multiplicateur de vitesse du ballon (passes, coups de pied) : LAST_MINUTE_BALL_SPEED_MULT en dernière minute. */
export const ballSpeedMult = (state: MatchState): number => (state.lastMinute ? LAST_MINUTE_BALL_SPEED_MULT : 1);

/** Sens « vers son propre en-but » sur l'axe Z : l'équipe 0 attaque vers +Z, donc recule vers −Z. */
export const backwardZ = (team: TeamId): -1 | 1 => (team === 0 ? -1 : 1);

/**
 * Le porteur peut-il agir (passe / coup de pied) ? Actif, et pas en plongeon ni au sol après un plongeon.
 * PURE, exportée : le rendu masque les indicateurs de passe quand l'appui serait ignoré.
 */
export const canCarrierAct = (p: PlayerState): boolean => p.status === 'active' && p.move !== 'dive' && p.move !== 'dive_recover';

/** Facteur de déplacement horizontal sous traînée linéaire : Δ = v0 · dragFactor(t) (= t sans traînée). */
const dragFactor = (t: number): number => (BALL_AIR_DRAG < 1e-9 ? t : (1 - Math.exp(-BALL_AIR_DRAG * t)) / BALL_AIR_DRAG);

// ---------------------------------------------------------------------------
// Passe : sélection du receveur (PURE, appelée aussi par le rendu à chaque frame)
// ---------------------------------------------------------------------------

/** Résultat de la visée assistée. Les sous-notes sont dans [0, 1]. */
export interface PassTarget {
  targetId: number;
  /** Note totale (PASS_WEIGHT_AIM·aim + PASS_WEIGHT_DISTANCE·distance + PASS_WEIGHT_OPENNESS·openness, + bonus d'hystérésis). */
  score: number;
  aim: number;
  distance: number;
  openness: number;
  /** Distance horizontale porteur–receveur (m). */
  range: number;
}

/**
 * Direction de visée de la passe (horizontale, unitaire) : le regard « replié » dans le demi-plan arrière
 * du TERRAIN. On garde la composante latérale (X) du regard, multipliée par PASS_AIM_LATERAL_GAIN, et on
 * remplace sa composante sur l'axe du terrain (Z) par sa valeur absolue orientée vers son propre en-but.
 * Regarder à gauche (de son propre point de vue) => viser à gauche, quelle que soit l'équipe ; regarder droit
 * devant => viser droit derrière ; regarder vers son en-but => idem que regarder devant (miroir).
 */
export function passAimDirection(team: TeamId, yaw: number): { x: number; z: number } {
  const f = forward(yaw);
  const x = f.x * PASS_AIM_LATERAL_GAIN;
  const z = Math.abs(f.z) * backwardZ(team);
  const l = Math.sqrt(x * x + z * z);
  return l > 1e-9 ? { x: x / l, z: z / l } : { x: 0, z: backwardZ(team) };
}

/**
 * Menace d'un adversaire en (px, pz) sur une passe de A = (ax, az) vers B = (bx, bz), dans [0, 1] :
 * 1 − d / PASS_OPENNESS_RADIUS (≥ 0), d = distance au segment [A, B] (receveur compris). Un adversaire
 * DERRIÈRE le passeur par rapport à la direction de la passe (projection < 0) ne menace pas : le ballon
 * s'éloigne de lui (un plaqueur au contact du porteur ne rend pas toutes les passes « marquées »).
 */
function passThreat(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const proj = l2 > EPS ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  if (proj < 0) return 0;
  const t = Math.min(proj, 1);
  const cx = ax + dx * t - px;
  const cz = az + dz * t - pz;
  return clamp(1 - Math.sqrt(cx * cx + cz * cz) / PASS_OPENNESS_RADIUS, 0, 1);
}

/** Note de distance : 0 au contact, 1 à PASS_IDEAL_RANGE, 0 à PASS_MAX_RANGE (linéaire par morceaux). */
function distanceScore(d: number): number {
  if (d <= PASS_IDEAL_RANGE) return PASS_IDEAL_RANGE > 0 ? d / PASS_IDEAL_RANGE : 1;
  const span = PASS_MAX_RANGE - PASS_IDEAL_RANGE;
  return span > 0 ? clamp(1 - (d - PASS_IDEAL_RANGE) / span, 0, 1) : 0;
}

/**
 * Visée assistée de la passe (PURE) : le coéquipier qui recevrait une passe du porteur `carrierId` s'il
 * regardait selon `yaw`, ou null si aucun n'est valide.
 *  - Candidats : coéquipiers actifs dans le cône arrière RELATIF AU TERRAIN (vers son propre en-but,
 *    demi-angle PASS_CONE_HALF_ANGLE_DEG ; une passe à plat est permise à 90°), à au plus PASS_MAX_RANGE.
 *  - Note : PASS_WEIGHT_AIM × aim + PASS_WEIGHT_DISTANCE × distance + PASS_WEIGHT_OPENNESS × openness
 *      aim      = (1 + cos(angle entre passAimDirection et la direction du coéquipier)) / 2 ;
 *      distance = distanceScore (pic à PASS_IDEAL_RANGE) ;
 *      openness = Π (1 − menace) sur les adversaires actifs (passThreat : proche du segment porteur–receveur
 *                 ou du receveur, et pas derrière le passeur) : une menace commune n'efface pas les autres ;
 *    + PASS_TARGET_STICKY_BONUS pour le receveur retenu au tick précédent (ball.aimTargetId, hystérésis).
 *  - Égalité : le plus petit id.
 */
export function selectPassTarget(state: MatchState, carrierId: number, yaw: number): PassTarget | null {
  const c = state.players[carrierId];
  if (c === undefined) return null;
  const aimDir = passAimDirection(c.team, yaw);
  const bz = backwardZ(c.team);
  const b = state.ball;
  const sticky = b.mode === 'carried' && b.carrierId === c.id ? b.aimTargetId : -1;
  let best: PassTarget | null = null;
  for (const m of state.players) {
    if (m.id === c.id || m.team !== c.team || m.status !== 'active') continue;
    const dx = m.pos.x - c.pos.x;
    const dz = m.pos.z - c.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > PASS_MAX_RANGE || d < 1e-6) continue;
    if ((dz * bz) / d < PASS_CONE_COS) continue; // hors du cône arrière (vers l'avant)
    const aim = (1 + (dx * aimDir.x + dz * aimDir.z) / d) / 2;
    const distance = distanceScore(d);
    let openness = 1;
    for (const o of state.players) {
      if (o.team === c.team || o.status !== 'active') continue;
      openness *= 1 - passThreat(o.pos.x, o.pos.z, c.pos.x, c.pos.z, m.pos.x, m.pos.z);
    }
    const score =
      PASS_WEIGHT_AIM * aim +
      PASS_WEIGHT_DISTANCE * distance +
      PASS_WEIGHT_OPENNESS * openness +
      (m.id === sticky ? PASS_TARGET_STICKY_BONUS : 0);
    if (best === null || score > best.score) best = { targetId: m.id, score, aim, distance, openness, range: d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Trajectoires (PURES)
// ---------------------------------------------------------------------------

/**
 * Vitesse initiale qui amène le ballon de `from` à `to` en exactement `t` secondes sous la gravité
 * BALL_GRAVITY et la traînée linéaire BALL_AIR_DRAG de ball.ts (dv/dt = −k·v − g·ŷ, solution exacte) :
 *   horizontal : Δ = v0 · (1 − e^(−kt)) / k
 *   vertical   : Δy = (v0y + g/k) · (1 − e^(−kt)) / k − g·t / k
 * (L'intégrateur de ball.ts suit cette solution à quelques millimètres près sur une passe.)
 */
export function ballisticVelocity(from: Vec3, to: Vec3, t: number): Vec3 {
  const k = BALL_AIR_DRAG;
  const g = BALL_GRAVITY;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  if (k < 1e-9) return { x: dx / t, y: dy / t + 0.5 * g * t, z: dz / t };
  const f = dragFactor(t);
  return { x: dx / f, y: (dy + (g * t) / k) / f - g / k, z: dz / f };
}

/** Plan d'une passe : départ, point de réception visé, vitesse initiale, durée de vol (s). */
export interface PassPlan {
  from: Vec3;
  to: Vec3;
  vel: Vec3;
  flightSec: number;
}

/**
 * Plan de la passe du porteur `carrierId` vers `targetId` (PURE) :
 *  - départ : poitrine du porteur (BALL_CARRY_HEIGHT), PASS_RELEASE_OFFSET vers le receveur ;
 *  - durée de vol T telle que la vitesse horizontale moyenne vaille PASS_SPEED (× dernière minute) jusqu'à la
 *    position ANTICIPÉE du receveur, pos + PASS_LEAD · V · T (racine positive d'un trinôme), bornée à
 *    [PASS_MIN_FLIGHT_SEC, PASS_MAX_FLIGHT_SEC] ; V = vitesse horizontale du receveur plafonnée à
 *    PASS_LEAD_MAX_SPEED (une esquive au départ de la passe ne l'envoie pas 20 m trop loin) ;
 *  - JAMAIS EN AVANT : la vitesse du ballon vers l'en-but adverse ne dépasse pas celle du porteur (0 s'il
 *    est arrêté ou recule) — passe « à plat » permise en course, comme au rugby. Sinon le point visé est
 *    ramené sur cette limite (un receveur qui sprinte devant le passeur ne reçoit pas une passe en avant) ;
 *  - point visé : position anticipée, à PASS_TARGET_HEIGHT au-dessus du sol (supportHeight) ;
 *  - vitesse initiale exacte (ballisticVelocity) : le ballon y arrive pile au bout de T.
 */
export function planPass(state: MatchState, carrierId: number, targetId: number): PassPlan | null {
  const c = state.players[carrierId];
  const r = state.players[targetId];
  if (c === undefined || r === undefined) return null;
  const rx = r.pos.x - c.pos.x;
  const rz = r.pos.z - c.pos.z;
  const rl = Math.sqrt(rx * rx + rz * rz);
  const off = rl > 1e-9 ? Math.min(PASS_RELEASE_OFFSET, rl) / rl : 0;
  const from = { x: c.pos.x + rx * off, y: c.pos.y + BALL_CARRY_HEIGHT, z: c.pos.z + rz * off };
  const s = PASS_SPEED * ballSpeedMult(state);
  const dx = r.pos.x - from.x;
  const dz = r.pos.z - from.z;
  const rs = Math.sqrt(r.vel.x * r.vel.x + r.vel.z * r.vel.z);
  const cap = rs > PASS_LEAD_MAX_SPEED ? PASS_LEAD_MAX_SPEED / rs : 1;
  const vx = r.vel.x * cap * PASS_LEAD;
  const vz = r.vel.z * cap * PASS_LEAD;
  // |D + V·T| = s·T  <=>  (|V|² − s²)·T² + 2(D·V)·T + |D|² = 0.
  const a = vx * vx + vz * vz - s * s;
  const b = 2 * (dx * vx + dz * vz);
  const cc = dx * dx + dz * dz;
  let t = PASS_MAX_FLIGHT_SEC;
  if (a < -EPS) t = (-b - Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a);
  t = clamp(t, PASS_MIN_FLIGHT_SEC, PASS_MAX_FLIGHT_SEC);
  const tx = r.pos.x + vx * t;
  let tz = r.pos.z + vz * t;
  // Jamais en avant (sens −bz = vers l'en-but adverse) plus vite que le porteur ne court vers l'avant.
  const bz = backwardZ(c.team);
  const maxForward = Math.max(0, -c.vel.z * bz) * dragFactor(t);
  if ((from.z - tz) * bz > maxForward) tz = from.z - bz * maxForward;
  const to = { x: tx, y: supportHeight(state.field, tx, tz, PLAYER_RADIUS) + PASS_TARGET_HEIGHT, z: tz };
  return { from, to, vel: ballisticVelocity(from, to, t), flightSec: t };
}

/**
 * Lancement d'un coup de pied (PURE) : depuis le pied (KICK_START_FORWARD devant, KICK_START_HEIGHT au-dessus
 * du sol), selon `yaw`, élévation KICK_ELEVATION_DEG + pitch × KICK_PITCH_INFLUENCE bornée à
 * [KICK_ELEVATION_MIN_DEG, KICK_ELEVATION_MAX_DEG], vitesse KICK_SPEED × √(field.scale) (portée ∝ v² : adaptée
 * à la taille du terrain, 3v3 compris) × dernière minute, plus KICK_INHERIT_VELOCITY × la vitesse horizontale du tireur.
 */
export function kickLaunch(state: MatchState, carrierId: number, yaw: number, pitch: number): { pos: Vec3; vel: Vec3 } | null {
  const c = state.players[carrierId];
  if (c === undefined) return null;
  const f = forward(yaw);
  const elev = clamp(KICK_ELEVATION_DEG + (pitch / DEG) * KICK_PITCH_INFLUENCE, KICK_ELEVATION_MIN_DEG, KICK_ELEVATION_MAX_DEG) * DEG;
  const speed = KICK_SPEED * Math.sqrt(state.field.scale) * ballSpeedMult(state);
  const h = Math.cos(elev) * speed;
  const px = c.pos.x + f.x * KICK_START_FORWARD;
  const pz = c.pos.z + f.z * KICK_START_FORWARD;
  const py = Math.max(c.pos.y + KICK_START_HEIGHT, groundHeight(state.field, px, pz) + BALL_RADIUS);
  return {
    pos: { x: px, y: py, z: pz },
    vel: {
      x: f.x * h + c.vel.x * KICK_INHERIT_VELOCITY,
      y: Math.sin(elev) * speed,
      z: f.z * h + c.vel.z * KICK_INHERIT_VELOCITY,
    },
  };
}

/**
 * Point de chute prévu d'un ballon lancé de `pos` à `vel` (PURE, pour l'affichage) : premier contact avec le
 * relief (groundHeight), gravité et traînée exactes ; murets et murs ignorés (indication, pas une promesse).
 */
export function predictBallLanding(field: FieldLayout, pos: Vec3, vel: Vec3): Vec3 {
  const k = BALL_AIR_DRAG;
  const g = BALL_GRAVITY;
  let px = pos.x;
  let pz = pos.z;
  for (let t = PREDICT_DT; t <= PREDICT_MAX_SEC; t += PREDICT_DT) {
    const f = k < 1e-9 ? t : (1 - Math.exp(-k * t)) / k;
    const x = pos.x + vel.x * f;
    const z = pos.z + vel.z * f;
    const y = k < 1e-9 ? pos.y + vel.y * t - 0.5 * g * t * t : pos.y + (vel.y + g / k) * f - (g * t) / k;
    const gy = groundHeight(field, x, z);
    if (y - BALL_RADIUS <= gy) return { x, y: gy, z };
    px = x;
    pz = z;
  }
  return { x: px, y: groundHeight(field, px, pz), z: pz };
}

// ---------------------------------------------------------------------------
// Actions du porteur (étape 5 de step)
// ---------------------------------------------------------------------------

/**
 * Passe vers `target` (la visée assistée de ce tick) : renvoie vrai si la passe est partie ; sinon
 * 'pass_denied' et le porteur garde le ballon.
 */
function tryPass(state: MatchState, c: PlayerState, target: PassTarget | null): boolean {
  const plan = target === null ? null : planPass(state, c.id, target.targetId);
  if (target === null || plan === null) {
    state.events.push({ type: 'pass_denied', playerId: c.id });
    return false;
  }
  const b = state.ball;
  b.mode = 'pass';
  b.carrierId = -1;
  b.throwerId = c.id;
  b.passTargetId = target.targetId;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.lastTeam = c.team;
  b.pos = plan.from;
  b.vel = plan.vel;
  b.spinRate = BALL_PASS_SPIN_RATE;
  b.tumbleRate = 0;
  b.tumble = 0;
  c.pickupBlockTicks = secToTicks(PASS_PICKUP_BLOCK_SEC);
  state.events.push({ type: 'pass', fromId: c.id, toId: target.targetId });
  return true;
}

/** Coup de pied : le ballon part devant, personne ne le porte (« tout le monde court »). */
function kick(state: MatchState, c: PlayerState): void {
  const launch = kickLaunch(state, c.id, c.yaw, c.pitch);
  if (launch === null) return;
  const b = state.ball;
  b.mode = 'kick';
  b.carrierId = -1;
  b.throwerId = c.id;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.lastTeam = c.team;
  b.pos = launch.pos;
  b.vel = launch.vel;
  b.spinRate = 0;
  b.tumbleRate = BALL_KICK_TUMBLE_RATE;
  c.pickupBlockTicks = secToTicks(KICK_PICKUP_BLOCK_SEC);
  state.events.push({ type: 'kick', playerId: c.id });
}

/**
 * Étape 5 de `step` : actions du porteur sur front montant. PASS est prioritaire : si la passe part, un KICK
 * pressé au même tick est ignoré ; si elle est refusée (aucun receveur), le KICK s'applique.
 * Ni passe ni coup de pied pendant un plongeon ou la récupération au sol (l'appui est ignoré).
 * Autorisés en course, en l'air, en esquive, en glissade et pendant une grimpe.
 * À chaque tick où il peut agir, la cible de la visée assistée est mémorisée dans ball.aimTargetId
 * (hystérésis de selectPassTarget, lue aussi par le rendu) ; la passe part vers CETTE cible.
 */
export function updateCarrierActions(state: MatchState, inputs: readonly TickInput[]): void {
  const b = state.ball;
  if (b.mode !== 'carried') return;
  const c = state.players[b.carrierId];
  const inp = inputs[b.carrierId];
  if (c === undefined || inp === undefined || !canCarrierAct(c)) return;
  const target = selectPassTarget(state, c.id, c.yaw);
  b.aimTargetId = target?.targetId ?? -1;
  if (has(inp.pressed, Buttons.PASS) && tryPass(state, c, target)) return;
  if (has(inp.pressed, Buttons.KICK)) kick(state, c);
}

// ---------------------------------------------------------------------------
// Plongeon (étape 6 de step, appelé par player.ts)
// ---------------------------------------------------------------------------

/**
 * Plongeon du PORTEUR (SLIDE pressé ; pour les autres joueurs, SLIDE = glissade).
 *  - Possible depuis la course, la glissade (un porteur qui a reçu le ballon en glissant peut enchaîner) et
 *    l'esquive (le plongeon l'interrompt) ; en l'air seulement si DIVE_IN_AIR. Jamais pendant une grimpe.
 *  - Direction : l'entrée de déplacement si elle pointe vers l'avant (cos avec le regard ≥
 *    DIVE_INPUT_MIN_FORWARD_COS : on peut plonger en diagonale vers l'en-but), sinon droit devant (le regard).
 *  - Dash DIVE_SPEED pendant DIVE_DURATION_SEC, invulnérable DIVE_INVULN_SEC dès ce tick, hitbox basse,
 *    cooldown DIVE_COOLDOWN_SEC (× dernière minute) ; événement 'dive'. Le porteur garde le ballon.
 */
export function tryStartDive(state: MatchState, p: PlayerState, wishDir: Vec3): boolean {
  if (p.diveCd > 0 || p.status !== 'active') return false;
  if (p.move !== 'run' && p.move !== 'slide' && p.move !== 'dodge') return false;
  if (!p.onGround && !DIVE_IN_AIR) return false;
  const f = forward(p.yaw);
  const useWish = (wishDir.x !== 0 || wishDir.z !== 0) && wishDir.x * f.x + wishDir.z * f.z >= DIVE_INPUT_MIN_FORWARD_COS;
  const dir = useWish ? wishDir : f;
  p.move = 'dive';
  p.moveTicks = secToTicks(DIVE_DURATION_SEC);
  p.moveDir = { x: dir.x, y: 0, z: dir.z };
  p.vel.x = dir.x * DIVE_SPEED;
  p.vel.z = dir.z * DIVE_SPEED;
  p.diveCd = cooldownTicks(state, DIVE_COOLDOWN_SEC);
  p.invulnTicks = Math.max(p.invulnTicks, secToTicks(DIVE_INVULN_SEC));
  state.events.push({ type: 'dive', playerId: p.id });
  return true;
}

/**
 * Vitesse horizontale pendant 'dive' / 'dive_recover'. Renvoie vrai si le joueur est toujours en plongeon
 * (sinon le déplacement applique la course ce tick-là).
 *  - 'dive' : DIVE_SPEED selon moveDir pendant moveTicks ticks (aucun braquage), puis 'dive_recover'.
 *  - 'dive_recover' : au sol, freinage DIVE_RECOVER_DECEL pendant DIVE_RECOVER_SEC (on finit lent), puis
 *    retour en course ; en l'air (plongeon aérien), le minuteur attend l'atterrissage, sans contrôle.
 */
export function updateDiveMovement(_state: MatchState, p: PlayerState): boolean {
  if (p.move === 'dive') {
    if (p.moveTicks > 0) {
      p.vel.x = p.moveDir.x * DIVE_SPEED;
      p.vel.z = p.moveDir.z * DIVE_SPEED;
      p.moveTicks--;
      return true;
    }
    p.move = 'dive_recover';
    p.moveTicks = secToTicks(DIVE_RECOVER_SEC);
  }
  if (p.move !== 'dive_recover') return false;
  if (!p.onGround) return true; // plongeon aérien : on garde l'élan jusqu'au sol
  if (p.moveTicks > 0) {
    const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    const ns = Math.max(0, sp - DIVE_RECOVER_DECEL * TICK_DT);
    if (sp > 1e-9) {
      // `+ 0` : un freinage jusqu'à l'arrêt donnerait −0 sur une composante négative (MatchState sans −0).
      p.vel.x = p.vel.x * (ns / sp) + 0;
      p.vel.z = p.vel.z * (ns / sp) + 0;
    } else {
      p.vel.x = 0;
      p.vel.z = 0;
    }
    p.moveTicks--;
    return true;
  }
  p.move = 'run';
  p.moveTicks = 0;
  return false;
}

// ---------------------------------------------------------------------------
// Ramassage, réception, interception (étape 9 de step)
// ---------------------------------------------------------------------------

/** Le joueur peut-il prendre le ballon ? Actif (ni au sol, ni en train de se relever) et non bloqué. */
const canTakeBall = (p: PlayerState): boolean => p.status === 'active' && p.pickupBlockTicks === 0;

/** Bornes de hauteur (centre du ballon) atteignables par un joueur : des pieds − BALL_REACH_BELOW au-dessus de la tête + BALL_CATCH_REACH_ABOVE. */
function reach(p: PlayerState): { lo: number; hi: number } {
  return { lo: p.pos.y - BALL_REACH_BELOW, hi: p.pos.y + playerHeight(p) + BALL_CATCH_REACH_ABOVE };
}

/** Donne le ballon à `p` (ramassage, réception, remise en jeu, outils de test) : il le porte immédiatement. */
export function giveBall(state: MatchState, p: PlayerState): void {
  const b = state.ball;
  b.mode = 'carried';
  b.carrierId = p.id;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.lastTeam = p.team;
  b.looseTicks = 0;
  b.pos = carryPosition(p.pos, p.yaw);
  b.vel = { x: p.vel.x, y: p.vel.y, z: p.vel.z };
  b.spinRate = 0;
  b.tumbleRate = 0;
}

/**
 * Premier instant t ∈ [0, 1] du segment [from, to] du ballon où il est dans le cylindre de réception du
 * joueur (rayon `radius` autour de son axe, hauteurs atteignables), ou −1. Exact pour un segment
 * (trinôme horizontal ∩ intervalle vertical) : aucun « tunnel », même à 0,9 m par tick.
 */
function sweepEntry(p: PlayerState, from: Vec3, to: Vec3, radius: number): number {
  const ax = from.x - p.pos.x;
  const az = from.z - p.pos.z;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (ax * dx + az * dz);
  const c = ax * ax + az * az - radius * radius;
  let t0: number;
  let t1: number;
  if (a < EPS) {
    if (c > 0) return -1;
    t0 = 0;
    t1 = 1;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    t0 = Math.max(0, (-b - sq) / (2 * a));
    t1 = Math.min(1, (-b + sq) / (2 * a));
    if (t0 > t1) return -1;
  }
  const { lo, hi } = reach(p);
  const dy = to.y - from.y;
  if (Math.abs(dy) < EPS) {
    if (from.y < lo || from.y > hi) return -1;
  } else {
    const ta = (lo - from.y) / dy;
    const tb = (hi - from.y) / dy;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return -1;
  }
  return t0;
}

/**
 * Rayon de réception de `p` pour le ballon en vol (mode `fromMode` au début du tick), ou −1 s'il ne peut pas
 * l'attraper ce tick-ci :
 *  - passe : le receveur visé (passTargetId) à PASS_TARGET_CATCH_RADIUS, un adversaire du passeur à
 *    PASS_INTERCEPT_RADIUS ; les autres coéquipiers du passeur jamais (un soutien collé ne vole pas la passe) ;
 *  - coup de pied : pendant les secToTicks(KICK_CHARGE_DOWN_SEC) premiers ticks de vol, seul un adversaire à moins
 *    de KICK_CHARGE_DOWN_RADIUS du tireur (contre) ; ensuite tout le monde à BALL_CATCH_RADIUS ;
 *  - lanceur inconnu (état forgé, outil de test) : tout le monde à BALL_CATCH_RADIUS.
 */
function catchRadius(state: MatchState, p: PlayerState, fromMode: BallMode, thrower: PlayerState | undefined): number {
  if (!canTakeBall(p)) return -1;
  if (thrower === undefined) return BALL_CATCH_RADIUS;
  const b = state.ball;
  if (fromMode === 'pass') {
    if (p.id === b.passTargetId) return PASS_TARGET_CATCH_RADIUS;
    return p.team !== thrower.team ? PASS_INTERCEPT_RADIUS : -1;
  }
  if (b.flightTicks <= secToTicks(KICK_CHARGE_DOWN_SEC)) {
    if (p.team === thrower.team) return -1;
    const dx = p.pos.x - thrower.pos.x;
    const dz = p.pos.z - thrower.pos.z;
    return dx * dx + dz * dz <= KICK_CHARGE_DOWN_RADIUS * KICK_CHARGE_DOWN_RADIUS ? BALL_CATCH_RADIUS : -1;
  }
  return BALL_CATCH_RADIUS;
}

/**
 * Réception / interception en vol ('pass' ou 'kick' au début du tick) : test balayé sur le segment parcouru
 * par le ballon pendant le tick, contre le cylindre de chaque joueur qui peut l'attraper (catchRadius) ;
 * le premier sur la trajectoire l'emporte (plus petit t, puis distance horizontale au point d'entrée, puis id).
 * `intercepted` (événement, stats) : PASSE attrapée par un adversaire du passeur. Un coup de pied réceptionné
 * par l'adversaire est un jeu normal (pas une interception). Renvoie vrai si quelqu'un a attrapé le ballon.
 */
function catchInFlight(state: MatchState, from: Vec3, fromMode: BallMode): boolean {
  const b = state.ball;
  const to = b.pos;
  const thrower = state.players[b.throwerId];
  let best: PlayerState | null = null;
  let bestT = 2;
  let bestD = 0;
  for (const p of state.players) {
    const radius = catchRadius(state, p, fromMode, thrower);
    if (radius < 0) continue;
    const t = sweepEntry(p, from, to, radius);
    if (t < 0) continue;
    const ex = from.x + (to.x - from.x) * t - p.pos.x;
    const ez = from.z + (to.z - from.z) * t - p.pos.z;
    const d = Math.sqrt(ex * ex + ez * ez);
    if (best === null || t < bestT - 1e-12 || (Math.abs(t - bestT) <= 1e-12 && d < bestD - 1e-12)) {
      best = p;
      bestT = t;
      bestD = d;
    }
  }
  if (best === null) return false;
  const intercepted = fromMode === 'pass' && thrower !== undefined && thrower.team !== best.team;
  if (intercepted) best.stats.interceptions++;
  else if (fromMode === 'pass' && thrower !== undefined && thrower.id !== best.id) thrower.stats.passes++;
  // Le ballon est pris au point d'entrée sur la trajectoire (puis replacé dans les mains par giveBall).
  giveBall(state, best);
  state.events.push({ type: 'catch', playerId: best.id, fromId: b.throwerId, intercepted });
  return true;
}

/**
 * Ballon libre : « un cercle au sol, le premier joueur qui entre dedans le prend ». Candidats : joueurs qui
 * peuvent prendre le ballon, à au plus BALL_PICKUP_RADIUS (horizontal, de leur axe au centre du ballon), ballon
 * à hauteur atteignable (on peut sauter pour attraper un rebond haut). Plusieurs au même tick : le plus proche,
 * égalité => le plus petit id.
 */
function pickupLoose(state: MatchState): void {
  const b = state.ball;
  let best: PlayerState | null = null;
  let bestD2 = 0;
  const r2 = BALL_PICKUP_RADIUS * BALL_PICKUP_RADIUS;
  for (const p of state.players) {
    if (!canTakeBall(p)) continue;
    const dx = b.pos.x - p.pos.x;
    const dz = b.pos.z - p.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const { lo, hi } = reach(p);
    if (b.pos.y < lo || b.pos.y > hi) continue;
    if (best === null || d2 < bestD2) {
      best = p;
      bestD2 = d2;
    }
  }
  if (best === null) return;
  giveBall(state, best);
  state.events.push({ type: 'pickup', playerId: best.id });
}

/**
 * Étape 9 de `step`, après la physique du ballon : `from` / `fromMode` = position et mode du ballon AVANT
 * la physique de ce tick (après les actions du porteur). Un ballon en vol ('pass' / 'kick') au début du tick
 * peut être attrapé sur tout le segment parcouru, même s'il a touché le sol pendant le tick ; s'il n'a pas
 * été attrapé et qu'il est devenu libre, la règle du cercle s'applique aussitôt.
 */
export function updateBallPickup(state: MatchState, from: Vec3, fromMode: BallMode): void {
  const b = state.ball;
  const inFlight = fromMode === 'pass' || fromMode === 'kick';
  if (inFlight) b.flightTicks++; // ticks de vol, segment de ce tick compris
  if (inFlight && catchInFlight(state, from, fromMode)) return;
  if (b.mode !== 'pass' && b.mode !== 'kick') b.flightTicks = 0;
  if (b.mode === 'loose') pickupLoose(state);
}

// ---------------------------------------------------------------------------
// Outils de test / réglage (mode ?debug et entraînement uniquement côté client)
// ---------------------------------------------------------------------------

/**
 * Les outils de test agissent-ils dans cette phase ? `debugGiveBall` : en jeu et pendant le coup d'envoi (le ballon
 * change de main avant le coup de sifflet) ; `debugResetBall` : en jeu seulement (pendant le décompte, un ballon lâché
 * au centre rendait le porteur de la remise en jeu les mains vides et le coup de sifflet partait ballon libre).
 * Jamais pendant la pause d'essai ni après la fin (ballon mort : rien ne doit le ranimer, la remise en jeu le replace).
 */
const debugToolsAllowed = (state: MatchState): boolean => state.phase === 'play' || state.phase === 'kickoff';

/**
 * OUTIL DE TEST : donne le ballon au joueur `playerId` (s'il existe et n'est pas au sol), comme un ramassage
 * mais sans événement (à appeler ENTRE deux `step`). Déterministe, ne consomme pas d'aléatoire. Refusé pendant
 * la pause d'essai et après la fin du match. Donné dans l'en-but adverse : essai au tick suivant (règles).
 * Renvoie vrai si le ballon a été donné.
 */
export function debugGiveBall(state: MatchState, playerId: number): boolean {
  const p = state.players[playerId];
  if (p === undefined || p.status !== 'active' || !debugToolsAllowed(state)) return false;
  state.ball.throwerId = -1;
  state.scrum = null; // une mêlée en cours s'arrête (le ballon a quitté la zone)
  p.pickupBlockTicks = 0;
  giveBall(state, p);
  return true;
}

/**
 * OUTIL DE TEST : ballon libre, immobile, lâché de BALL_DROP_HEIGHT au-dessus du centre du terrain (à
 * appeler entre deux `step`). Déterministe (aucun tirage). Débloque le ramassage de tous les joueurs.
 * Refusé (renvoie faux) hors de la phase 'play' (décompte du coup d'envoi, pause d'essai, fin du match).
 */
export function debugResetBall(state: MatchState): boolean {
  if (state.phase !== 'play') return false;
  const b = state.ball;
  b.pos = { x: 0, y: groundHeight(state.field, 0, 0) + BALL_DROP_HEIGHT + BALL_RADIUS, z: 0 };
  b.vel = { x: 0, y: 0, z: 0 };
  b.mode = 'loose';
  b.carrierId = -1;
  b.throwerId = -1;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.looseTicks = 0;
  b.spinRate = 0;
  b.tumbleRate = 0;
  state.scrum = null; // une mêlée en cours s'arrête
  for (const p of state.players) p.pickupBlockTicks = 0;
  return true;
}
