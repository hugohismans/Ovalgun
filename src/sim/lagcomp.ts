/**
 * Compensation de latence (mode en ligne), PURE et déterministe.
 *
 * En ligne, un joueur voit les AUTRES dans le passé : interpolation (ONLINE_INTERP_TICKS côté client) + trajet des
 * instantanés + trajet de son entrée. Sans compensation, le serveur jugeait ses tirs sur les positions ACTUELLES : il
 * fallait viser devant une cible qui court. Avec compensation, chaque entrée porte le tick que le client affichait
 * (`view`) ; le serveur en tire un retard `lag` (ticks, borné par LAG_COMP_MAX_TICKS) et le note sur les projectiles
 * créés par cette entrée (`Projectile.lag`). Pendant tout leur vol, ces projectiles sont testés contre la GÉOMÉTRIE des
 * adversaires `lag` ticks plus tôt (position, orientation, posture), lue dans un historique tenu HORS de l'état
 * (`PoseHistory`, rempli par le serveur après chaque tick) : le projectile vole dans la chronologie du tireur.
 *
 * Ce qui n'est PAS rembobiné : l'état du joueur touché (touchable, invulnérable, bouclier levé ou non, jauge) — un
 * bouclier levé côté serveur protège tout de suite ; les dégâts s'appliquent à l'état actuel ; le relief ; les
 * explosions de grenade (zone, peu sensibles au retard).
 *
 * Hors ligne (solo, prédiction du client) : aucune option, aucun `lag` : la sim est strictement inchangée.
 */

import { LAG_COMP_MAX_TICKS } from './constants';
import type { MatchState, MoveMode, PlayerState } from './types';
import type { Vec3 } from './vec';

/** Options de `step` réservées au serveur en ligne. */
export interface StepOptions {
  /** Retard (ticks, ≥ 0, fractionnaire) de la vue de chaque joueur humain pour ce tick : id -> lag. */
  lag?: Readonly<Record<number, number>>;
  /** Géométrie passée des joueurs (indispensable pour que `lag` ait un effet). */
  history?: PoseHistory;
}

/** Géométrie d'un joueur utile aux collisions des projectiles. */
interface Pose {
  pos: Vec3;
  yaw: number;
  move: MoveMode;
}

/** Ticks gardés : le retard maximal, plus une marge pour l'interpolation et le vol des projectiles. */
const HISTORY_TICKS = LAG_COMP_MAX_TICKS + 4;

/** Retard borné accepté par le serveur (valeur non finie ou négative => 0). */
export const clampLag = (lag: number): number => (Number.isFinite(lag) ? Math.min(LAG_COMP_MAX_TICKS, Math.max(0, lag)) : 0);

export class PoseHistory {
  private readonly frames: Array<{ tick: number; poses: Pose[] }> = [];

  /** Mémorise la géométrie de l'état APRÈS son tick (`state.tick`) ; un tick déjà vu remplace l'ancien enregistrement. */
  record(state: MatchState): void {
    const last = this.frames[this.frames.length - 1];
    if (last !== undefined && last.tick >= state.tick) this.frames.length = 0;
    this.frames.push({ tick: state.tick, poses: state.players.map((p) => ({ pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, yaw: p.yaw, move: p.move })) });
    if (this.frames.length > HISTORY_TICKS) this.frames.shift();
  }

  clear(): void {
    this.frames.length = 0;
  }

  /**
   * `p` tel qu'il était après le tick `tick` (fractionnaire : position interpolée, orientation et posture du tick le
   * plus proche) ; le reste de l'état est celui d'aujourd'hui. Tick hors de l'historique : borné à ses extrémités ;
   * historique vide : `p` lui-même.
   */
  rewound(p: PlayerState, tick: number): PlayerState {
    const f = this.frames;
    if (f.length === 0) return p;
    const t = Math.min(f[f.length - 1].tick, Math.max(f[0].tick, tick));
    let i = 0;
    while (i + 1 < f.length && f[i + 1].tick <= t) i++;
    const j = Math.min(f.length - 1, i + 1);
    const a = f[i].poses[p.id];
    const b = f[j].poses[p.id];
    if (a === undefined || b === undefined) return p;
    const span = f[j].tick - f[i].tick;
    const k = span > 0 ? (t - f[i].tick) / span : 0;
    const near = k < 0.5 ? a : b;
    return {
      ...p,
      pos: { x: a.pos.x + (b.pos.x - a.pos.x) * k, y: a.pos.y + (b.pos.y - a.pos.y) * k, z: a.pos.z + (b.pos.z - a.pos.z) * k },
      yaw: near.yaw,
      move: near.move,
    };
  }
}
