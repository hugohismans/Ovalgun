/**
 * Ballon (étape 9 de `step`) : suit le porteur, ou physique maison quand il est libre / en vol.
 *
 * Physique (modes 'loose', 'pass', 'kick') découpée en sous-pas d'au plus BALL_SUBSTEP_MAX_DIST :
 *   - gravité BALL_GRAVITY (intégration exacte), traînée BALL_AIR_DRAG ;
 *   - murs invisibles et faces verticales des murets / rampes : rebond BALL_WALL_RESTITUTION ;
 *   - sol (normale du relief) : si la vitesse d'impact dépasse BALL_MIN_BOUNCE_SPEED, rebond
 *     avec restitution BALL_RESTITUTION ± BALL_RESTITUTION_JITTER et déviation horizontale
 *     ±BALL_BOUNCE_DEVIATION_DEG tirées sur state.rng (le rebond d'un ovale est imprévisible,
 *     mais reproductible), frottement BALL_BOUNCE_FRICTION ; sinon il roule (BALL_GROUND_FRICTION,
 *     la gravité projetée sur la pente le fait descendre) puis s'immobilise sous BALL_REST_SPEED,
 *     seulement si la pente peut le retenir (BALL_GRAVITY·sin θ ≤ BALL_GROUND_FRICTION : il reste
 *     sur une rampe mais dévale les flancs des buttes) ;
 *   - un ballon qui roulait déjà au sol au sous-pas précédent ne rebondit jamais : un changement
 *     de pente (pied de rampe) le fait seulement suivre le nouveau plan, sans tirage aléatoire.
 * Une passe ou un coup de pied qui touche le sol devient un ballon libre ('loose').
 * Le ramassage / la réception sont à l'étape 4 (carrier.ts : updateBallPickup).
 */

import {
  BALL_AIR_DRAG,
  BALL_BOUNCE_DEVIATION_DEG,
  BALL_BOUNCE_FRICTION,
  BALL_CARRY_FORWARD,
  BALL_CARRY_HEIGHT,
  BALL_CARRY_SIDE,
  BALL_GRAVITY,
  BALL_GROUND_FRICTION,
  BALL_MAX_SUBSTEPS,
  BALL_MIN_BOUNCE_SPEED,
  BALL_RADIUS,
  BALL_REST_SPEED,
  BALL_RESTITUTION,
  BALL_RESTITUTION_JITTER,
  BALL_SPIN_PER_IMPACT,
  BALL_SUBSTEP_MAX_DIST,
  BALL_TUMBLE_PER_IMPACT,
  BALL_WALL_RESTITUTION,
  BALL_WIDTH,
  TICK_DT,
} from './constants';
import { faceContact, groundHeight, groundNormal } from './field';
import { rand, randSigned } from './prng';
import type { BallState, MatchState } from './types';
import { forward, right, wrapAngle, type Vec3 } from './vec';

const DEVIATION_MAX = (BALL_BOUNCE_DEVIATION_DEG * Math.PI) / 180;
/** Tolérance numérique (m) pour considérer que le ballon est posé au sol (pas une valeur de gameplay). */
const GROUNDED_EPS = 1e-6;

/**
 * Position du ballon porté pour des pieds / un yaw de porteur : devant (BALL_CARRY_FORWARD), à droite
 * (BALL_CARRY_SIDE), à hauteur de poitrine (BALL_CARRY_HEIGHT). Partagée avec le rendu (qui l'applique au
 * porteur interpolé) : le ballon affiché est toujours exactement là où la sim le place.
 * `out` permet au rendu d'éviter une allocation par frame.
 */
export function carryPosition(feet: Vec3, yaw: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const f = forward(yaw);
  const r = right(yaw);
  out.x = feet.x + f.x * BALL_CARRY_FORWARD + r.x * BALL_CARRY_SIDE;
  out.y = feet.y + BALL_CARRY_HEIGHT;
  out.z = feet.z + f.z * BALL_CARRY_FORWARD + r.z * BALL_CARRY_SIDE;
  return out;
}

