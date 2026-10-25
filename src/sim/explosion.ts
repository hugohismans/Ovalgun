/**
 * Explosions des grenades du demi et knockback (étape 7). Appelé par projectiles.ts à l'impact (relief, mur, joueur
 * adverse, bouclier) ou en fin de vie de la grenade (portée / durée : explosion en l'air).
 *
 * Pour chaque joueur (ordre des ids), `d` = distance du centre de l'explosion à la SURFACE de sa capsule (point de
 * son axe le plus proche, moins PLAYER_RADIUS ; 0 s'il est dedans) ; il est concerné si d ≤ blastRadius ET s'il est
 * en ligne de vue (voir hasLineOfSight) :
 *  - u = d / blastRadius ∈ [0, 1] ; dégâts = blastDamageCenter + (blastDamageEdge − blastDamageCenter)·u
 *    (+ directHitBonus pour le joueur touché de plein fouet) × CARRIER_DAMAGE_MULT s'il porte le ballon ;
 *    knockback = (knockback, knockbackUp) × (1 + (knockbackEdgeMult − 1)·u), horizontal dans la direction centre ->
 *    joueur (réduit linéairement à moins de PLAYER_RADIUS du centre : une explosion sous les pieds pousse vers le haut) ;
 *  - ADVERSAIRES du tireur touchables (isHittable : actifs, non invulnérables, jauge > 0) : dégâts + knockback ;
 *    un adversaire protégé par un bouclier (shield.ts : ligne de vue qui traverse un bouclier de son équipe, ou
 *    explosion dans l'arc frontal du pilier lui-même) ne prend AUCUN dégât et un knockback × SHIELD_BLAST_KNOCKBACK_MULT
 *    (événement 'blocked' pour le pilier, une fois par explosion) ;
 *  - le TIREUR : knockback × selfKnockbackMult, aucun dégât (« grenade jump ») ;
 *  - coéquipiers du tireur (pas de tir ami), joueurs au sol / qui se relèvent / invulnérables : rien (ni dégâts, ni
 *    knockback : un joueur « intouchable » l'est aussi pour le souffle).
 * Une explosion qui touche au moins un adversaire crédite UNE touche au tireur (stats.shotsHit ≤ shotsFired).
 *
 * Knockback (applyKnockback) : le souffle IMPOSE une vitesse horizontale MINIMALE le long de sa direction (correction
 * de la relecture de l'étape 7 : avant, il s'ajoutait à la vitesse du joueur — un porteur lancé vers l'explosion n'était
 * presque pas arrêté, et un porteur qui fuyait une explosion derrière lui était accéléré vers l'en-but). Avec n la
 * direction du souffle et a = vitesse·n : si a < souffle, la vitesse gagne (souffle − a)·n (la composante latérale est
 * conservée) ; un joueur qui va déjà plus vite que le souffle dans son sens ne gagne rien ; horizontale plafonnée à
 * KNOCKBACK_MAX_HORIZONTAL_SPEED (une vitesse déjà plus haute n'est pas réduite). Verticale = max(vy, 0) + souffle,
 * plafonnée à KNOCKBACK_MAX_VERTICAL_SPEED. Il quitte le sol, garde son élan en l'air (player.ts : en l'air, on ne freine
 * pas), atterrit normalement ; le déplacement reste
 * balayé en sous-pas contre le relief (body.ts : pas de traversée de muret). Esquive, glissade et grimpe sont
 * interrompues ; un plongeon passe en récupération (sans contrôle jusqu'au sol). Un porteur projeté garde le ballon.
 */

import {
  BLAST_LOS_BACKOFF,
  CARRIER_DAMAGE_MULT,
  COYOTE_TIME_SEC,
  DIVE_RECOVER_SEC,
  KNOCKBACK_MAX_HORIZONTAL_SPEED,
  KNOCKBACK_MAX_VERTICAL_SPEED,
  PLAYER_RADIUS,
  SHIELD_BLAST_KNOCKBACK_MULT,
  type WeaponStats,
} from './constants';
import { isCarrier, playerHeight } from './playerStatus';
import { segmentTerrainEntry } from './raycast';
import { segmentShieldEntry, shieldArcCovers, shieldPoint, shieldUp } from './shield';
import { applyDamage, isHittable } from './stability';
import { secToTicks } from './time';
import type { MatchState, PlayerState, Projectile } from './types';
import type { Vec3 } from './vec';

/**
 * Point de l'axe de la capsule de `p` le plus proche de `c` (axe vertical de pos.y + r à pos.y + max(h − r, r)).
 * Écrit dans `out` et le renvoie.
 */
