/**
 * Capacités de rôle des bots (étape 7) : bouclier du pilier, zone de ralentissement du demi. L'ailier (sprint boosté)
 * est géré par carrierBrain.ts. Lit le MatchState sans le modifier ; seule la mémoire du bot évolue.
 *
 * PILIER — bouclier frontal (shield.ts) :
 *  - le lever (front montant ABILITY, capacité prête) : PORTEUR, si un défenseur armé est devant lui (dans l'arc du
 *    bouclier autour de sa course) à moins de BOT_SHIELD_CARRIER_DIST, ou s'il se fait tirer dessus de face ;
 *    SANS BALLON, s'il se fait tirer dessus (fenêtre « sous le feu », réflexe armé) avec une stabilité sous
 *    BOT_SHIELD_RAISE_STABILITY_FRACTION par un tireur hors de portée de son fusil — ou sous
 *    BOT_SHIELD_PANIC_STABILITY_FRACTION quel que soit le tireur ;
 *  - bouclier levé : sans ballon, il fait FACE à la menace (dernier tireur, sinon sa cible) ; porteur, il garde sa course ;
 *  - le baisser (second appui, cooldown proportionnel) après BOT_SHIELD_CALM_SEC sans menace : porteur sans défenseur
 *    devant ; sans ballon, s'il a une cible à portée de fusil (bouclier levé = pas de tir) ou plus aucune menace.
 * DEMI — zone de ralentissement (slowZonePlacement de la sim) :
 *  - DÉFENSE : devant le porteur adverse (sa course anticipée de BOT_ZONE_LEAD_SEC, + BOT_ZONE_AHEAD vers notre en-but),
 *    s'il n'est pas déjà dans une de nos zones ;
 *  - ATTAQUE : sur le poursuivant le plus proche de notre porteur (à moins de BOT_ZONE_PURSUER_DIST, derrière ou à côté
 *    de lui) — le demi porteur se retourne donc brièvement, seulement si personne ne le presse devant ;
 *  - point à moins de BOT_ZONE_MAX_DIST (le rayon de visée doit toucher le sol là) ; le bot tourne son regard vers le
 *    point (pitch vers le sol) et appuie sur ABILITY quand la pose prévue AVEC LE REGARD ENVOYÉ tombe à moins de
 *    BOT_ZONE_PLACE_TOLERANCE du point ; abandon après BOT_ACTION_MAX_PREP_SEC. Pendant la préparation, il ne tire pas.
 */

import {
  aimOrigin,
  attackDir,
  BOT_ACTION_MAX_PREP_SEC,
  BOT_PRESSURE_RADIUS,
  BOT_SHIELD_CALM_SEC,
  BOT_SHIELD_CARRIER_DIST,
  BOT_SHIELD_PANIC_STABILITY_FRACTION,
  BOT_SHIELD_RAISE_STABILITY_FRACTION,
  BOT_ZONE_AHEAD,
  BOT_ZONE_LEAD_SEC,
  BOT_ZONE_MAX_DIST,
  BOT_ZONE_PLACE_TOLERANCE,
  BOT_ZONE_PURSUER_DIST,
  groundHeight,
  inSlowZone,
  ROLES,
  secToTicks,
  shieldArcCovers,
  shieldUp,
  slowZonePlacement,
  type MatchState,
  type PlayerState,
} from '../sim';
import type { BotMemory } from './memory';
import { dodgeReflexArmed, underFire } from './perception';
import { cappedVelocity, dist2, engageRange, perceivedFocus } from './world';

/** Intention de capacité pour ce tick. */
export interface AbilityIntent {
  /** Appuyer sur ABILITY (front montant garanti par l'appelant). */
  press: boolean;
  /** Regard imposé (bouclier face à la menace, visée de la zone), null : inchangé. */
  yaw: number | null;
  pitch: number | null;
  /** La capacité prend le regard : pas de tir ce tick. */
  holdFire: boolean;
}

const NONE: AbilityIntent = { press: false, yaw: null, pitch: null, holdFire: false };

/** Adversaire actif `o` armé, dont l'arme atteint `me` (portée de son arme). */
function threatens(o: PlayerState, me: PlayerState): boolean {
  const r = ROLES[o.role].weapon.range;
  return dist2(o.pos.x, o.pos.z, me.pos.x, me.pos.z) <= r * r;
}

