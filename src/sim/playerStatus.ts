/**
 * Lectures élémentaires sur un joueur, partagées par player.ts (déplacement), carrier.ts (porteur) et
 * combat.ts (tir) sans dépendance circulaire entre ces modules. Ré-exportées par player.ts.
 */

import { AIM_ORIGIN_HEIGHT, LAST_MINUTE_COOLDOWN_MULT, PLAYER_HEIGHT, PLAYER_LOW_HEIGHT, SHOULDER_OFFSET } from './constants';
import { secToTicks } from './time';
import type { MatchState, PlayerState } from './types';
import { right, type Vec3 } from './vec';

/**
 * Origine de visée (docs/ARCHITECTURE.md §3) : pieds + AIM_ORIGIN_HEIGHT vers le haut + SHOULDER_OFFSET
 * vers right(yaw). Les tirs partent de ce point selon aimDir(yaw, pitch) ; la caméra épaule du client se
 * place sur la même droite, en arrière (le tir part donc exactement vers le réticule).
 */
export function aimOrigin(feet: Vec3, yaw: number): Vec3 {
  const r = right(yaw);
  return { x: feet.x + r.x * SHOULDER_OFFSET, y: feet.y + AIM_ORIGIN_HEIGHT, z: feet.z + r.z * SHOULDER_OFFSET };
}

/** Vrai si ce joueur porte le ballon. */
export const isCarrier = (state: MatchState, p: PlayerState): boolean =>
  state.ball.mode === 'carried' && state.ball.carrierId === p.id;

/** Hauteur courante de la capsule (basse en glissade / plongeon / au sol) — lue par les projectiles et la réception du ballon. */
export const playerHeight = (p: PlayerState): number =>
  p.move === 'slide' || p.move === 'dive' || p.move === 'dive_recover' || p.status === 'down'
    ? PLAYER_LOW_HEIGHT
    : PLAYER_HEIGHT;

/** Cooldown en ticks, raccourci pendant la dernière minute. Fixé au déclenchement de l'action. */
export const cooldownTicks = (state: MatchState, sec: number): number =>
  secToTicks(state.lastMinute ? sec * LAST_MINUTE_COOLDOWN_MULT : sec);
