/**
 * Boucle de match côté HUD (étape 6 ; affiché par le HUD de l'étape 8 : ScoreBar, Announcer, ScrumMeter, EndScreen), PUR et testé (le temps est passé en
 * paramètre) : score et chrono (mm:ss), compte à rebours du coup d'envoi (« 3, 2, 1, JOUEZ ! »), bannière d'essai,
 * indicateur « DERNIÈRE MINUTE », écran de fin (score final, statistiques par joueur) ; étape 7 : mêlée (« MÊLÉE ! »,
 * décompte, temps restant, prolongation, « Mêlée gagnée par … »).
 *
 * La session lui transmet les événements de chaque tick (`handleEvents`) et lit un instantané par frame (`frame`).
 * Durées d'affichage : STYLE (render/palette.ts), valeurs purement visuelles.
 */

import { inScrumZone, ROLES, TICK_RATE, type MatchEvent, type MatchPhase, type MatchState, type Role, type TeamId } from '../sim';
import { PALETTE, STYLE } from '../render/palette';
import { scrumGauge } from '../render/ScrumView';
import { playerName } from './names';

/** Noms affichés des équipes (couleurs du rendu : équipe 0 orange, équipe 1 bleu). */
export const TEAM_NAMES: readonly [string, string] = ['Orange', 'Bleu'];
/** Couleurs des équipes pour l'UI (les mêmes que le rendu : PALETTE.teams). */
export const TEAM_COLORS: readonly [string, string] = [PALETTE.teams[0].main, PALETTE.teams[1].main];

/**
 * Chrono « m:ss » à partir de ticks restants, arrondi à la seconde SUPÉRIEURE (0:00 seulement à la fin). Étape 8 : sous
 * `tenthsBelowSec` secondes (STYLE.clockTenthsBelowSec dans le HUD), « s,d » au dixième (arrondi supérieur : « 0,1 »
 * jusqu'au dernier tick, « 0,0 » à la fin) ; 0 = jamais.
 */
