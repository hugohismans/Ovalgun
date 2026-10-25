/**
 * Instantané de la session pour le HUD (étape 8), en runes.
 *
 * La session produit un `FrameSnapshot` à chaque frame. Pour ne pas réévaluer tout le HUD à 60–144 Hz :
 *  - `snap` (score, jauges, cooldowns, flux…) est publié à HUD_RATE Hz au plus, et tout de suite quand un état
 *    discret change (pause, fin, mode, périphérique, phase, porteur, statut, retour texte, hitmarker, tir reçu) ;
 *  - `fast` (ce qui bouge avec la caméra : mini-flèche du ballon, indicateurs de tirs reçus, vignette, réticule) est
 *    publié à chaque frame, dans un petit objet séparé : seuls les composants qui le lisent sont réévalués.
 * `$state.raw` : les instantanés sont remplacés, jamais modifiés (pas de proxy profond).
 */

import type { FrameSnapshot } from '../../game/session';

/** Fréquence maximale de publication de `snap` (Hz). */
const HUD_RATE = 30;

export interface FastFrame {
  ball: FrameSnapshot['ball'];
  combat: FrameSnapshot['combat'];
  aiming: boolean;
}

/** Vrai si un état discret a changé : publication immédiate. */
function discreteChange(a: FrameSnapshot, b: FrameSnapshot): boolean {
  return (
    a.paused !== b.paused ||
    a.ended !== b.ended ||
    a.mode !== b.mode ||
    a.awaitingLock !== b.awaitingLock ||
    a.activeDevice !== b.activeDevice ||
    a.gamepadStyle !== b.gamepadStyle ||
    a.match.phase !== b.match.phase ||
    a.carrier !== b.carrier ||
    a.status !== b.status ||
    (a.feedback?.seq ?? -1) !== (b.feedback?.seq ?? -1) ||
    a.combat.hitTakenSeq !== b.combat.hitTakenSeq ||
    (a.combat.hitMarker?.seq ?? -1) !== (b.combat.hitMarker?.seq ?? -1) ||
    a.match.countdown !== b.match.countdown ||
    a.feed.length !== b.feed.length
  );
}

class HudStore {
  snap = $state.raw<FrameSnapshot | null>(null);
  fast = $state.raw<FastFrame | null>(null);
  private lastAt = -Infinity;

  /** Nouvel instantané de la session (`nowSec` : horloge de l'UI). */
  push(s: FrameSnapshot, nowSec: number): void {
    this.fast = { ball: s.ball, combat: s.combat, aiming: s.aiming };
    const prev = this.snap;
    if (prev === null || discreteChange(prev, s) || nowSec - this.lastAt >= 1 / HUD_RATE) {
      this.snap = s;
      this.lastAt = nowSec;
    }
  }

  clear(): void {
    this.snap = null;
    this.fast = null;
    this.lastAt = -Infinity;
  }
}

export const hud = new HudStore();
