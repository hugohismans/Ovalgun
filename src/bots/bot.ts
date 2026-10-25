/**
 * Bot de match (étape 6) : producteur de PlayerInput PUR, comme un humain. Il LIT le MatchState et renvoie une
 * entrée ; il ne modifie JAMAIS l'état. Toute sa mémoire (PRNG propre dérivé de deriveSeed, perception retardée,
 * décision courante, visée lissée, réflexes, blocage) vit dans `BotMemory`, hors du MatchState : il tourne tel quel
 * sur un serveur (aucune dépendance au client). Suppose un appel par tick (contrat de la session et d'un serveur) ;
 * un tick qui recule (nouveau match) remet la mémoire à zéro.
 *
 * Un tick :
 *   1. perception (situation retardée, tirs reçus) — perception.ts ;
 *   2. phase figée ou joueur au sol : aucun déplacement, regard vers le ballon (rotation limitée) ;
 *   3. décision tous les decisionSec (± BOT_DECISION_JITTER) ou dès qu'un changement est perçu — tactics.ts ;
 *   4. pilotage vers le point visé (écartement, détour) — steering.ts ;
 *   5. porteur : réflexes et gestes (carrierBrain.ts) ; sinon visée, rafales, rechargement (aiming.ts) et réflexe
 *      d'esquive ; regard tourné d'au plus turnRateDeg × dt ;
 *   6. sortie de blocage (saut, détour) ; conversion de la direction monde en entrée locale (relative au yaw envoyé).
 */

import {
  angleDiff,
  BOT_DECISION_JITTER,
  BOT_DIFFICULTY,
  BOT_DODGE_FORWARD_MIX,
  BOT_FIRE_CONE_DEG,
  Buttons,
  canShoot,
  clamp,
  forward,
  makeInput,
  PITCH_MAX,
  PITCH_MIN,
  rand,
  randSigned,
  right,
  secToTicks,
  TICK_DT,
  weaponImplemented,
  wrapAngle,
  ROLES,
  type BotDifficulty,
  type MatchState,
  type PlayerInput,
  type PlayerState,
} from '../sim';
import { aimTick, type AimIntent } from './aiming';
import { carrierTick, dodgeDirection } from './carrierBrain';
import type { InputProvider } from './index';
import { createBotMemory, idleDecision, readSituation, resetBotMemory, type BotMemory } from './memory';
import { dodgeReflexArmed, updateHitTracking, updatePerception } from './perception';
import { resetStuck, steer, trackStuck } from './steering';
import { decide } from './tactics';

const DEG = Math.PI / 180;

/** Bouton pressé seulement s'il n'était pas maintenu au tick précédent (front montant garanti pour la sim). */
const pulse = (me: PlayerState, button: number): number => ((me.lastButtons & button) !== 0 ? 0 : button);

/** Intervalle avant la prochaine décision (ticks, au moins 1), avec sa variation aléatoire. */
function decisionTicks(mem: BotMemory): number {
  const base = BOT_DIFFICULTY[mem.difficulty].decisionSec;
  return Math.max(1, secToTicks(base * (1 + BOT_DECISION_JITTER * randSigned(mem))));
}

/** Dernière visée calculée (lecture par les tests : précision mesurée au moment du tir). */
export interface BotDebug {
  aim: AimIntent | null;
}

/**
 * Entrée du bot pour ce tick (PURE vis-à-vis du match : `state` n'est que lu ; `mem` est mise à jour).
 * `debug` (optionnel) reçoit la visée du tick (tests).
 */