export function formatClock(ticks: number, tenthsBelowSec = 0): string {
  const t = Math.max(0, ticks);
  if (tenthsBelowSec > 0 && t < tenthsBelowSec * TICK_RATE) {
    // Arrondi supérieur, plafonné juste sous le seuil (pas de « 10,0 » entre « 0:10 » et « 9,9 »).
    const tenths = Math.min(tenthsBelowSec * 10 - 1, Math.ceil((t * 10) / TICK_RATE - 1e-9));
    return `${Math.floor(tenths / 10)},${tenths % 10}`;
  }
  const total = Math.ceil(t / TICK_RATE);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Statistiques d'un joueur sur l'écran de fin. `accuracy` = touches / projectiles tirés (null : n'a pas tiré). */
export interface PlayerLine {
  id: number;
  team: TeamId;
  role: Role;
  roleLabel: string;
  /** Nom affiché (« Ailier 1 », names.ts). */
  name: string;
  local: boolean;
  tries: number;
  tackles: number;
  passes: number;
  interceptions: number;
  shotsFired: number;
  accuracy: number | null;
}

/** Bannière d'essai (pendant la pause 'try'). */
export interface TryBanner {
  team: TeamId;
  teamName: string;
  scorerId: number;
  scorerLabel: string;
  /** Vrai si l'équipe du joueur local a marqué. */
  ours: boolean;
  /** Le joueur local a marqué lui-même. */
  mine: boolean;
  score: [number, number];
}

/** Résultat final (phase 'ended'). */
export interface FinalResult {
  score: [number, number];
  /** Équipe gagnante, −1 : égalité. */
  winner: TeamId | -1;
  /** Résultat pour le joueur local. */
  outcome: 'win' | 'loss' | 'draw';
  /** Joueurs, équipe du joueur local d'abord, puis par id. */
  players: PlayerLine[];
  /** A / Entrée acceptés (délai STYLE.endScreenInputDelaySec écoulé depuis la fin). */
  canReplay: boolean;
  /** « Joueur du match » (matchMvp : STYLE.mvpWeights), −1 : personne (aucune statistique). */
  mvpId: number;
}

/**
 * « Joueur du match » (étape 8), PUR : la ligne au plus grand score Σ statistique × STYLE.mvpWeights ; en cas d'égalité,
 * la première dans l'ordre donné (celui de l'écran de fin) ; −1 si tous les scores sont nuls (ou aucune ligne).
 */
export function matchMvp(players: readonly Readonly<Pick<PlayerLine, 'id' | 'tries' | 'tackles' | 'interceptions' | 'passes'>>[]): number {
  const w = STYLE.mvpWeights;
  let best = -1;
  let bestScore = 0;
  for (const p of players) {
    const sc = p.tries * w.tries + p.tackles * w.tackles + p.interceptions * w.interceptions + p.passes * w.passes;
    if (sc > bestScore) {
      bestScore = sc;
      best = p.id;
    }
  }
  return best;
}

/** Mêlée en cours (étape 7) : décompte, équipe qui mène, prolongation, temps restant de la phase en cours. */
export interface ScrumHud {
  counts: [number, number];
  /** Équipe qui mène au décompte, −1 à égalité. */
  leader: TeamId | -1;
  overtime: boolean;
  /** Temps restant de la phase en cours (capture, ou prolongation qui peut finir plus tôt), s. */
  secLeft: number;
  /** Avancement de la phase en cours, 0..1. */
  progress: number;
  /** Le joueur local compte dans la zone (actif, dedans). */
  inZone: boolean;
}

/** Résultat de la dernière mêlée (bannière quelques secondes après la résolution). */
export interface ScrumResult {
  /** Équipe gagnante, −1 : personne (ballon rendu libre). */
  team: TeamId | -1;
  teamName: string;
  /** L'équipe du joueur local a gagné. */
  ours: boolean;
  /** Le joueur local reçoit le ballon. */
  mine: boolean;
}

export interface MatchHudFrame {
  phase: MatchPhase;
  score: [number, number];
  localTeam: TeamId;
  teamNames: readonly [string, string];
  /** Chrono « m:ss » (« s,d » dans les STYLE.clockTenthsBelowSec dernières secondes) ; en entraînement, chrono figé (`training`). */
  clock: string;
  /** Chrono au dixième (dernières secondes) : mis en valeur par l'UI. */
  clockUrgent: boolean;
  training: boolean;
  lastMinute: boolean;
  /** Bannière « DERNIÈRE MINUTE » (quelques secondes après son déclenchement). */
  lastMinuteBanner: boolean;
  /** Compte à rebours du coup d'envoi : 3, 2, 1 (secondes entières restantes), 0 hors coup d'envoi. */
  countdown: number;
  /** Équipe qui reçoit le coup d'envoi en cours / à venir. */
  kickoffTeam: TeamId;
  /** « JOUEZ ! » juste après le coup de sifflet. */
  playCall: boolean;
  tryBanner: TryBanner | null;
  final: FinalResult | null;
  /** Étape 7 : mêlée en cours (null : aucune), « MÊLÉE ! » au déclenchement, résultat après la résolution. */
  scrum: ScrumHud | null;
  scrumCall: boolean;
  scrumResult: ScrumResult | null;
}

export class MatchHud {
  private playCallUntil = -Infinity;
  private lastMinuteUntil = -Infinity;
  private endedAt = Infinity;
  private lastTry: { team: TeamId; scorerId: number; score: [number, number] } | null = null;
  private scrumCallUntil = -Infinity;
  private scrumResultUntil = -Infinity;
  private lastScrum: { team: TeamId | -1; playerId: number } | null = null;

  /** Oublie tout (nouveau match). */
  reset(): void {
    this.playCallUntil = -Infinity;
    this.lastMinuteUntil = -Infinity;
    this.endedAt = Infinity;
    this.lastTry = null;
    this.scrumCallUntil = -Infinity;
    this.scrumResultUntil = -Infinity;
    this.lastScrum = null;
  }

  /** Événements d'un tick (état juste après le tick). */
  handleEvents(events: readonly MatchEvent[], state: MatchState, nowSec: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'play':
          this.playCallUntil = nowSec + STYLE.playCallSec;
          break;
        case 'last_minute':
          this.lastMinuteUntil = nowSec + STYLE.lastMinuteBannerSec;
          break;
        case 'try':
          this.lastTry = { team: e.team, scorerId: e.scorerId, score: [state.score[0], state.score[1]] };
          break;
        case 'kickoff':
          this.playCallUntil = -Infinity;
          this.scrumCallUntil = -Infinity;
          this.scrumResultUntil = -Infinity;
          break;
        case 'scrum_start':
          this.scrumCallUntil = nowSec + STYLE.scrumCallSec;
          this.scrumResultUntil = -Infinity;
          break;
        case 'scrum_won':
          this.lastScrum = { team: e.team, playerId: e.playerId };
          this.scrumCallUntil = -Infinity;
          this.scrumResultUntil = nowSec + STYLE.scrumResultSec;
          break;
        case 'scrum_released':
          this.lastScrum = { team: -1, playerId: -1 };
          this.scrumCallUntil = -Infinity;
          this.scrumResultUntil = nowSec + STYLE.scrumResultSec;
          break;
        case 'match_end':
          this.endedAt = nowSec;
          break;
        default:
          break;
      }
    }
  }

  /** Vrai quand l'écran de fin accepte A / Entrée (délai écoulé depuis la fin du match). */
  canReplay(nowSec: number): boolean {
    return nowSec >= this.endedAt + STYLE.endScreenInputDelaySec;
  }

  /** Instantané pour l'UI. */
  frame(state: MatchState, localId: number, nowSec: number): MatchHudFrame {
    const me = state.players[localId];
    const localTeam: TeamId = me?.team ?? 0;
    const t = this.lastTry;
    let tryBanner: TryBanner | null = null;
    if (state.phase === 'try' && t !== null) {
      tryBanner = {
        team: t.team,
        teamName: TEAM_NAMES[t.team],
        scorerId: t.scorerId,
        scorerLabel: playerName(state, t.scorerId),
        ours: t.team === localTeam,
        mine: t.scorerId === localId,
        score: t.score,
      };
    }
    return {
      phase: state.phase,
      score: [state.score[0], state.score[1]],
      localTeam,
      teamNames: TEAM_NAMES,
      clock: formatClock(state.clockTicks, STYLE.clockTenthsBelowSec),
      clockUrgent: !state.config.training && state.phase !== 'ended' && state.clockTicks < STYLE.clockTenthsBelowSec * TICK_RATE,
      training: state.config.training,
      lastMinute: state.lastMinute,
      lastMinuteBanner: state.phase !== 'ended' && nowSec < this.lastMinuteUntil,
      countdown: state.phase === 'kickoff' ? Math.max(1, Math.ceil(state.phaseTicks / TICK_RATE)) : 0,
      kickoffTeam: state.kickoffTeam,
      playCall: state.phase === 'play' && nowSec < this.playCallUntil,
      tryBanner,
      final: state.phase === 'ended' ? this.finalResult(state, localId, localTeam, nowSec) : null,
      scrum: this.scrumHud(state, localId),
      scrumCall: state.scrum !== null && nowSec < this.scrumCallUntil,
      scrumResult: this.scrumResultFrame(state, localId, localTeam, nowSec),
    };
  }

  private scrumHud(state: MatchState, localId: number): ScrumHud | null {
    const sc = state.scrum;
    if (sc === null) return null;
    const g = scrumGauge(sc);
    const me = state.players[localId];
    const inZone = me !== undefined && inScrumZone(me, sc); // la règle de la sim (pas de copie côté client)
    return { counts: [sc.counts[0], sc.counts[1]], leader: g.leader, overtime: g.overtime, secLeft: g.secLeft, progress: g.progress, inZone };
  }

  private scrumResultFrame(state: MatchState, localId: number, localTeam: TeamId, nowSec: number): ScrumResult | null {
    const r = this.lastScrum;
    if (r === null || state.phase !== 'play' || nowSec >= this.scrumResultUntil) return null;
    return { team: r.team, teamName: r.team === -1 ? '' : TEAM_NAMES[r.team], ours: r.team === localTeam, mine: r.playerId === localId };
  }

  private finalResult(state: MatchState, localId: number, localTeam: TeamId, nowSec: number): FinalResult {
    const [a, b] = state.score;
    const winner: TeamId | -1 = a === b ? -1 : a > b ? 0 : 1;
    const players = state.players
      .map(
        (p): PlayerLine => ({
          id: p.id,
          team: p.team,
          role: p.role,
          roleLabel: ROLES[p.role].label,
          name: playerName(state, p.id),
          local: p.id === localId,
          tries: p.stats.tries,
          tackles: p.stats.tackles,
          passes: p.stats.passes,
          interceptions: p.stats.interceptions,
          shotsFired: p.stats.shotsFired,
          accuracy: p.stats.shotsFired > 0 ? p.stats.shotsHit / p.stats.shotsFired : null,
        }),
      )
      .sort((x, y) => (x.team === y.team ? x.id - y.id : x.team === localTeam ? -1 : 1));
    return {
      score: [a, b],
      winner,
      outcome: winner === -1 ? 'draw' : winner === localTeam ? 'win' : 'loss',
      players,
      canReplay: this.canReplay(nowSec),
      mvpId: matchMvp(players),
    };
  }
}
