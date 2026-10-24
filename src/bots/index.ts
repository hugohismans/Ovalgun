/**
 * Bots : producteurs de PlayerInput. Ils lisent le MatchState et renvoient une
 * entrée, exactement comme le client humain. Ils ne modifient JAMAIS l'état.
 * Module PUR (même contrainte que src/sim). Étape 5 : tourelle d'entraînement (turret.ts) et visée avec avance
 * (aim.ts, réutilisée par les vrais bots de l'étape 6).
 */

import type { MatchState, PlayerInput } from '../sim/types';

/**
 * Contrat commun client / serveur d'un producteur d'entrées (bot) : il reçoit l'état du match
 * (lecture seule) et l'id du joueur qu'il pilote, et renvoie l'entrée de ce joueur pour le tick.
 * Le client (`GameSession.inputProviders`) et un futur serveur autoritaire l'appellent de la même façon :
 * un bot n'a besoin d'aucune référence au client (pas de closure sur la session).
 */
export type InputProvider = (state: Readonly<MatchState>, playerId: number) => PlayerInput;
