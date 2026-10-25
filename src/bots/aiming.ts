/**
 * Visée et tir d'un bot (étape 6), hors porteur (la sim interdit de toute façon au porteur de tirer).
 *
 *  - Cible : UNIQUEMENT la cible du rôle (decision.shootId, choisie par tactics.ts : le porteur pour la pression et le
 *    repli, une menace directe pour les autres rôles), si elle est active et à portée d'engagement (portée de l'arme ×
 *    engageRangeMult) ; sinon aucune (le bot regarde où il court). Correction de l'étape 6 : le repli sur « l'adversaire
 *    le plus proche » faisait tirer tout le monde sur tout le monde (85–90 % des plaquages sur des non-porteurs).
 *    Nouvelle cible => temps d'acquisition = temps de réaction avant le premier tir.
 *  - Point visé : position prévue de la cible à l'arrivée du projectile × leadFraction (aim.ts), PLUS l'erreur de
 *    visée de la difficulté : un décalage tiré au PRNG du bot toutes les BOT_AIM_ERROR_PERIOD_SEC (+ jitter), rejoint en
 *    douceur (BOT_AIM_ERROR_SMOOTH_SEC) — une erreur qui dérive lentement, pas un bruit blanc par tick. L'erreur est
 *    tirée en écarts-types (sans unité) puis convertie en angle selon la distance : max(aimErrorDeg,
 *    atan(aimErrorM / distance)) — de près, un décalage latéral en mètres (on rate aussi à 5 m).
 *  - Tir par rafales (BOT_BURST_SEC / pauses BOT_BURST_PAUSE_SEC + jitter, × burstPauseMult de la difficulté,
 *    × BOT_RESTRAINED_PAUSE_MULT hors « press » / « cover » / « scrum ») ; l'appelant ne presse FIRE que si le regard
 *    (après rotation limitée) est à moins de BOT_FIRE_CONE_DEG de la direction voulue ; AIM au-delà de BOT_ADS_DISTANCE.
 *  - Rechargement opportuniste : RELOAD après BOT_RELOAD_IDLE_SEC sans cible si le chargeur est sous
 *    BOT_RELOAD_AMMO_FRACTION.
 *  - Étape 7 : LANCE-GRENADES (demi) : tir balistique (ballisticAimTo, parabole exacte) vers les PIEDS de la cible
 *    anticipée (BOT_GRENADE_AIM_HEIGHT au-dessus du sol, avance = durée de vol × leadFraction, vitesse plafonnée), arc
 *    bas de préférence ; au moment de tirer, le point d'impact prévu (predictGrenadeImpact, relief compris) doit tomber
 *    près du point visé (BOT_GRENADE_IMPACT_TOLERANCE) et loin du demi (rayon d'explosion + BOT_GRENADE_SELF_MARGIN),
 *    et aucun adversaire touchable ne doit être sur les premiers mètres de la parabole (jusqu'à blastRadius +
 *    BOT_GRENADE_SELF_MARGIN de lui : la grenade lui exploserait au visage, correction de la relecture de l'étape 7),
 *    sinon il essaie l'autre arc (mémorisé : lobHigh) et ne tire pas ce tick ; jamais sur une cible à moins de
 *    BOT_GRENADE_MIN_DIST. FUSIL À POMPE (pilier) : visée directe comme l'ailier, portée plafonnée (world.ts).
 *    Personne ne tire sur un pilier dont le bouclier levé lui fait face (shieldFacing : projectiles perdus).
 */

