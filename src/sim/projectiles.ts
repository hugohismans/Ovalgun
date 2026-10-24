/**
 * Projectiles (étape 6 de `step`, étape 5 du cahier des charges) : déplacement BALAYÉ et collisions.
 *
 * Chaque projectile (ordre des ids : state.projectiles est rangé par id croissant) parcourt un segment par tick :
 *   1. segment [pos, pos + vel·dt] (parabole exacte si l'arme a une gravité — grenades, étape 7), raccourci au
 *      reste de portée (`range − traveled`) ;
 *   2. premier contact sur ce segment (raycast.ts, exact : aucun « tunnel », même à 10 m par tick) :
 *        - capsules des ADVERSAIRES touchables (isHittable : actifs, non invulnérables, jauge > 0), selon leur
 *          posture (playerHeight : glissade / plongeon = capsule basse), élargies du rayon du projectile
 *          (PROJECTILE_HIT_RADIUS) — pas de tir ami. Au premier segment (départ de l'origine de visée), un
 *          adversaire qui CONTIENT l'origine n'est touché que si le tir va vers lui (startsInsideLeaving) ;
 *        - relief (sol, buttes, rampes, faces et dessus des murets) et murs invisibles ;
 *      le plus petit t l'emporte ; à égalité entre joueurs, le plus petit id ;
 *   3. joueur touché : bouclier (point d'extension, étape 7) puis dégâts = base × atténuation (distance parcourue
 *      jusqu'à l'impact) × CARRIER_DAMAGE_MULT si porteur (stability.ts), une touche créditée au tireur
 *      (stats.shotsHit, une fois par projectile) ; relief : impact (grenade : explosion,
 *      étape 7) ; sinon il avance, et disparaît en bout de portée ou de durée de vie (ttl) ;
 *   4. toute disparition émet 'projectile_end' (traceurs, étincelles du rendu).
 *
 * Appelé AVANT le déplacement des joueurs (match.ts) : le segment d'un tick est testé contre les capsules au DÉBUT
 * du tick, c'est-à-dire là où le tireur les voyait (au demi-tick d'interpolation près) quand il a tiré.
 */

import { PLAYER_RADIUS, PROJECTILE_HIT_RADIUS, ROLES, TICK_DT, type WeaponStats } from './constants';
import { playerHeight } from './playerStatus';
import { segmentCapsuleEntry, segmentTerrainEntry, startsInsideLeaving } from './raycast';
import { applyDamage, damageAmount, isHittable } from './stability';
import type { MatchState, PlayerState, Projectile, ProjectileEndReason } from './types';
import type { Vec3 } from './vec';

/**
 * POINT D'EXTENSION ÉTAPE 7 — bouclier frontal du pilier : vrai si le bouclier levé de `target` arrête le
 * projectile qui le touche en `hit` en venant de la direction `dir`. Appelé AVANT l'application des dégâts ;
 * vrai => événement 'blocked', aucun dégât. Étape 5 : aucun bouclier.
 */
function shieldBlocks(_state: MatchState, _target: PlayerState, _proj: Projectile, _hit: Vec3, _dir: Vec3): boolean {
  return false; // TODO ÉTAPE 7 : SHIELD_HALF_ANGLE_DEG, SHIELD_DISTANCE, SHIELD_RADIUS.
}

/**
 * POINT D'EXTENSION ÉTAPE 7 — impact d'une grenade (relief ou joueur) : explosion (blastRadius, dégâts dégressifs,
 * directHitBonus, knockback). Étape 5 : les grenades ne sont pas tirées (combat.ts, weaponImplemented).
 */
function onGrenadeImpact(_state: MatchState, _proj: Projectile, _pos: Vec3, _w: WeaponStats): void {
  // TODO ÉTAPE 7.
}

function endProjectile(state: MatchState, proj: Projectile, pos: Vec3, reason: ProjectileEndReason): void {
  state.events.push({
    type: 'projectile_end',
    projectileId: proj.id,
    ownerId: proj.ownerId,
    kind: proj.kind,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    reason,
  });
}

/**
 * Avance un projectile d'un tick. Renvoie faux s'il disparaît (impact, portée, durée de vie).
 */
