/**
 * Projectiles (étape 6 de `step`, étapes 5 et 7 du cahier des charges) : déplacement BALAYÉ et collisions.
 *
 * Chaque projectile (ordre des ids : state.projectiles est rangé par id croissant) avance d'un tick :
 *   1. trajectoire : segment [pos, pos + vel·dt] ; si l'arme a une gravité (grenades, étape 7), parabole EXACTE balayée
 *      en PROJECTILE_ARC_SUBSTEPS cordes (extrémités sur la parabole) ; raccourcie au reste de portée (`range − traveled`) ;
 *   2. premier contact sur chaque corde (raycast.ts / shield.ts, exacts : aucun « tunnel », même à 10 m par tick) :
 *        - relief (sol, buttes, rampes, faces et dessus des murets) et murs invisibles ;
 *        - BOUCLIERS levés des adversaires (étape 7, shield.ts, règle 1 : surface franchie de l'extérieur) ;
 *        - capsules des ADVERSAIRES touchables (isHittable : actifs, non invulnérables, jauge > 0), selon leur
 *          posture (playerHeight : glissade / plongeon = capsule basse), élargies du rayon du projectile
 *          (PROJECTILE_HIT_RADIUS) — pas de tir ami. Au premier segment (départ de l'origine de visée), un
 *          adversaire qui CONTIENT l'origine n'est touché que si le tir va vers lui (startsInsideLeaving) ;
 *      le plus petit t l'emporte ; à égalité : relief, puis bouclier, puis joueur ; entre joueurs (ou boucliers), le plus petit id ;
 *   3. joueur touché : s'il a le bouclier levé et que le tir vient de son arc frontal (règle 2), le tir est bloqué ;
 *      sinon balle / plomb : dégâts = base × atténuation (distance parcourue jusqu'à l'impact) × CARRIER_DAMAGE_MULT si
 *      porteur (stability.ts), une touche créditée au tireur (stats.shotsHit, une fois par projectile) ;
 *      grenade : explosion (explosion.ts : dégâts dégressifs, impact direct, knockback, ligne de vue) ;
 *      bouclier : événement 'blocked' (le projectile est détruit ; une grenade explose contre le bouclier) ;
 *      relief : impact (grenade : explosion) ; sinon il avance, et disparaît en bout de portée ou de durée de vie (ttl)
 *      — une grenade explose alors en l'air ;
 *   4. toute disparition émet 'projectile_end' (traceurs, étincelles du rendu).
 *
 * Appelé AVANT le déplacement des joueurs (match.ts) : le segment d'un tick est testé contre les capsules au DÉBUT
 * du tick, c'est-à-dire là où le tireur les voyait (au demi-tick d'interpolation près) quand il a tiré.
 */

import {
  PLAYER_RADIUS,
  PROJECTILE_ARC_SUBSTEPS,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_MAX_LIFE_SEC,
  ROLES,
  TICK_DT,
  type WeaponStats,
} from './constants';
import { blastLosOrigin, explode } from './explosion';
import { playerHeight } from './playerStatus';
import { segmentCapsuleEntry, segmentTerrainEntry, startsInsideLeaving } from './raycast';
import { segmentShieldEntry, shieldArcCovers, shieldPoint, shieldUp } from './shield';
import { applyDamage, damageAmount, isHittable } from './stability';
import { secToTicks } from './time';
import type { FieldLayout, MatchState, PlayerState, Projectile, ProjectileEndReason } from './types';
import type { Vec3 } from './vec';

/**
 * Règle 2 du bouclier (shield.ts) : vrai si `target` a le bouclier levé et que le projectile arrive de son arc frontal
 * (direction horizontale opposée à `dir`). Appelé AVANT l'application des dégâts.
 */
