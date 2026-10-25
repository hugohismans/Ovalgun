/**
 * Perception d'un bot (étape 6) : temps de réaction et réflexes, lus dans le MatchState sans le modifier.
 *
 *  - Situation retardée : un changement de situation (possession, porteur, mode du ballon, cible de passe, phase)
 *    n'est pris en compte qu'après `reactionSec` (± BOT_REACTION_JITTER, tiré au PRNG du bot). Le délai court depuis
 *    le PREMIER changement : si la situation change encore entre-temps, le bot adopte la plus récente à l'échéance
 *    (pas de « famine » quand le ballon change vite de mode). Exception : ce qui concerne le bot LUI-MÊME (il vient
 *    de prendre / de lâcher le ballon, une passe lui est destinée) est perçu aussitôt — on sait ce qu'on a dans les mains.
 *  - Tir reçu : la stabilité qui baisse ouvre une fenêtre « sous le feu » (BOT_UNDER_FIRE_SEC) ; le réflexe
 *    d'esquive n'est armé qu'après le temps de réaction.
 */

import {
  BOT_DIFFICULTY,
  BOT_REACTION_JITTER,
  BOT_UNDER_FIRE_SEC,
  randSigned,
  secToTicks,
  type MatchState,
  type PlayerState,
} from '../sim';
import { readSituation, sameSituation, type BotMemory } from './memory';

/** Temps de réaction en ticks, avec sa variation aléatoire (PRNG du bot). Au moins 1 tick. */
export function reactionTicks(mem: BotMemory): number {
  const base = BOT_DIFFICULTY[mem.difficulty].reactionSec;
  return Math.max(1, secToTicks(base * (1 + BOT_REACTION_JITTER * randSigned(mem))));
}

/**
 * Met à jour la situation perçue. Renvoie vrai si la situation perçue vient de changer (décision immédiate).
 * Appelée une fois par tick.
 */
export function updatePerception(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState): boolean {
  const raw = readSituation(state);
  if (sameSituation(raw, mem.seen)) {
    mem.pendingTicks = -1;
    return false;
  }
  const id = me.id;
  const selfChange =
    (raw.carrierId === id && raw.ballMode === 'carried') !== (mem.seen.carrierId === id && mem.seen.ballMode === 'carried') ||
    (raw.passTargetId === id && raw.ballMode === 'pass' && !(mem.seen.passTargetId === id && mem.seen.ballMode === 'pass'));
  if (selfChange) {
    mem.seen = raw;
    mem.pendingTicks = -1;
    return true;
  }
  mem.pending = raw;
  if (mem.pendingTicks < 0) {
    // Premier changement vu à ce tick : il sera pris en compte dans reactionTicks ticks.
    mem.pendingTicks = reactionTicks(mem);
    return false;
  }
  if (mem.pendingTicks > 0) mem.pendingTicks--;
  if (mem.pendingTicks === 0) {
    mem.seen = mem.pending;
    mem.pendingTicks = -1;
    return true;
  }
  return false;
}

/** Suivi des tirs reçus (fenêtre « sous le feu », réflexe armé après le temps de réaction). Une fois par tick. */
export function updateHitTracking(mem: BotMemory, me: PlayerState): void {
  if (mem.underFireTicks > 0) mem.underFireTicks--;
  if (mem.hitReactTicks > 0) mem.hitReactTicks--;
  if (me.status === 'active' && me.stability < mem.lastStability - 1e-6) {
    if (mem.underFireTicks === 0) mem.hitReactTicks = reactionTicks(mem);
    mem.underFireTicks = secToTicks(BOT_UNDER_FIRE_SEC);
    mem.lastShooterId = me.lastHitBy;
  }
  mem.lastStability = me.stability;
}

/** Vrai si le bot se sait sous le feu ET que son réflexe est armé (temps de réaction écoulé). */
export const dodgeReflexArmed = (mem: BotMemory): boolean => mem.underFireTicks > 0 && mem.hitReactTicks === 0;

/** Vrai si le bot a été touché récemment (fenêtre « sous le feu »), réflexe armé ou non. */
export const underFire = (mem: BotMemory): boolean => mem.underFireTicks > 0;
