/**
 * Qualité graphique « Auto » (PURE, testée) : part de Haut et descend d'un niveau quand la moyenne des images par seconde
 * sur une fenêtre de AUTO_QUALITY.windowSec passe sous AUTO_QUALITY.minFps. Les images trop longues (onglet caché,
 * chargement, compilation des shaders) sont ignorées. Jamais de remontée : pas d'oscillation entre deux niveaux.
 */

import { AUTO_QUALITY, type QualityLevel } from '../render/palette';

/** Niveaux du plus beau au plus léger. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['haut', 'moyen', 'bas'];

export class AutoQuality {
  level: QualityLevel = 'haut';
  private time = 0;
  private frames = 0;

  /** Repart de Haut (réglage changé, nouvelle partie). */
  reset(): void {
    this.level = 'haut';
    this.time = 0;
    this.frames = 0;
  }

  /** Une image de `dt` secondes ; renvoie le nouveau niveau s'il vient de baisser, sinon null. */
  frame(dt: number): QualityLevel | null {
    if (!(dt > 0) || dt > AUTO_QUALITY.maxFrameSec) return null;
    this.time += dt;
    this.frames++;
    if (this.time < AUTO_QUALITY.windowSec) return null;
    const fps = this.frames / this.time;
    this.time = 0;
    this.frames = 0;
    const i = QUALITY_LEVELS.indexOf(this.level);
    if (fps >= AUTO_QUALITY.minFps || i >= QUALITY_LEVELS.length - 1) return null;
    this.level = QUALITY_LEVELS[i + 1];
    return this.level;
  }
}
