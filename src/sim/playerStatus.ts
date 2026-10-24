/**
 * Lectures élémentaires sur un joueur, partagées par player.ts (déplacement) et carrier.ts (porteur)
 * sans dépendance circulaire entre ces deux modules. Ré-exportées par player.ts.
 */

import { LAST_MINUTE_COOLDOWN_MULT, PLAYER_HEIGHT, PLAYER_LOW_HEIGHT } from './constants';
import { secToTicks } from './time';
import type { MatchState, PlayerState } from './types';

/** Vrai si ce joueur porte le ballon. */
export const isCarrier = (state: MatchState, p: PlayerState): boolean =>
  state.ball.mode === 'carried' && state.ball.carrierId === p.id;

/** Hauteur courante de la capsule (basse en glissade / plongeon / au sol) — lue par les projectiles (étape 5) et la réception du ballon. */
export const playerHeight = (p: PlayerState): number =>
  p.move === 'slide' || p.move === 'dive' || p.move === 'dive_recover' || p.status === 'down'
    ? PLAYER_LOW_HEIGHT
    : PLAYER_HEIGHT;

/** Cooldown en ticks, raccourci pendant la dernière minute. Fixé au déclenchement de l'action. */
export const cooldownTicks = (state: MatchState, sec: number): number =>
  secToTicks(state.lastMinute ? sec * LAST_MINUTE_COOLDOWN_MULT : sec);
