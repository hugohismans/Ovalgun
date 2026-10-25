/**
 * Prédiction côté client (module pur, testé) : le joueur local voit ses propres actions IMMÉDIATEMENT au lieu
 * d'attendre l'aller-retour serveur.
 *
 * Principe (réconciliation classique) : on garde une copie locale complète de l'état. À chaque tick local, l'entrée du
 * joueur est appliquée tout de suite (`advance`) et gardée en attente. À chaque instantané, on repart de l'état du
 * serveur et on rejoue les entrées que le serveur n'a pas encore appliquées (`reconcile`, grâce à son accusé). Les autres
 * joueurs restent affichés depuis les instantanés interpolés ; seul le joueur local vient de la prédiction. Un écart de
 * position après réconciliation est absorbé visuellement en douceur (`correction`), sauf s'il est énorme (téléportation,
 * remise en jeu).
 */

import { cloneState, makeInput, step, type InputFrame, type MatchEvent, type MatchState, type PlayerInput, type PlayerState, type Vec3 } from '../sim';

/** Événements du joueur local joués dès la prédiction (et ignorés quand le serveur les renvoie) : retours instantanés. */
const SELF_EVENTS = new Set<MatchEvent['type']>(['shot', 'jump', 'dodge', 'slide', 'dive', 'reload', 'ability', 'climb']);

export function isSelfEvent(e: MatchEvent, playerId: number): boolean {
  return SELF_EVENTS.has(e.type) && 'playerId' in e && e.playerId === playerId;
}

/** Entrées en attente max (au-delà, le serveur a décroché : on oublie les plus anciennes). */
const MAX_PENDING = 120;
/** Écart (m) au-delà duquel on ne lisse pas : on accepte la position du serveur d'un coup. */
const SNAP_DISTANCE = 3;
/** Vitesse de résorption de l'écart visuel (1/s). */
const CORRECTION_RATE = 10;

export class Predictor {
  private state: MatchState | null = null;
  private prev: PlayerState | null = null;
  private pending: Array<{ seq: number; input: PlayerInput }> = [];
  /** Écart visuel à ajouter à la position prédite (se résorbe tout seul). */
  readonly correction: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly display: { pos: Vec3; vel: Vec3 } = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };

  constructor(readonly playerId: number) {}

  get ready(): boolean {
    return this.state !== null;
  }

  /** État prédit courant (lecture seule). */
  get current(): MatchState | null {
    return this.state;
  }

  reset(state: MatchState): void {
    this.state = cloneState(state);
    this.prev = null;
    this.pending = [];
    this.correction.x = this.correction.y = this.correction.z = 0;
  }

  private frame(s: MatchState, input: PlayerInput): InputFrame {
    const f: Record<number, PlayerInput> = {};
    for (const p of s.players) f[p.id] = p.id === this.playerId ? input : makeInput({ yaw: p.yaw, pitch: p.pitch });
    return f;
  }

  /** Tick local : applique l'entrée tout de suite ; renvoie les événements du joueur local à jouer immédiatement. */
  advance(input: PlayerInput, seq: number): MatchEvent[] {
    const s = this.state;
    if (s === null) return [];
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.prev = clonePlayer(s.players[this.playerId]);
    step(s, this.frame(s, input));
    return s.events.filter((e) => isSelfEvent(e, this.playerId));
  }

  /** Instantané du serveur : repart de son état et rejoue les entrées qu'il n'a pas encore appliquées. */
  reconcile(server: MatchState, ack: number): void {
    const before = this.state?.players[this.playerId]?.pos;
    const bx = before?.x ?? 0;
    const by = before?.y ?? 0;
    const bz = before?.z ?? 0;
    const s = cloneState(server);
    this.pending = this.pending.filter((p) => p.seq > ack);
    for (const p of this.pending) step(s, this.frame(s, p.input));
    this.state = s;
    const now = s.players[this.playerId].pos;
    if (before !== undefined) {
      const dx = bx - now.x;
      const dy = by - now.y;
      const dz = bz - now.z;
      const c = this.correction;
      if (Math.hypot(dx + c.x, dz + c.z) > SNAP_DISTANCE) c.x = c.y = c.z = 0;
      else {
        c.x += dx;
        c.y += dy;
        c.z += dz;
      }
    }
    // Pas de « retour en arrière » visuel : la frame suivante interpole depuis la nouvelle position.
    if (this.prev !== null) {
      this.prev.pos.x = now.x;
      this.prev.pos.y = now.y;
      this.prev.pos.z = now.z;
    }
  }

  /** Résorbe l'écart visuel (à chaque frame). */
  decay(dt: number): void {
    const k = Math.exp(-CORRECTION_RATE * dt);
    this.correction.x *= k;
    this.correction.y *= k;
    this.correction.z *= k;
  }

  /** Joueur local à afficher : position prédite interpolée entre les deux derniers ticks locaux + écart visuel. */
  localDisplay(alpha: number): PlayerState | null {
    const s = this.state;
    if (s === null) return null;
    const cur = s.players[this.playerId];
    const prev = this.prev ?? cur;
    const a = Math.min(1, Math.max(0, alpha));
    const d = this.display;
    d.pos.x = prev.pos.x + (cur.pos.x - prev.pos.x) * a + this.correction.x;
    d.pos.y = prev.pos.y + (cur.pos.y - prev.pos.y) * a + this.correction.y;
    d.pos.z = prev.pos.z + (cur.pos.z - prev.pos.z) * a + this.correction.z;
    d.vel.x = prev.vel.x + (cur.vel.x - prev.vel.x) * a;
    d.vel.y = prev.vel.y + (cur.vel.y - prev.vel.y) * a;
    d.vel.z = prev.vel.z + (cur.vel.z - prev.vel.z) * a;
    return { ...cur, pos: { ...d.pos }, vel: { ...d.vel } };
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return JSON.parse(JSON.stringify(p)) as PlayerState;
}
