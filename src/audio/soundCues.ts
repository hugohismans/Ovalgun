/**
 * Quels sons jouer, et où (fonctions pures, testées) : événements de la sim -> sons, excitation de la foule, compte à
 * rebours. Aucune dépendance au Web Audio : le moteur (AudioEngine.ts) ne fait qu'exécuter ces décisions.
 *
 * Un son est soit SPATIALISÉ (position dans le monde : tirs, impacts, rebonds… entendus d'où ils viennent), soit
 * « 2D » (retours personnels du joueur local, arbitre, interface).
 */

import type { MatchEvent, MatchState, Vec3 } from '../sim';
import type { SynthName } from './synth';

export type Bus = 'sfx' | 'ui' | 'ambience';

export interface CueDef {
  bus: Bus;
  /** Priorité (plus haut = gardé quand trop de voix jouent). */
  priority: number;
}

/** Bus et priorité de chaque son. */
export const CUE_DEFS: Readonly<Record<SynthName, CueDef>> = {
  smg: { bus: 'sfx', priority: 3 },
  shotgun: { bus: 'sfx', priority: 4 },
  launcher: { bus: 'sfx', priority: 4 },
  explosion: { bus: 'sfx', priority: 7 },
  reload: { bus: 'sfx', priority: 2 },
  impact: { bus: 'sfx', priority: 3 },
  hitmarker: { bus: 'ui', priority: 8 },
  tackleConfirm: { bus: 'ui', priority: 9 },
  shieldBlock: { bus: 'sfx', priority: 5 },
  bodyFall: { bus: 'sfx', priority: 6 },
  tackledSelf: { bus: 'ui', priority: 9 },
  getup: { bus: 'sfx', priority: 2 },
  footstep: { bus: 'sfx', priority: 1 },
  jump: { bus: 'sfx', priority: 2 },
  land: { bus: 'sfx', priority: 2 },
  whoosh: { bus: 'sfx', priority: 4 },
  dive: { bus: 'sfx', priority: 6 },
  slide: { bus: 'sfx', priority: 3 },
  climb: { bus: 'sfx', priority: 2 },
  abilityBoost: { bus: 'sfx', priority: 6 },
  abilityShield: { bus: 'sfx', priority: 6 },
  abilityZone: { bus: 'sfx', priority: 6 },
  pickup: { bus: 'sfx', priority: 7 },
  pass: { bus: 'sfx', priority: 7 },
  catch: { bus: 'sfx', priority: 7 },
  kick: { bus: 'sfx', priority: 7 },
  bounce: { bus: 'sfx', priority: 3 },
  interception: { bus: 'ui', priority: 8 },
  whistleShort: { bus: 'ui', priority: 9 },
  whistlePlay: { bus: 'ui', priority: 9 },
  whistleLong: { bus: 'ui', priority: 10 },
  horn: { bus: 'ui', priority: 8 },
  scrumWon: { bus: 'ui', priority: 7 },
  alarm: { bus: 'ui', priority: 9 },
  countdown: { bus: 'ui', priority: 9 },
  countdownGo: { bus: 'ui', priority: 9 },
  fanfare: { bus: 'ui', priority: 10 },
  defeat: { bus: 'ui', priority: 10 },
  crowdCheer: { bus: 'ambience', priority: 8 },
  crowdOoh: { bus: 'ambience', priority: 5 },
  heartbeat: { bus: 'ui', priority: 6 },
  uiMove: { bus: 'ui', priority: 5 },
  uiConfirm: { bus: 'ui', priority: 6 },
  uiBack: { bus: 'ui', priority: 6 },
  uiError: { bus: 'ui', priority: 6 },
};

export interface CueRequest {
  cue: SynthName;
  /** Position dans le monde (son spatialisé) ; null = son 2D. */
  pos: Vec3 | null;
  gain: number;
  pitch: number;
  /** Clé d'anti-rafale (même clé => au plus un son par intervalle, voir AudioEngine) ; '' = aucune. */
  throttleKey: string;
}

const cue = (c: SynthName, pos: Vec3 | null, gain = 1, pitch = 1, throttleKey = ''): CueRequest => ({ cue: c, pos, gain, pitch, throttleKey });

/** Hauteur de la poitrine d'un joueur (position d'émission des sons de joueur). */
const CHEST = 1.1;
const at = (p: { pos: Vec3 } | undefined, dy = CHEST): Vec3 | null => (p === undefined ? null : { x: p.pos.x, y: p.pos.y + dy, z: p.pos.z });

/**
 * Sons d'un tick. `localId` = joueur humain (-1 : aucun, fond de menu). Les retours personnels (hitmarker, plaquage
 * réussi / subi, passe refusée) ne concernent que lui ; ses propres sons de mouvement sont joués en 2D (pas de
 * spatialisation sur soi-même) et un peu plus doux.
 */
