/**
 * Protocole réseau client <-> serveur (JSON sur WebSocket). Partagé par le client (src/net) et le serveur
 * (server/, Cloudflare Durable Object) : module PUR, compilé avec tsconfig.sim.json (aucune API navigateur).
 *
 * Modèle : serveur AUTORITAIRE. Le serveur fait tourner la simulation (step) et les bots à 30 Hz ; chaque client envoie
 * ses PlayerInput par paquets et reçoit des instantanés de l'état (sans les parties statiques) qu'il interpole.
 */

import type { BotDifficulty, MatchEvent, MatchState, PlayerInput, Role, TeamId, TeamSize } from '../../sim';

/** Version du protocole : un client et un serveur de versions différentes refusent de jouer ensemble. */
export const PROTOCOL_VERSION = 3;

/** Instantané envoyé tous les SNAPSHOT_EVERY ticks (2 => 15 Hz). */
export const SNAPSHOT_EVERY = 2;
/** Entrées regroupées par paquet côté client (2 ticks => 15 messages/s). */
export const INPUT_BATCH = 2;
/** Longueur max d'un jeton de reconnexion accepté. */
export const TOKEN_MAX_LENGTH = 64;
/** Joueurs humains max par salon (5v5). */
export const MAX_HUMANS = 10;
/** Longueur et alphabet des codes de salon (sans caractères ambigus). */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface LobbyPlayer {
  /** Identifiant de connexion (stable pendant la session du salon). */
  id: string;
  name: string;
  team: TeamId;
  role: Role;
  host: boolean;
}

export interface LobbyConfig {
  teamSize: TeamSize;
  difficulty: BotDifficulty;
}

export type RoomPhase = 'lobby' | 'match';

/** Parties statiques de l'état (envoyées une fois au début du match). */
export type StaticState = Pick<MatchState, 'field' | 'config'>;
/** État dynamique (envoyé à chaque instantané). */
export type DynamicState = Omit<MatchState, 'field' | 'config'>;

export type ClientMessage =
  /**
   * `token` : jeton de reconnexion (aléatoire, propre à l'onglet) : en le présentant à nouveau, un client qui a perdu
   * la connexion retrouve sa place (son joueur dans le match en cours, son équipe, son rôle, l'hôte).
   */
  | { t: 'hello'; version: number; name: string; role: Role; token?: string }
  | { t: 'lobby'; team?: TeamId; role?: Role; name?: string }
  | { t: 'config'; teamSize?: TeamSize; difficulty?: BotDifficulty }
  | { t: 'start' }
  /**
   * Entrées de ticks consécutifs ; `seq` = numéro de la première (accusé de réception : `snap.acks`) ; `views` : pour
   * chacune, le tick du serveur que le client affichait (fractionnaire, -1 inconnu) : compensation de latence.
   */
  | { t: 'input'; seq: number; inputs: PlayerInput[]; views?: number[] }
  | { t: 'ping'; c: number };

export type ServerMessage =
  | { t: 'welcome'; you: string; room: string }
  | { t: 'lobby'; phase: RoomPhase; players: LobbyPlayer[]; config: LobbyConfig }
  | { t: 'start'; playerId: number; statics: StaticState; state: DynamicState; humans: Record<number, string> }
  /** `acks` : id de joueur -> numéro de la dernière entrée appliquée par le serveur (prédiction côté client). */
  | { t: 'snap'; state: DynamicState; events: MatchEvent[]; acks: Record<number, number> }
  | { t: 'end'; score: [number, number] }
  | { t: 'pong'; c: number }
  | { t: 'error'; message: string };

/** Code de salon valide (majuscules de l'alphabet, longueur fixe). */
export function isRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Normalise une saisie de code (espaces, minuscules). */
export const normalizeRoomCode = (raw: string): string => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Nom de joueur affichable (longueur bornée, jamais vide). */
export function sanitizeName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '';
  return s.length > 0 ? s : fallback;
}

export function splitState(state: MatchState): { statics: StaticState; dynamic: DynamicState } {
  const { field, config, ...dynamic } = state;
  return { statics: { field, config }, dynamic };
}

export const joinState = (statics: StaticState, dynamic: DynamicState): MatchState => ({ ...dynamic, ...statics });
