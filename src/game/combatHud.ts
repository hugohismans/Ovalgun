/**
 * Retours de visée du joueur local (étape 5), PURS et testés (le temps est passé en paramètre) :
 *  - hitmarker sur le réticule quand il touche (et un plus fort quand il plaque) ;
 *  - indicateurs de direction des tirs reçus (angle relatif à la caméra, recalculé à chaque frame avec la position
 *    COURANTE du tireur, qui s'estompe en STYLE.damageIndicatorSec) ;
 *  - vignette rouge quand la stabilité est basse, plus un bref flash à chaque tir reçu.
 * Durées et seuils : STYLE (render/palette.ts), valeurs purement visuelles.
 */

import { ROLES, type MatchEvent, type MatchState, type PlayerState } from '../sim';
import { STYLE } from '../render/palette';

/**
 * Hitmarker en cours : `seq` change à chaque nouveau coup (relance l'animation), `strong` = plaquage,
 * `durationSec` = durée d'affichage (STYLE.hitMarkerSec / hitMarkerStrongSec), passée au CSS de l'animation.
 */
export interface HitMarker {
  seq: number;
  strong: boolean;
  durationSec: number;
}

/** Indicateur de tir reçu : angle (degrés, 0 = devant, positif = à droite, sens horaire à l'écran), opacité 0..1. */
export interface DamageIndicator {
  key: number;
  angleDeg: number;
  alpha: number;
}

export interface CombatHudFrame {
  hitMarker: HitMarker | null;
  damage: DamageIndicator[];
  /** Opacité de la vignette rouge (0 : aucune). */
  vignette: number;
}

interface Received {
  key: number;
  sourceId: number;
  /** Position du tireur au moment du coup (si le tireur n'existe plus). */
  x: number;
  z: number;
  at: number;
}

/** Angle (degrés) de (dx, dz) vu par une caméra de lacet `yaw` : 0 devant, +90 à droite (convention de vec.ts). */
export function relativeAngleDeg(dx: number, dz: number, yaw: number): number {
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const rgt = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  return (Math.atan2(rgt, fwd) * 180) / Math.PI;
}

export class CombatHud {
  private markerSeq = 0;
  private markerStrong = false;
  private markerUntil = -1;
  private readonly received: Received[] = [];
  private nextKey = 0;
  private lastHitTakenAt = -Infinity;

  /** Événements d'un tick pour le joueur local. */
  handleEvents(events: readonly MatchEvent[], state: MatchState, localId: number, nowSec: number): void {
    for (const e of events) {
      if (e.type === 'hit') {
        if (e.sourceId === localId && e.targetId !== localId) this.marker(false, nowSec);
        if (e.targetId === localId) {
          this.lastHitTakenAt = nowSec;
          const src = state.players[e.sourceId];
          const existing = this.received.find((r) => r.sourceId === e.sourceId);
          const r = existing ?? { key: this.nextKey++, sourceId: e.sourceId, x: 0, z: 0, at: 0 };
          r.x = src?.pos.x ?? e.pos.x;
          r.z = src?.pos.z ?? e.pos.z;
          r.at = nowSec;
          if (existing === undefined) {
            this.received.push(r);
            if (this.received.length > STYLE.damageIndicatorMax) this.received.shift();
          }
        }
      } else if (e.type === 'tackled' && e.byId === localId && e.targetId !== localId) {
        this.marker(true, nowSec);
      }
    }
  }

  private marker(strong: boolean, nowSec: number): void {
    // Un coup simple ne remplace pas un hitmarker de plaquage encore affiché.
    if (!strong && this.markerStrong && nowSec < this.markerUntil) return;
    this.markerSeq++;
    this.markerStrong = strong;
    this.markerUntil = nowSec + (strong ? STYLE.hitMarkerStrongSec : STYLE.hitMarkerSec);
  }

  /** État d'affichage pour une frame : `viewYaw` = lacet COURANT de la caméra. */
  frame(nowSec: number, me: PlayerState, viewYaw: number, state: MatchState): CombatHudFrame {
    for (let i = this.received.length - 1; i >= 0; i--) {
      if (nowSec - this.received[i].at >= STYLE.damageIndicatorSec) this.received.splice(i, 1);
    }
    const damage = this.received.map((r) => {
      const src = state.players[r.sourceId];
      const x = src?.pos.x ?? r.x;
      const z = src?.pos.z ?? r.z;
      return {
        key: r.key,
        angleDeg: relativeAngleDeg(x - me.pos.x, z - me.pos.z, viewYaw),
        alpha: 1 - (nowSec - r.at) / STYLE.damageIndicatorSec,
      };
    });
    const ratio = me.status === 'active' ? me.stability / ROLES[me.role].stabilityMax : 1;
    const low = Math.max(0, Math.min(1, (STYLE.vignetteFromFraction - ratio) / STYLE.vignetteFromFraction));
    const since = nowSec - this.lastHitTakenAt;
    const flash = since < STYLE.vignetteHitSec ? STYLE.vignetteHitFlash * (1 - since / STYLE.vignetteHitSec) : 0;
    return {
      hitMarker:
        nowSec < this.markerUntil
          ? {
              seq: this.markerSeq,
              strong: this.markerStrong,
              durationSec: this.markerStrong ? STYLE.hitMarkerStrongSec : STYLE.hitMarkerSec,
            }
          : null,
      damage,
      vignette: Math.min(1, low + flash),
    };
  }

  reset(): void {
    this.received.length = 0;
    this.markerUntil = -1;
    this.lastHitTakenAt = -Infinity;
  }
}
