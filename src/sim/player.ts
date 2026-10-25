/**
 * Déplacement des joueurs piloté par PlayerInput (étape 7 de `step`, voir docs/ARCHITECTURE.md §2).
 *
 * Ce fichier décide de la VITESSE (course, esquive, glissade, saut, grimpe) ; l'intégration
 * de la position contre le terrain et les murs, et la séparation entre joueurs, sont dans body.ts.
 *
 * Toutes les durées sont en ticks entiers ; aucune allocation d'état cachée : tout vit dans PlayerState.
 */

import { abilityAccelMultiplier, abilitySpeedMultiplier } from './abilities';
import { tryStartDive, updateDiveMovement } from './carrier';
import { fireOverridesSprint } from './combat';
import {
  AIM_SPEED_MULT,
  AIR_ACCEL,
  AIR_JUMP_VELOCITY,
  BACKPEDAL_SPEED_MULT,
  CARRIER_DODGE_COOLDOWN_SEC,
  CARRIER_SPEED_MULT,
  COYOTE_TIME_SEC,
  DODGE_BUFFER_SEC,
  DODGE_COOLDOWN_SEC,
  DODGE_DURATION_SEC,
  DODGE_FORWARD_SPEED_MULT,
  DODGE_EXIT_SPEED_KEEP,
  DODGE_IN_AIR,
  DODGE_INVULN_SEC,
  DODGE_JUMP_CANCEL_SEC,
  DODGE_SPEED,
  GROUND_ACCEL,
  GROUND_DECEL,
  GROUND_OVERSPEED_DECEL,
  JUMP_BUFFER_SEC,
  JUMP_VELOCITY,
  MOVE_INPUT_FULL_SPEED,
  ROLES,
  SLIDE_BOOST,
  SLIDE_COOLDOWN_SEC,
  SLIDE_DECEL,
  SLIDE_DURATION_SEC,
  SLIDE_MAX_SPEED,
  SLIDE_MIN_SPEED,
  SLIDE_STEER_RATE,
  SPRINT_MIN_FORWARD_COS,
  SPRINT_MIN_TILT,
  SPRINT_SPEED_MULT,
  STRAFE_SPEED_MULT,
  TACKLE_SLIDE_DECEL,
  TICK_DT,
} from './constants';
import { integrateBody } from './body';
import { has, type TickInput } from './input';
import { airKeptSpeed, decayAirOverspeed, maxRunSpeed } from './momentum';
import { aimOrigin, cooldownTicks, isCarrier, playerHeight } from './playerStatus';
import { secToTicks } from './time';
import { Buttons, type MatchState, type PlayerState, type Vec3 } from './types';
import { forward, right } from './vec';

/** Norme d'entrée sous laquelle on considère qu'il n'y a pas d'intention de déplacement. */
const MOVE_EPS = 1e-3;

// Lectures partagées avec carrier.ts et combat.ts (définies dans playerStatus.ts pour éviter un import circulaire).
export { aimOrigin, cooldownTicks, isCarrier, playerHeight };

/** Direction monde (horizontale, unitaire ou nulle) correspondant à l'entrée locale. */
export function wishDirection(yaw: number, moveX: number, moveY: number): Vec3 {
  const f = forward(yaw);
  const r = right(yaw);
  const x = r.x * moveX + f.x * moveY;
  const z = r.z * moveX + f.z * moveY;
  const l = Math.sqrt(x * x + z * z);
  // `+ 0` : reculer avec yaw = 0 donne x = (−1)·0 + 0·(−1) = −0 ; jamais de −0 dans l'état (vitesse, moveDir).
  return l > MOVE_EPS ? { x: x / l + 0, y: 0, z: z / l + 0 } : { x: 0, y: 0, z: 0 };
}

/**
 * Vrai si le sprint s'applique : SPRINT maintenu, direction dans le cône avant
 * (SPRINT_MIN_FORWARD_COS) ET stick assez incliné (SPRINT_MIN_TILT). Direction et inclinaison
 * sont séparées : un stick à fond à 70° (pas chassé) ne sprinte pas, un stick à peine poussé non plus.
 */
export function sprintApplies(inp: TickInput): boolean {
  if (!has(inp.buttons, Buttons.SPRINT) || inp.moveMag < SPRINT_MIN_TILT) return false;
  return inp.moveY / inp.moveMag >= SPRINT_MIN_FORWARD_COS;
}