/** Ballon porté : placé devant / à droite du porteur, à hauteur de poitrine, à sa vitesse. */
function followCarrier(state: MatchState, b: BallState): void {
  const c = state.players[b.carrierId];
  if (c === undefined) {
    // Défensif : porteur invalide => ballon libre là où il est.
    b.mode = 'loose';
    b.carrierId = -1;
    return;
  }
  b.pos = carryPosition(c.pos, c.yaw);
  b.vel = { x: c.vel.x, y: c.vel.y, z: c.vel.z };
  b.lastTeam = c.team;
  b.spinRate = 0;
  b.tumbleRate = 0;
}

/** Réflexion de la vitesse sur un plan de normale horizontale (nx, nz) ; renvoie la vitesse normale d'impact. */
function reflectHorizontal(b: BallState, nx: number, nz: number, restitution: number): number {
  const vn = b.vel.x * nx + b.vel.z * nz;
  if (vn >= 0) return 0;
  b.vel.x -= (1 + restitution) * vn * nx;
  b.vel.z -= (1 + restitution) * vn * nz;
  return -vn;
}

function pushBounce(state: MatchState, b: BallState, speed: number): void {
  state.events.push({ type: 'bounce', pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, speed });
}

/** Murs invisibles (bords de l'arène). */
function collideArena(state: MatchState, b: BallState): void {
  const hw = state.field.width / 2 - BALL_RADIUS;
  const hl = state.field.length / 2 - BALL_RADIUS;
  let impact = 0;
  if (b.pos.x > hw) {
    b.pos.x = hw;
    impact = Math.max(impact, reflectHorizontal(b, -1, 0, BALL_WALL_RESTITUTION));
  } else if (b.pos.x < -hw) {
    b.pos.x = -hw;
    impact = Math.max(impact, reflectHorizontal(b, 1, 0, BALL_WALL_RESTITUTION));
  }
  if (b.pos.z > hl) {
    b.pos.z = hl;
    impact = Math.max(impact, reflectHorizontal(b, 0, -1, BALL_WALL_RESTITUTION));
  } else if (b.pos.z < -hl) {
    b.pos.z = -hl;
    impact = Math.max(impact, reflectHorizontal(b, 0, 1, BALL_WALL_RESTITUTION));
  }
  if (impact > BALL_MIN_BOUNCE_SPEED) pushBounce(state, b, impact);
}

/** Faces verticales des murets / rampes. */
function collideFaces(state: MatchState, b: BallState): void {
  const c = faceContact(state.field, b.pos.x, b.pos.y - BALL_RADIUS, b.pos.z, BALL_RADIUS, BALL_RADIUS);
  if (c === null) return;
  b.pos.x += c.nx * c.depth;
  b.pos.z += c.nz * c.depth;
  const impact = reflectHorizontal(b, c.nx, c.nz, BALL_WALL_RESTITUTION);
  if (impact > BALL_MIN_BOUNCE_SPEED) pushBounce(state, b, impact);
}

/**
 * Contact avec le sol : rebond seedé, ou roulement avec frottement.
 * `wasGrounded` : le ballon touchait le sol au début du sous-pas (il roulait) => pas de rebond.
 */
