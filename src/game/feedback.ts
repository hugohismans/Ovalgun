/**
 * Retours texte temporaires pour le joueur local (étape 4 ; étape 8 : affichés par le HUD près du réticule, hud/Callout.svelte) :
 * « Aucun coéquipier derrière », « Interception ! », « Plaqué ! », « Plaquage ! »…
 * Table PURE (testée) : événement -> message.
 */

import type { MatchEvent, MatchState } from '../sim';
import { playerName } from './names';

export type FeedbackKind = 'good' | 'bad' | 'info';

export interface Feedback {
  text: string;
  kind: FeedbackKind;
}

/** Durée d'affichage d'un retour texte (s) — confort de lecture, pas une valeur de gameplay. */
export const FEEDBACK_SEC = 1.3;

/** Message pour le joueur local `localId` correspondant à un événement (null : aucun). `state` = état après le tick. */
export function feedbackFor(e: MatchEvent, state: MatchState, localId: number): Feedback | null {
  const me = state.players[localId];
  if (me === undefined) return null;
  switch (e.type) {
    case 'pass_denied':
      return e.playerId === localId ? { text: 'Aucun coéquipier derrière', kind: 'bad' } : null;
    case 'catch': {
      if (e.playerId === localId) return e.intercepted ? { text: 'Interception !', kind: 'good' } : null;
      const catcher = state.players[e.playerId];
      if (!e.intercepted) {
        // Passe finale : sa passe attrapée par un coéquipier (souvent hors champ, derrière lui) est confirmée. Un coup de
        // pied repris par un coéquipier compte aussi (« passe au pied ») ; repris par l'adversaire : rien.
        if (e.fromId !== localId || catcher === undefined || catcher.team !== me.team) return null;
        return { text: `Passe réussie → ${playerName(state, catcher.id)}`, kind: 'good' };
      }
      if (e.fromId === localId) return { text: 'Ballon intercepté', kind: 'bad' };
      if (catcher === undefined) return null;
      return catcher.team === me.team ? { text: 'Interception de ton équipe !', kind: 'good' } : { text: 'Interception adverse', kind: 'bad' };
    }
    case 'tackled':
      if (e.targetId === localId) return { text: 'Plaqué !', kind: 'bad' };
      return e.byId === localId ? { text: 'Plaquage !', kind: 'good' } : null;
    case 'drop':
      // Émis juste après 'tackled' quand le plaqué portait le ballon : ce message remplace « Plaqué ! ».
      return e.playerId === localId ? { text: 'Plaqué ! Ballon lâché', kind: 'bad' } : null;
    default:
      return null;
  }
}
