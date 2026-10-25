/**
 * Choix de l'animation d'un personnage à partir de l'état de la simulation (fonctions pures, testées).
 *
 * Le personnage n'a aucune influence sur le jeu : la hitbox reste la capsule de la sim. On ne fait que traduire
 * l'état (statut, mouvement spécial, vitesse, porteur, tir…) en poids d'animations et en postures.
 */

import type { MoveMode, PlayerStatus } from '../../sim';

/** Grand mode du corps, par ordre de priorité. */
export type BodyMode = 'down' | 'getup' | 'celebrate' | 'dive' | 'slide' | 'dodge' | 'air' | 'locomotion';

export interface BodyInput {
  status: PlayerStatus;
  move: MoveMode;
  onGround: boolean;
  celebrate: boolean;
}

export function bodyMode(b: BodyInput): BodyMode {
  if (b.status === 'down') return 'down';
  if (b.status === 'getting_up') return 'getup';
  if (b.celebrate) return 'celebrate';
  if (b.move === 'dive' || b.move === 'dive_recover') return 'dive';
  if (b.move === 'slide') return 'slide';
  if (b.move === 'dodge') return 'dodge';
  if (!b.onGround && b.move !== 'climb') return 'air';
  return 'locomotion';
}

/** Poids des cycles de course selon la direction du déplacement par rapport au regard (somme = 1). */
export interface LocomotionWeights {
  idle: number;
  forward: number;
  back: number;
  left: number;
  right: number;
}

/**
 * `fwd` / `side` : vitesse horizontale projetée sur l'avant et la droite du regard (m/s).
 * Sous `idleSpeed` : immobile ; jusqu'à `runSpeed`, fondu idle -> course. La direction est répartie entre les deux
 * cycles cardinaux voisins (avant / droite / arrière / gauche).
 */
export function locomotionWeights(fwd: number, side: number, idleSpeed: number, runSpeed: number): LocomotionWeights {
  const speed = Math.hypot(fwd, side);
  const w: LocomotionWeights = { idle: 0, forward: 0, back: 0, left: 0, right: 0 };
  const run = runSpeed > idleSpeed ? Math.min(1, Math.max(0, (speed - idleSpeed) / (runSpeed - idleSpeed))) : speed > idleSpeed ? 1 : 0;
  w.idle = 1 - run;
  if (run === 0) return w;
  // Angle 0 = avant, +PI/2 = droite.
  const a = Math.atan2(side, fwd);
  const sectors: Array<keyof LocomotionWeights> = ['forward', 'right', 'back', 'left'];
  const q = ((a / (Math.PI / 2)) % 4 + 4) % 4;
  const i = Math.floor(q);
  const t = q - i;
  w[sectors[i % 4]] += run * (1 - t);
  w[sectors[(i + 1) % 4]] += run * t;
  return w;
}

/** Vitesse de lecture d'un cycle de course pour une vitesse au sol donnée (bornée pour éviter les pas « patinés »). */
export function runTimeScale(speed: number, clipSpeed: number, min: number, max: number): number {
  if (clipSpeed <= 0) return 1;
  return Math.min(max, Math.max(min, speed / clipSpeed));
}

/** Rapproche `v` de `target` avec un lissage exponentiel de taux `rate` (1/s). */
export const approachExp = (v: number, target: number, rate: number, dt: number): number =>
  target + (v - target) * Math.exp(-rate * dt);