export function cuesForEvents(events: readonly MatchEvent[], state: MatchState, localId: number): CueRequest[] {
  const out: CueRequest[] = [];
  const pl = (id: number) => state.players[id];
  // Sons de joueur : 2D pour le joueur local, spatialisés pour les autres.
  const self = (c: SynthName, id: number, gain = 1, pitch = 1, key = ''): void => {
    out.push(id === localId ? cue(c, null, gain * 0.7, pitch, key) : cue(c, at(pl(id)), gain, pitch, key));
  };
  for (const e of events) {
    switch (e.type) {
      case 'shot': {
        const c: SynthName = e.kind === 'bullet' ? 'smg' : e.kind === 'pellet' ? 'shotgun' : 'launcher';
        out.push(cue(c, e.playerId === localId ? null : e.pos, e.playerId === localId ? 0.6 : 1, 1, `shot:${e.playerId}`));
        break;
      }
      case 'hit':
        out.push(cue('impact', e.pos, 1, 1, `hit:${e.targetId}`));
        if (e.sourceId === localId) out.push(cue('hitmarker', null, 1, 1, 'hitmarker'));
        break;
      case 'blocked':
        out.push(cue('shieldBlock', e.pos, 1, 1, `block:${e.targetId}`));
        break;
      case 'explosion':
        out.push(cue('explosion', e.pos));
        break;
      case 'tackled': {
        out.push(cue('bodyFall', at(pl(e.targetId), 0.3)));
        if (e.targetId === localId) out.push(cue('tackledSelf', null));
        else if (e.byId === localId) out.push(cue('tackleConfirm', null));
        break;
      }
      case 'getup':
        self('getup', e.playerId, 0.8);
        break;
      case 'jump':
        self('jump', e.playerId, 1, e.air ? 1.25 : 1);
        break;
      case 'land':
        if (e.speed > 4) self('land', e.playerId, Math.min(1.2, e.speed / 10));
        break;
      case 'dodge':
        self('whoosh', e.playerId);
        break;
      case 'slide':
        self('slide', e.playerId);
        break;
      case 'dive':
        self('dive', e.playerId);
        break;
      case 'climb':
        self('climb', e.playerId);
        break;
      case 'reload':
        self('reload', e.playerId);
        break;
      case 'ability':
        self(e.role === 'ailier' ? 'abilityBoost' : e.role === 'pilier' ? 'abilityShield' : 'abilityZone', e.playerId);
        break;
      case 'pickup':
        self('pickup', e.playerId);
        break;
      case 'pass':
        self('pass', e.fromId);
        break;
      case 'pass_denied':
        if (e.playerId === localId) out.push(cue('uiError', null));
        break;
      case 'catch':
        self('catch', e.playerId);
        if (e.intercepted) out.push(cue('interception', null), cue('crowdOoh', null, 0.8));
        break;
      case 'kick':
        self('kick', e.playerId);
        break;
      case 'drop':
        out.push(cue('crowdOoh', null, 0.7));
        break;
      case 'bounce':
        if (e.speed > 1.5) out.push(cue('bounce', e.pos, Math.min(1, e.speed / 9), 1, 'bounce'));
        break;
      case 'try': {
        const mine = localId >= 0 && pl(localId)?.team === e.team;
        out.push(cue('whistleShort', null), cue('crowdCheer', null, 1));
        out.push(cue(localId < 0 || mine ? 'fanfare' : 'defeat', null));
        break;
      }
      case 'kickoff':
        break;
      case 'play':
        out.push(cue('countdownGo', null), cue('whistlePlay', null));
        break;
      case 'scrum_start':
        out.push(cue('horn', null));
        break;
      case 'scrum_won':
        out.push(cue('scrumWon', null));
        break;
      case 'last_minute':
        out.push(cue('alarm', null));
        break;
      case 'match_end':
        out.push(cue('whistleLong', null), cue('crowdCheer', null, 0.8, 0.9));
        break;
    }
  }
  return out;
}

/**
 * Excitation de la foule 0..1 : monte quand un porteur approche de l'en-but adverse, un peu pendant une mêlée et quand
 * le ballon est en l'air ; nulle hors jeu.
 */
export function crowdExcitement(state: MatchState): number {
  if (state.phase !== 'play') return 0;
  const b = state.ball;
  if (b.mode === 'carried') {
    const c = state.players[b.carrierId];
    if (c === undefined) return 0;
    const line = c.team === 0 ? state.field.tryLineZ : -state.field.tryLineZ;
    const dist = Math.abs(line - c.pos.z);
    const span = state.field.tryLineZ * 2;
    const k = Math.min(1, Math.max(0, 1 - dist / (span * 0.6)));
    return k * k;
  }
  if (b.mode === 'scrum') return 0.45;
  if (b.mode === 'kick' || b.mode === 'pass') return 0.3;
  return 0.15;
}

/** Bip du compte à rebours du coup d'envoi quand la seconde affichée change (3, 2, 1). Renvoie la seconde ou 0. */
export function countdownBeep(prevTicks: number, ticks: number, tickRate: number): number {
  const prev = Math.ceil(prevTicks / tickRate);
  const cur = Math.ceil(ticks / tickRate);
  return cur !== prev && cur >= 1 && cur <= 3 ? cur : 0;
}

/** Anti-rafale : au plus un son par clé et par intervalle (s). */
export class Throttle {
  private readonly last = new Map<string, number>();
  constructor(private readonly intervalSec: number) {}

  allow(key: string, now: number): boolean {
    if (key === '') return true;
    const t = this.last.get(key);
    if (t !== undefined && now - t < this.intervalSec) return false;
    this.last.set(key, now);
    return true;
  }

  clear(): void {
    this.last.clear();
  }
}
