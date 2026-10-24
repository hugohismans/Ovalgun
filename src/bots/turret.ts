/**
 * Cible d'entraînement « tourelle » (étape 5) : producteur d'entrées minimal et PUR (contrat InputProvider),
 * pour ressentir le plaquage avant les vrais bots (étape 6, qui la remplacera).
 *
 * Comportement : immobile ; se tourne (TURRET_TURN_RATE_DEG au plus) vers l'ENNEMI ACTIF le plus proche à portée,
 * en visant sa position prévue à l'arrivée de la balle (TURRET_LEAD_FRACTION de l'avance, aim.ts)
 * (portée de l'arme × TURRET_ENGAGE_RANGE_MULT ; égalité : plus petit id) ; après TURRET_REACTION_SEC sur une
 * nouvelle cible, tire par rafales (TURRET_BURST_SEC, puis pause TURRET_PAUSE_SEC + jusqu'à
 * TURRET_PAUSE_JITTER_SEC), seulement quand sa visée est à moins de TURRET_FIRE_CONE_DEG de la cible voulue.
 * Imprécision seedée : une erreur de visée tirée à chaque rafale (TURRET_AIM_ERROR_DEG) et un tremblement par tick
 * (TURRET_AIM_JITTER_DEG). Plaquée, portant le ballon ou sans arme utilisable : elle ne tire pas.
 *
 * Aléatoire : PRNG PROPRE au bot, dérivé de deriveSeed(seed, id), stocké dans sa mémoire (`TurretMemory`), jamais
 * dans MatchState. L'état du match n'est que LU. La mémoire suppose un appel par tick (contrat de la session).
 */

import {
  aimOrigin,
  angleDiff,
  clamp,
  deriveSeed,
  makeInput,
  PITCH_MAX,
  PITCH_MIN,
  randSigned,
  rand,
  ROLES,
  secToTicks,
  TICK_DT,
  TURRET_AIM_ERROR_DEG,
  TURRET_AIM_JITTER_DEG,
  TURRET_BURST_SEC,
  TURRET_ENGAGE_RANGE_MULT,
  TURRET_FIRE_CONE_DEG,
  TURRET_LEAD_FRACTION,
  TURRET_PAUSE_JITTER_SEC,
  TURRET_PAUSE_SEC,
  TURRET_REACTION_SEC,
  TURRET_TURN_RATE_DEG,
  Buttons,
  canShoot,
  weaponImplemented,
  wrapAngle,
  type MatchState,
  type PlayerInput,
  type PlayerState,
} from '../sim';
import { aimAnglesTo, leadAimPoint } from './aim';
import type { InputProvider } from './index';

const DEG = Math.PI / 180;

/** Mémoire interne d'une tourelle (sérialisable, hors MatchState). */
export interface TurretMemory {
  /** État du PRNG propre au bot. */
  rng: number;
  /** Cible courante (-1 : aucune). */
  targetId: number;
  /** Ticks avant la première rafale sur la cible courante. */
  reactTicks: number;
  /** Ticks restants de la rafale en cours. */
  burstTicks: number;
  /** Ticks restants de la pause entre deux rafales. */
  pauseTicks: number;
  /** Erreur de visée de la rafale en cours (rad). */
  errYaw: number;
  errPitch: number;
}

/** Mémoire neuve d'une tourelle pilotant `playerId` dans un match de seed `seed`. */
export function createTurretMemory(seed: number, playerId: number): TurretMemory {
  return { rng: deriveSeed(seed, playerId), targetId: -1, reactTicks: 0, burstTicks: 0, pauseTicks: 0, errYaw: 0, errPitch: 0 };
}

/** Ennemi actif le plus proche (horizontalement) à moins de `range`, égalité : plus petit id. */
function nearestEnemy(state: Readonly<MatchState>, me: PlayerState, range: number): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD2 = range * range;
  for (const p of state.players) {
    if (p.team === me.team || p.status !== 'active') continue;
    const dx = p.pos.x - me.pos.x;
    const dz = p.pos.z - me.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2 || (best === null && d2 === bestD2)) {
      best = p;
      bestD2 = d2;
    }
  }
  return best;
}

