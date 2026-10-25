/**
 * Cœur d'un salon en ligne (pur, testé sans Cloudflare) : joueurs connectés, lobby, puis match AUTORITAIRE (la
 * simulation et les bots tournent ici, à 30 Hz). Le Durable Object (server/src/index.ts) ne fait que brancher les
 * WebSockets et appeler `tick()` à 30 Hz.
 *
 * Entrées : chaque client envoie ses PlayerInput par paquets ; elles sont mises en file et consommées une par tick.
 * File vide (paquet en retard, perdu) : on répète la dernière entrée reçue (aucun freinage, aucun faux appui :
 * la sim détecte les fronts montants elle-même). File trop longue (retard accumulé) : les plus anciennes sont jetées.
 * Joueur qui se déconnecte en cours de match : un bot reprend sa place, gardée pour lui (jeton de reconnexion du
 * `hello`) : s'il revient avant la fin du match, il reprend son joueur. Une nouvelle connexion avec le jeton d'un joueur
 * encore connecté (ancienne connexion morte que le serveur n'a pas encore vue tomber) la remplace directement. Plus aucun
 * humain dans le match : il continue (ou reste figé si plus personne n'est connecté) au plus RECONNECT_GRACE_TICKS,
 * puis retour au lobby.
 *
 * Compensation de latence (src/sim/lagcomp.ts) : chaque entrée porte le tick que son client affichait ; au tick où elle
 * est appliquée, le retard (tick courant − tick affiché, borné) est passé à `step` avec l'historique des poses, rempli
 * après chaque tick.
 */

import { createBot, type InputProvider } from '../../bots';
import {
  clampLag,
  createMatch,
  makeInput,
  PoseHistory,
  step,
  TICK_DT,
  type BotDifficulty,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
  type Role,
  type TeamId,
  type TeamSize,
} from '../../sim';
import { buildMatchSetup, canJoinTeam, teamForNewPlayer } from './lobby';
import {
  MAX_HUMANS,
  PROTOCOL_VERSION,
  sanitizeName,
  SNAPSHOT_EVERY,
  splitState,
  TOKEN_MAX_LENGTH,
  type ClientMessage,
  type LobbyConfig,
  type LobbyPlayer,
  type RoomPhase,
  type ServerMessage,
} from './protocol';

export interface Peer {
  id: string;
  send(text: string): void;
  /** Ferme la connexion (remplacée par une reconnexion du même joueur). */
  close?(): void;
}

/** Entrées en attente max par joueur (au-delà, les plus anciennes sont jetées : on rattrape le retard). */
const MAX_QUEUE = 10;
/** Ticks passés sur le score final avant le retour au lobby (5 s). */
const END_LINGER_TICKS = 150;
/** Match sans aucun humain : retour au lobby après ce délai (30 s), le temps qu'un joueur coupé revienne. */
const RECONNECT_GRACE_TICKS = 900;
const ROLES: readonly Role[] = ['pilier', 'ailier', 'demi'];
const DIFFICULTIES: readonly BotDifficulty[] = ['facile', 'normal', 'difficile'];