function stepProjectile(state: MatchState, proj: Projectile): boolean {
  const owner = state.players[proj.ownerId];
  if (owner === undefined) return false; // état forgé : propriétaire inconnu, retiré sans effet
  const w = ROLES[owner.role].weapon;
  const from = proj.pos;
  const g = w.gravity;
  let tx = from.x + proj.vel.x * TICK_DT;
  let ty = from.y + proj.vel.y * TICK_DT - 0.5 * g * TICK_DT * TICK_DT;
  let tz = from.z + proj.vel.z * TICK_DT;
  let len = Math.sqrt((tx - from.x) ** 2 + (ty - from.y) ** 2 + (tz - from.z) ** 2);
  const remaining = w.range - proj.traveled;
  let outOfRange = false;
  if (len >= remaining) {
    const k = len > 1e-12 ? Math.max(0, remaining) / len : 0;
    tx = from.x + (tx - from.x) * k;
    ty = from.y + (ty - from.y) * k;
    tz = from.z + (tz - from.z) * k;
    len = Math.max(0, remaining);
    outOfRange = true;
  }
  const to = { x: tx, y: ty, z: tz };

  // Premier contact : relief, puis joueurs adverses touchables plus tôt sur le segment.
  const tTerrain = segmentTerrainEntry(state.field, from, to);
  let target: PlayerState | null = null;
  let tHit = tTerrain >= 0 ? tTerrain : 2;
  const hitRadius = PLAYER_RADIUS + (proj.kind === 'grenade' ? 0 : PROJECTILE_HIT_RADIUS);
  const dx = tx - from.x;
  const dy = ty - from.y;
  const dz = tz - from.z;
  for (const p of state.players) {
    if (p.team === proj.team || !isHittable(p)) continue;
    const h = playerHeight(p);
    const t = segmentCapsuleEntry(from, to, p.pos, h, hitRadius);
    // Départ DANS la capsule (adversaire collé à l'épaule) d'un tir qui s'en éloigne : pas de touche « sans viser ».
    if (t === 0 && proj.traveled === 0 && startsInsideLeaving(from, { x: dx, y: dy, z: dz }, p.pos, h, hitRadius)) continue;
    if (t >= 0 && t < tHit) {
      tHit = t;
      target = p;
    }
  }

  if (target !== null || tTerrain >= 0) {
    const hit = { x: from.x + (tx - from.x) * tHit, y: from.y + (ty - from.y) * tHit, z: from.z + (tz - from.z) * tHit };
    if (target !== null) {
      const dir = len > 1e-12 ? { x: (tx - from.x) / len, y: (ty - from.y) / len, z: (tz - from.z) / len } : { x: 0, y: 0, z: 1 };
      if (shieldBlocks(state, target, proj, hit, dir)) {
        state.events.push({ type: 'blocked', targetId: target.id, sourceId: proj.ownerId, pos: hit });
        endProjectile(state, proj, hit, 'blocked');
        return false;
      }
      if (proj.kind === 'grenade') onGrenadeImpact(state, proj, hit, w);
      else applyDamage(state, target, damageAmount(state, target, w, proj.damage, proj.traveled + len * tHit), proj.ownerId, hit);
      owner.stats.shotsHit++; // une touche par projectile (précision = shotsHit / shotsFired ≤ 1)
      endProjectile(state, proj, hit, 'player');
      return false;
    }
    if (proj.kind === 'grenade') onGrenadeImpact(state, proj, hit, w);
    endProjectile(state, proj, hit, 'terrain');
    return false;
  }

  proj.pos.x = tx;
  proj.pos.y = ty;
  proj.pos.z = tz;
  proj.vel.y -= g * TICK_DT;
  proj.traveled += len;
  if (proj.ttl > 0) proj.ttl--;
  if (outOfRange || proj.ttl <= 0) {
    endProjectile(state, proj, proj.pos, 'expired');
    return false;
  }
  return true;
}

/** Étape 6 de `step` (avant le déplacement des joueurs) : déplacement et collisions de tous les projectiles (ordre des ids), compactage en place. */
export function updateProjectiles(state: MatchState): void {
  const list = state.projectiles;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const proj = list[i];
    if (stepProjectile(state, proj)) list[n++] = proj;
  }
  list.length = n;
}
