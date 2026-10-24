/**
 * Retours texte temporaires pour le joueur local (étape 4, en attendant le vrai HUD de l'étape 8) :
 * « Aucun coéquipier derrière », « Interception ! »… Table PURE (testée) : événement -> message.
 */

import type { MatchEvent, MatchState } from '../sim';

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
      if (!e.intercepted) return null;
      if (e.fromId === localId) return { text: 'Ballon intercepté', kind: 'bad' };
      const catcher = state.players[e.playerId];
      if (catcher === undefined) return null;
      return catcher.team === me.team ? { text: 'Interception de ton équipe !', kind: 'good' } : { text: 'Interception adverse', kind: 'bad' };
    }
    default:
      return null;
  }
}