/** Yaw / pitch vers le centre de la capsule de `t`, avancé de TURRET_LEAD_FRACTION (balle à `speed` m/s). */
function aimAngles(me: PlayerState, t: PlayerState, speed: number): { yaw: number; pitch: number } {
  const origin = aimOrigin(me.pos, Math.atan2(t.pos.x - me.pos.x, t.pos.z - me.pos.z));
  return aimAnglesTo(me, leadAimPoint(origin, t, speed, TURRET_LEAD_FRACTION));
}

/**
 * Entrée de la tourelle pour ce tick (PURE vis-à-vis du match : `state` n'est que lu ; `mem` est mise à jour).
 * Toujours une entrée complète qui garde (ou tourne) l'orientation du joueur : jamais de yaw remis à 0.
 */
export function turretInput(mem: TurretMemory, state: Readonly<MatchState>, playerId: number): PlayerInput {
  const me = state.players[playerId];
  if (me === undefined) return makeInput();
  const hold = makeInput({ yaw: me.yaw, pitch: me.pitch });
  const w = ROLES[me.role].weapon;
  if (me.status !== 'active' || !weaponImplemented(w)) {
    mem.targetId = -1;
    mem.burstTicks = 0;
    return hold;
  }
  const target = nearestEnemy(state, me, w.range * TURRET_ENGAGE_RANGE_MULT);
  if (target === null) {
    mem.targetId = -1;
    mem.burstTicks = 0;
    return hold;
  }
  if (target.id !== mem.targetId) {
    mem.targetId = target.id;
    mem.reactTicks = secToTicks(TURRET_REACTION_SEC);
    mem.burstTicks = 0;
    mem.pauseTicks = 0;
  }
  // Rafales : réaction, puis rafale / pause en alternance ; nouvelle erreur de visée à chaque rafale.
  let firing = false;
  if (mem.reactTicks > 0) {
    mem.reactTicks--;
  } else if (mem.burstTicks > 0) {
    firing = true;
    mem.burstTicks--;
    if (mem.burstTicks === 0) mem.pauseTicks = secToTicks(TURRET_PAUSE_SEC + rand(mem) * TURRET_PAUSE_JITTER_SEC);
  } else if (mem.pauseTicks > 0) {
    mem.pauseTicks--;
  } else {
    mem.burstTicks = Math.max(1, secToTicks(TURRET_BURST_SEC));
    mem.errYaw = randSigned(mem) * TURRET_AIM_ERROR_DEG * DEG;
    mem.errPitch = randSigned(mem) * TURRET_AIM_ERROR_DEG * DEG;
    firing = true;
    mem.burstTicks--;
  }
  const want = aimAngles(me, target, w.speed);
  const jitterYaw = randSigned(mem) * TURRET_AIM_JITTER_DEG * DEG;
  const jitterPitch = randSigned(mem) * TURRET_AIM_JITTER_DEG * DEG;
  const wantYaw = wrapAngle(want.yaw + mem.errYaw + jitterYaw);
  const wantPitch = clamp(want.pitch + mem.errPitch + jitterPitch, PITCH_MIN, PITCH_MAX);
  const maxStep = TURRET_TURN_RATE_DEG * DEG * TICK_DT;
  const dYaw = angleDiff(me.yaw, wantYaw);
  const yaw = wrapAngle(me.yaw + clamp(dYaw, -maxStep, maxStep));
  const pitch = me.pitch + clamp(wantPitch - me.pitch, -maxStep, maxStep);
  const aligned = Math.abs(angleDiff(yaw, wantYaw)) <= TURRET_FIRE_CONE_DEG * DEG;
  const shoot = firing && aligned && canShoot(state, me);
  return makeInput({ yaw, pitch, buttons: shoot ? Buttons.FIRE : 0 });
}

/**
 * Fabrique un InputProvider « tourelle » avec sa propre mémoire (PRNG dérivé de deriveSeed(seed, playerId)).
 * `active = false` : cible passive (garde son orientation, ne tire jamais) — ?dummies=off côté client.
 */
export function createTurret(seed: number, playerId: number, active = true): InputProvider {
  const mem = createTurretMemory(seed, playerId);
  return (state, id) => {
    if (!active) {
      const me = state.players[id];
      return makeInput(me === undefined ? {} : { yaw: me.yaw, pitch: me.pitch });
    }
    return turretInput(mem, state, id);
  };
}
