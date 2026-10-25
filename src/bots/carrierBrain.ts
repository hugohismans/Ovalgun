/**
 * Cerveau du PORTEUR (étape 6) : avancer, esquiver, passer, taper, plonger — en lisant le MatchState.
 *
 * Décision (tous les decisionSec, planCarrier) :
 *  - direction de course : éventail de BOT_CARRIER_DIRECTIONS directions vers l'en-but adverse, notées par la
 *    progression moins le risque (distance de sa course projetée aux adversaires projetés sur BOT_CARRIER_LOOKAHEAD_SEC),
 *    moins la sortie du terrain, plus une petite hystérésis ; sprint si le chemin est libre ;
 *  - PRESSÉ (adversaire proche devant / à côté, ou sous le feu avec une stabilité basse) : PASSE ARRIÈRE vers le
 *    coéquipier le plus démarqué et le moins pressé, trouvée avec la visée assistée de la sim (selectPassTarget) en
 *    essayant plusieurs regards : le bot tourne ensuite son regard vers celui qui désigne ce receveur et appuie sur
 *    PASSE dès que la visée assistée le désigne ;
 *  - ENCERCLÉ (plusieurs adversaires proches) ou plaqué imminent, sans passe valable : dans son propre tiers, passe
 *    même peu démarquée ; sinon COUP DE PIED (point de chute prédit par kickLaunch + predictBallLanding, noté par la
 *    progression et l'avance de son équipe pour y arriver ; jamais dans un défenseur au contact, jamais juste après un
 *    coup de pied, jamais dans l'en-but adverse, seulement si son équipe arrive la première) ; sinon il garde le ballon ;
 *  - près de la ligne : pas de passe, il fonce.
 * Réflexes (chaque tick, carrierTick) : PLONGEON pour franchir la ligne à portée de plongeon, plongeon d'évasion
 * (sous le feu, stabilité très basse, esquive en recharge), ESQUIVE (réflexe quand on lui tire dessus, ou défenseur
 * au contact), SPRINT BOOSTÉ de l'ailier en terrain libre.
 */

import {
  attackDir,
  attackYaw,
  BOT_ACTION_MAX_PREP_SEC,
  BOT_ACTION_YAW_TOLERANCE_DEG,
  BOT_BOOST_MIN_LINE_DIST,
  BOT_CARRIER_AVOID_RADIUS,
  BOT_CARRIER_AVOID_WEIGHT,
  BOT_CARRIER_DIR_SPREAD_DEG,
  BOT_CARRIER_DIR_STICKY,
  BOT_CARRIER_DIRECTIONS,
  BOT_CARRIER_LOOKAHEAD_SEC,
  BOT_CARRIER_ZONE_PENALTY,
  BOT_CONTACT_DISTANCE,
  BOT_CONTACT_REFLEX_MULT,
  BOT_DIFFICULTY,
  BOT_DIVE_ESCAPE_STABILITY_FRACTION,
  BOT_DIVE_TRY_DISTANCE,
  BOT_DODGE_FORWARD_MIX,
  BOT_ENCIRCLED_COUNT,
  BOT_ENCIRCLED_COUNT_5V5,
  BOT_ENCIRCLED_RADIUS,
  BOT_KICK_ADVANTAGE_SEC,
  BOT_KICK_ADVANTAGE_WEIGHT,
  BOT_KICK_AFTER_KICK_SEC,
  BOT_KICK_CHARGE_EXTRA_SEC,
  BOT_KICK_CHARGE_MARGIN,
  BOT_KICK_DIRECTIONS,
  BOT_KICK_LAND_MIN_LINE_DIST,
  BOT_KICK_MIN_ADVANTAGE_SEC,
  BOT_KICK_MIN_LINE_DIST,
  BOT_KICK_OUT_DIST,
  BOT_KICK_PITCH_DEG,
  BOT_KICK_SPREAD_DEG,
  BOT_KICK_STABILITY_FRACTION,
  BOT_LINE_RUSH_AVOID_MULT,
  BOT_LINE_RUSH_DIST,
  BOT_NO_PASS_LINE_DIST,
  BOT_OWN_THIRD_FRACTION,
  BOT_PASS_MIN_OPENNESS,
  BOT_PASS_MIN_OPENNESS_OWN_THIRD,
  BOT_PASS_MIN_RANGE,
  BOT_PASS_STABILITY_FRACTION,
  BOT_PASS_YAW_SAMPLES,
  BOT_PATH_CLEAR_DIST,
  BOT_PATH_CLEAR_HALF_ANGLE_DEG,
  BOT_PRESSURE_BESIDE_TOLERANCE,
  BOT_PRESSURE_RADIUS,
  BOT_WALL_MARGIN,
  Buttons,
  angleDiff,
  canCarrierAct,
  distanceToTryLine,
  KICK_CHARGE_DOWN_RADIUS,
  KICK_CHARGE_DOWN_SEC,
  kickLaunch,
  opponentTeam,
  predictBallLanding,
  rand,
  ROLES,
  secToTicks,
  selectPassTarget,
  TICK_DT,
  type MatchState,
  type PlayerState,
} from '../sim';
import type { BotMemory } from './memory';
import { dodgeReflexArmed, underFire } from './perception';
import { activeOf, dist2, horizontalSpeed, playerDist, timeTo } from './world';