/** Défenseur armé le plus proche devant le porteur `me` (dans l'arc du bouclier autour de sa course), à moins de `maxDist` ; −1 sinon. */
function defenderAhead(state: Readonly<MatchState>, me: PlayerState, runX: number, runZ: number, maxDist: number): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  const probe: PlayerState = { ...me, yaw: Math.atan2(runX, runZ) };
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active' || !threatens(o, me)) continue;
    const d = dist2(o.pos.x, o.pos.z, me.pos.x, me.pos.z);
    if (d > bestD || !shieldArcCovers(probe, o.pos.x - me.pos.x, o.pos.z - me.pos.z)) continue;
    bestD = d;
    best = o.id;
  }
  return best;
}

/**
 * Pilier : bouclier. `carrier` : il porte le ballon et court selon (runX, runZ). Met à jour shieldCalmTicks.
 */
function shieldTick(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, carrier: boolean, runX: number, runZ: number): AbilityIntent {
  const up = shieldUp(me);
  const hot = underFire(mem);
  const shooter = mem.lastShooterId >= 0 ? (state.players[mem.lastShooterId] ?? null) : null;
  const shooterActive = shooter !== null && shooter.team !== me.team && shooter.status === 'active';
  const stab = me.stability / ROLES[me.role].stabilityMax;
  if (carrier) {
    const ahead = defenderAhead(state, me, runX, runZ, BOT_SHIELD_CARRIER_DIST);
    const threat = ahead >= 0 || (hot && shooterActive);
    mem.shieldCalmTicks = up && !threat ? mem.shieldCalmTicks + 1 : 0;
    if (!up) return { ...NONE, press: threat && me.abilityCd === 0 };
    return { ...NONE, press: mem.shieldCalmTicks >= secToTicks(BOT_SHIELD_CALM_SEC) };
  }
  // Sans ballon : contre un tireur hors de portée de son fusil (ou en détresse), face à lui.
  const range = engageRange(me, mem.difficulty);
  const target = mem.decision.shootId >= 0 ? (state.players[mem.decision.shootId] ?? null) : null;
  const targetInRange =
    target !== null && target.status === 'active' && dist2(target.pos.x, target.pos.z, me.pos.x, me.pos.z) <= range * range;
  const threat = hot && shooterActive;
  const faceId = threat && shooter !== null ? shooter.id : target !== null && target.status === 'active' ? target.id : -1;
  const face = faceId >= 0 ? state.players[faceId] : undefined;
  const faceYaw = face === undefined ? null : Math.atan2(face.pos.x - me.pos.x, face.pos.z - me.pos.z);
  if (!up) {
    if (!threat || !dodgeReflexArmed(mem) || me.abilityCd > 0 || shooter === null) return NONE;
    const shooterFar = dist2(shooter.pos.x, shooter.pos.z, me.pos.x, me.pos.z) > range * range;
    const raise = (shooterFar && stab < BOT_SHIELD_RAISE_STABILITY_FRACTION) || stab < BOT_SHIELD_PANIC_STABILITY_FRACTION;
    return raise ? { press: true, yaw: faceYaw, pitch: 0, holdFire: true } : NONE;
  }
  mem.shieldCalmTicks = threat ? 0 : mem.shieldCalmTicks + 1;
  const drop = mem.shieldCalmTicks >= secToTicks(BOT_SHIELD_CALM_SEC) && (targetInRange || target === null || !hot);
  return { press: drop, yaw: faceYaw, pitch: 0, holdFire: true };
}