function collideGround(state: MatchState, b: BallState, h: number, wasGrounded: boolean): void {
  const gy = groundHeight(state.field, b.pos.x, b.pos.z);
  if (b.pos.y - BALL_RADIUS > gy) return;
  b.pos.y = gy + BALL_RADIUS;
  const n = groundNormal(state.field, b.pos.x, b.pos.z);
  const vn = b.vel.x * n.x + b.vel.y * n.y + b.vel.z * n.z;
  if (vn >= 0) return;
  // Composante tangentielle (le long du sol).
  let tx = b.vel.x - vn * n.x;
  let ty = b.vel.y - vn * n.y;
  let tz = b.vel.z - vn * n.z;
  const impact = -vn;
  if (b.mode === 'pass' || b.mode === 'kick') b.mode = 'loose';

  if (impact > BALL_MIN_BOUNCE_SPEED && !wasGrounded) {
    const e = Math.max(0, BALL_RESTITUTION + randSigned(state) * BALL_RESTITUTION_JITTER);
    const a = randSigned(state) * DEVIATION_MAX;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = (tx * ca + tz * sa) * BALL_BOUNCE_FRICTION;
    const rz = (tz * ca - tx * sa) * BALL_BOUNCE_FRICTION;
    tx = rx;
    tz = rz;
    ty *= BALL_BOUNCE_FRICTION;
    b.vel.x = tx + n.x * impact * e;
    b.vel.y = ty + n.y * impact * e;
    b.vel.z = tz + n.z * impact * e;
    b.tumbleRate = (rand(state) < 0.5 ? -1 : 1) * impact * BALL_TUMBLE_PER_IMPACT;
    b.spinRate = randSigned(state) * impact * BALL_SPIN_PER_IMPACT;
    pushBounce(state, b, impact);
    return;
  }

  // Roulement : frottement sur la vitesse tangentielle ; arrêt sous BALL_REST_SPEED si la pente
  // peut retenir le ballon (sinon, parti de l'arrêt, il serait remis à zéro à chaque sous-pas).
  const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
  const ns = ts - BALL_GROUND_FRICTION * h;
  const slopeAccel = BALL_GRAVITY * Math.sqrt(Math.max(0, 1 - n.y * n.y));
  if (ns <= 0 || (ns <= BALL_REST_SPEED && slopeAccel <= BALL_GROUND_FRICTION)) {
    b.vel.x = 0;
    b.vel.y = 0;
    b.vel.z = 0;
    b.tumbleRate = 0;
    b.spinRate = 0;
    return;
  }
  const k = ns / ts;
  b.vel.x = tx * k;
  b.vel.y = ty * k;
  b.vel.z = tz * k;
  b.tumbleRate = ns / (BALL_WIDTH / 2);
  b.spinRate = 0;
}

/** Physique du ballon libre / en vol sur un tick. */
function simulateBallPhysics(state: MatchState, b: BallState): void {
  const v = b.vel;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) + BALL_GRAVITY * TICK_DT;
  const n = Math.min(BALL_MAX_SUBSTEPS, Math.max(1, Math.ceil((speed * TICK_DT) / BALL_SUBSTEP_MAX_DIST)));
  const h = TICK_DT / n;
  const drag = Math.max(0, 1 - BALL_AIR_DRAG * h);
  for (let k = 0; k < n; k++) {
    const wasGrounded = b.pos.y - BALL_RADIUS <= groundHeight(state.field, b.pos.x, b.pos.z) + GROUNDED_EPS;
    b.pos.x += b.vel.x * h;
    b.pos.y += (b.vel.y - 0.5 * BALL_GRAVITY * h) * h;
    b.pos.z += b.vel.z * h;
    b.vel.y -= BALL_GRAVITY * h;
    b.vel.x *= drag;
    b.vel.y *= drag;
    b.vel.z *= drag;
    collideArena(state, b);
    collideFaces(state, b);
    collideGround(state, b, h, wasGrounded);
  }
}

/** Mise à jour du ballon pour un tick (hors ramassage, voir carrier.ts). */
export function updateBall(state: MatchState): void {
  const b = state.ball;
  switch (b.mode) {
    case 'carried':
      followCarrier(state, b);
      break;
    case 'loose':
    case 'pass':
    case 'kick':
      simulateBallPhysics(state, b);
      break;
    case 'scrum':
    case 'dead':
      b.vel = { x: 0, y: 0, z: 0 };
      b.spinRate = 0;
      b.tumbleRate = 0;
      break;
  }
  b.spin = wrapAngle(b.spin + b.spinRate * TICK_DT);
  b.tumble = wrapAngle(b.tumble + b.tumbleRate * TICK_DT);
  b.looseTicks = b.mode === 'loose' ? b.looseTicks + 1 : 0;
}