import {
  aimDir,
  aimOrigin,
  BOT_ADS_DISTANCE,
  BOT_GRENADE_AIM_HEIGHT,
  BOT_GRENADE_IMPACT_TOLERANCE,
  BOT_GRENADE_PATH_MARGIN,
  BOT_GRENADE_SELF_MARGIN,
  BOT_LEAD_SPEED_CAP_MULT,
  BOT_AIM_ERROR_PERIOD_JITTER_SEC,
  BOT_AIM_ERROR_PERIOD_SEC,
  BOT_AIM_ERROR_SMOOTH_SEC,
  BOT_AIM_PITCH_ERROR_MULT,
  BOT_BURST_PAUSE_JITTER_SEC,
  BOT_BURST_PAUSE_SEC,
  BOT_BURST_SEC,
  BOT_DIFFICULTY,
  BOT_RELOAD_AMMO_FRACTION,
  BOT_RELOAD_IDLE_SEC,
  BOT_RESTRAINED_PAUSE_MULT,
  canShoot,
  clamp,
  groundHeight,
  isHittable,
  PITCH_MAX,
  PITCH_MIN,
  PLAYER_RADIUS,
  playerHeight,
  predictGrenadeImpact,
  PROJECTILE_ARC_SUBSTEPS,
  PROJECTILE_HIT_RADIUS,
  rand,
  ROLES,
  secToTicks,
  segmentCapsuleEntry,
  shieldFacing,
  TICK_DT,
  weaponImplemented,
  type MatchState,
  type PlayerState,
  type Vec3,
  type WeaponStats,
} from '../sim';
import { aimAnglesTo, ballisticAimTo, leadAimPoint, type BallisticAim } from './aim';
import type { BotMemory } from './memory';
import { reactionTicks } from './perception';
import { cappedVelocity, dist2, engageRange, minEngageRange } from './world';

const DEG = Math.PI / 180;
/** Facteur de lissage par tick de l'erreur de visée (1 − e^(−dt/τ)). */
const ERROR_SMOOTH = 1 - Math.exp(-TICK_DT / BOT_AIM_ERROR_SMOOTH_SEC);

/** Tirage approximativement normal centré réduit (somme de 3 uniformes, écart-type 1), PRNG du bot. */
function gauss(mem: BotMemory): number {
  return (rand(mem) + rand(mem) + rand(mem) - 1.5) * 2;
}

/**
 * Fait évoluer l'erreur de visée, en écarts-types (nouvelle valeur visée à chaque période, rejointe en douceur). Une
 * fois par tick. Convertie en angle par `aimErrorScale` au moment de viser.
 */
export function updateAimError(mem: BotMemory): void {
  if (mem.errTicks <= 0) {
    mem.errTargetYaw = gauss(mem);
    mem.errTargetPitch = gauss(mem) * BOT_AIM_PITCH_ERROR_MULT;
    mem.errTicks = Math.max(1, secToTicks(BOT_AIM_ERROR_PERIOD_SEC + rand(mem) * BOT_AIM_ERROR_PERIOD_JITTER_SEC));
  }
  mem.errTicks--;
  mem.errYaw += (mem.errTargetYaw - mem.errYaw) * ERROR_SMOOTH;
  mem.errPitch += (mem.errTargetPitch - mem.errPitch) * ERROR_SMOOTH;
}

/** Écart-type angulaire (rad) de l'erreur de visée à `dist` m : max(aimErrorDeg, atan(aimErrorM / dist)). PURE. */
export function aimErrorScale(mem: BotMemory, dist: number): number {
  const diff = BOT_DIFFICULTY[mem.difficulty];
  return Math.max(diff.aimErrorDeg * DEG, Math.atan(diff.aimErrorM / Math.max(dist, 1e-3)));
}

/** Cible de tir de ce tick (PURE) : la cible du rôle si elle est un adversaire actif à portée, sinon aucune. */
export function pickTarget(state: Readonly<MatchState>, me: PlayerState, range: number, preferredId: number): PlayerState | null {
  if (range <= 0 || preferredId < 0) return null;
  const pref = state.players[preferredId];
  if (pref === undefined || pref.team === me.team || pref.status !== 'active') return null;
  return dist2(pref.pos.x, pref.pos.z, me.pos.x, me.pos.z) <= range * range ? pref : null;
}

/** Tir balistique vers une cible : regard et point visé (pieds de la cible anticipée). */
interface GrenadeAim extends BallisticAim {
  point: Vec3;
}

/**
 * Tir balistique (lance-grenades) vers les pieds de `target` anticipée (PURE) : trois passes (la durée de vol dépend du
 * point visé), vitesse de la cible plafonnée (BOT_LEAD_SPEED_CAP_MULT × runSpeed : une esquive n'est pas suivie).
 */