/** Point de pose voulu par le demi (null : aucun) — défense devant le porteur adverse, attaque sur un poursuivant. */
function zoneTarget(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState): { x: number; z: number } | null {
  const focus = perceivedFocus(state, mem.seen);
  if (focus === null || state.ball.mode !== 'carried') return null;
  const carrier = state.players[state.ball.carrierId];
  if (carrier === undefined || carrier.status !== 'active') return null;
  if (carrier.team !== me.team) {
    // Défense : devant le porteur adverse, sur sa course, s'il n'est pas déjà ralenti.
    if (inSlowZone(state, carrier)) return null;
    const v = cappedVelocity(carrier, ROLES[carrier.role].runSpeed);
    const toward = attackDir(carrier.team); // le porteur adverse va vers NOTRE en-but
    return { x: carrier.pos.x + v.x * BOT_ZONE_LEAD_SEC, z: carrier.pos.z + v.z * BOT_ZONE_LEAD_SEC + toward * BOT_ZONE_AHEAD };
  }
  // Attaque : poursuivant le plus proche de notre porteur, derrière ou à côté de lui (pas devant).
  const dir = attackDir(carrier.team);
  let best: PlayerState | null = null;
  let bestD = BOT_ZONE_PURSUER_DIST * BOT_ZONE_PURSUER_DIST;
  let pressedAhead = false;
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active' || inSlowZone(state, o)) continue;
    const d = dist2(o.pos.x, o.pos.z, carrier.pos.x, carrier.pos.z);
    const ahead = (o.pos.z - carrier.pos.z) * dir > 0;
    if (ahead) {
      if (d < BOT_PRESSURE_RADIUS * BOT_PRESSURE_RADIUS) pressedAhead = true;
      continue;
    }
    if (d <= bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best === null || (carrier.id === me.id && pressedAhead)) return null;
  const v = cappedVelocity(best, ROLES[best.role].runSpeed);
  return { x: best.pos.x + v.x * BOT_ZONE_LEAD_SEC, z: best.pos.z + v.z * BOT_ZONE_LEAD_SEC };
}

/** Regard (yaw, pitch) qui vise le sol au point (x, z) depuis l'origine de visée (deux passes : décalage d'épaule). */
function lookAtGround(state: Readonly<MatchState>, me: PlayerState, x: number, z: number): { yaw: number; pitch: number } {
  let yaw = Math.atan2(x - me.pos.x, z - me.pos.z);
  let pitch = 0;
  const gy = groundHeight(state.field, x, z);
  for (let i = 0; i < 2; i++) {
    const o = aimOrigin(me.pos, yaw);
    const dx = x - o.x;
    const dz = z - o.z;
    yaw = Math.atan2(dx, dz);
    pitch = Math.atan2(gy - o.y, Math.sqrt(dx * dx + dz * dz));
  }
  return { yaw, pitch };
}

/**
 * Demi : zone de ralentissement. `turnYaw` / `turnPitch` : regard RÉELLEMENT envoyé ce tick vers une direction voulue
 * (rotation limitée) — la zone part si la pose prévue avec CE regard tombe près du point voulu.
 */
function zoneTick(
  mem: BotMemory,
  state: Readonly<MatchState>,
  me: PlayerState,
  turnYaw: (want: number) => number,
  turnPitch: (want: number) => number,
): AbilityIntent {
  if (me.abilityCd > 0) {
    mem.zonePlanTicks = 0;
    return NONE;
  }
  if (mem.zonePlanTicks <= 0) {
    const t = zoneTarget(mem, state, me);
    if (t === null) return NONE;
    const d2 = dist2(t.x, t.z, me.pos.x, me.pos.z);
    if (d2 > BOT_ZONE_MAX_DIST * BOT_ZONE_MAX_DIST) return NONE;
    mem.zoneX = t.x;
    mem.zoneZ = t.z;
    mem.zonePlanTicks = Math.max(1, secToTicks(BOT_ACTION_MAX_PREP_SEC));
  }
  mem.zonePlanTicks--;
  const want = lookAtGround(state, me, mem.zoneX, mem.zoneZ);
  const yaw = turnYaw(want.yaw);
  const pitch = turnPitch(want.pitch);
  const at = slowZonePlacement(state, me, yaw, pitch);
  const ok = dist2(at.x, at.z, mem.zoneX, mem.zoneZ) <= BOT_ZONE_PLACE_TOLERANCE * BOT_ZONE_PLACE_TOLERANCE;
  if (ok) mem.zonePlanTicks = 0;
  return { press: ok, yaw: want.yaw, pitch: want.pitch, holdFire: true };
}

/**
 * Capacité de rôle du bot pour ce tick (pilier : bouclier ; demi : zone ; ailier : rien ici). `carrier` : il porte le
 * ballon et court selon (runX, runZ). PURE vis-à-vis de l'état.
 */
export function roleAbilityTick(
  mem: BotMemory,
  state: Readonly<MatchState>,
  me: PlayerState,
  carrier: boolean,
  runX: number,
  runZ: number,
  turnYaw: (want: number) => number,
  turnPitch: (want: number) => number,
): AbilityIntent {
  if (me.status !== 'active') return NONE;
  if (me.role === 'pilier') return shieldTick(mem, state, me, carrier, runX, runZ);
  if (me.role === 'demi') return zoneTick(mem, state, me, turnYaw, turnPitch);
  return NONE;
}
