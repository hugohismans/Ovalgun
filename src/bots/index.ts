/**
 * Bots : producteurs de PlayerInput. Ils lisent le MatchState et renvoient une
 * entrée, exactement comme le client humain. Ils ne modifient JAMAIS l'état.
 * Module PUR (même contrainte que src/sim) : il tourne tel quel sur un serveur.
 *
 * Étape 6 : bots de match (createBot, bot.ts) — perception retardée (perception.ts), décision tactique (tactics.ts),
 * cerveau du porteur (carrierBrain.ts), pilotage (steering.ts), visée (aiming.ts, aim.ts), mémoire (memory.ts).
 * Étape 5 : tourelle d'entraînement (turret.ts), gardée pour les tests.
 */

import type { MatchState, PlayerInput } from '../sim/types';

/**
 * Contrat commun client / serveur d'un producteur d'entrées (bot) : il reçoit l'état du match
 * (lecture seule) et l'id du joueur qu'il pilote, et renvoie l'entrée de ce joueur pour le tick.
 * Le client (`GameSession.inputProviders`) et un futur serveur autoritaire l'appellent de la même façon :
 * un bot n'a besoin d'aucune référence au client (pas de closure sur la session).
 */
export type InputProvider = (state: Readonly<MatchState>, playerId: number) => PlayerInput;

export { botInput, createBot, type BotDebug, type BotOptions } from './bot';
export { createBotMemory, type BotMemory, type Decision, type TacticalRole } from './memory';