const DEG = Math.PI / 180;
/** Projection d'une course : nombre d'instants échantillonnés sur l'horizon (pas une valeur de gameplay). */
const LOOKAHEAD_SAMPLES = 4;
/** Contrôle du contre d'un coup de pied : nombre d'instants échantillonnés sur la trajectoire de départ (pas une valeur de gameplay). */
const CHARGE_SAMPLES = 4;

/** Pression sur le porteur, lue dans l'état. */
export interface Pressure {
  /** Distance au plus proche adversaire actif devant ou à côté (Infinity : aucun). */
  nearestAhead: number;
  /** Id de cet adversaire (−1 : aucun). */
  nearestAheadId: number;
  /** Adversaires actifs à moins de BOT_ENCIRCLED_RADIUS (toutes directions). */
  encircled: number;
}

/** Pression subie par le porteur `me` (PURE). */
export function carrierPressure(state: Readonly<MatchState>, me: PlayerState): Pressure {
  const dir = attackDir(me.team);
  let nearestAhead = Infinity;
  let nearestAheadId = -1;
  let encircled = 0;
  const r2 = BOT_ENCIRCLED_RADIUS * BOT_ENCIRCLED_RADIUS;
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active') continue;
    const d = playerDist(me, o);
    if (d * d <= r2) encircled++;
    if ((o.pos.z - me.pos.z) * dir > -BOT_PRESSURE_BESIDE_TOLERANCE && d < nearestAhead) {
      nearestAhead = d;
      nearestAheadId = o.id;
    }
  }
  return { nearestAhead, nearestAheadId, encircled };
}

/** Direction de course choisie et chemin libre. */
export interface RunChoice {
  x: number;
  z: number;
  clear: boolean;
}

/** Vrai si aucun adversaire actif n'est dans le cône devant (dx, dz), à moins de BOT_PATH_CLEAR_DIST (PURE). */
export function pathClear(state: Readonly<MatchState>, me: PlayerState, dx: number, dz: number): boolean {
  const cosMax = Math.cos(BOT_PATH_CLEAR_HALF_ANGLE_DEG * DEG);
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active') continue;
    const ox = o.pos.x - me.pos.x;
    const oz = o.pos.z - me.pos.z;
    const d = Math.sqrt(ox * ox + oz * oz);
    if (d > BOT_PATH_CLEAR_DIST) continue;
    if (d < 1e-6 || (ox * dx + oz * dz) / d >= cosMax) return false;
  }
  return true;
}

/**
 * Direction de course du porteur (PURE) : éventail vers l'en-but adverse, note = progression − risque × poids
 * − sortie du terrain + hystérésis sur la direction précédente (prevX, prevZ) − BOT_CARRIER_ZONE_PENALTY si la course
 * projetée traverse une zone de ralentissement adverse (étape 7). Près de la ligne (BOT_LINE_RUSH_DIST),
 * l'évitement est multiplié par BOT_LINE_RUSH_AVOID_MULT : il fonce.
 */
