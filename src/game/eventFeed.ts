/**
 * Flux d'événements discret du HUD (étape 8), PUR et testé (le temps est passé en paramètre) : plaquages (avec
 * « ballon lâché » quand le plaqué portait le ballon), interceptions, essais, mêlées gagnées / ballon rendu. Chaque
 * ligne nomme les joueurs (rôle + rang, couleur d'équipe, « Toi ») et porte un ton relatif au joueur local (bon pour
 * son équipe, mauvais sinon) ; elle vit STYLE.feedSec puis s'estompe pendant STYLE.feedFadeSec ; STYLE.feedMax lignes
 * au plus (la plus ancienne disparaît).
 *
 * Les grandes annonces (ESSAI !, MÊLÉE !, compte à rebours…) sont dans matchHud.ts, les messages personnels (« Aucun
 * coéquipier derrière », « Plaqué ! »…) dans feedback.ts.
 */

import type { MatchEvent, MatchState, TeamId } from '../sim';
import { STYLE } from '../render/palette';
import { TEAM_NAMES } from './matchHud';
import { playerTag, type PlayerTag } from './names';

export type FeedKind = 'tackle' | 'interception' | 'try' | 'scrum';
export type FeedTone = 'good' | 'bad' | 'neutral';

export interface FeedItem {
  key: number;
  kind: FeedKind;
  /** Auteur (plaqueur, intercepteur, marqueur, joueur qui reçoit le ballon de la mêlée), null : aucun. */
  actor: PlayerTag | null;
  /** Verbe / texte entre les deux joueurs (« plaque », « intercepte », « marque un essai »…). */
  text: string;
  /** Joueur qui subit (plaqué, passeur intercepté), null : aucun. */
  target: PlayerTag | null;
  /** Complément (« ballon lâché »), chaîne vide sinon. */
  extra: string;
  /** Équipe à l'honneur (couleur de la ligne), −1 : aucune. */
  team: TeamId | -1;
  tone: FeedTone;
  /** Opacité 0..1 (fondu de fin de vie). */
  alpha: number;
}

interface Entry {
  item: Omit<FeedItem, 'alpha'>;
  at: number;
}

export class EventFeed {
  private entries: Entry[] = [];
  private nextKey = 0;

  reset(): void {
    this.entries = [];
  }

  /** Événements d'un tick (état juste après le tick) vus par le joueur local `localId`. */
  handleEvents(events: readonly MatchEvent[], state: Readonly<MatchState>, localId: number, nowSec: number): void {
    const localTeam = state.players[localId]?.team ?? 0;
    const tone = (team: TeamId | -1): FeedTone => (team === -1 ? 'neutral' : team === localTeam ? 'good' : 'bad');
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      switch (e.type) {
        case 'tackled': {
          const actor = e.byId >= 0 && e.byId !== e.targetId ? playerTag(state, e.byId, localId) : null;
          const target = playerTag(state, e.targetId, localId);
          if (target === null) break;
          // « drop » suit « tackled » dans le même tick quand le plaqué portait le ballon.
          const dropped = events.some((x, j) => j > i && x.type === 'drop' && x.playerId === e.targetId);
          // Le plaquage est à l'honneur de l'équipe adverse du plaqué.
          const team: TeamId = target.team === 0 ? 1 : 0;
          const extra = dropped ? 'ballon lâché' : '';
          if (actor !== null) this.push({ kind: 'tackle', actor, text: 'plaque', target, extra, team, tone: tone(team) }, nowSec);
          // Sans plaqueur crédité : le plaqué est le sujet de la phrase.
          else this.push({ kind: 'tackle', actor: target, text: 'est plaqué', target: null, extra, team, tone: tone(team) }, nowSec);
          break;
        }
        case 'catch': {
          if (!e.intercepted) break;
          const actor = playerTag(state, e.playerId, localId);
          if (actor === null) break;
          const target = e.fromId >= 0 ? playerTag(state, e.fromId, localId) : null;
          this.push({ kind: 'interception', actor, text: target !== null ? 'intercepte la passe de' : 'intercepte la passe', target, extra: '', team: actor.team, tone: tone(actor.team) }, nowSec);
          break;
        }
        case 'try': {
          const actor = playerTag(state, e.scorerId, localId);
          this.push({ kind: 'try', actor, text: actor !== null ? 'marque un essai' : `Essai ${TEAM_NAMES[e.team]}`, target: null, extra: '', team: e.team, tone: tone(e.team) }, nowSec);
          break;
        }
        case 'scrum_won': {
          const actor = playerTag(state, e.playerId, localId);
          this.push({ kind: 'scrum', actor, text: `gagne la mêlée pour ${TEAM_NAMES[e.team]}`, target: null, extra: '', team: e.team, tone: tone(e.team) }, nowSec);
          break;
        }
        case 'scrum_released':
          this.push({ kind: 'scrum', actor: null, text: 'Mêlée : ballon rendu', target: null, extra: '', team: -1, tone: 'neutral' }, nowSec);
          break;
        default:
          break;
      }
    }
  }

  private push(item: Omit<FeedItem, 'alpha' | 'key'>, nowSec: number): void {
    this.entries.push({ item: { ...item, key: this.nextKey++ }, at: nowSec });
    while (this.entries.length > STYLE.feedMax) this.entries.shift();
  }

  /** Lignes affichées à l'instant `nowSec` (de la plus ancienne à la plus récente). */
  frame(nowSec: number): FeedItem[] {
    const life = STYLE.feedSec + STYLE.feedFadeSec;
    this.entries = this.entries.filter((e) => nowSec - e.at < life);
    return this.entries.map((e) => {
      const age = nowSec - e.at;
      const alpha = age <= STYLE.feedSec ? 1 : Math.max(0, 1 - (age - STYLE.feedSec) / STYLE.feedFadeSec);
      return { ...e.item, alpha };
    });
  }
}