function shieldBlocks(target: PlayerState, dir: Vec3): boolean {
  return shieldUp(target) && shieldArcCovers(target, -dir.x, -dir.z);
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

/** Résultat d'une corde : le projectile continue, ou il a disparu (impact, portée). */
type SegmentResult = 'flying' | 'ended';

/**
 * Impact d'une grenade : explosion au point `hit` ; origine de la ligne de vue reculée le long de la trajectoire `dir`
 * d'au plus la longueur déjà parcourue sur cette corde (`back`, côté libre de l'impact).
 */
function grenadeImpact(state: MatchState, proj: Projectile, w: WeaponStats, hit: Vec3, dir: Vec3, back: number, directId: number): void {
  explode(state, proj, w, hit, blastLosOrigin(hit, dir, back), directId);
}

/**
 * Une corde de durée `h` (TICK_DT pour une balle, TICK_DT / PROJECTILE_ARC_SUBSTEPS pour une grenade) : déplacement,
 * premier contact, effets. Renvoie 'ended' si le projectile disparaît.
 */
function stepSegment(state: MatchState, proj: Projectile, owner: PlayerState, w: WeaponStats, h: number): SegmentResult {
  const from = proj.pos;
  const g = w.gravity;
  let tx = from.x + proj.vel.x * h;
  let ty = from.y + proj.vel.y * h - 0.5 * g * h * h;
  let tz = from.z + proj.vel.z * h;
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
  const dx = tx - from.x;
  const dy = ty - from.y;
  const dz = tz - from.z;
  const dir = len > 1e-12 ? { x: dx / len, y: dy / len, z: dz / len } : { x: 0, y: 0, z: 1 };

  // Premier contact : relief, puis boucliers adverses, puis joueurs adverses touchables, strictement plus tôt.
  const tTerrain = segmentTerrainEntry(state.field, from, to);
  let tHit = tTerrain >= 0 ? tTerrain : 2;
  let shieldOwner: PlayerState | null = null;
  for (const p of state.players) {
    if (p.team === proj.team || !shieldUp(p)) continue;
    const t = segmentShieldEntry(from, to, p);
    if (t >= 0 && t < tHit) {
      tHit = t;
      shieldOwner = p;
    }
  }
  let target: PlayerState | null = null;
  const hitRadius = PLAYER_RADIUS + PROJECTILE_HIT_RADIUS;
  for (const p of state.players) {
    if (p.team === proj.team || !isHittable(p)) continue;
    const ph = playerHeight(p);
    const t = segmentCapsuleEntry(from, to, p.pos, ph, hitRadius);
    // Départ DANS la capsule (adversaire collé à l'épaule) d'un tir qui s'en éloigne : pas de touche « sans viser ».
    if (t === 0 && proj.traveled === 0 && startsInsideLeaving(from, { x: dx, y: dy, z: dz }, p.pos, ph, hitRadius)) continue;
    if (t >= 0 && t < tHit) {
      tHit = t;
      target = p;
      shieldOwner = null;
    }
  }

  if (target !== null || shieldOwner !== null || tTerrain >= 0) {
    const hit = { x: from.x + dx * tHit, y: from.y + dy * tHit, z: from.z + dz * tHit };
    const back = len * tHit;
    // Bouclier : surface franchie (règle 1), ou pilier touché par un tir venu de son arc frontal (règle 2).
    let blocker = shieldOwner;
    let blockPos = hit;
    if (target !== null && shieldBlocks(target, dir)) {
      blocker = target;
      blockPos = shieldPoint(target, -dir.x, -dir.z, hit.y);
    }
    if (blocker !== null) {
      state.events.push({ type: 'blocked', targetId: blocker.id, sourceId: proj.ownerId, pos: { x: blockPos.x, y: blockPos.y, z: blockPos.z } });
      if (proj.kind === 'grenade') grenadeImpact(state, proj, w, blockPos, dir, back, -1);
      endProjectile(state, proj, blockPos, 'blocked');
      return 'ended';
    }
    if (target !== null) {
      if (proj.kind === 'grenade') {
        grenadeImpact(state, proj, w, hit, dir, back, target.id); // une touche créditée par explode()
      } else {
        applyDamage(state, target, damageAmount(state, target, w, proj.damage, proj.traveled + back), proj.ownerId, hit);
        owner.stats.shotsHit++; // une touche par projectile (précision = shotsHit / shotsFired ≤ 1)
      }
      endProjectile(state, proj, hit, 'player');
      return 'ended';
    }
    if (proj.kind === 'grenade') grenadeImpact(state, proj, w, hit, dir, back, -1);
    endProjectile(state, proj, hit, 'terrain');
    return 'ended';
  }

  proj.pos.x = tx;
  proj.pos.y = ty;
  proj.pos.z = tz;
  proj.vel.y -= g * h;
  proj.traveled += len;
  if (outOfRange) {
    expire(state, proj, w);
    return 'ended';
  }
  return 'flying';
}

/** Fin de portée / de durée de vie : 'projectile_end' « expired » ; une grenade explose en l'air (ligne de vue depuis son centre). */
function expire(state: MatchState, proj: Projectile, w: WeaponStats): void {
  if (proj.kind === 'grenade') explode(state, proj, w, proj.pos, proj.pos, -1);
  endProjectile(state, proj, proj.pos, 'expired');
}

/**
 * Avance un projectile d'un tick (une corde, ou PROJECTILE_ARC_SUBSTEPS cordes sur la parabole d'une grenade).
 * Renvoie faux s'il disparaît (impact, portée, durée de vie).
 */
function stepProjectile(state: MatchState, proj: Projectile): boolean {
  const owner = state.players[proj.ownerId];
  if (owner === undefined) return false; // état forgé : propriétaire inconnu, retiré sans effet
  const w = ROLES[owner.role].weapon;
  const n = w.gravity > 0 ? Math.max(1, PROJECTILE_ARC_SUBSTEPS) : 1;
  const h = TICK_DT / n;
  for (let k = 0; k < n; k++) {
    if (stepSegment(state, proj, owner, w, h) === 'ended') return false;
  }
  if (proj.ttl > 0) proj.ttl--;
  if (proj.ttl <= 0) {
    expire(state, proj, w);
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

/**
 * Point d'impact prévu d'une grenade lancée de `origin` à `vel` avec l'arme `w` (PURE : bots, indicateur du rendu) :
 * même parabole balayée que la simulation (PROJECTILE_ARC_SUBSTEPS cordes par tick), contre le RELIEF seulement (ni
 * joueurs, ni boucliers) ; bout de portée ou de durée de vie : point d'explosion en l'air. Nouveau vecteur.
 */
export function predictGrenadeImpact(field: FieldLayout, origin: Vec3, vel: Vec3, w: WeaponStats): Vec3 {
  const n = w.gravity > 0 ? Math.max(1, PROJECTILE_ARC_SUBSTEPS) : 1;
  const h = TICK_DT / n;
  const maxTicks = Math.max(1, secToTicks(PROJECTILE_MAX_LIFE_SEC));
  const p = { x: origin.x, y: origin.y, z: origin.z };
  let vy = vel.y;
  let traveled = 0;
  for (let tick = 0; tick < maxTicks; tick++) {
    for (let k = 0; k < n; k++) {
      let tx = p.x + vel.x * h;
      let ty = p.y + vy * h - 0.5 * w.gravity * h * h;
      let tz = p.z + vel.z * h;
      let len = Math.sqrt((tx - p.x) ** 2 + (ty - p.y) ** 2 + (tz - p.z) ** 2);
      const remaining = w.range - traveled;
      const out = len >= remaining;
      if (out) {
        const s = len > 1e-12 ? Math.max(0, remaining) / len : 0;
        tx = p.x + (tx - p.x) * s;
        ty = p.y + (ty - p.y) * s;
        tz = p.z + (tz - p.z) * s;
        len = Math.max(0, remaining);
      }
      const to = { x: tx, y: ty, z: tz };
      const t = segmentTerrainEntry(field, p, to);
      if (t >= 0) return { x: p.x + (tx - p.x) * t, y: p.y + (ty - p.y) * t, z: p.z + (tz - p.z) * t };
      p.x = tx;
      p.y = ty;
      p.z = tz;
      if (out) return p;
      vy -= w.gravity * h;
      traveled += len;
    }
  }
  return p;
}