function grenadeAim(state: Readonly<MatchState>, me: PlayerState, target: PlayerState, w: WeaponStats, lead: number, high: boolean): GrenadeAim | null {
  const v = cappedVelocity(target, ROLES[target.role].runSpeed * BOT_LEAD_SPEED_CAP_MULT);
  let px = target.pos.x;
  let pz = target.pos.z;
  let res: GrenadeAim | null = null;
  for (let i = 0; i < 3; i++) {
    const point = { x: px, y: groundHeight(state.field, px, pz) + BOT_GRENADE_AIM_HEIGHT, z: pz };
    const sol = ballisticAimTo(me, point, w.speed, w.gravity, high);
    if (sol === null) return null;
    res = { ...sol, point };
    px = target.pos.x + v.x * sol.time * lead;
    pz = target.pos.z + v.z * sol.time * lead;
  }
  return res;
}

/**
 * Un adversaire touchable sur les premiers mètres de la parabole partie de `o` à la vitesse `v` (jusqu'à `reach` m du
 * tireur, horizontalement) ? Même découpage en cordes que la simulation (PROJECTILE_ARC_SUBSTEPS par tick), capsules
 * élargies de BOT_GRENADE_PATH_MARGIN. PURE.
 */
function grenadePathBlocked(state: Readonly<MatchState>, me: PlayerState, w: WeaponStats, o: Vec3, v: Vec3, reach: number): boolean {
  const n = Math.max(1, PROJECTILE_ARC_SUBSTEPS);
  const h = TICK_DT / n;
  const hs = Math.sqrt(v.x * v.x + v.z * v.z);
  const steps = Math.min(Math.ceil(reach / Math.max(hs, 1) / h) + 1, secToTicks(1) * n);
  const r = PLAYER_RADIUS + PROJECTILE_HIT_RADIUS + BOT_GRENADE_PATH_MARGIN;
  const a = { x: o.x, y: o.y, z: o.z };
  const b = { x: 0, y: 0, z: 0 };
  let vy = v.y;
  for (let k = 0; k < steps; k++) {
    b.x = a.x + v.x * h;
    b.y = a.y + vy * h - 0.5 * w.gravity * h * h;
    b.z = a.z + v.z * h;
    for (const p of state.players) {
      if (p.team === me.team || !isHittable(p)) continue;
      if (segmentCapsuleEntry(a, b, p.pos, playerHeight(p), r) >= 0) return true;
    }
    if (dist2(b.x, b.z, me.pos.x, me.pos.z) > reach * reach) return false;
    a.x = b.x;
    a.y = b.y;
    a.z = b.z;
    vy -= w.gravity * h;
  }
  return false;
}

/**
 * Le tir balistique `a` est-il sûr et utile ? Impact prévu (relief compris, sans les joueurs) près du point visé et loin
 * du tireur, et aucun adversaire sur les premiers mètres de la trajectoire (il y exploserait, au visage du tireur). PURE.
 */
function grenadeClear(state: Readonly<MatchState>, me: PlayerState, w: WeaponStats, a: GrenadeAim): boolean {
  const d = aimDir(a.yaw, a.pitch);
  const o = aimOrigin(me.pos, a.yaw);
  const v = { x: d.x * w.speed, y: d.y * w.speed, z: d.z * w.speed };
  const impact = predictGrenadeImpact(state.field, o, v, w);
  const near = (impact.x - a.point.x) ** 2 + (impact.y - a.point.y) ** 2 + (impact.z - a.point.z) ** 2;
  const self = w.blastRadius + BOT_GRENADE_SELF_MARGIN;
  return (
    near <= BOT_GRENADE_IMPACT_TOLERANCE * BOT_GRENADE_IMPACT_TOLERANCE &&
    dist2(impact.x, impact.z, me.pos.x, me.pos.z) > self * self &&
    !grenadePathBlocked(state, me, w, o, v, self)
  );
}

/** Visée voulue pour ce tick. */
export interface AimIntent {
  /** Cible courante (−1 : aucune ; le bot regarde alors où il va). */
  targetId: number;
  /** Direction voulue (erreur de visée comprise). */
  wantYaw: number;
  wantPitch: number;
  /** Direction idéale SANS erreur (mesure de la précision dans les tests). */
  idealYaw: number;
  idealPitch: number;
  /** Rafale en cours, cible acquise et touchable : l'appelant tire si son regard est aligné. */
  firing: boolean;
  /** Tir lointain : viser (AIM). */
  ads: boolean;
  /** Rechargement opportuniste demandé. */
  reload: boolean;
}

/**
 * Visée et rythme de tir d'un bot non porteur pour ce tick. `lookYaw` : regard par défaut sans cible (direction de
 * course). Met à jour la mémoire (cible, acquisition, rafales, erreur, inactivité) ; l'état n'est que lu.
 */
