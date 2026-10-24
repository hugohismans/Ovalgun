/**
 * Placement des équipes en formation (début de match, et remises en jeu à l'étape 6).
 *
 * Une équipe est alignée en largeur, à une distance donnée de la médiane dans son propre camp
 * (équipe 0 en z < 0 regardant +Z, équipe 1 en z > 0 regardant −Z). Les positions de l'équipe 1
 * sont l'image de celles de l'équipe 0 par la rotation de 180° du terrain (équité).
 */

import { FORMATION_WIDTH_FRACTION, PLAYER_RADIUS } from './constants';
import type { FieldLayout, MatchState, PlayerState, TeamId } from './types';
import { supportHeight } from './field';
import { forward } from './vec';

export interface FormationSlot {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Position de formation du joueur `index` (0..teamSize-1) de l'équipe `team`,
 * à `distFromCenter` mètres de la médiane dans son camp (distance déjà à l'échelle du terrain).
 */
export function formationSlot(
  field: FieldLayout,
  teamSize: number,
  team: TeamId,
  index: number,
  distFromCenter: number,
): FormationSlot {
  const t = (index + 0.5) / teamSize - 0.5;
  const x = t * field.width * FORMATION_WIDTH_FRACTION;
  // `0 - v` plutôt que `-v` : pas de -0 dans l'état (joueur central quand teamSize est impair).
  return team === 0 ? { x, z: 0 - distFromCenter, yaw: 0 } : { x: 0 - x, z: distFromCenter, yaw: Math.PI };
}

/** Remet à zéro le mouvement d'un joueur et le pose au sol en (x, z), orienté selon `yaw`. */
export function resetPlayerAt(field: FieldLayout, p: PlayerState, x: number, z: number, yaw: number): void {
  p.pos = { x, y: supportHeight(field, x, z, PLAYER_RADIUS), z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw;
  p.pitch = 0;
  p.onGround = true;
  p.airTicks = 0;
  p.airJumpsUsed = 0;
  p.jumpBufferTicks = 0;
  p.move = 'run';
  p.moveTicks = 0;
  p.moveDir = forward(yaw);
  p.climbTargetY = 0;
  p.lastMoveX = 0;
  p.lastMoveY = 0;
}

/**
 * Place toute l'équipe `team` en formation à `distFromCenter` m de la médiane.
 * Réutilisable pour les remises en jeu (étape 6) : équipe qui reçoit à
 * tryLineZ − KICKOFF_RECEIVE_OFFSET·échelle, l'autre à KICKOFF_DEFEND_OFFSET·échelle.
 */
export function placeTeamInFormation(state: MatchState, team: TeamId, distFromCenter: number): void {
  const n = state.config.teamSize;
  for (const p of state.players) {
    if (p.team !== team) continue;
    const index = p.id - team * n;
    const slot = formationSlot(state.field, n, team, index, distFromCenter);
    resetPlayerAt(state.field, p, slot.x, slot.z, slot.yaw);
  }
}
