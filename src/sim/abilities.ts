/**
 * Capacités de rôle et zones.
 *
 * Front montant ABILITY, joueur actif (ni au sol, ni en train de se relever), utilisable en portant le ballon :
 *  - AILIER — sprint boosté (étape 5) : si `abilityCd == 0` et capacité inactive, `abilityTicks` = durée
 *    (secToTicks(ability.duration)), événement 'ability'. Pendant la durée : vitesse de course × BOOST_SPEED_MULT,
 *    accélération au sol × BOOST_ACCEL_MULT. Le cooldown (cooldownTicks : raccourci en dernière minute) démarre à la FIN
 *    de la durée active.
 *  - PILIER — bouclier frontal (étape 7, géométrie et règles : shield.ts) : même activation que le sprint boosté
 *    (durée active, puis cooldown). Un SECOND appui pendant la durée baisse le bouclier : cooldown PROPORTIONNEL à la
 *    durée utilisée (cooldown × utilisé / durée), au moins SHIELD_CANCEL_MIN_COOLDOWN_FRACTION × cooldown. Bouclier
 *    levé : vitesse de course × SHIELD_SPEED_MULT, pas de tir (combat.ts), porteur compris (« charge » derrière le bouclier).
 *  - DEMI — zone de ralentissement (étape 7) : capacité INSTANTANÉE (abilityTicks reste à 0, le cooldown part à la
 *    pose) : une zone (state.zones, id = nextEntityId) est posée au point visé (slowZonePlacement), rayon
 *    SLOW_ZONE_RADIUS, durée de vie secToTicks(ability.duration) ; elle REMPLACE la zone précédente de ce demi.
 * Un plaquage termine la capacité en cours (endAbility : cooldown complet).
 *
 * Zones (étape 10 de `step`, updateZones) : ttl décompté, zone retirée à 0 (elle a agi pendant exactement `duration`).
 * Une zone ralentit la COURSE des ADVERSAIRES de son équipe dont les pieds sont dedans (inSlowZone : distance horizontale
 * au centre ≤ rayon, |Δy| ≤ SLOW_ZONE_HEIGHT) : vitesse cible × SLOW_ZONE_SPEED_MULT (sprint, visée, porteur compris ;
 * plusieurs zones ne se cumulent pas). L'accélération, l'esquive, le plongeon et le saut ne changent pas.
 */

import {
  BOOST_ACCEL_MULT,
  BOOST_SPEED_MULT,
  ROLES,
  SHIELD_CANCEL_MIN_COOLDOWN_FRACTION,
  SHIELD_SPEED_MULT,
  SLOW_ZONE_HEIGHT,
  SLOW_ZONE_PLACE_RANGE,
  SLOW_ZONE_RADIUS,
  SLOW_ZONE_SPEED_MULT,
} from './constants';
import { groundHeight } from './field';
import { has, type TickInput } from './input';
import { aimOrigin, cooldownTicks } from './playerStatus';
import { segmentTerrainEntry } from './raycast';
import { shieldUp } from './shield';
import { secToTicks } from './time';
import { Buttons, type MatchState, type PlayerState } from './types';
import { aimDir, forward, type Vec3 } from './vec';

/** Recul (m) le long du regard depuis le point de relief touché avant de chercher le sol (face de muret). Numérique. */
const PLACE_BACKOFF = 0.05;

/** Vrai si la capacité du joueur est en cours (durée active : sprint boosté, bouclier). */
export const abilityActive = (p: PlayerState): boolean => p.abilityTicks > 0;

/** Démarre le cooldown complet de la capacité (à la fin de sa durée active, ou tout de suite pour une capacité instantanée). */
function startAbilityCooldown(state: MatchState, p: PlayerState): void {
  p.abilityCd = cooldownTicks(state, ROLES[p.role].ability.cooldown);
}

/**
 * Étape 4 de `step` : minuteries de capacité. Une capacité active décompte sa durée ; au tick où elle se termine,
 * le cooldown démarre (il n'est décompté qu'à partir du tick suivant : exactement `cooldown` après la fin).
 */
export function tickAbilityTimers(state: MatchState): void {
  for (const p of state.players) {
    if (p.abilityTicks > 0) {
      p.abilityTicks--;
      if (p.abilityTicks === 0) startAbilityCooldown(state, p);
    } else if (p.abilityCd > 0) {
      p.abilityCd--;
    }
  }
}

/** Termine la capacité en cours (plaquage) : le cooldown complet démarre maintenant. Sans effet si elle est inactive. */
export function endAbility(state: MatchState, p: PlayerState): void {
  if (p.abilityTicks <= 0) return;
  p.abilityTicks = 0;
  startAbilityCooldown(state, p);
}

/** Vrai si la capacité du rôle est implémentée : tous les rôles depuis l'étape 7 (gardé dans l'API publique : HUD). */
export const abilityImplemented = (_p: PlayerState): boolean => true;

/**
 * Point de pose d'une zone de ralentissement pour le joueur `p` regardant (yaw, pitch) (PURE : sim, rendu, bots) : le
 * rayon de visée (depuis aimOrigin, longueur SLOW_ZONE_PLACE_RANGE) contre le relief (sol, butte, rampe, muret, murs
 * invisibles) ; sans contact, au sol à SLOW_ZONE_PLACE_RANGE horizontalement devant (forward(yaw)). Centre ramené dans
 * le terrain, posé au sol (groundHeight).
 */