/**
 * Vitesse de course cible (m/s) pour l'entrée donnée : vitesse du rôle × direction locale
 * (avant 1, pas chassé STRAFE, arrière BACKPEDAL, interpolés) × inclinaison analogique ×
 * visée (sauf porteur) / sprint × porteur × capacités (sprint boosté de l'ailier ; étape 7 : bouclier levé, zone de
 * ralentissement adverse — abilities.ts, abilitySpeedMultiplier).
 * Tir contre sprint (étape 5) : FIRE maintenu avec une arme prête (fireOverridesSprint) => le sprint est
 * ignoré ce tick (le tir l'emporte).
 */
export function targetRunSpeed(state: MatchState, p: PlayerState, inp: TickInput): number {
  if (inp.moveMag <= MOVE_EPS) return 0;
  const fwd = inp.moveY / inp.moveMag; // cosinus de l'angle entre l'entrée et « devant »
  const dirMult =
    fwd >= 0
      ? STRAFE_SPEED_MULT + (1 - STRAFE_SPEED_MULT) * fwd
      : STRAFE_SPEED_MULT + (BACKPEDAL_SPEED_MULT - STRAFE_SPEED_MULT) * -fwd;
  let speed = ROLES[p.role].runSpeed * dirMult * Math.min(1, inp.moveMag / MOVE_INPUT_FULL_SPEED);
  // Le porteur ne vise pas (cahier des charges) : AIM est ignoré pour lui (ni ralentissement, ni sprint annulé).
  const carrier = isCarrier(state, p);
  if (has(inp.buttons, Buttons.AIM) && !carrier) speed *= AIM_SPEED_MULT;
  else if (sprintApplies(inp) && !fireOverridesSprint(state, p, inp)) speed *= SPRINT_SPEED_MULT;
  if (carrier) speed *= CARRIER_SPEED_MULT;
  return speed * abilitySpeedMultiplier(state, p);
}

/** Rapproche la vitesse horizontale de (tx, tz) d'au plus `maxDelta` (accélération vectorielle). */
function approachHorizontal(v: Vec3, tx: number, tz: number, maxDelta: number): void {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= maxDelta || d < 1e-12) {
    v.x = tx;
    v.z = tz;
  } else {
    v.x += (dx / d) * maxDelta;
    v.z += (dz / d) * maxDelta;
  }
}

// ---------------------------------------------------------------------------
// Mouvements spéciaux
// ---------------------------------------------------------------------------

/**
 * Vitesse du dash d'une esquive dans la direction unitaire `dir` pour le regard `yaw` : DODGE_SPEED, réduite vers
 * l'avant (× (1 − (1 − DODGE_FORWARD_SPEED_MULT)·c²), c = max(0, cos(dir, regard))). PURE.
 */
export function dodgeSpeed(dir: Vec3, yaw: number): number {
  const f = forward(yaw);
  const c = Math.max(0, dir.x * f.x + dir.z * f.z);
  return DODGE_SPEED * (1 - (1 - DODGE_FORWARD_SPEED_MULT) * c * c);
}

/**
 * Esquive, si elle est disponible (cooldown écoulé, ni grimpe ni plongeon, au sol ou DODGE_IN_AIR). Appelée tant que
 * le tampon d'esquive (dodgeBufferTicks, DODGE_BUFFER_SEC) n'est pas écoulé : un appui un peu trop tôt part dès que
 * possible ; le tampon est consommé au déclenchement.
 */
function tryStartDodge(state: MatchState, p: PlayerState, wish: Vec3): void {
  if (p.dodgeCd > 0 || p.move === 'climb' || p.move === 'dive' || p.move === 'dive_recover') return;
  if (!p.onGround && !DODGE_IN_AIR) return;
  const dir = wish.x !== 0 || wish.z !== 0 ? wish : forward(p.yaw);
  p.dodgeBufferTicks = 0;
  p.move = 'dodge';
  p.moveTicks = secToTicks(DODGE_DURATION_SEC);
  p.moveDir = { x: dir.x, y: 0, z: dir.z };
  p.moveSpeed = dodgeSpeed(p.moveDir, p.yaw);
  p.dodgeCd = cooldownTicks(state, isCarrier(state, p) ? CARRIER_DODGE_COOLDOWN_SEC : DODGE_COOLDOWN_SEC);
  p.invulnTicks = Math.max(p.invulnTicks, secToTicks(DODGE_INVULN_SEC));
  state.events.push({ type: 'dodge', playerId: p.id });
}

