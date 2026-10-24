/**
 * Intégration du corps des joueurs : position contre le terrain (marche, grimpe, obstacles),
 * gravité, murs invisibles, séparation douce entre joueurs.
 *
 * Le déplacement d'un tick est découpé en sous-pas d'au plus PLAYER_SUBSTEP_MAX_DIST pour
 * qu'aucun mouvement rapide (esquive à 21 m/s ≈ 0,7 m/tick) ne traverse un muret.
 * Pour chaque sous-pas, on compare la hauteur de support (supportHeight, empreintes élargies
 * du rayon du joueur) à la hauteur des pieds :
 *   montée ≤ MAX_STEP_HEIGHT           => on avance (marche, pente), collé au sol ;
 *   montée ≤ MAX_CLIMB_HEIGHT          => grimpe automatique (mode 'climb', sans arrêt) si l'on va
 *                                         vers la face (CLIMB_MIN_APPROACH), sinon obstacle (on le frôle) ;
 *   au-delà                            => obstacle : on glisse le long de la face.
 * La verticale est intégrée exactement (parabole) : hauteur de saut = v² / (2·g).
 */

import {
  CLIMB_HORIZONTAL_KEEP,
  CLIMB_MIN_APPROACH,
  CLIMB_UP_SPEED,
  DIVE_RECOVER_SEC,
  MAX_CLIMB_HEIGHT,
  MAX_STEP_HEIGHT,
  PLAYER_GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_MAX_SUBSTEPS,
  PLAYER_PUSH_STRENGTH,
  PLAYER_RADIUS,
  PLAYER_SEPARATION,
  PLAYER_SUBSTEP_MAX_DIST,
  TICK_DT,
} from './constants';
import { faceContact, supportHeight } from './field';
import { secToTicks } from './time';
import type { FieldLayout, MatchState, PlayerState } from './types';

/** Marge numérique (m) ajoutée quand on repousse un joueur hors d'une face (pas une valeur de gameplay). */
const FACE_PUSH_EPS = 1e-4;

/** Garde le joueur dans l'arène (murs invisibles) ; annule la vitesse dirigée vers le mur. */
export function clampToField(field: FieldLayout, p: PlayerState): void {
  const hw = field.width / 2 - PLAYER_RADIUS;
  const hl = field.length / 2 - PLAYER_RADIUS;
  if (p.pos.x > hw) {
    p.pos.x = hw;
    if (p.vel.x > 0) p.vel.x = 0;
  } else if (p.pos.x < -hw) {
    p.pos.x = -hw;
    if (p.vel.x < 0) p.vel.x = 0;
  }
  if (p.pos.z > hl) {
    p.pos.z = hl;
    if (p.vel.z > 0) p.vel.z = 0;
  } else if (p.pos.z < -hl) {
    p.pos.z = -hl;
    if (p.vel.z < 0) p.vel.z = 0;
  }
}

function land(state: MatchState, p: PlayerState, groundY: number): void {
  const impact = -p.vel.y;
  p.pos.y = groundY;
  p.vel.y = 0;
  p.onGround = true;
  p.airJumpsUsed = 0;
  state.events.push({ type: 'land', playerId: p.id, speed: impact > 0 ? impact : 0 });
}

/**
 * Début de grimpe. Depuis un plongeon ('dive' / 'dive_recover'), le dash s'arrête mais la récupération au sol
 * n'est pas perdue : `moveTicks` (inutilisé pendant la grimpe) mémorise secToTicks(DIVE_RECOVER_SEC) et la fin
 * de la grimpe enchaîne sur 'dive_recover' (plonger contre un muret n'est pas un dash gratuit).
 */
function startClimb(state: MatchState, p: PlayerState, targetY: number): void {
  const fromDive = p.move === 'dive' || p.move === 'dive_recover';
  p.move = 'climb';
  p.moveTicks = fromDive ? secToTicks(DIVE_RECOVER_SEC) : 0;
  p.climbTargetY = targetY;
  p.vel.x *= CLIMB_HORIZONTAL_KEEP;
  p.vel.z *= CLIMB_HORIZONTAL_KEEP;
  p.vel.y = CLIMB_UP_SPEED;
  p.onGround = false;
  state.events.push({ type: 'climb', playerId: p.id });
}

/**
 * Vrai si le déplacement de (ox, oz) vers (nx, nz) va VERS la face du relief touché : cos entre la
 * vitesse horizontale et la normale entrante ≥ CLIMB_MIN_APPROACH. Si la position de départ était
 * déjà sur l'empreinte (poussé par la séparation…), on grimpe toujours, pour ne jamais rester coincé.
 */
function approachesFace(field: FieldLayout, p: PlayerState, ox: number, oz: number, nx: number, nz: number): boolean {
  if (supportHeight(field, ox, oz, PLAYER_RADIUS) - p.pos.y > MAX_STEP_HEIGHT) return true;
  const c = faceContact(field, nx, p.pos.y, nz, PLAYER_RADIUS, MAX_STEP_HEIGHT);
  if (c === null) return true;
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  if (sp < 1e-9) return true;
  return -(p.vel.x * c.nx + p.vel.z * c.nz) >= CLIMB_MIN_APPROACH * sp;
}

