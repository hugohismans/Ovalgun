import { TICK_RATE } from './constants';

/** Convertit une durée en secondes en nombre de ticks (arrondi, au moins 0). */
export const secToTicks = (sec: number): number => Math.max(0, Math.round(sec * TICK_RATE));

/** Convertit des ticks en secondes. */
export const ticksToSec = (ticks: number): number => ticks / TICK_RATE;
