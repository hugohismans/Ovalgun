/**
 * Client réseau : connexion WebSocket au salon, messages du lobby, entrées envoyées par paquets, file des instantanés
 * reçus (consommée par la session à chaque frame), mesure du ping.
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
}

export type NetStatus = 'connecting' | 'open' | 'closed';

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
  private readonly ws: WebSocket;
  private readonly snaps: Snapshot[] = [];
  private batch: PlayerInput[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(server: string, readonly code: string, name: string, role: Role) {
    this.ws = new WebSocket(roomSocketUrl(server, code));
    this.ws.addEventListener('open', () => {
      this.status = 'open';
      this.send({ t: 'hello', version: PROTOCOL_VERSION, name, role });
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    });
    this.ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') this.receive(ev.data);
    });
    const closed = (): void => {
      if (this.status === 'closed') return;
      this.status = 'closed';
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      this.onClose?.();
    };
    this.ws.addEventListener('close', closed);
    this.ws.addEventListener('error', () => {
      if (this.status === 'connecting') this.onError?.('Serveur injoignable.');
      closed();
    });
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
        break;
      case 'lobby':
        this.lobby = { phase: msg.phase, players: msg.players, config: msg.config };
        this.onLobby?.(this.lobby);
        break;
      case 'start':
        this.snaps.length = 0;
        this.batch = [];
        this.onStart?.({ playerId: msg.playerId, statics: msg.statics, state: msg.state, humans: msg.humans });
        break;
      case 'snap':
        this.snaps.push({ state: msg.state, events: msg.events });
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
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Instantanés reçus depuis le dernier appel. */
  drainSnapshots(): Snapshot[] {
    return this.snaps.splice(0, this.snaps.length);
  }

  /** Entrée d'un tick (envoyée par paquets de INPUT_BATCH). */
  queueInput(inp: PlayerInput): void {
    this.batch.push(inp);
    if (this.batch.length >= INPUT_BATCH) {
      this.send({ t: 'input', inputs: this.batch });
      this.batch = [];
    }
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

  close(): void {
    this.onClose = null;
    this.onLobby = null;
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.status = 'closed';
    this.ws.close();
  }
}