export function chooseRunDirection(state: Readonly<MatchState>, me: PlayerState, prevX: number, prevZ: number): RunChoice {
  const dir = attackDir(me.team);
  const base = attackYaw(me.team);
  const speed = Math.max(horizontalSpeed(me), ROLES[me.role].runSpeed);
  const halfW = state.field.width / 2 - BOT_WALL_MARGIN;
  const rush = distanceToTryLine(state, me.team, me.pos.z) < BOT_LINE_RUSH_DIST;
  const avoidW = rush ? BOT_CARRIER_AVOID_WEIGHT * BOT_LINE_RUSH_AVOID_MULT : BOT_CARRIER_AVOID_WEIGHT;
  const opponents = activeOf(state, opponentTeam(me.team));
  let bestX = 0;
  let bestZ: number = dir;
  let bestScore = -Infinity;
  const n = Math.max(1, BOT_CARRIER_DIRECTIONS);
  for (let i = 0; i < n; i++) {
    const a = base + (n === 1 ? 0 : BOT_CARRIER_DIR_SPREAD_DEG * DEG * ((2 * i) / (n - 1) - 1));
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    let risk = 0;
    for (const o of opponents) {
      let worst = 0;
      for (let k = 1; k <= LOOKAHEAD_SAMPLES; k++) {
        const t = (k / LOOKAHEAD_SAMPLES) * BOT_CARRIER_LOOKAHEAD_SEC;
        const px = me.pos.x + dx * speed * t;
        const pz = me.pos.z + dz * speed * t;
        const d = Math.sqrt(dist2(px, pz, o.pos.x + o.vel.x * t, o.pos.z + o.vel.z * t));
        const r = Math.max(0, 1 - d / BOT_CARRIER_AVOID_RADIUS);
        if (r > worst) worst = r;
      }
      risk += worst * worst;
    }
    // Étape 7 : une course qui traverse une zone de ralentissement adverse est pénalisée (il la contourne).
    let slowed = 0;
    for (const zn of state.zones) {
      if (zn.team === me.team) continue;
      for (let k = 1; k <= LOOKAHEAD_SAMPLES; k++) {
        const t = (k / LOOKAHEAD_SAMPLES) * BOT_CARRIER_LOOKAHEAD_SEC;
        if (dist2(me.pos.x + dx * speed * t, me.pos.z + dz * speed * t, zn.pos.x, zn.pos.z) <= zn.radius * zn.radius) {
          slowed = BOT_CARRIER_ZONE_PENALTY;
          break;
        }
      }
    }
    const endX = me.pos.x + dx * speed * BOT_CARRIER_LOOKAHEAD_SEC;
    const out = Math.max(0, Math.abs(endX) - halfW) / Math.max(1, speed * BOT_CARRIER_LOOKAHEAD_SEC);
    const sticky = dx * prevX + dz * prevZ > Math.cos((BOT_CARRIER_DIR_SPREAD_DEG * DEG) / Math.max(1, n - 1)) ? BOT_CARRIER_DIR_STICKY : 0;
    const score = dz * dir - avoidW * risk - out + sticky - slowed;
    if (score > bestScore) {
      bestScore = score;
      bestX = dx;
      bestZ = dz;
    }
  }
  return { x: bestX, z: bestZ, clear: pathClear(state, me, bestX, bestZ) };
}

/** Passe choisie : receveur et regard (yaw) pour lequel la visée assistée de la sim le désigne. */
export interface PassChoice {
  targetId: number;
  yaw: number;
}

