/**
 * Placement des équipes en formation (coup d'envoi et remises en jeu, étape 6).
 *
 * Une équipe est alignée en largeur, à une distance donnée de la médiane dans son propre camp
 * (équipe 0 en z < 0 regardant +Z, équipe 1 en z > 0 regardant −Z). Les positions de l'équipe 1
 * sont l'image de celles de l'équipe 0 par la rotation de 180° du terrain (équité).
 *
 * Remise en jeu (cahier des charges : « l'équipe qui a encaissé reçoit le ballon sur sa ligne, l'autre se
 * replace derrière la médiane ») : l'équipe qui reçoit est alignée à KICKOFF_RECEIVE_OFFSET × échelle devant sa
 * propre ligne d'essai, l'autre à KICKOFF_DEFEND_OFFSET × échelle derrière la médiane (dans son camp). Ces deux
 * lignes sont sur du plat (hors reliefs : FIELD_TRY_LINE_CLEARANCE et FIELD_CENTER_CLEARANCE, vérifié par les tests).
 */

import { FORMATION_WIDTH_FRACTION, KICKOFF_DEFEND_OFFSET, KICKOFF_RECEIVE_OFFSET, PLAYER_RADIUS } from './constants';
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

/** Place toute l'équipe `team` en formation à `distFromCenter` m de la médiane (mouvement remis à zéro). */
export function placeTeamInFormation(state: MatchState, team: TeamId, distFromCenter: number): void {
  const n = state.config.teamSize;
  for (const p of state.players) {
    if (p.team !== team) continue;
    const index = p.id - team * n;
    const slot = formationSlot(state.field, n, team, index, distFromCenter);
    resetPlayerAt(state.field, p, slot.x, slot.z, slot.yaw);
  }
}

/**
 * Distance à la médiane de la ligne d'une équipe à la remise en jeu : tryLineZ − KICKOFF_RECEIVE_OFFSET × échelle
 * pour l'équipe qui reçoit (devant sa propre ligne d'essai), KICKOFF_DEFEND_OFFSET × échelle pour l'autre.
 */
export const kickoffDistance = (field: FieldLayout, receiving: boolean): number =>
  receiving ? field.tryLineZ - KICKOFF_RECEIVE_OFFSET * field.scale : KICKOFF_DEFEND_OFFSET * field.scale;

/**
 * Index (0..teamSize-1) du joueur qui reçoit le ballon à la remise en jeu : le plus CENTRAL de la formation
 * (|x| minimal), égalité => le plus petit index. En 3v3 / 5v5 (effectifs impairs) : celui du milieu.
 */
export function kickoffCarrierIndex(field: FieldLayout, teamSize: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < teamSize; i++) {
    const ax = Math.abs(formationSlot(field, teamSize, 0, i, 0).x);
    if (ax < bestAbs - 1e-9) {
      best = i;
      bestAbs = ax;
    }
  }
  return best;
}

/**
 * Place les deux équipes pour une remise en jeu reçue par `receivingTeam` (positions, orientation vers l'en-but
 * adverse, mouvement remis à zéro). Renvoie l'id du joueur qui reçoit le ballon : `config.kickoffReceivers[équipe]`
 * s'il est désigné (≥ 0 : le joueur humain en solo), sinon le plus central (kickoffCarrierIndex).
 * L'état transitoire hors mouvement (statuts, cooldowns, ballon…) est remis à zéro par rules.ts (setupKickoff).
 */
export function placeForKickoff(state: MatchState, receivingTeam: TeamId): number {
  const f = state.field;
  placeTeamInFormation(state, 0, kickoffDistance(f, receivingTeam === 0));
  placeTeamInFormation(state, 1, kickoffDistance(f, receivingTeam === 1));
  const n = state.config.teamSize;
  const chosen = state.config.kickoffReceivers[receivingTeam];
  return receivingTeam * n + (chosen >= 0 ? chosen : kickoffCarrierIndex(f, n));
}