export function botInput(mem: BotMemory, state: Readonly<MatchState>, playerId: number, debug?: BotDebug): PlayerInput {
  const me = state.players[playerId];
  if (me === undefined) return makeInput();
  if (mem.lastTick >= 0 && state.tick < mem.lastTick) resetBotMemory(mem);
  if (mem.lastTick < 0) {
    mem.lastStability = me.stability;
    mem.seen = readSituation(state);
  }
  mem.lastTick = state.tick;
  if (state.ball.mode === 'kick') mem.lastKickSeenTick = state.tick;
  if (debug !== undefined) debug.aim = null;

  const perceivedChange = updatePerception(mem, state, me);
  updateHitTracking(mem, me);
  const diff = BOT_DIFFICULTY[mem.difficulty];
  const maxStep = diff.turnRateDeg * DEG * TICK_DT;
  const turnYaw = (want: number): number => wrapAngle(me.yaw + clamp(angleDiff(me.yaw, want), -maxStep, maxStep));
  const turnPitch = (want: number): number => clamp(me.pitch + clamp(want - me.pitch, -maxStep, maxStep), PITCH_MIN, PITCH_MAX);
  const ball = state.ball.pos;
  const ballYaw = Math.atan2(ball.x - me.pos.x, ball.z - me.pos.z);

  // Phase figée (coup d'envoi, essai, fin) ou joueur au sol : pas de déplacement, regard vers le jeu.
  if (state.phase !== 'play' || me.status !== 'active') {
    if (mem.decision.role !== 'idle') mem.decision = idleDecision();
    mem.decisionTicks = 0;
    mem.aimTargetId = -1;
    mem.burstTicks = 0;
    resetStuck(mem);
    mem.lastDirX = 0;
    mem.lastDirZ = 0;
    mem.lastMoveMag = 0;
    mem.lastButtons = 0;
    const yaw = me.status === 'active' ? turnYaw(ballYaw) : me.yaw;
    return makeInput({ yaw, pitch: me.status === 'active' ? turnPitch(0) : me.pitch });
  }

  // Décision.
  if (perceivedChange || mem.decisionTicks <= 0 || mem.decision.role === 'idle') {
    decide(mem, state, me);
    mem.decisionTicks = decisionTicks(mem);
  } else {
    mem.decisionTicks--;
  }

  // Pilotage, puis regard et boutons selon le rôle.
  const move = steer(mem, state, me);
  let dirX = move.dirX;
  let dirZ = move.dirZ;
  let mag = move.mag;
  let yaw: number;
  let pitch: number;
  let buttons = 0;
  const role = mem.decision.role;
  if (role === 'carrier') {
    const c = carrierTick(mem, state, me, turnYaw, dirX, dirZ);
    yaw = turnYaw(c.wantYaw);
    pitch = turnPitch(c.wantPitch);
    buttons = c.buttons;
    dirX = c.dirX;
    dirZ = c.dirZ;
    mag = 1;
  } else {
    const lookYaw = mag > 0 ? Math.atan2(dirX, dirZ) : ballYaw;
    if (move.sprint) buttons |= Buttons.SPRINT;
    if (role === 'receive') {
      // Le receveur garde sa ligne : il regarde où il court (sprint conservé), sans tirer.
      yaw = turnYaw(lookYaw);
      pitch = turnPitch(0);
    } else {
      const a = aimTick(mem, state, me, lookYaw);
      if (debug !== undefined) debug.aim = a;
      yaw = turnYaw(a.wantYaw);
      pitch = turnPitch(a.wantPitch);
      const cone = BOT_FIRE_CONE_DEG * DEG;
      const aligned = Math.abs(angleDiff(yaw, a.wantYaw)) <= cone && Math.abs(pitch - a.wantPitch) <= cone;
      if (a.firing && aligned && canShoot(state, me) && weaponImplemented(ROLES[me.role].weapon)) {
        buttons |= Buttons.FIRE;
        if (a.ads) buttons |= Buttons.AIM;
      }
      if (a.reload) buttons |= pulse(me, Buttons.RELOAD);
    }
    // Réflexe d'esquive sous le feu (après le temps de réaction), latéral au tireur.
    if (dodgeReflexArmed(mem) && me.dodgeCd === 0 && me.move === 'run' && rand(mem) < diff.dodgeReflex * TICK_DT) {
      const shooter = mem.lastShooterId >= 0 ? (state.players[mem.lastShooterId] ?? null) : null;
      const fx = mag > 0 ? dirX : Math.sin(yaw);
      const fz = mag > 0 ? dirZ : Math.cos(yaw);
      const dd = dodgeDirection(me, shooter, fx, fz, BOT_DODGE_FORWARD_MIX);
      dirX = dd.x;
      dirZ = dd.z;
      mag = 1;
      buttons |= pulse(me, Buttons.DODGE);
    }
  }

  // Sortie de blocage.
  if (trackStuck(mem, me, mag)) buttons |= pulse(me, Buttons.JUMP);

  // Direction monde -> entrée locale, relative au yaw RÉELLEMENT envoyé (la sim l'applique avant le déplacement).
  const f = forward(yaw);
  const r = right(yaw);
  const moveX = (dirX * r.x + dirZ * r.z) * mag;
  const moveY = (dirX * f.x + dirZ * f.z) * mag;
  mem.lastDirX = dirX;
  mem.lastDirZ = dirZ;
  mem.lastMoveMag = mag;
  mem.lastButtons = buttons;
  return { moveX, moveY, yaw, pitch, buttons };
}

/** Options d'un bot. */
export interface BotOptions {
  /**
   * Joueurs qui ne sont PAS des bots (le joueur humain en solo ; un serveur y mettrait tous les humains) : les bots se
   * répartissent les rôles entre eux, sans compter sur eux. Défaut : aucun (tous les joueurs sont des bots).
   */
  externalIds?: readonly number[];
}

/**
 * Fabrique un bot (contrat InputProvider) pilotant `playerId` avec la difficulté donnée, sa propre mémoire et son PRNG
 * dérivé de `seed` (seed du match) et de l'id. L'InputProvider renvoyé ne garde aucune référence au client.
 */
export function createBot(playerId: number, difficulty: BotDifficulty, seed: number, options: BotOptions = {}): InputProvider {
  const mem = createBotMemory(playerId, difficulty, seed, options.externalIds ?? []);
  return (state, id) => botInput(mem, state, id);
}
