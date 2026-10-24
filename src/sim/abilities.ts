/**
 * Capacités de rôle et zones.
 *
 * Étape 5 : sprint boosté de l'AILIER (seul rôle jouable pour valider le feeling du plaquage).
 *   - Front montant ABILITY, joueur actif, `abilityCd == 0` et capacité inactive : `abilityTicks` = durée
 *     (secToTicks(ability.duration)), événement 'ability'. Utilisable en portant le ballon.
 *   - Pendant la durée : vitesse de course × BOOST_SPEED_MULT, accélération au sol × BOOST_ACCEL_MULT.
 *   - Le cooldown (cooldownTicks : raccourci en dernière minute) démarre à la FIN de la durée active
 *     (AbilityStats.cooldown) ; un plaquage termine la capacité en cours (le cooldown démarre alors).
 * ÉTAPE 7 : bouclier (pilier), zone de ralentissement (demi), updateZones, multiplicateurs correspondants.
 * D'ici là, ABILITY est sans effet pour le pilier et le demi (aucun cooldown consommé).
 */

import { BOOST_ACCEL_MULT, BOOST_SPEED_MULT, ROLES } from './constants';
import { has, type TickInput } from './input';
import { cooldownTicks } from './playerStatus';
import { secToTicks } from './time';
import { Buttons, type MatchState, type PlayerState } from './types';

/** Vrai si la capacité du joueur est en cours (durée active). */
export const abilityActive = (p: PlayerState): boolean => p.abilityTicks > 0;

/** Démarre le cooldown de la capacité (à la fin de sa durée active, ou tout de suite pour une capacité instantanée). */
function startAbilityCooldown(state: MatchState, p: PlayerState): void {
  p.abilityCd = cooldownTicks(state, ROLES[p.role].ability.cooldown);
}

/**
 * Étape 4 de `step` : minuteries de capacité. Une capacité active décompte sa durée ; au tick où elle se termine,
 * le cooldown démarre (il n'est décompté qu'à partir du tick suivant : exactement `cooldown` après la fin).
 */
export function tickAbilityTimers(state: MatchState): void {
  for (const p of state.players) {
    if (p.abilityTicks > 0) {
      p.abilityTicks--;
      if (p.abilityTicks === 0) startAbilityCooldown(state, p);
    } else if (p.abilityCd > 0) {
      p.abilityCd--;
    }
  }
}

/** Termine la capacité en cours (plaquage) : le cooldown démarre maintenant. Sans effet si elle est inactive. */
export function endAbility(state: MatchState, p: PlayerState): void {
  if (p.abilityTicks <= 0) return;
  p.abilityTicks = 0;
  startAbilityCooldown(state, p);
}

/** Vrai si la capacité du rôle est implémentée (ÉTAPE 7 : bouclier du pilier, zone du demi). */
export const abilityImplemented = (p: PlayerState): boolean => p.role === 'ailier';

/** Étape 5 de `step` : activation des capacités (front montant ABILITY), ordre des ids. */
export function updateAbilities(state: MatchState, inputs: readonly TickInput[]): void {
  for (const p of state.players) {
    const inp = inputs[p.id];
    if (inp === undefined || !has(inp.pressed, Buttons.ABILITY)) continue;
    if (p.status !== 'active' || p.abilityCd > 0 || p.abilityTicks > 0) continue;
    // TODO ÉTAPE 7 : bouclier frontal (pilier) et pose de la zone de ralentissement (demi). D'ici là, l'appui est
    // ignoré sans consommer de cooldown.
    if (!abilityImplemented(p)) continue;
    const duration = secToTicks(ROLES[p.role].ability.duration);
    if (duration > 0) p.abilityTicks = duration;
    else startAbilityCooldown(state, p); // capacité instantanée (étape 7)
    state.events.push({ type: 'ability', playerId: p.id, role: p.role });
  }
}

/** Étape 7 — zones (ralentissement) : durée de vie. Vide pour l'instant. */
export function updateZones(_state: MatchState): void {
  // ÉTAPE 7.
}

/**
 * Multiplicateur de vitesse de course lié aux capacités : BOOST_SPEED_MULT pendant le sprint boosté de l'ailier.
 * ÉTAPE 7 : SHIELD_SPEED_MULT (bouclier levé), SLOW_ZONE_SPEED_MULT (zone de ralentissement adverse).
 */
export function abilitySpeedMultiplier(_state: MatchState, p: PlayerState): number {
  return p.role === 'ailier' && abilityActive(p) ? BOOST_SPEED_MULT : 1;
}

/** Multiplicateur d'accélération au sol : BOOST_ACCEL_MULT pendant le sprint boosté de l'ailier. */
export function abilityAccelMultiplier(_state: MatchState, p: PlayerState): number {
  return p.role === 'ailier' && abilityActive(p) ? BOOST_ACCEL_MULT : 1;
}