export function aimTick(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, lookYaw: number): AimIntent {
  const diff = BOT_DIFFICULTY[mem.difficulty];
  const w = ROLES[me.role].weapon;
  const usable = weaponImplemented(w) && canShoot(state, me);
  updateAimError(mem);
  const target = pickTarget(state, me, engageRange(me, mem.difficulty), mem.decision.shootId);
  if (target === null) {
    mem.aimTargetId = -1;
    mem.burstTicks = 0;
    mem.idleTicks++;
    const reload =
      usable && mem.idleTicks >= secToTicks(BOT_RELOAD_IDLE_SEC) && me.reloadTicks === 0 && me.ammo < w.magazine * BOT_RELOAD_AMMO_FRACTION;
    return { targetId: -1, wantYaw: lookYaw, wantPitch: 0, idealYaw: lookYaw, idealPitch: 0, firing: false, ads: false, reload };
  }
  mem.idleTicks = 0;
  if (target.id !== mem.aimTargetId) {
    mem.aimTargetId = target.id;
    mem.acquireTicks = reactionTicks(mem);
    mem.burstTicks = 0;
    mem.pauseTicks = 0;
    mem.lobHigh = false;
  }
  let firing = false;
  if (mem.acquireTicks > 0) {
    mem.acquireTicks--;
  } else if (mem.burstTicks > 0) {
    firing = true;
    mem.burstTicks--;
    if (mem.burstTicks === 0) {
      const role = mem.decision.role;
      const restrained = role !== 'press' && role !== 'cover' && role !== 'scrum' ? BOT_RESTRAINED_PAUSE_MULT : 1;
      const pause = (BOT_BURST_PAUSE_SEC + rand(mem) * BOT_BURST_PAUSE_JITTER_SEC) * diff.burstPauseMult * restrained;
      mem.pauseTicks = secToTicks(pause);
    }
  } else if (mem.pauseTicks > 0) {
    mem.pauseTicks--;
  } else {
    mem.burstTicks = Math.max(1, secToTicks(BOT_BURST_SEC)) - 1;
    firing = true;
  }
  const dist = Math.sqrt(dist2(target.pos.x, target.pos.z, me.pos.x, me.pos.z));
  let ideal: { yaw: number; pitch: number } | null = null;
  if (w.projectile === 'grenade') {
    // Lance-grenades : tir en cloche vers les pieds de la cible anticipée ; trajectoire vérifiée au moment de tirer.
    if (dist < minEngageRange(me)) firing = false;
    let a = grenadeAim(state, me, target, w, diff.leadFraction, mem.lobHigh);
    if (a === null) {
      mem.lobHigh = !mem.lobHigh;
      firing = false;
    } else if (firing && me.fireCd === 0 && me.ammo > 0 && me.reloadTicks === 0 && !grenadeClear(state, me, w, a)) {
      // Trajectoire bouchée (butte, muret) ou impact trop près de lui : essayer l'autre arc au prochain tick.
      const other = grenadeAim(state, me, target, w, diff.leadFraction, !mem.lobHigh);
      if (other !== null && grenadeClear(state, me, w, other)) {
        mem.lobHigh = !mem.lobHigh;
        a = other;
      }
      firing = false;
    }
    ideal = a;
  }
  if (ideal === null) {
    const origin = aimOrigin(me.pos, Math.atan2(target.pos.x - me.pos.x, target.pos.z - me.pos.z));
    ideal = aimAnglesTo(me, leadAimPoint(origin, target, w.speed, diff.leadFraction));
  }
  // Bouclier levé face à lui : projectiles perdus, il attend (ou un coéquipier le prend de flanc).
  if (shieldFacing(target, me.pos.x, me.pos.z)) firing = false;
  const errScale = aimErrorScale(mem, dist);
  return {
    targetId: target.id,
    wantYaw: ideal.yaw + mem.errYaw * errScale,
    wantPitch: clamp(ideal.pitch + mem.errPitch * errScale, PITCH_MIN, PITCH_MAX),
    idealYaw: ideal.yaw,
    idealPitch: ideal.pitch,
    firing: firing && usable && isHittable(target),
    ads: dist > BOT_ADS_DISTANCE && w.projectile !== 'grenade',
    reload: false,
  };
}