function tryStartSlide(state: MatchState, p: PlayerState): void {
  if (!p.onGround || p.slideCd > 0 || p.move !== 'run') return;
  const speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  if (speed < SLIDE_MIN_SPEED) return;
  const boosted = Math.max(speed, Math.min(speed * SLIDE_BOOST, SLIDE_MAX_SPEED));
  p.move = 'slide';
  p.moveTicks = secToTicks(SLIDE_DURATION_SEC);
  p.moveDir = { x: p.vel.x / speed, y: 0, z: p.vel.z / speed };
  p.vel.x = p.moveDir.x * boosted;
  p.vel.z = p.moveDir.z * boosted;
  p.slideCd = cooldownTicks(state, SLIDE_COOLDOWN_SEC);
  state.events.push({ type: 'slide', playerId: p.id });
}

/**
 * Vrai si l'esquive en cours est assez avancée pour être annulée par un saut au sol
 * (DODGE_JUMP_CANCEL_SEC). `moveTicks` part de la durée de l'esquive et décroît d'un par tick.
 */
const dodgeJumpCancelable = (p: PlayerState): boolean =>
  secToTicks(DODGE_DURATION_SEC) - p.moveTicks >= secToTicks(DODGE_JUMP_CANCEL_SEC);

/**
 * Saut : honoré si un appui est en mémoire (tampon) et que le joueur est au sol ou dans le
 * coyote time ; sinon, un appui FRAIS en l'air consomme un saut aérien (double saut de l'ailier).
 * Pendant une esquive : seul le saut au sol est possible, après DODGE_JUMP_CANCEL_SEC (« dash-saut » :
 * l'esquive s'arrête et on garde la vitesse de sortie). Un appui plus tôt reste dans le tampon.
 */
function tryJump(state: MatchState, p: PlayerState, freshPress: boolean): void {
  if (p.jumpBufferTicks <= 0) return;
  if (p.move === 'climb' || p.move === 'dive' || p.move === 'dive_recover') return;
  const inDodge = p.move === 'dodge';
  if (inDodge && !dodgeJumpCancelable(p)) return;
  const coyote = secToTicks(COYOTE_TIME_SEC);
  if (p.onGround || p.airTicks <= coyote) {
    p.vel.y = JUMP_VELOCITY;
    p.onGround = false;
    p.airTicks = coyote + 1; // plus de coyote time après un vrai saut
    p.airJumpsUsed = 0;
    p.jumpBufferTicks = 0;
    if (inDodge) {
      exitDodge(p); // dash-saut : on garde l'élan de sortie
    } else if (p.move === 'slide') {
      p.move = 'run'; // saut depuis une glissade : on garde l'élan
      p.moveTicks = 0;
    }
    state.events.push({ type: 'jump', playerId: p.id, air: false });
  } else if (!inDodge && freshPress && p.airJumpsUsed < ROLES[p.role].airJumps) {
    p.vel.y = AIR_JUMP_VELOCITY;
    p.airJumpsUsed++;
    p.jumpBufferTicks = 0;
    state.events.push({ type: 'jump', playerId: p.id, air: true });
  }
}

// ---------------------------------------------------------------------------
// Vitesse par mode
// ---------------------------------------------------------------------------

/**
 * Course : la vitesse horizontale tend vers wish × vitesse cible.
 *  - Au sol sans entrée : freinage GROUND_DECEL.
 *  - Au sol avec entrée : GROUND_ACCEL, sauf l'EXCÈS de vitesse dans la direction voulue
 *    (sortie d'esquive, de glissade, de grimpe, fin de sprint) qui ne diminue qu'à
 *    GROUND_OVERSPEED_DECEL : l'élan porte au lieu de s'arrêter net.
 *  - En l'air sans entrée : on garde l'élan. Avec entrée : AIR_ACCEL ; si l'on va déjà plus
 *    vite que la cible dans le sens de l'entrée, la norme est conservée (on réoriente sans freiner).
 *  - En l'air, dans les deux cas (passe finale) : l'excès au-delà du plafond de course (maxRunSpeed) s'éteint à
 *    AIR_OVERSPEED_DECEL — sinon esquive + sauts à répétition allaient plus vite que tout sprint.
 */
