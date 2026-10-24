/**
 * Stabilité et plaquage (étape 5) : « pas de vie, pas de mort ».
 *
 *  - Dégâts (applyDamage, appelé par les projectiles à l'étape 6 de `step`) : stability −= dégâts,
 *    regenDelayTicks = secToTicks(REGEN_DELAY_SEC), lastHitBy = tireur, événement 'hit'. Le crédit stats.shotsHit
 *    est donné par projectiles.ts, UNE fois par projectile qui touche (une explosion qui touche plusieurs joueurs,
 *    étape 7, ne compte qu'une touche : shotsHit ≤ shotsFired).
 *  - Étape 8 de `step` (updateStability), ordre des ids :
 *      jauge ≤ 0 => PLAQUÉ : statut 'down' pendant secToTicks(DOWN_DURATION_SEC) ticks, mouvement spécial annulé,
 *      capacité terminée, le corps glisse (vitesse plafonnée à TACKLE_SLIDE_MAX_SPEED, freinage TACKLE_SLIDE_DECEL,
 *      player.ts) puis s'arrête, intouchable au sol ; s'il portait le ballon, il le lâche (ballon libre à la position
 *      de port, vitesse horizontale = TACKLE_DROP_CARRY_KEEP × la sienne plafonnée à TACKLE_DROP_MAX_CARRY
 *      + TACKLE_DROP_POP_FORWARD dans le sens de course, verticale TACKLE_DROP_POP_UP, lui seul bloqué
 *      TACKLE_PICKUP_BLOCK_SEC) ; événements
 *      'tackled' puis 'drop' ; stats.tackles du dernier tireur adverse (lastHitBy) ;
 *      sinon régénération : joueur actif, REGEN_DELAY_SEC sans être touché => REGEN_RATE points/s jusqu'au max.
 *  - Relevé (combat.ts, updateStatusTimers) : 'down' -> 'getting_up' -> 'active' sur place (pas de respawn).
 */

import { endAbility } from './abilities';
import { carryPosition } from './ball';
import {
  CARRIER_DAMAGE_MULT,
  DOWN_DURATION_SEC,
  REGEN_DELAY_SEC,
  REGEN_RATE,
  ROLES,
  TACKLE_DROP_CARRY_KEEP,
  TACKLE_DROP_MAX_CARRY,
  TACKLE_DROP_POP_FORWARD,
  TACKLE_DROP_POP_UP,
  TACKLE_DROP_TUMBLE_RATE,
  TACKLE_PICKUP_BLOCK_SEC,
  TACKLE_SLIDE_MAX_SPEED,
  TICK_DT,
  type WeaponStats,
} from './constants';
import { isCarrier } from './playerStatus';
import { secToTicks } from './time';
import type { MatchState, PlayerState } from './types';
import { forward, type Vec3 } from './vec';

/** Vitesse horizontale (m/s) sous laquelle le « sens de course » d'un plaqué est son regard. */
const RUN_DIR_MIN_SPEED = 1e-3;

/**
 * Le joueur peut-il être touché par un projectile ? Actif (les joueurs 'down' / 'getting_up' sont intouchables
 * et laissent passer les tirs), non invulnérable (plongeon, fin de relevé) et pas déjà à 0 : une balle qui arrive
 * dans le même tick qu'une balle qui a vidé la jauge le traverse (le crédit du plaquage reste à celui qui l'a vidée).
 */
export const isHittable = (p: PlayerState): boolean => p.status === 'active' && p.invulnTicks === 0 && p.stability > 0;

/**
 * Multiplicateur d'atténuation des dégâts d'une arme à la distance parcourue `dist` (m) : 1 jusqu'à
 * falloffStart, puis linéaire jusqu'à falloffMinMult à `range` (et au-delà). PURE.
 */
export function damageFalloff(w: WeaponStats, dist: number): number {
  if (dist <= w.falloffStart) return 1;
  const span = w.range - w.falloffStart;
  if (span <= 0) return w.falloffMinMult;
  const u = Math.min(1, (dist - w.falloffStart) / span);
  return 1 + (w.falloffMinMult - 1) * u;
}