function closestAxisPoint(p: PlayerState, c: Vec3, out: Vec3): Vec3 {
  const y0 = p.pos.y + PLAYER_RADIUS;
  const y1 = p.pos.y + Math.max(playerHeight(p) - PLAYER_RADIUS, PLAYER_RADIUS);
  out.x = p.pos.x;
  out.y = c.y < y0 ? y0 : c.y > y1 ? y1 : c.y;
  out.z = p.pos.z;
  return out;
}

/** Distance (m) du point `c` à la surface de la capsule de `p` (0 si `c` est dedans). PURE. */
export function blastDistance(p: PlayerState, c: Vec3): number {
  const a = closestAxisPoint(p, c, { x: 0, y: 0, z: 0 });
  const d = Math.sqrt((a.x - c.x) ** 2 + (a.y - c.y) ** 2 + (a.z - c.z) ** 2);
  return Math.max(0, d - PLAYER_RADIUS);
}

/**
 * Ligne de vue d'une explosion d'origine `los` vers `p` (règle simple et déterministe) : vrai si le segment `los` ->
 * point de son axe le plus proche du centre `center`, OU `los` -> haut de son axe, ne coupe aucun relief (sol, butte,
 * rampe, muret, mur invisible franchi vers l'extérieur). Une butte entre l'explosion et le joueur le protège ; une tête
 * qui dépasse d'un muret bas ne l'est pas. Renvoie les points visibles dans `visible` (0, 1 ou 2 points).
 */
function visiblePoints(state: MatchState, los: Vec3, center: Vec3, p: PlayerState, visible: Vec3[]): void {
  visible.length = 0;
  const near = closestAxisPoint(p, center, { x: 0, y: 0, z: 0 });
  const top = { x: p.pos.x, y: p.pos.y + Math.max(playerHeight(p) - PLAYER_RADIUS, PLAYER_RADIUS), z: p.pos.z };
  if (segmentTerrainEntry(state.field, los, near) < 0) visible.push(near);
  if (segmentTerrainEntry(state.field, los, top) < 0) visible.push(top);
}

/** Vrai si le joueur `p` est en ligne de vue de l'explosion (au moins un point de son axe visible). PURE (bots, tests). */
export function hasLineOfSight(state: MatchState, los: Vec3, center: Vec3, p: PlayerState): boolean {
  const pts: Vec3[] = [];
  visiblePoints(state, los, center, p, pts);
  return pts.length > 0;
}

/**
 * Knockback : souffle horizontal (dx·horiz, dz·horiz) ((dx, dz) de norme ≤ 1) imposé comme vitesse MINIMALE le long de
 * sa direction, et `up` ajouté à la verticale. Voir l'en-tête du fichier. Sans effet si les deux composantes sont nulles.
 */
export function applyKnockback(p: PlayerState, dx: number, dz: number, horiz: number, up: number): void {
  if (horiz <= 0 && up <= 0) return;
  if (p.move === 'dodge' || p.move === 'slide' || p.move === 'climb') {
    p.move = 'run';
    p.moveTicks = 0;
  } else if (p.move === 'dive') {
    p.move = 'dive_recover';
    p.moveTicks = secToTicks(DIVE_RECOVER_SEC);
  }
  const s0 = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  // Souffle horizontal : norme `push`, direction unitaire (nx, nz) ; on ne complète que ce qui manque le long de n.
  const push = Math.sqrt(dx * dx + dz * dz) * Math.max(horiz, 0);
  if (push > 0) {
    const nx = dx / Math.sqrt(dx * dx + dz * dz);
    const nz = dz / Math.sqrt(dx * dx + dz * dz);
    const along = p.vel.x * nx + p.vel.z * nz;
    if (along < push) {
      p.vel.x += (push - along) * nx;
      p.vel.z += (push - along) * nz;
    }
    const s1 = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    const cap = Math.max(s0, KNOCKBACK_MAX_HORIZONTAL_SPEED);
    if (s1 > cap) {
      p.vel.x *= cap / s1;
      p.vel.z *= cap / s1;
    }
  }
  if (up > 0) {
    const vy = Math.max(p.vel.y, 0) + up;
    p.vel.y = Math.min(vy, Math.max(p.vel.y, KNOCKBACK_MAX_VERTICAL_SPEED));
    p.onGround = false;
    p.airTicks = secToTicks(COYOTE_TIME_SEC) + 1; // pas de saut « coyote » gratuit après un souffle
  }
}

