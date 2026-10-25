/**
 * Cœur d'un salon en ligne (pur, testé sans Cloudflare) : joueurs connectés, lobby, puis match AUTORITAIRE (la
 * simulation et les bots tournent ici, à 30 Hz). Le Durable Object (server/src/index.ts) ne fait que brancher les
 * WebSockets et appeler `tick()` à 30 Hz.
 *
 * Entrées : chaque client envoie ses PlayerInput par paquets ; elles sont mises en file et consommées une par tick.
 * File vide (paquet en retard, perdu) : on répète la dernière entrée reçue (aucun freinage, aucun faux appui :
 * la sim détecte les fronts montants elle-même). File trop longue (retard accumulé) : les plus anciennes sont jetées.
 * Joueur qui se déconnecte en cours de match : un bot reprend sa place.
 */

import { createBot, type InputProvider } from '../../bots';
import { createMatch, makeInput, step, type BotDifficulty, type MatchEvent, type MatchState, type PlayerInput, type Role, type TeamId, type TeamSize } from '../../sim';
import { buildMatchSetup, canJoinTeam, teamForNewPlayer } from './lobby';
import {
  MAX_HUMANS,
  PROTOCOL_VERSION,
  sanitizeName,
  SNAPSHOT_EVERY,
  splitState,
  type ClientMessage,
  type LobbyConfig,
  type LobbyPlayer,
  type RoomPhase,
  type ServerMessage,
} from './protocol';

export interface Peer {
  id: string;
  send(text: string): void;
}

/** Entrées en attente max par joueur (au-delà, les plus anciennes sont jetées : on rattrape le retard). */
const MAX_QUEUE = 10;
/** Ticks passés sur le score final avant le retour au lobby (5 s). */
const END_LINGER_TICKS = 150;
const ROLES: readonly Role[] = ['pilier', 'ailier', 'demi'];
const DIFFICULTIES: readonly BotDifficulty[] = ['facile', 'normal', 'difficile'];

interface Member {
  peer: Peer;
  player: LobbyPlayer | null;
  queue: Array<{ seq: number; input: PlayerInput }>;
  last: PlayerInput;
  /** Numéro de la dernière entrée appliquée (accusé envoyé dans les instantanés). */
  ack: number;
  joinedAt: number;
}

export class RoomCore {
  private readonly members = new Map<string, Member>();
  private phase: RoomPhase = 'lobby';
  private config: LobbyConfig = { teamSize: 3, difficulty: 'normal' };
  private state: MatchState | null = null;
  private simIds = new Map<string, number>();
  private bots = new Map<number, InputProvider>();
  private pendingEvents: MatchEvent[] = [];
  private tickCount = 0;
  private endedFor = 0;
  private matchIndex = 0;
  private joinCounter = 0;

  constructor(
    readonly code: string,
    private readonly seedBase: number,
  ) {}

  get empty(): boolean {
    return this.members.size === 0;
  }

  get inMatch(): boolean {
    return this.phase === 'match';
  }

  join(peer: Peer): void {
    this.members.set(peer.id, { peer, player: null, queue: [], last: makeInput(), ack: -1, joinedAt: this.joinCounter++ });
  }

  leave(id: string): void {
    const m = this.members.get(id);
    if (m === undefined) return;
    this.members.delete(id);
    if (m.player?.host === true) {
      const next = this.lobbyPlayers()[0];
      if (next !== undefined) next.host = true;
    }
    // En match : un bot reprend la place du joueur parti.
    const simId = this.simIds.get(id);
    if (simId !== undefined && this.state !== null) {
      this.simIds.delete(id);
      this.bots.set(simId, createBot(simId, this.config.difficulty, this.seedBase ^ (simId * 7919), { externalIds: [...this.simIds.values()] }));
    }
    if (this.lobbyPlayers().length === 0) this.backToLobby();
    else this.broadcastLobby();
  }

  message(id: string, raw: string): void {
    const m = this.members.get(id);
    if (m === undefined) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (typeof msg !== 'object' || msg === null) return;
    switch (msg.t) {
      case 'hello':
        this.hello(m, msg.version, msg.name, msg.role);
        break;
      case 'ping':
        this.send(m, { t: 'pong', c: Number(msg.c) || 0 });
        break;
      case 'lobby':
        this.lobbyChange(m, msg.team, msg.role, msg.name);
        break;
      case 'config':
        this.configChange(m, msg.teamSize, msg.difficulty);
        break;
      case 'start':
        if (m.player?.host === true && this.phase === 'lobby') this.startMatch();
        break;
      case 'input':
        if (Array.isArray(msg.inputs)) {
          const seq0 = Number.isInteger(msg.seq) ? msg.seq : m.ack + 1;
          msg.inputs.slice(0, MAX_QUEUE).forEach((input, i) => m.queue.push({ seq: seq0 + i, input }));
          while (m.queue.length > MAX_QUEUE) m.queue.shift();
        }
        break;
    }
  }

