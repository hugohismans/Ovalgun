/**
 * Boucle de match côté HUD (étape 6, minimal : le HUD complet est l'étape 8), PUR et testé (le temps est passé en
 * paramètre) : score et chrono (mm:ss), compte à rebours du coup d'envoi (« 3, 2, 1, JOUEZ ! »), bannière d'essai,
 * indicateur « DERNIÈRE MINUTE », écran de fin (score final, statistiques par joueur).
 *
 * La session lui transmet les événements de chaque tick (`handleEvents`) et lit un instantané par frame (`frame`).
 * Durées d'affichage : STYLE (render/palette.ts), valeurs purement visuelles.
 */

import { ROLES, TICK_RATE, type MatchEvent, type MatchPhase, type MatchState, type Role, type TeamId } from '../sim';
import { PALETTE, STYLE } from '../render/palette';

/** Noms affichés des équipes (couleurs du rendu : équipe 0 orange, équipe 1 bleu). */
export const TEAM_NAMES: readonly [string, string] = ['Orange', 'Bleu'];
/** Couleurs des équipes pour l'UI (les mêmes que le rendu : PALETTE.teams). */
export const TEAM_COLORS: readonly [string, string] = [PALETTE.teams[0].main, PALETTE.teams[1].main];

/** Chrono « m:ss » à partir de ticks restants, arrondi à la seconde SUPÉRIEURE (0:00 seulement à la fin). */
export function formatClock(ticks: number): string {
  const total = Math.max(0, Math.ceil(ticks / TICK_RATE));
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
}

export interface MatchHudFrame {
  phase: MatchPhase;
  score: [number, number];
  localTeam: TeamId;
  teamNames: readonly [string, string];
  /** Chrono « m:ss » ; en entraînement, chrono figé (`training`). */
  clock: string;
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
}

const playerLabel = (state: MatchState, id: number): string => {
  const p = state.players[id];
  return p === undefined ? `#${id}` : `${ROLES[p.role].label} #${id}`;
};

export class MatchHud {
  private playCallUntil = -Infinity;
  private lastMinuteUntil = -Infinity;
  private endedAt = Infinity;
  private lastTry: { team: TeamId; scorerId: number; score: [number, number] } | null = null;

  /** Oublie tout (nouveau match). */
  reset(): void {
    this.playCallUntil = -Infinity;
    this.lastMinuteUntil = -Infinity;
    this.endedAt = Infinity;
    this.lastTry = null;
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
        scorerLabel: playerLabel(state, t.scorerId),
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
      clock: formatClock(state.clockTicks),
      training: state.config.training,
      lastMinute: state.lastMinute,
      lastMinuteBanner: state.phase !== 'ended' && nowSec < this.lastMinuteUntil,
      countdown: state.phase === 'kickoff' ? Math.max(1, Math.ceil(state.phaseTicks / TICK_RATE)) : 0,
      kickoffTeam: state.kickoffTeam,
      playCall: state.phase === 'play' && nowSec < this.playCallUntil,
      tryBanner,
      final: state.phase === 'ended' ? this.finalResult(state, localId, localTeam, nowSec) : null,
    };
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
    };
  }
}