/** Un sous-pas horizontal (dx, dz) avec gestion du terrain. `retry` : autorise un glissement le long d'un obstacle. */
function moveHorizontal(state: MatchState, p: PlayerState, dx: number, dz: number, retry: boolean): void {
  const field = state.field;
  const ox = p.pos.x;
  const oz = p.pos.z;
  p.pos.x = ox + dx;
  p.pos.z = oz + dz;
  clampToField(field, p);
  const nx = p.pos.x;
  const nz = p.pos.z;
  const sup = supportHeight(field, nx, nz, PLAYER_RADIUS);
  const rise = sup - p.pos.y;

  if (rise <= MAX_STEP_HEIGHT) {
    if (p.move === 'climb') return; // la verticale de la grimpe est gérée par verticalStep
    if (p.onGround) {
      if (rise >= -MAX_STEP_HEIGHT) p.pos.y = sup; // marche, pente : collé au sol
      else p.onGround = false; // bord de muret / de rampe : on tombe (vel.y = 0)
    } else if (rise > 0) {
      if (p.vel.y <= 0) land(state, p, sup);
      else p.pos.y = sup;
    }
    return;
  }

  if (rise <= MAX_CLIMB_HEIGHT) {
    if (p.move === 'climb') {
      if (sup > p.climbTargetY) p.climbTargetY = sup;
      return;
    }
    // Seul un joueur actif grimpe : un corps plaqué qui glisse au sol bute contre le muret (obstacle).
    if (p.status === 'active' && approachesFace(field, p, ox, oz, nx, nz)) {
      startClimb(state, p, sup);
      return;
    }
    // On frôle le muret sans aller vers lui (ou corps au sol) : il fait obstacle (glissement ci-dessous).
  }

  // Obstacle (trop haut, ou muret frôlé) : retour à la position précédente, on retire la
  // composante de vitesse dirigée vers la face, puis on tente d'aller au point d'arrivée REPOUSSÉ
  // hors de la face (glissement le long de la face, y compris quand on la longe parallèlement).
  p.pos.x = ox;
  p.pos.z = oz;
  const c = faceContact(field, nx, p.pos.y, nz, PLAYER_RADIUS, MAX_STEP_HEIGHT);
  if (c === null) {
    p.vel.x = 0;
    p.vel.z = 0;
    return;
  }
  const vn = p.vel.x * c.nx + p.vel.z * c.nz;
  if (vn < 0) {
    p.vel.x -= vn * c.nx;
    p.vel.z -= vn * c.nz;
  }
  if (retry) {
    const push = c.depth + FACE_PUSH_EPS;
    moveHorizontal(state, p, nx + c.nx * push - ox, nz + c.nz * push - oz, false);
  }
}

/** Un sous-pas vertical de durée h : grimpe, ou chute balistique exacte et atterrissage. */
function verticalStep(state: MatchState, p: PlayerState, h: number): void {
  const field = state.field;
  if (p.move === 'climb') {
    p.pos.y += CLIMB_UP_SPEED * h;
    if (p.pos.y >= p.climbTargetY) {
      p.pos.y = p.climbTargetY;
      p.move = p.moveTicks > 0 ? 'dive_recover' : 'run'; // grimpe entamée en plongeon : récupération au sol
      p.vel.y = 0;
      const sup = supportHeight(field, p.pos.x, p.pos.z, PLAYER_RADIUS);
      if (p.pos.y - sup <= MAX_STEP_HEIGHT) {
        p.pos.y = sup;
        p.onGround = true;
        p.airJumpsUsed = 0;
      }
    }
    return;
  }
  if (p.onGround) {
    p.vel.y = 0;
    return;
  }
  p.pos.y += (p.vel.y - 0.5 * PLAYER_GRAVITY * h) * h;
  p.vel.y -= PLAYER_GRAVITY * h;
  const sup = supportHeight(field, p.pos.x, p.pos.z, PLAYER_RADIUS);
  if (p.pos.y <= sup) {
    if (p.vel.y <= 0) land(state, p, sup);
    else p.pos.y = sup;
  }
}

/**
 * Intègre la position d'un joueur sur un tick à partir de sa vitesse (déjà décidée par player.ts) :
 * sous-pas horizontaux + verticaux, terrain, murs. Met à jour onGround et airTicks.
 */
export function integrateBody(state: MatchState, p: PlayerState): void {
  const hd = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) * TICK_DT;
  const n = Math.min(PLAYER_MAX_SUBSTEPS, Math.max(1, Math.ceil(hd / PLAYER_SUBSTEP_MAX_DIST)));
  const h = TICK_DT / n;
  for (let k = 0; k < n; k++) {
    moveHorizontal(state, p, p.vel.x * h, p.vel.z * h, true);
    verticalStep(state, p, h);
  }
  p.airTicks = p.onGround ? 0 : p.airTicks + 1;
}

/**
 * Séparation douce entre joueurs actifs qui se chevauchent (ordre déterministe : paires i < j
 * dans l'ordre des ids). Chacun corrige PLAYER_PUSH_STRENGTH/2 du chevauchement par tick.
 * Deux joueurs exactement superposés sont écartés selon X (le plus petit id vers −X).
 */
export function separatePlayers(state: MatchState): void {
  const ps = state.players;
  const sep2 = PLAYER_SEPARATION * PLAYER_SEPARATION;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.status !== 'active') continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.status !== 'active') continue;
      if (Math.abs(a.pos.y - b.pos.y) >= PLAYER_HEIGHT) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= sep2) continue;
      const d = Math.sqrt(d2);
      let nx = 1;
      let nz = 0;
      if (d > 1e-6) {
        nx = dx / d;
        nz = dz / d;
      }
      const push = (PLAYER_SEPARATION - d) * PLAYER_PUSH_STRENGTH * 0.5;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      clampToField(state.field, a);
      clampToField(state.field, b);
    }
  }
}