  /** Un tick à 30 Hz : simulation, bots, instantanés. */
  tick(): void {
    const s = this.state;
    if (this.phase !== 'match' || s === null) return;
    const frame: Record<number, PlayerInput> = {};
    for (const [cid, simId] of this.simIds) {
      const m = this.members.get(cid);
      if (m === undefined) continue;
      const next = m.queue.shift();
      if (next !== undefined) {
        m.last = next.input;
        m.ack = next.seq;
      }
      frame[simId] = m.last;
    }
    for (const [simId, bot] of this.bots) frame[simId] = bot(s, simId);
    step(s, frame);
    for (const e of s.events) this.pendingEvents.push(e);
    this.tickCount++;
    if (this.tickCount % SNAPSHOT_EVERY === 0) {
      const { dynamic } = splitState(s);
      const acks: Record<number, number> = {};
      for (const [cid, simId] of this.simIds) acks[simId] = this.members.get(cid)?.ack ?? -1;
      this.broadcast({ t: 'snap', state: { ...dynamic, events: [] }, events: this.pendingEvents, acks });
      this.pendingEvents = [];
    }
    if (s.phase === 'ended') {
      this.endedFor++;
      if (this.endedFor >= END_LINGER_TICKS) {
        this.broadcast({ t: 'end', score: [s.score[0], s.score[1]] });
        this.backToLobby();
      }
    }
  }

  // ---------------------------------------------------------------------------

  private lobbyPlayers(): LobbyPlayer[] {
    return [...this.members.values()]
      .filter((m) => m.player !== null)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => m.player as LobbyPlayer);
  }

  private hello(m: Member, version: number, name: string, role: Role): void {
    if (m.player !== null) return;
    if (version !== PROTOCOL_VERSION) {
      this.send(m, { t: 'error', message: 'Version du jeu différente : recharge la page (Ctrl+F5).' });
      return;
    }
    const players = this.lobbyPlayers();
    if (players.length >= MAX_HUMANS) {
      this.send(m, { t: 'error', message: 'Salon complet (10 joueurs max).' });
      return;
    }
    let team = teamForNewPlayer(players, this.config.teamSize);
    if (team === null && this.config.teamSize === 3) {
      // Plus de 6 humains : on passe automatiquement en 5v5 (si personne ne joue encore).
      if (this.phase === 'lobby') this.config.teamSize = 5;
      team = teamForNewPlayer(players, this.config.teamSize);
    }
    m.player = {
      id: m.peer.id,
      name: sanitizeName(name, `Joueur ${players.length + 1}`),
      team: team ?? 0,
      role: ROLES.includes(role) ? role : 'ailier',
      host: players.length === 0,
    };
    this.send(m, { t: 'welcome', you: m.peer.id, room: this.code });
    this.broadcastLobby();
  }

  private lobbyChange(m: Member, team: TeamId | undefined, role: Role | undefined, name: string | undefined): void {
    const p = m.player;
    if (p === null || this.phase !== 'lobby') return;
    if ((team === 0 || team === 1) && canJoinTeam(this.lobbyPlayers(), p.id, team, this.config.teamSize)) p.team = team;
    if (role !== undefined && ROLES.includes(role)) p.role = role;
    if (name !== undefined) p.name = sanitizeName(name, p.name);
    this.broadcastLobby();
  }

  private configChange(m: Member, teamSize: TeamSize | undefined, difficulty: BotDifficulty | undefined): void {
    if (m.player?.host !== true || this.phase !== 'lobby') return;
    if (difficulty !== undefined && DIFFICULTIES.includes(difficulty)) this.config.difficulty = difficulty;
    if (teamSize === 3 || teamSize === 5) {
      const players = this.lobbyPlayers();
      if (players.length <= teamSize * 2) {
        this.config.teamSize = teamSize;
        // Rééquilibre : une équipe qui déborde envoie ses derniers arrivés dans l'autre.
        for (const team of [0, 1] as const) {
          const mine = players.filter((p) => p.team === team);
          for (const p of mine.slice(teamSize)) p.team = team === 0 ? 1 : 0;
        }
      }
    }
    this.broadcastLobby();
  }

  private startMatch(): void {
    const players = this.lobbyPlayers();
    this.matchIndex++;
    const setup = buildMatchSetup(players, this.config, (this.seedBase + this.matchIndex * 101) | 0);
    const state = createMatch(setup.config);
    this.state = state;
    this.phase = 'match';
    this.tickCount = 0;
    this.endedFor = 0;
    this.pendingEvents = [...state.events];
    this.simIds = new Map(Object.entries(setup.playerIds));
    const humanIds = [...this.simIds.values()];
    this.bots = new Map(setup.botIds.map((id) => [id, createBot(id, this.config.difficulty, (setup.config.seed ^ (id * 7919)) | 0, { externalIds: humanIds })]));
    const humans: Record<number, string> = {};
    for (const p of players) {
      const id = this.simIds.get(p.id);
      if (id !== undefined) humans[id] = p.name;
    }
    const { statics, dynamic } = splitState(state);
    for (const m of this.members.values()) {
      m.queue = [];
      m.last = makeInput();
      m.ack = -1;
      const playerId = this.simIds.get(m.peer.id);
      if (playerId !== undefined) this.send(m, { t: 'start', playerId, statics, state: dynamic, humans });
    }
    this.broadcastLobby();
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.state = null;
    this.simIds.clear();
    this.bots.clear();
    this.pendingEvents = [];
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', phase: this.phase, players: this.lobbyPlayers(), config: { ...this.config } });
  }

  private send(m: Member, msg: ServerMessage): void {
    try {
      m.peer.send(JSON.stringify(msg));
    } catch {
      // Connexion fermée entre-temps : le départ sera traité par `leave`.
    }
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const m of this.members.values()) {
      if (m.player === null) continue;
      try {
        m.peer.send(text);
      } catch {
        // idem
      }
    }
  }
}
