/**
 * Client réseau : connexion WebSocket au salon, messages du lobby, entrées envoyées par paquets, file des instantanés
 * reçus (consommée par la session à chaque frame), mesure du ping.
 *
 * Reconnexion automatique : une connexion qui tombe (ou qui ne reçoit plus rien pendant SILENCE_TIMEOUT_MS : coupure
 * Wi-Fi que le navigateur ne signale pas) est rouverte avec des délais croissants (RECONNECT_DELAYS_MS) pendant au
 * plus RECONNECT_GIVE_UP_MS ; le `hello` renvoie le même jeton : le serveur rend sa place au joueur (et le match en
 * cours via un nouveau 'start'). Statut 'reconnecting' pendant ce temps ; `onClose` seulement si on abandonne.
 */

import type { BotDifficulty, PlayerInput, Role, TeamId, TeamSize } from '../sim';
import {
  INPUT_BATCH,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DynamicState,
  type LobbyConfig,
  type LobbyPlayer,
  type RoomPhase,
  type ServerMessage,
  type StaticState,
} from './shared/protocol';
import type { MatchEvent } from '../sim';

export interface LobbyView {
  phase: RoomPhase;
  players: LobbyPlayer[];
  config: LobbyConfig;
}

export interface StartInfo {
  playerId: number;
  statics: StaticState;
  state: DynamicState;
  humans: Record<number, string>;
}

export interface Snapshot {
  state: DynamicState;
  events: MatchEvent[];
  acks: Record<number, number>;
}

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Silence (aucun message, pongs compris : un toutes les 2 s) au-delà duquel la connexion est jugée morte (ms). */
const SILENCE_TIMEOUT_MS = 6000;
/** Délais entre deux tentatives de reconnexion (ms), le dernier répété. */
const RECONNECT_DELAYS_MS = [300, 1000, 2000, 3000, 5000];
/** Abandon de la reconnexion (ms depuis la coupure). */
const RECONNECT_GIVE_UP_MS = 45000;

/** Adresse WebSocket d'un salon à partir de l'adresse du serveur (http(s) -> ws(s)). */
export function roomSocketUrl(server: string, code: string): string {
  const base = server.replace(/\/+$/, '').replace(/^http/, 'ws');
  return `${base}/room/${encodeURIComponent(code)}`;
}