/** Distance au plus proche adversaire actif de `p` (Infinity : aucun). */
function nearestOpponentDist(state: Readonly<MatchState>, p: PlayerState): number {
  let best = Infinity;
  for (const o of state.players) {
    if (o.team === p.team || o.status !== 'active') continue;
    const d = playerDist(p, o);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Passe arrière (PURE) : regards essayés en éventail (BOT_PASS_YAW_SAMPLES, de −90° à +90° autour de l'en-but adverse,
 * le porteur continue de courir vers l'avant) ; pour chacun, le receveur que la visée assistée choisirait. Receveur
 * retenu : démarqué (openness ≥ `minOpenness`, BOT_PASS_MIN_OPENNESS par défaut), à au moins BOT_PASS_MIN_RANGE, MOINS
 * pressé que le porteur ; le meilleur produit démarquage × liberté. Le regard gardé pour lui : celui où l'alignement
 * (aim) est le plus net.
 * Liberté du porteur = min(distance au plus proche adversaire / BOT_PRESSURE_RADIUS, stabilité restante) : la pression
 * peut venir d'un tireur lointain (passe finale : avec la distance seule, un porteur sous le feu du dernier défenseur à
 * 15–26 m valait 1 et aucun receveur n'était « plus libre » : il ne passait jamais, même presque plaqué).
 */
export function choosePass(state: Readonly<MatchState>, me: PlayerState, minOpenness = BOT_PASS_MIN_OPENNESS): PassChoice | null {
  const base = attackYaw(me.team);
  const myFreedom = Math.min(1, nearestOpponentDist(state, me) / BOT_PRESSURE_RADIUS, me.stability / ROLES[me.role].stabilityMax);
  let best: PassChoice | null = null;
  let bestValue = -Infinity;
  let bestAim = -Infinity;
  const n = Math.max(2, BOT_PASS_YAW_SAMPLES);
  for (let k = 0; k < n; k++) {
    const yaw = base + (Math.PI / 2) * ((2 * k) / (n - 1) - 1);
    const t = selectPassTarget(state, me.id, yaw);
    if (t === null || t.range < BOT_PASS_MIN_RANGE || t.openness < minOpenness) continue;
    const r = state.players[t.targetId];
    const freedom = Math.min(1, nearestOpponentDist(state, r) / BOT_PRESSURE_RADIUS);
    if (freedom <= myFreedom) continue;
    const value = t.openness * freedom;
    if (best !== null && best.targetId === t.targetId) {
      if (t.aim > bestAim) {
        best = { targetId: t.targetId, yaw };
        bestAim = t.aim;
      }
    } else if (value > bestValue + 1e-9) {
      best = { targetId: t.targetId, yaw };
      bestValue = value;
      bestAim = t.aim;
    }
  }
  return best;
}

/** Coup de pied retenu : regard, avance de la première arrivée de l'équipe du botteur (s), point de chute prédit. */
export interface KickChoice {
  yaw: number;
  /** min des temps de course des adversaires − min de ceux de son équipe (botteur compris) au point de chute (s). */
  advantage: number;
  landX: number;
  landZ: number;
}

/**
 * Vrai si un adversaire actif (projeté selon sa vitesse) passe à moins de KICK_CHARGE_DOWN_RADIUS + BOT_KICK_CHARGE_MARGIN
 * de la trajectoire de départ du ballon pendant KICK_CHARGE_DOWN_SEC + BOT_KICK_CHARGE_EXTRA_SEC (contre probable). PURE.
 */
function kickBlocked(state: Readonly<MatchState>, me: PlayerState, pos: { x: number; z: number }, vel: { x: number; z: number }): boolean {
  const horizon = KICK_CHARGE_DOWN_SEC + BOT_KICK_CHARGE_EXTRA_SEC;
  const r = KICK_CHARGE_DOWN_RADIUS + BOT_KICK_CHARGE_MARGIN;
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active') continue;
    for (let k = 0; k <= CHARGE_SAMPLES; k++) {
      const t = (k / CHARGE_SAMPLES) * horizon;
      const d2 = dist2(pos.x + vel.x * t, pos.z + vel.z * t, o.pos.x + o.vel.x * t, o.pos.z + o.vel.z * t);
      if (d2 <= r * r) return true;
    }
  }
  return false;
}

/**
 * Coup de pied (PURE) : directions en éventail (BOT_KICK_DIRECTIONS sur ±BOT_KICK_SPREAD_DEG autour de l'en-but
 * adverse), point de chute prédit (kickLaunch + predictBallLanding). Directions écartées : contre probable (kickBlocked),
 * point de chute à moins de BOT_KICK_LAND_MIN_LINE_DIST × échelle de la ligne adverse (pas de coup de pied dans l'en-but).
 * Note = progression (rapportée à la longueur du terrain) + BOT_KICK_ADVANTAGE_WEIGHT × avance de la première arrivée de
 * son équipe (bornée à ±1 au-delà de BOT_KICK_ADVANTAGE_SEC) − sortie du terrain (/ BOT_KICK_OUT_DIST). Renvoie la
 * meilleure direction (null : toutes contrées) ; c'est l'appelant qui décide de taper ou non (avance, zone d'attaque).
 */
export function chooseKick(state: Readonly<MatchState>, me: PlayerState): KickChoice | null {
  const dir = attackDir(me.team);
  const base = attackYaw(me.team);
  const pitch = BOT_KICK_PITCH_DEG * DEG;
  const halfW = state.field.width / 2 - BOT_WALL_MARGIN;
  const halfL = state.field.length / 2;
  const opponents = activeOf(state, opponentTeam(me.team));
  const mates = activeOf(state, me.team);
  let best: KickChoice | null = null;
  let bestScore = -Infinity;
  const n = Math.max(1, BOT_KICK_DIRECTIONS);
  for (let i = 0; i < n; i++) {
    const yaw = base + (n === 1 ? 0 : BOT_KICK_SPREAD_DEG * DEG * ((2 * i) / (n - 1) - 1));
    const launch = kickLaunch(state, me.id, yaw, pitch);
    if (launch === null || kickBlocked(state, me, launch.pos, launch.vel)) continue;
    const land = predictBallLanding(state.field, launch.pos, launch.vel);
    if (distanceToTryLine(state, me.team, land.z) < BOT_KICK_LAND_MIN_LINE_DIST * state.field.scale) continue;
    let oppT = Infinity;
    for (const o of opponents) oppT = Math.min(oppT, timeTo(o, land.x, land.z));
    let ourT = Infinity;
    for (const m of mates) ourT = Math.min(ourT, timeTo(m, land.x, land.z));
    const advantage = oppT === Infinity ? BOT_KICK_ADVANTAGE_SEC : oppT - ourT;
    const progress = ((land.z - me.pos.z) * dir) / state.field.length;
    const out = (Math.max(0, Math.abs(land.x) - halfW) + Math.max(0, Math.abs(land.z) - halfL)) / BOT_KICK_OUT_DIST;
    const adv = Math.max(-1, Math.min(1, advantage / BOT_KICK_ADVANTAGE_SEC));
    const score = progress + BOT_KICK_ADVANTAGE_WEIGHT * adv - out;
    if (score > bestScore) {
      bestScore = score;
      best = { yaw, advantage, landX: land.x, landZ: land.z };
    }
  }
  return best;
}

/**
 * Décision du porteur (tous les decisionSec) : direction de course et sprint, puis passe / coup de pied selon la
 * pression. Un geste déjà en préparation (planTicks > 0) est conservé.
 */
export function planCarrier(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState): void {
  const d = mem.decision;
  const keepPlan = d.role === 'carrier' && d.plan !== 'run' && d.planTicks > 0;
  const prevX = d.role === 'carrier' ? d.dirX : 0;
  const prevZ = d.role === 'carrier' ? d.dirZ : attackDir(me.team);
  d.role = 'carrier';
  d.shootId = -1;
  d.markId = -1;
  const run = chooseRunDirection(state, me, prevX, prevZ);
  d.dirX = run.x;
  d.dirZ = run.z;
  d.goalX = me.pos.x + run.x * BOT_PATH_CLEAR_DIST;
  d.goalZ = me.pos.z + run.z * BOT_PATH_CLEAR_DIST;
  d.pathClear = run.clear;
  d.sprint = run.clear;
  if (keepPlan) return;
  d.plan = 'run';
  d.planTargetId = -1;
  d.planTicks = 0;
  if (!canCarrierAct(me)) return;
  const distLine = distanceToTryLine(state, me.team, me.pos.z);
  if (distLine <= BOT_NO_PASS_LINE_DIST) return;
  const pr = carrierPressure(state, me);
  const stab = me.stability / ROLES[me.role].stabilityMax;
  const hot = underFire(mem);
  const pressed = pr.nearestAhead < BOT_PRESSURE_RADIUS || (hot && stab < BOT_PASS_STABILITY_FRACTION);
  if (!pressed) return;
  const prep = Math.max(1, secToTicks(BOT_ACTION_MAX_PREP_SEC));
  const pass = choosePass(state, me);
  if (pass !== null) {
    d.plan = 'pass';
    d.planTargetId = pass.targetId;
    d.planYaw = pass.yaw;
    d.planTicks = prep;
    return;
  }
  const encircledCount = state.config.teamSize === 3 ? BOT_ENCIRCLED_COUNT : BOT_ENCIRCLED_COUNT_5V5;
  const cornered = pr.encircled >= encircledCount || (hot && stab < BOT_KICK_STABILITY_FRACTION);
  if (!cornered) return;
  // Dans son propre tiers, une passe même peu démarquée vaut mieux qu'un coup de pied rendu à l'adversaire.
  if (distLine > BOT_OWN_THIRD_FRACTION * 2 * state.field.tryLineZ) {
    const safe = choosePass(state, me, BOT_PASS_MIN_OPENNESS_OWN_THIRD);
    if (safe !== null) {
      d.plan = 'pass';
      d.planTargetId = safe.targetId;
      d.planYaw = safe.yaw;
      d.planTicks = prep;
      return;
    }
  }
  // Pas de coup de pied près de la ligne adverse, ni juste après un coup de pied (pas de « ping-pong »).
  if (distLine <= BOT_KICK_MIN_LINE_DIST * state.field.scale) return;
  if (mem.lastKickSeenTick >= 0 && state.tick - mem.lastKickSeenTick < secToTicks(BOT_KICK_AFTER_KICK_SEC)) return;
  const kick = chooseKick(state, me);
  if (kick === null) return;
  // On ne tape que si son équipe arrive la première au point de chute.
  if (kick.advantage <= BOT_KICK_MIN_ADVANTAGE_SEC) return;
  d.plan = 'kick';
  d.planTargetId = -1;
  d.planYaw = kick.yaw;
  d.planTicks = prep;
}

/** Sortie d'un tick du porteur : regard voulu, pitch voulu, boutons (fronts gérés par l'appelant), direction de course. */
export interface CarrierTickOutput {
  wantYaw: number;
  wantPitch: number;
  buttons: number;
  /** Direction monde de l'entrée de déplacement (unitaire). */
  dirX: number;
  dirZ: number;
}

/** Bouton pressé seulement s'il n'était pas maintenu au tick précédent (front montant garanti). */
const pulse = (me: PlayerState, button: number): number => ((me.lastButtons & button) !== 0 ? 0 : button);

/** Tirage « au moins une fois par seconde en moyenne `perSec` » pour ce tick (PRNG du bot). */
const rollPerSec = (mem: BotMemory, perSec: number): boolean => rand(mem) < perSec * TICK_DT;

/**
 * Direction d'esquive : perpendiculaire à la menace (du tireur / du défenseur vers le porteur), côté opposé au mur le
 * plus proche, mêlée de BOT_DODGE_FORWARD_MIX × la direction voulue (fx, fz).
 */
export function dodgeDirection(
  me: PlayerState,
  threat: PlayerState | null,
  fx: number,
  fz: number,
  forwardMix: number,
): { x: number; z: number } {
  let tx = threat === null ? fx : me.pos.x - threat.pos.x;
  let tz = threat === null ? fz : me.pos.z - threat.pos.z;
  const tl = Math.sqrt(tx * tx + tz * tz);
  if (tl < 1e-6) {
    tx = fx;
    tz = fz;
  } else {
    tx /= tl;
    tz /= tl;
  }
  // Deux perpendiculaires : celle qui éloigne du mur latéral le plus proche (vers le centre du terrain).
  let px = -tz;
  let pz = tx;
  if (px * me.pos.x > 0) {
    px = -px;
    pz = -pz;
  }
  const x = px + fx * forwardMix;
  const z = pz + fz * forwardMix;
  const l = Math.sqrt(x * x + z * z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: fx, z: fz };
}

/**
 * Un tick du porteur, qui court selon (baseDirX, baseDirZ) (direction de la décision, détour de blocage compris) :
 * réflexes (plongeon d'essai, plongeon d'évasion, esquive, sprint boosté) puis exécution du plan
 * (passe : regard vers le receveur puis PASSE quand la visée assistée le désigne ; coup de pied : regard puis KICK).
 * `turnToward(want)` = regard réellement envoyé ce tick vers `want` (rotation limitée) : la passe part si la visée
 * assistée, évaluée avec CE regard (celui que la sim appliquera), désigne le receveur prévu.
 */
export function carrierTick(
  mem: BotMemory,
  state: Readonly<MatchState>,
  me: PlayerState,
  turnToward: (want: number) => number,
  baseDirX: number,
  baseDirZ: number,
): CarrierTickOutput {
  const d = mem.decision;
  const diff = BOT_DIFFICULTY[mem.difficulty];
  const dir = attackDir(me.team);
  let dirX = baseDirX;
  let dirZ = baseDirZ;
  if (dirX === 0 && dirZ === 0) dirZ = dir;
  let wantYaw = Math.atan2(dirX, dirZ);
  let wantPitch = 0;
  let buttons = d.sprint ? Buttons.SPRINT : 0;
  if (!canCarrierAct(me)) return { wantYaw, wantPitch, buttons, dirX, dirZ };

  const distLine = distanceToTryLine(state, me.team, me.pos.z);
  const canDive = me.diveCd === 0 && (me.move === 'run' || me.move === 'slide' || me.move === 'dodge');
  // Plongeon d'essai : à portée de la ligne, droit vers l'en-but.
  if (canDive && distLine <= BOT_DIVE_TRY_DISTANCE) {
    wantYaw = attackYaw(me.team);
    return { wantYaw, wantPitch, buttons: buttons | pulse(me, Buttons.SLIDE), dirX: 0, dirZ: dir };
  }
  const stab = me.stability / ROLES[me.role].stabilityMax;
  const hot = underFire(mem);
  // Plongeon d'évasion : sous le feu, presque plaqué, esquive indisponible => 0,3 s d'invulnérabilité vers l'avant.
  if (canDive && hot && stab < BOT_DIVE_ESCAPE_STABILITY_FRACTION && me.dodgeCd > 0) {
    return { wantYaw, wantPitch, buttons: buttons | pulse(me, Buttons.SLIDE), dirX, dirZ };
  }
  // Esquive : réflexe sous le feu, ou défenseur au contact devant.
  if (me.dodgeCd === 0 && me.move === 'run') {
    const pr = carrierPressure(state, me);
    const contact = pr.nearestAhead < BOT_CONTACT_DISTANCE;
    const reflex = dodgeReflexArmed(mem) && rollPerSec(mem, diff.dodgeReflex);
    const juke = !reflex && contact && rollPerSec(mem, diff.dodgeReflex * BOT_CONTACT_REFLEX_MULT);
    if (reflex || juke) {
      const threatId = reflex ? mem.lastShooterId : pr.nearestAheadId;
      const threat = threatId >= 0 ? (state.players[threatId] ?? null) : null;
      const dd = dodgeDirection(me, threat, 0, dir, BOT_DODGE_FORWARD_MIX);
      return { wantYaw, wantPitch, buttons: buttons | pulse(me, Buttons.DODGE), dirX: dd.x, dirZ: dd.z };
    }
  }
  // Sprint boosté (ailier) en terrain libre, loin de la ligne.
  if (
    me.role === 'ailier' &&
    me.abilityCd === 0 &&
    me.abilityTicks === 0 &&
    d.pathClear &&
    distLine > BOT_BOOST_MIN_LINE_DIST
  ) {
    buttons |= pulse(me, Buttons.ABILITY);
  }

  if (d.plan === 'pass' || d.plan === 'kick') {
    d.planTicks--;
    wantYaw = d.planYaw;
    if (d.plan === 'kick') wantPitch = BOT_KICK_PITCH_DEG * DEG;
    const yaw = turnToward(wantYaw);
    const aligned = Math.abs(angleDiff(yaw, wantYaw)) <= BOT_ACTION_YAW_TOLERANCE_DEG * DEG;
    if (d.plan === 'pass') {
      const t = selectPassTarget(state, me.id, yaw);
      if (t !== null && t.targetId === d.planTargetId) {
        buttons |= pulse(me, Buttons.PASS);
        d.plan = 'run';
        d.planTicks = 0;
      }
    } else if (aligned) {
      buttons |= pulse(me, Buttons.KICK);
      d.plan = 'run';
      d.planTicks = 0;
    }
    if (d.planTicks <= 0) d.plan = 'run';
  }
  return { wantYaw, wantPitch, buttons, dirX, dirZ };
}