interface Member {
  peer: Peer;
  player: LobbyPlayer | null;
  /** Jeton de reconnexion ('' : aucun). */
  token: string;
  queue: Array<{ seq: number; input: PlayerInput; view: number }>;
  last: PlayerInput;
  /** Tick affiché par le client pour la dernière entrée appliquée (-1 : inconnu). */
  view: number;
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
  private readonly history = new PoseHistory();
  private tickCount = 0;
  private endedFor = 0;
  private matchIndex = 0;
  private joinCounter = 0;
  /** Places gardées pendant le match pour les joueurs coupés : jeton -> joueur du lobby et id dans la sim. */
  private reserved = new Map<string, { player: LobbyPlayer; simId: number }>();
  /** Noms des humains du match en cours (renvoyés à un joueur qui revient). */
  private humans: Record<number, string> = {};
  /** Ticks consécutifs d'un match sans humain. */
  private orphanTicks = 0;

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
    this.members.set(peer.id, { peer, player: null, token: '', queue: [], last: makeInput(), view: -1, ack: -1, joinedAt: this.joinCounter++ });
  }

  leave(id: string): void {
    const m = this.members.get(id);
    if (m === undefined) return;
    this.members.delete(id);
    if (m.player?.host === true) {
      const next = this.lobbyPlayers()[0];
      if (next !== undefined) next.host = true;
    }
    // En match : un bot reprend la place du joueur parti, gardée pour lui jusqu'à la fin du match (jeton).
    const simId = this.simIds.get(id);
    if (simId !== undefined && this.state !== null) {
      this.simIds.delete(id);
      this.bots.set(simId, createBot(simId, this.config.difficulty, this.seedBase ^ (simId * 7919), { externalIds: [...this.simIds.values()] }));
      if (m.token !== '' && m.player !== null) this.reserved.set(m.token, { player: { ...m.player, host: false }, simId });
    }
    // Plus personne : le salon retourne au lobby, sauf un match en cours (gardé pour une reconnexion, voir l'en-tête).
    if (this.lobbyPlayers().length === 0 && this.phase !== 'match') this.backToLobby();
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
        this.hello(m, msg.version, msg.name, msg.role, msg.token);
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
          const views = Array.isArray(msg.views) ? msg.views : [];
          msg.inputs.slice(0, MAX_QUEUE).forEach((input, i) => {
            const v = views[i];
            m.queue.push({ seq: seq0 + i, input, view: typeof v === 'number' && Number.isFinite(v) ? v : -1 });
          });
          while (m.queue.length > MAX_QUEUE) m.queue.shift();
        }
        break;
    }
  }

  /** Un tick à 30 Hz : simulation, bots, instantanés. */
  tick(): void {
    const s = this.state;
    if (this.phase !== 'match' || s === null) return;
    // Match sans humain (tous coupés) : on attend leur retour un moment, puis retour au lobby.
    this.orphanTicks = this.simIds.size === 0 ? this.orphanTicks + 1 : 0;
    if (this.orphanTicks > RECONNECT_GRACE_TICKS) {
      this.backToLobby();
      return;
    }
    const frame: Record<number, PlayerInput> = {};
    const lag: Record<number, number> = {};
    for (const [cid, simId] of this.simIds) {
      const m = this.members.get(cid);
      if (m === undefined) continue;
      const next = m.queue.shift();
      if (next !== undefined) {
        m.last = next.input;
        m.ack = next.seq;
        m.view = next.view;
      }
      frame[simId] = m.last;
      // Entrée répétée (file vide) : même tick affiché, donc un retard qui grandit — borné par clampLag.
      if (m.view >= 0) lag[simId] = clampLag(s.tick - m.view);
    }
    for (const [simId, bot] of this.bots) frame[simId] = bot(s, simId);
    step(s, frame, TICK_DT, { lag, history: this.history });
    this.history.record(s);
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

  private hello(m: Member, version: number, name: string, role: Role, token: unknown): void {
    if (m.player !== null) return;
    if (version !== PROTOCOL_VERSION) {
      this.send(m, { t: 'error', message: 'Version du jeu différente : recharge la page (Ctrl+F5).' });
      return;
    }
    m.token = typeof token === 'string' ? token.slice(0, TOKEN_MAX_LENGTH) : '';
    if (m.token !== '' && (this.takeOver(m) || this.rejoin(m))) return;
    const players = this.lobbyPlayers();
    if (players.length >= MAX_HUMANS) {
      this.send(m, { t: 'error', message: 'Salon complet (10 joueurs max).' });
      return;
    }
    // Match abandonné (plus aucun humain dedans) : le nouveau venu ramène le salon au lobby.
    if (this.phase === 'match' && this.simIds.size === 0) this.backToLobby();
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

  /**
   * Reconnexion alors que l'ancienne connexion du même jeton est encore là (morte sans que le serveur l'ait vue
   * tomber) : la nouvelle prend sa place telle quelle (joueur du lobby, hôte, joueur du match) ; l'ancienne est fermée.
   */
  private takeOver(m: Member): boolean {
    let old: Member | undefined;
    for (const o of this.members.values()) if (o !== m && o.token === m.token && o.player !== null) old = o;
    if (old === undefined || old.player === null) return false;
    const oldId = old.peer.id;
    this.members.delete(oldId);
    try {
      old.peer.close?.();
    } catch {
      // déjà fermée
    }
    m.player = { ...old.player, id: m.peer.id };
    m.joinedAt = old.joinedAt; // même place dans la liste du salon
    const simId = this.simIds.get(oldId);
    if (simId !== undefined) {
      this.simIds.delete(oldId);
      this.simIds.set(m.peer.id, simId);
    }
    this.welcomeBack(m, simId);
    return true;
  }

  /** Retour d'un joueur coupé pendant le match en cours : il reprend son joueur au bot qui le remplaçait. */
  private rejoin(m: Member): boolean {
    const slot = this.reserved.get(m.token);
    if (slot === undefined || this.phase !== 'match' || !this.bots.has(slot.simId)) return false;
    this.reserved.delete(m.token);
    this.bots.delete(slot.simId);
    const hasHost = this.lobbyPlayers().some((p) => p.host);
    m.player = { ...slot.player, id: m.peer.id, host: !hasHost };
    this.simIds.set(m.peer.id, slot.simId);
    this.welcomeBack(m, slot.simId);
    return true;
  }

  /** Accueil d'un joueur qui revient : salon, puis le match en cours (état complet) s'il y joue. */
  private welcomeBack(m: Member, simId: number | undefined): void {
    this.send(m, { t: 'welcome', you: m.peer.id, room: this.code });
    this.broadcastLobby();
    if (simId !== undefined && this.state !== null && this.phase === 'match') {
      const { statics, dynamic } = splitState(this.state);
      this.send(m, { t: 'start', playerId: simId, statics, state: { ...dynamic, events: [] }, humans: this.humans });
    }
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
    this.history.clear();
    this.history.record(state);
    this.pendingEvents = [...state.events];
    this.simIds = new Map(Object.entries(setup.playerIds));
    const humanIds = [...this.simIds.values()];
    this.bots = new Map(setup.botIds.map((id) => [id, createBot(id, this.config.difficulty, (setup.config.seed ^ (id * 7919)) | 0, { externalIds: humanIds })]));
    const humans: Record<number, string> = {};
    for (const p of players) {
      const id = this.simIds.get(p.id);
      if (id !== undefined) humans[id] = p.name;
    }
    this.humans = humans;
    this.reserved.clear();
    this.orphanTicks = 0;
    const { statics, dynamic } = splitState(state);
    for (const m of this.members.values()) {
      m.queue = [];
      m.last = makeInput();
      m.view = -1;
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
    this.reserved.clear();
    this.humans = {};
    this.orphanTicks = 0;
    // Plus d'hôte (il est parti pendant le match) : le premier arrivé le devient.
    const players = this.lobbyPlayers();
    if (players.length > 0 && !players.some((p) => p.host)) players[0].host = true;
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
