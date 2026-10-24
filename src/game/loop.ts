/**
 * Boucle à pas fixe (PURE, testée sous Node) : accumulateur de temps réel -> nombre de ticks de
 * simulation à exécuter pour cette frame, et alpha d'interpolation pour le rendu.
 *
 *  - Au plus `maxSteps` ticks par frame : au-delà, le retard est abandonné (pas de « spirale de la
 *    mort » après un onglet en arrière-plan ou un gros à-coup).
 *  - dt de frame borné à `maxFrameSec`.
 *  - alpha = accumulateur / pas, dans [0, 1[ : le rendu interpole entre l'état précédent et l'état courant.
 */

import { TICK_DT } from '../sim';

/** Nombre maximal de ticks simulés par frame (rattrapage). */
export const MAX_CATCHUP_TICKS = 5;
/** Durée de frame maximale prise en compte (s) : au-delà (onglet gelé), on repart proprement. */
export const MAX_FRAME_DT = 0.25;

export class FixedStepLoop {
  /** Temps réel accumulé non encore simulé (s). */
  acc = 0;

  constructor(
    readonly stepSec: number = TICK_DT,
    readonly maxSteps: number = MAX_CATCHUP_TICKS,
    readonly maxFrameSec: number = MAX_FRAME_DT,
  ) {}

  /** Ajoute la durée d'une frame ; renvoie le nombre de ticks à simuler maintenant. */
  advance(dtSec: number): number {
    const dt = Number.isFinite(dtSec) ? Math.min(this.maxFrameSec, Math.max(0, dtSec)) : 0;
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.stepSec && n < this.maxSteps) {
      this.acc -= this.stepSec;
      n++;
    }
    if (this.acc >= this.stepSec) this.acc %= this.stepSec; // retard abandonné
    return n;
  }

  /** Fraction du tick suivant déjà écoulée (0..1) : alpha d'interpolation. */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.acc / this.stepSec));
  }

  /** Repart d'un accumulateur vide (reprise après une pause). */
  reset(): void {
    this.acc = 0;
  }
}