function runVelocity(state: MatchState, p: PlayerState, inp: TickInput, wish: Vec3): void {
  const speed = targetRunSpeed(state, p, inp);
  const v = p.vel;
  if (inp.moveMag <= MOVE_EPS) {
    if (p.onGround) approachHorizontal(v, 0, 0, GROUND_DECEL * TICK_DT);
    else decayAirOverspeed(state, p);
    return;
  }
  if (p.onGround) {
    const along = v.x * wish.x + v.z * wish.z;
    if (along > speed) {
      // Excès de vitesse dans le sens voulu : freinage doux de la composante avant,
      // braquage normal de la composante latérale.
      const accel = GROUND_ACCEL * abilityAccelMultiplier(state, p) * TICK_DT;
      let lx = v.x - along * wish.x;
      let lz = v.z - along * wish.z;
      const ll = Math.sqrt(lx * lx + lz * lz);
      if (ll <= accel) {
        lx = 0;
        lz = 0;
      } else {
        lx -= (lx / ll) * accel;
        lz -= (lz / ll) * accel;
      }
      const na = Math.max(speed, along - GROUND_OVERSPEED_DECEL * TICK_DT);
      v.x = wish.x * na + lx;
      v.z = wish.z * na + lz;
    } else {
      approachHorizontal(v, wish.x * speed, wish.z * speed, GROUND_ACCEL * abilityAccelMultiplier(state, p) * TICK_DT);
    }
    return;
  }
  const s0 = Math.sqrt(v.x * v.x + v.z * v.z);
  const keepMomentum = s0 > speed && v.x * wish.x + v.z * wish.z > 0;
  approachHorizontal(v, wish.x * speed, wish.z * speed, AIR_ACCEL * TICK_DT);
  if (keepMomentum) {
    const s1 = Math.sqrt(v.x * v.x + v.z * v.z);
    const keep = airKeptSpeed(s0, maxRunSpeed(state, p));
    if (s1 > 1e-9 && s1 < keep) {
      v.x *= keep / s1;
      v.z *= keep / s1;
    }
  }
}

/** Fin d'esquive : retour en course avec DODGE_EXIT_SPEED_KEEP de la vitesse du dash. */
function exitDodge(p: PlayerState): void {
  p.vel.x = p.moveDir.x * p.moveSpeed * DODGE_EXIT_SPEED_KEEP;
  p.vel.z = p.moveDir.z * p.moveSpeed * DODGE_EXIT_SPEED_KEEP;
  p.move = 'run';
  p.moveTicks = 0;
  p.moveSpeed = 0;
}

/** Vitesse pendant l'esquive. Le tick de sortie fixe la vitesse de sortie telle quelle (pas de course ce tick-là). */
function dodgeVelocity(p: PlayerState): void {
  if (p.moveTicks <= 0) {
    exitDodge(p);
    return;
  }
  p.vel.x = p.moveDir.x * p.moveSpeed;
  p.vel.z = p.moveDir.z * p.moveSpeed;
  p.moveTicks--;
}

/** Glissade : décélération SLIDE_DECEL, braquage limité à SLIDE_STEER_RATE vers l'entrée. */
function slideVelocity(p: PlayerState, wish: Vec3): boolean {
  if (p.moveTicks <= 0 || !p.onGround) {
    p.move = 'run';
    p.moveTicks = 0;
    return false;
  }
  const d = p.moveDir;
  if (wish.x !== 0 || wish.z !== 0) {
    const maxTurn = SLIDE_STEER_RATE * TICK_DT;
    const dotDW = d.x * wish.x + d.z * wish.z;
    if (dotDW >= Math.cos(maxTurn)) {
      d.x = wish.x;
      d.z = wish.z;
    } else {
      // cross = sin(yaw(d) − yaw(wish)) : < 0 => l'entrée est à yaw plus grand => tourner +maxTurn.
      const cross = d.x * wish.z - d.z * wish.x;
      const a = cross < 0 ? maxTurn : -maxTurn;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = d.x * c + d.z * s;
      const nz = d.z * c - d.x * s;
      d.x = nx;
      d.z = nz;
    }
  }
  const speed = Math.max(0, Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) - SLIDE_DECEL * TICK_DT);
  // `+ 0` : glissade bloquée (vitesse 0) avec une composante de direction négative => −0 (MatchState sans −0).
  p.vel.x = d.x * speed + 0;
  p.vel.z = d.z * speed + 0;
  p.moveTicks--;
  return true;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/**
 * Déplacement d'un joueur pour un tick.
 * `frozen` : phase figée (kickoff / try / ended) => aucun déplacement volontaire.
 */
