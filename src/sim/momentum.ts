/**
 * Plafond de course et élan aérien (passe finale), partagés par player.ts (course en l'air) et carrier.ts (plongeon
 * aérien) sans dépendance circulaire entre ces deux modules.
 */

import { abilitySpeedMultiplier } from './abilities';
import { AIR_OVERSPEED_DECEL, CARRIER_SPEED_MULT, ROLES, SPRINT_SPEED_MULT, TICK_DT } from './constants';
import { isCarrier } from './playerStatus';
import type { MatchState, PlayerState } from './types';

/**
 * Vitesse de course MAXIMALE du joueur en ce moment (m/s) : vitesse du rôle × sprint × porteur × capacités (sprint
 * boosté, bouclier, zone de ralentissement). C'est le plafond au-delà duquel l'élan aérien s'éteint.
 */
export function maxRunSpeed(state: MatchState, p: PlayerState): number {
  const carrier = isCarrier(state, p) ? CARRIER_SPEED_MULT : 1;
  return ROLES[p.role].runSpeed * SPRINT_SPEED_MULT * carrier * abilitySpeedMultiplier(state, p);
}

/**
 * Norme horizontale gardée en l'air pour une vitesse `s` (m/s) : au-delà du plafond `ceiling`, l'excès diminue de
 * AIR_OVERSPEED_DECEL × dt par tick (sans repasser sous le plafond) ; en dessous, inchangée.
 */
export const airKeptSpeed = (s: number, ceiling: number): number =>
  s > ceiling ? Math.max(ceiling, s - AIR_OVERSPEED_DECEL * TICK_DT) : s;

/**
 * En l'air SANS entrée (ou sans contrôle : récupération d'un plongeon aérien) : l'élan est gardé, sauf l'excès
 * au-delà de maxRunSpeed qui s'éteint à AIR_OVERSPEED_DECEL (direction conservée).
 */
export function decayAirOverspeed(state: MatchState, p: PlayerState): void {
  const s = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  const keep = airKeptSpeed(s, maxRunSpeed(state, p));
  if (keep < s && s > 1e-9) {
    // `+ 0` : jamais de −0 dans l'état.
    p.vel.x = p.vel.x * (keep / s) + 0;
    p.vel.z = p.vel.z * (keep / s) + 0;
  }
}
