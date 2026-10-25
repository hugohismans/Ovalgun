/**
 * Lectures géométriques communes aux bots (PURES, aucune mutation de l'état ni de la mémoire).
 */

import {
  BOT_DIFFICULTY,
  BOT_GRENADE_ENGAGE_DIST,
  BOT_GRENADE_MIN_DIST,
  BOT_SHOTGUN_ENGAGE_DIST,
  BOT_WALL_MARGIN,
  PLAYER_RADIUS,
  ROLES,
  type BotDifficulty,
  type MatchState,
  type PlayerState,
  type TeamId,
} from '../sim';
import type { Situation } from './memory';

/** Point horizontal. */
export interface Point {
  x: number;
  z: number;
}

/** Distance horizontale au carré. */
export const dist2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) ** 2 + (az - bz) ** 2;

/** Temps de course approximatif d'un joueur jusqu'à (x, z), à sa vitesse de course (s). */
export const timeTo = (p: PlayerState, x: number, z: number): number => Math.sqrt(dist2(p.pos.x, p.pos.z, x, z)) / ROLES[p.role].runSpeed;

/** Distance horizontale entre deux joueurs. */
export const playerDist = (a: PlayerState, b: PlayerState): number => Math.sqrt(dist2(a.pos.x, a.pos.z, b.pos.x, b.pos.z));

/**
 * Ramène un point dans le terrain, à `margin` des murs invisibles (BOT_WALL_MARGIN par défaut ; la course au ballon
 * passe PLAYER_RADIUS pour aller le chercher jusque dans un coin).
 */
export function clampToField(state: Readonly<MatchState>, x: number, z: number, margin = BOT_WALL_MARGIN): Point {
  const hx = state.field.width / 2 - margin;
  const hz = state.field.length / 2 - margin;
  return { x: Math.max(-hx, Math.min(hx, x)), z: Math.max(-hz, Math.min(hz, z)) };
}

/** Marge aux murs du point visé d'une course au ballon : on va le chercher jusque contre le mur. */
export const CHASE_WALL_MARGIN = PLAYER_RADIUS;

/**
 * Portée d'engagement du bot (m) : balles = portée de l'arme × engageRangeMult ;
 * plombs (pilier) = plafonnée à BOT_SHOTGUN_ENGAGE_DIST (au-delà le fusil ne fait presque rien : il se rapproche) ;
 * grenades (demi) = BOT_GRENADE_ENGAGE_DIST × engageRangeMult (au plus la portée de l'arme ; tir balistique).
 */
export function engageRange(p: PlayerState, difficulty: BotDifficulty): number {
  const w = ROLES[p.role].weapon;
  const mult = BOT_DIFFICULTY[difficulty].engageRangeMult;
  if (w.projectile === 'grenade') return Math.min(w.range, BOT_GRENADE_ENGAGE_DIST * mult);
  if (w.projectile === 'pellet') return Math.min(w.range * mult, BOT_SHOTGUN_ENGAGE_DIST);
  return w.range * mult;
}

/** Distance horizontale minimale de tir (m) : BOT_GRENADE_MIN_DIST pour le lance-grenades (son propre souffle), 0 sinon. */
export const minEngageRange = (p: PlayerState): number => (ROLES[p.role].weapon.projectile === 'grenade' ? BOT_GRENADE_MIN_DIST : 0);

/**
 * Joueur au centre du jeu selon la situation PERÇUE : le porteur, ou le receveur d'une passe en vol (futur porteur),
 * null sinon (ballon libre, coup de pied, mort). Lu dans la situation PERÇUE : un porteur qui vient d'être plaqué reste
 * le centre du jeu jusqu'à ce que le bot perçoive le changement (temps de réaction).
 */
export function perceivedFocus(state: Readonly<MatchState>, sit: Situation): PlayerState | null {
  if (sit.ballMode === 'carried') return state.players[sit.carrierId] ?? null;
  if (sit.ballMode === 'pass') return state.players[sit.passTargetId] ?? null;
  return null;
}

/** Équipe en possession selon la situation perçue (porteur, ou passe en vol de cette équipe), −1 sinon. */
export function perceivedPossession(state: Readonly<MatchState>, sit: Situation): TeamId | -1 {
  const f = perceivedFocus(state, sit);
  return f === null ? -1 : f.team;
}

/** Joueurs actifs d'une équipe (id croissant), sans allocation d'un filtre générique dans les boucles chaudes. */
export function activeOf(state: Readonly<MatchState>, team: TeamId, exceptId = -1): PlayerState[] {
  const out: PlayerState[] = [];
  for (const p of state.players) if (p.team === team && p.status === 'active' && p.id !== exceptId) out.push(p);
  return out;
}

/**
 * Joueurs actifs d'une équipe pilotés par des BOTS (id croissant) : sans les joueurs externes (humains) connus du bot.
 * La répartition des rôles (pression, course au ballon, repli, soutien) se fait entre eux seulement : un humain ne suit
 * pas les règles des bots (s'il reste en retrait, recharge ou est au sol, son rôle ne serait tenu par personne).
 */
export function botsOf(state: Readonly<MatchState>, externalIds: readonly number[], team: TeamId, exceptId = -1): PlayerState[] {
  const out: PlayerState[] = [];
  for (const p of state.players) {
    if (p.team === team && p.status === 'active' && p.id !== exceptId && !externalIds.includes(p.id)) out.push(p);
  }
  return out;
}

/** Vitesse horizontale plafonnée à `cap` (anticipation d'une course sans suivre les pointes d'une esquive). */
export function cappedVelocity(p: PlayerState, cap: number): Point {
  const s = horizontalSpeed(p);
  const k = s > cap && s > 1e-9 ? cap / s : 1;
  return { x: p.vel.x * k, z: p.vel.z * k };
}

/** Vitesse horizontale. */
export const horizontalSpeed = (p: PlayerState): number => Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
