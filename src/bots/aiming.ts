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
 *    × BOT_RESTRAINED_PAUSE_MULT hors « press » / « cover ») ; l'appelant ne presse FIRE que si le regard
 *    (après rotation limitée) est à moins de BOT_FIRE_CONE_DEG de la direction voulue ; AIM au-delà de BOT_ADS_DISTANCE.
 *  - Rechargement opportuniste : RELOAD après BOT_RELOAD_IDLE_SEC sans cible si le chargeur est sous
 *    BOT_RELOAD_AMMO_FRACTION.
 */

import {
  aimOrigin,
  BOT_ADS_DISTANCE,
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
  isHittable,
  PITCH_MAX,
  PITCH_MIN,
  rand,
  ROLES,
  secToTicks,
  TICK_DT,
  weaponImplemented,
  type MatchState,
  type PlayerState,
} from '../sim';
import { aimAnglesTo, leadAimPoint } from './aim';
import type { BotMemory } from './memory';
import { reactionTicks } from './perception';
import { dist2, engageRange } from './world';

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
  }
  let firing = false;
  if (mem.acquireTicks > 0) {
    mem.acquireTicks--;
  } else if (mem.burstTicks > 0) {
    firing = true;
    mem.burstTicks--;
    if (mem.burstTicks === 0) {
      const role = mem.decision.role;
      const restrained = role !== 'press' && role !== 'cover' ? BOT_RESTRAINED_PAUSE_MULT : 1;
      const pause = (BOT_BURST_PAUSE_SEC + rand(mem) * BOT_BURST_PAUSE_JITTER_SEC) * diff.burstPauseMult * restrained;
      mem.pauseTicks = secToTicks(pause);
    }
  } else if (mem.pauseTicks > 0) {
    mem.pauseTicks--;
  } else {
    mem.burstTicks = Math.max(1, secToTicks(BOT_BURST_SEC)) - 1;
    firing = true;
  }
  const origin = aimOrigin(me.pos, Math.atan2(target.pos.x - me.pos.x, target.pos.z - me.pos.z));
  const ideal = aimAnglesTo(me, leadAimPoint(origin, target, w.speed, diff.leadFraction));
  const dist = Math.sqrt(dist2(target.pos.x, target.pos.z, me.pos.x, me.pos.z));
  const errScale = aimErrorScale(mem, dist);
  return {
    targetId: target.id,
    wantYaw: ideal.yaw + mem.errYaw * errScale,
    wantPitch: clamp(ideal.pitch + mem.errPitch * errScale, PITCH_MIN, PITCH_MAX),
    idealYaw: ideal.yaw,
    idealPitch: ideal.pitch,
    firing: firing && usable && isHittable(target),
    ads: dist > BOT_ADS_DISTANCE,
    reload: false,
  };
}