/**
 * Dégâts de stabilité infligés à `target` par un projectile de base `base` ayant parcouru `dist` (m) avec l'arme `w` :
 * base × atténuation × CARRIER_DAMAGE_MULT si la cible porte le ballon. PURE.
 */
export function damageAmount(state: MatchState, target: PlayerState, w: WeaponStats, base: number, dist: number): number {
  return base * damageFalloff(w, dist) * (isCarrier(state, target) ? CARRIER_DAMAGE_MULT : 1);
}

/**
 * Applique des dégâts de stabilité (événement 'hit', `amount` brut). Ne crédite PAS stats.shotsHit : c'est
 * l'appelant (projectiles.ts) qui compte une touche par projectile.
 */
export function applyDamage(state: MatchState, target: PlayerState, amount: number, sourceId: number, pos: Vec3): void {
  target.stability -= amount;
  target.regenDelayTicks = secToTicks(REGEN_DELAY_SEC);
  target.lastHitBy = sourceId;
  state.events.push({ type: 'hit', targetId: target.id, sourceId, amount, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

/**
 * Le plaqué lâche le ballon : libre à la position de port, petit rebond vers l'avant de sa course. Seule une part
 * plafonnée de sa vitesse passe au ballon (TACKLE_DROP_CARRY_KEEP, TACKLE_DROP_MAX_CARRY) : plaqué en esquive ou en
 * plongeon, le ballon retombe à quelques mètres, il ne part pas comme un coup de pied.
 */
function dropBall(state: MatchState, p: PlayerState): void {
  const b = state.ball;
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  const dir = sp > RUN_DIR_MIN_SPEED ? { x: p.vel.x / sp, z: p.vel.z / sp } : forward(p.yaw);
  const horiz = Math.min(sp * TACKLE_DROP_CARRY_KEEP, TACKLE_DROP_MAX_CARRY) + TACKLE_DROP_POP_FORWARD;
  b.mode = 'loose';
  b.carrierId = -1;
  b.throwerId = p.id;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.looseTicks = 0;
  b.lastTeam = p.team;
  b.pos = carryPosition(p.pos, p.yaw);
  // `+ 0` : pas de -0 dans l'état (il deviendrait 0 après un aller-retour JSON).
  b.vel = { x: dir.x * horiz + 0, y: TACKLE_DROP_POP_UP, z: dir.z * horiz + 0 };
  b.spinRate = 0;
  b.tumbleRate = TACKLE_DROP_TUMBLE_RATE;
  p.pickupBlockTicks = secToTicks(TACKLE_PICKUP_BLOCK_SEC);
}

/** Plaquage de `p` (jauge vide). */
function tackle(state: MatchState, p: PlayerState): void {
  const byId = p.lastHitBy;
  const carrier = isCarrier(state, p);
  if (carrier) dropBall(state, p);
  // Le corps glisse au sol (player.ts) : vitesse horizontale plafonnée (plaqué en esquive, en plongeon…).
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  if (sp > TACKLE_SLIDE_MAX_SPEED) {
    p.vel.x *= TACKLE_SLIDE_MAX_SPEED / sp;
    p.vel.z *= TACKLE_SLIDE_MAX_SPEED / sp;
  }
  p.status = 'down';
  p.statusTicks = secToTicks(DOWN_DURATION_SEC);
  p.stability = 0;
  p.regenDelayTicks = 0;
  p.move = 'run';
  p.moveTicks = 0;
  p.invulnTicks = 0;
  p.jumpBufferTicks = 0;
  endAbility(state, p);
  const by = state.players[byId];
  if (by !== undefined && by.team !== p.team) by.stats.tackles++;
  state.events.push({ type: 'tackled', targetId: p.id, byId });
  if (carrier) state.events.push({ type: 'drop', playerId: p.id });
}

/** Étape 8 de `step` : plaquages (jauge ≤ 0) puis régénération, ordre des ids. */
export function updateStability(state: MatchState): void {
  for (const p of state.players) {
    if (p.status !== 'active') continue;
    if (p.stability <= 0) {
      tackle(state, p);
      continue;
    }
    const max = ROLES[p.role].stabilityMax;
    if (p.regenDelayTicks === 0 && p.stability < max) p.stability = Math.min(max, p.stability + REGEN_RATE * TICK_DT);
  }
}