export function slowZonePlacement(state: MatchState, p: PlayerState, yaw: number, pitch: number): Vec3 {
  const o = aimOrigin(p.pos, yaw);
  const d = aimDir(yaw, pitch);
  const end = { x: o.x + d.x * SLOW_ZONE_PLACE_RANGE, y: o.y + d.y * SLOW_ZONE_PLACE_RANGE, z: o.z + d.z * SLOW_ZONE_PLACE_RANGE };
  const t = segmentTerrainEntry(state.field, o, end);
  let x: number;
  let z: number;
  if (t >= 0) {
    const s = Math.max(0, t * SLOW_ZONE_PLACE_RANGE - PLACE_BACKOFF);
    x = o.x + d.x * s;
    z = o.z + d.z * s;
  } else {
    const f = forward(yaw);
    x = o.x + f.x * SLOW_ZONE_PLACE_RANGE;
    z = o.z + f.z * SLOW_ZONE_PLACE_RANGE;
  }
  const hw = state.field.width / 2;
  const hl = state.field.length / 2;
  // `+ 0` : pas de -0 dans l'état (il deviendrait 0 après un aller-retour JSON).
  x = Math.max(-hw, Math.min(hw, x)) + 0;
  z = Math.max(-hl, Math.min(hl, z)) + 0;
  return { x, y: groundHeight(state.field, x, z), z };
}

/** Pose la zone du demi `p` (remplace la sienne). */
function placeSlowZone(state: MatchState, p: PlayerState): void {
  const pos = slowZonePlacement(state, p, p.yaw, p.pitch);
  const zones = state.zones;
  let n = 0;
  for (let i = 0; i < zones.length; i++) if (zones[i].ownerId !== p.id) zones[n++] = zones[i];
  zones.length = n;
  zones.push({
    id: state.nextEntityId++,
    kind: 'slow',
    ownerId: p.id,
    team: p.team,
    pos,
    radius: SLOW_ZONE_RADIUS,
    ttl: Math.max(1, secToTicks(ROLES.demi.ability.duration)),
  });
}

/** Étape 5 de `step` : activation des capacités (front montant ABILITY), ordre des ids. */
export function updateAbilities(state: MatchState, inputs: readonly TickInput[]): void {
  for (const p of state.players) {
    const inp = inputs[p.id];
    if (inp === undefined || !has(inp.pressed, Buttons.ABILITY) || p.status !== 'active') continue;
    const ab = ROLES[p.role].ability;
    if (p.role === 'pilier' && p.abilityTicks > 0) {
      // Bouclier baissé avant la fin : cooldown proportionnel à la durée utilisée (au moins la fraction minimale).
      const dur = Math.max(1, secToTicks(ab.duration));
      const used = Math.min(1, Math.max(SHIELD_CANCEL_MIN_COOLDOWN_FRACTION, (dur - p.abilityTicks) / dur));
      p.abilityTicks = 0;
      p.abilityCd = cooldownTicks(state, ab.cooldown * used);
      continue;
    }
    if (p.abilityCd > 0 || p.abilityTicks > 0) continue;
    if (p.role === 'demi') {
      placeSlowZone(state, p);
      startAbilityCooldown(state, p);
    } else {
      const duration = secToTicks(ab.duration);
      if (duration > 0) p.abilityTicks = duration;
      else startAbilityCooldown(state, p);
    }
    state.events.push({ type: 'ability', playerId: p.id, role: p.role });
  }
}

/** Étape 10 de `step` : durée de vie des zones (ttl décompté, zone retirée à 0 ; ordre des ids conservé). */
export function updateZones(state: MatchState): void {
  const zones = state.zones;
  let n = 0;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.ttl > 0) z.ttl--;
    if (z.ttl > 0) zones[n++] = z;
  }
  zones.length = n;
}

/** Vrai si les pieds de `p` sont dans une zone de ralentissement ADVERSE (PURE : déplacement, rendu, bots). */
export function inSlowZone(state: MatchState, p: PlayerState): boolean {
  for (const z of state.zones) {
    if (z.team === p.team || z.kind !== 'slow') continue;
    const dx = p.pos.x - z.pos.x;
    const dz = p.pos.z - z.pos.z;
    if (dx * dx + dz * dz <= z.radius * z.radius && Math.abs(p.pos.y - z.pos.y) <= SLOW_ZONE_HEIGHT) return true;
  }
  return false;
}

/**
 * Multiplicateur de vitesse de course lié aux capacités : BOOST_SPEED_MULT (sprint boosté de l'ailier),
 * SHIELD_SPEED_MULT (bouclier levé du pilier), × SLOW_ZONE_SPEED_MULT dans une zone de ralentissement adverse.
 */
export function abilitySpeedMultiplier(state: MatchState, p: PlayerState): number {
  let m = 1;
  if (p.role === 'ailier' && abilityActive(p)) m *= BOOST_SPEED_MULT;
  if (shieldUp(p)) m *= SHIELD_SPEED_MULT;
  if (state.zones.length > 0 && inSlowZone(state, p)) m *= SLOW_ZONE_SPEED_MULT;
  return m;
}

/** Multiplicateur d'accélération au sol : BOOST_ACCEL_MULT pendant le sprint boosté de l'ailier (bouclier, zones : inchangée). */
export function abilityAccelMultiplier(_state: MatchState, p: PlayerState): number {
  return p.role === 'ailier' && abilityActive(p) ? BOOST_ACCEL_MULT : 1;
}