export function updatePlayerMovement(state: MatchState, p: PlayerState, inp: TickInput, frozen: boolean): void {
  if (frozen || p.status !== 'active') {
    // Joueur figé, plaqué ou en train de se relever : aucune intention, il s'arrête (gravité conservée).
    if (p.move !== 'climb') {
      p.move = 'run';
      p.moveTicks = 0;
    }
    if (frozen) {
      p.vel.x = 0;
      p.vel.z = 0;
    } else if (p.onGround) {
      approachHorizontal(p.vel, 0, 0, (p.status === 'down' ? TACKLE_SLIDE_DECEL : GROUND_DECEL) * TICK_DT);
    }
    p.lastMoveX = 0;
    p.lastMoveY = 0;
    integrateBody(state, p);
    return;
  }

  p.lastMoveX = inp.moveX;
  p.lastMoveY = inp.moveY;
  const wish = wishDirection(p.yaw, inp.moveX, inp.moveY);

  if (has(inp.pressed, Buttons.DODGE)) p.dodgeBufferTicks = secToTicks(DODGE_BUFFER_SEC);
  if (p.dodgeBufferTicks > 0) tryStartDodge(state, p, wish);
  if (has(inp.pressed, Buttons.SLIDE)) {
    // Pour le porteur, SLIDE = plongeon (étape 4) ; pour les autres, glissade.
    if (isCarrier(state, p)) tryStartDive(state, p, wish);
    else tryStartSlide(state, p);
  }
  const freshJump = has(inp.pressed, Buttons.JUMP);
  if (freshJump) p.jumpBufferTicks = secToTicks(JUMP_BUFFER_SEC);
  tryJump(state, p, freshJump);

  switch (p.move) {
    case 'dodge':
      dodgeVelocity(p);
      break;
    case 'slide':
      if (!slideVelocity(p, wish)) runVelocity(state, p, inp, wish);
      break;
    case 'climb':
      break; // vitesse fixée au début de la grimpe (body.ts)
    case 'dive':
    case 'dive_recover':
      if (!updateDiveMovement(state, p)) runVelocity(state, p, inp, wish);
      break;
    case 'run':
      runVelocity(state, p, inp, wish);
      break;
  }

  integrateBody(state, p);
}

/**
 * Étape 4 de `step` : minuteries liées au déplacement et génériques (entiers, jamais < 0).
 * L'invulnérabilité n'est PAS décomptée ici mais juste après les projectiles (tickInvulnerability).
 */
export function tickPlayerTimers(p: PlayerState): void {
  if (p.dodgeCd > 0) p.dodgeCd--;
  if (p.slideCd > 0) p.slideCd--;
  if (p.diveCd > 0) p.diveCd--;
  if (p.jumpBufferTicks > 0) p.jumpBufferTicks--;
  if (p.dodgeBufferTicks > 0) p.dodgeBufferTicks--;
  if (p.pickupBlockTicks > 0) p.pickupBlockTicks--;
  if (p.fireCd > 0) p.fireCd--;
}

/**
 * Fin de l'étape 6 de `step` (juste après les projectiles, avant le déplacement) : décompte de l'invulnérabilité.
 * Les projectiles voient ainsi la valeur de la fin du tick précédent (l'état que le tireur voyait) : une
 * invulnérabilité de N ticks (plongeon, fin de relevé) arrête exactement N segments de projectiles. Les valeurs
 * en fin de tick sont les mêmes qu'avec un décompte en début de tick pour le plongeon et l'esquive (posés pendant
 * le déplacement, après ce décompte).
 */
export function tickInvulnerability(state: MatchState): void {
  for (const p of state.players) if (p.invulnTicks > 0) p.invulnTicks--;
}