export class NetClient {
  status: NetStatus = 'connecting';
  you = '';
  lobby: LobbyView | null = null;
  /** Aller-retour mesuré (ms). */
  rtt = 0;
  onLobby: ((l: LobbyView) => void) | null = null;
  onStart: ((s: StartInfo) => void) | null = null;
  onEnd: ((score: [number, number]) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  /** Changement de statut (reconnexion en cours, rétablie). */
  onStatus: ((status: NetStatus) => void) | null = null;
  private ws: WebSocket | null = null;
  private readonly snaps: Snapshot[] = [];
  private batch: PlayerInput[] = [];
  private views: number[] = [];
  /** Numéro de la prochaine entrée (et de la première du paquet en cours). */
  private nextSeq = 0;
  private batchSeq = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  /** Le salon nous a déjà accueillis une fois (sinon : serveur injoignable, pas de reconnexion). */
  private welcomed = false;
  private attempts = 0;
  private droppedAt = 0;
  private attemptAt = 0;

  constructor(
    private readonly server: string,
    readonly code: string,
    private readonly name: string,
    private readonly role: Role,
    /** Jeton de reconnexion (propre à l'onglet). */
    private readonly token = '',
  ) {
    this.connect();
    this.pingTimer = setInterval(() => this.heartbeat(), 2000);
  }

  private connect(): void {
    this.attemptAt = performance.now();
    const ws = new WebSocket(roomSocketUrl(this.server, this.code));
    this.ws = ws;
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.lastMessageAt = performance.now();
      this.send({ t: 'hello', version: PROTOCOL_VERSION, name: this.name, role: this.role, token: this.token });
      this.send({ t: 'ping', c: performance.now() });
    });
    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = performance.now();
      if (typeof ev.data === 'string') this.receive(ev.data);
    });
    const dropped = (): void => {
      if (this.ws !== ws) return;
      this.dropped();
    };
    ws.addEventListener('close', dropped);
    ws.addEventListener('error', dropped);
  }

  /** Ping toutes les 2 s ; connexion muette depuis trop longtemps (ou tentative qui n'aboutit pas) : jugée morte. */
  private heartbeat(): void {
    if (this.status === 'reconnecting' && this.ws !== null && performance.now() - this.attemptAt > SILENCE_TIMEOUT_MS) {
      this.dropped();
      return;
    }
    if (this.status !== 'open') return;
    if (performance.now() - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
      this.dropped();
      return;
    }
    this.send({ t: 'ping', c: performance.now() });
  }

  /** La connexion courante est perdue : nouvelle tentative (avec délai), ou abandon. */
  private dropped(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) {
      try {
        ws.close();
      } catch {
        // déjà fermée
      }
    }
    if (this.status === 'closed') return;
    if (!this.welcomed) {
      // Jamais entré dans le salon : serveur injoignable (ou refus), pas de reconnexion.
      this.onError?.('Serveur injoignable.');
      this.finish();
      return;
    }
    const now = performance.now();
    if (this.status !== 'reconnecting') {
      this.droppedAt = now;
      this.attempts = 0;
      this.setStatus('reconnecting');
    }
    if (now - this.droppedAt > RECONNECT_GIVE_UP_MS) {
      this.onError?.('Connexion au salon perdue.');
      this.finish();
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)];
    this.attempts++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.status === 'reconnecting') this.connect();
    }, delay);
  }

  private setStatus(status: NetStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
  }

  /** Fin définitive (abandon de la reconnexion) : `onClose`. */
  private finish(): void {
    this.stopTimers();
    this.status = 'closed';
    this.onClose?.();
  }

  private stopTimers(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.pingTimer = null;
    this.retryTimer = null;
  }

  private receive(text: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.welcomed = true;
        this.attempts = 0;
        this.setStatus('open');
        break;
      case 'lobby':
        this.lobby = { phase: msg.phase, players: msg.players, config: msg.config };
        this.onLobby?.(this.lobby);
        break;
      case 'start':
        this.snaps.length = 0;
        this.batch = [];
        this.views = [];
        this.nextSeq = 0;
        this.onStart?.({ playerId: msg.playerId, statics: msg.statics, state: msg.state, humans: msg.humans });
        break;
      case 'snap':
        this.snaps.push({ state: msg.state, events: msg.events, acks: msg.acks ?? {} });
        if (this.snaps.length > 60) this.snaps.splice(0, this.snaps.length - 60);
        break;
      case 'end':
        this.onEnd?.(msg.score);
        break;
      case 'pong':
        this.rtt = Math.max(0, performance.now() - msg.c);
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
    }
  }

  private send(msg: ClientMessage): void {
    const ws = this.ws;
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  /** Instantanés reçus depuis le dernier appel. */
  drainSnapshots(): Snapshot[] {
    return this.snaps.splice(0, this.snaps.length);
  }

  /**
   * Entrée d'un tick (envoyée par paquets de INPUT_BATCH) ; `view` : tick du serveur affiché à l'écran quand elle a été
   * lue (compensation de latence, -1 inconnu). Renvoie son numéro.
   */
  queueInput(inp: PlayerInput, view = -1): number {
    if (this.batch.length === 0) this.batchSeq = this.nextSeq;
    const seq = this.nextSeq++;
    this.batch.push(inp);
    this.views.push(Math.round(view * 100) / 100);
    if (this.batch.length >= INPUT_BATCH) {
      this.send({ t: 'input', seq: this.batchSeq, inputs: this.batch, views: this.views });
      this.batch = [];
      this.views = [];
    }
    return seq;
  }

  setLobby(change: { team?: TeamId; role?: Role; name?: string }): void {
    this.send({ t: 'lobby', ...change });
  }

  setConfig(change: { teamSize?: TeamSize; difficulty?: BotDifficulty }): void {
    this.send({ t: 'config', ...change });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  /** Quitte le salon (volontairement) : aucune reconnexion, aucun rappel. */
  close(): void {
    this.onClose = null;
    this.onLobby = null;
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    this.onStatus = null;
    this.stopTimers();
    this.status = 'closed';
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