/** Bouclier (règles 1 et 2) qui protège `p` de l'explosion (−1 : aucun) ; `hit` reçoit le point du bouclier. */
function shieldingPilier(state: MatchState, p: PlayerState, los: Vec3, visible: readonly Vec3[], hit: Vec3): number {
  // Règle 2 : explosion dans l'arc frontal du pilier lui-même.
  if (shieldUp(p)) {
    const dx = los.x - p.pos.x;
    const dz = los.z - p.pos.z;
    if (shieldArcCovers(p, dx, dz)) {
      const sp = shieldPoint(p, dx, dz, los.y);
      hit.x = sp.x;
      hit.y = sp.y;
      hit.z = sp.z;
      return p.id;
    }
  }
  // Règle 1 : TOUTES les lignes de vue traversent un bouclier levé de son équipe (le premier, ordre des ids).
  let first = -1;
  for (const pt of visible) {
    let blockedBy = -1;
    for (const q of state.players) {
      if (q.team !== p.team || !shieldUp(q)) continue;
      const t = segmentShieldEntry(los, pt, q);
      if (t >= 0) {
        blockedBy = q.id;
        if (first < 0) {
          hit.x = los.x + (pt.x - los.x) * t;
          hit.y = los.y + (pt.y - los.y) * t;
          hit.z = los.z + (pt.z - los.z) * t;
        }
        break;
      }
    }
    if (blockedBy < 0) return -1;
    if (first < 0) first = blockedBy;
  }
  return first;
}

/**
 * Explosion de la grenade `proj` (arme `w`) au point `center`. `los` : origine de la ligne de vue (center reculé le long
 * de la trajectoire, côté libre ; = center pour une explosion en l'air). `directId` : joueur touché de plein fouet (−1 :
 * aucun). Événements 'explosion', puis 'hit' / 'blocked'.
 */
export function explode(state: MatchState, proj: Projectile, w: WeaponStats, center: Vec3, los: Vec3, directId: number): void {
  state.events.push({ type: 'explosion', ownerId: proj.ownerId, pos: { x: center.x, y: center.y, z: center.z }, radius: w.blastRadius });
  const owner = state.players[proj.ownerId];
  const visible: Vec3[] = [];
  const shieldHit: Vec3 = { x: 0, y: 0, z: 0 };
  const blockedShields: number[] = [];
  let touched = false;
  for (const p of state.players) {
    const isOwner = p.id === proj.ownerId;
    const opponent = p.team !== proj.team;
    if (!isOwner && !opponent) continue; // pas de tir ami
    if (isOwner ? p.status !== 'active' || p.invulnTicks > 0 : !isHittable(p)) continue;
    const d = blastDistance(p, center);
    if (d > w.blastRadius) continue;
    visiblePoints(state, los, center, p, visible);
    if (visible.length === 0) continue;
    const u = w.blastRadius > 0 ? Math.min(1, d / w.blastRadius) : 0;
    const fall = 1 + (w.knockbackEdgeMult - 1) * u;
    // Direction horizontale centre -> joueur, réduite à moins de PLAYER_RADIUS (explosion sous les pieds : vers le haut).
    const hx = p.pos.x - center.x;
    const hz = p.pos.z - center.z;
    const hl = Math.max(Math.sqrt(hx * hx + hz * hz), PLAYER_RADIUS);
    let kb = w.knockback * fall;
    let up = w.knockbackUp * fall;
    if (isOwner) {
      kb *= w.selfKnockbackMult;
      up *= w.selfKnockbackMult;
    } else {
      const shieldId = shieldingPilier(state, p, los, visible, shieldHit);
      if (shieldId >= 0) {
        kb *= SHIELD_BLAST_KNOCKBACK_MULT;
        up *= SHIELD_BLAST_KNOCKBACK_MULT;
        if (!blockedShields.includes(shieldId)) {
          blockedShields.push(shieldId);
          state.events.push({ type: 'blocked', targetId: shieldId, sourceId: proj.ownerId, pos: { x: shieldHit.x, y: shieldHit.y, z: shieldHit.z } });
        }
      } else {
        const base = w.blastDamageCenter + (w.blastDamageEdge - w.blastDamageCenter) * u + (p.id === directId ? w.directHitBonus : 0);
        const amount = base * (isCarrier(state, p) ? CARRIER_DAMAGE_MULT : 1);
        const at = visible[0];
        applyDamage(state, p, amount, proj.ownerId, { x: at.x, y: at.y, z: at.z });
        touched = true;
      }
    }
    applyKnockback(p, hx / hl, hz / hl, kb, up);
  }
  if (touched && owner !== undefined) owner.stats.shotsHit++;
}

/** Origine de la ligne de vue : `hit` reculé de BLAST_LOS_BACKOFF (au plus `back` m) le long de la direction `dir`. */
export function blastLosOrigin(hit: Vec3, dir: Vec3, back: number): Vec3 {
  const k = Math.max(0, Math.min(BLAST_LOS_BACKOFF, back));
  return { x: hit.x - dir.x * k, y: hit.y - dir.y * k, z: hit.z - dir.z * k };
}
