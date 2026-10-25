/**
 * Pilotage d'un bot (étape 6) : de la décision (point visé ou direction imposée) à une direction de déplacement
 * MONDE et une inclinaison, avec écartement des coéquipiers et sortie de blocage.
 *
 *  - Point visé : arrêt dans BOT_ARRIVE_RADIUS, ralentissement dans BOT_SLOW_RADIUS (au moins BOT_MIN_MOVE_INPUT) ;
 *    sprint au-delà de BOT_SPRINT_MIN_DIST si le rôle le demande.
 *  - Coéquipiers à moins de BOT_TEAMMATE_SPACING : répulsion (pas d'agglutinement), sauf porteur et receveur.
 *  - Blocage : s'il veut avancer mais reste sous BOT_STUCK_SPEED pendant BOT_STUCK_SEC (muret frôlé, joueur en
 *    travers, coin), il saute et tourne sa direction de BOT_DETOUR_ANGLE_DEG (côté tiré au sort) pendant BOT_DETOUR_SEC.
 *    Les murets bas se franchissent seuls (grimpe automatique de la sim quand on va vers leur face) : le bot ne les
 *    contourne pas, il fonce dessus.
 *  - Étape 7 : ZONES DE RALENTISSEMENT ADVERSES : si la route vers le point visé traverse une zone adverse (rayon +
 *    BOT_ZONE_AVOID_MARGIN) à moins de BOT_ZONE_AVOID_LOOKAHEAD de son bord, la direction est tournée vers la tangente
 *    à la zone, du côté du point visé (contournement) — sauf si le point visé est lui-même dans la zone (ballon,
 *    porteur à presser : on y va) ou si l'on est déjà dedans (on sort vers le point visé). Le porteur, lui, pénalise
 *    les directions qui traversent une zone (carrierBrain.ts).
 */

import {
  BOT_ARRIVE_RADIUS,
  BOT_ZONE_AVOID_LOOKAHEAD,
  BOT_ZONE_AVOID_MARGIN,
  BOT_DETOUR_ANGLE_DEG,
  BOT_DETOUR_SEC,
  BOT_IDLE_PUSH_MIN,
  BOT_MIN_MOVE_INPUT,
  BOT_SLOW_RADIUS,
  BOT_SPRINT_MIN_DIST,
  BOT_STUCK_MIN_MOVE_MAG,
  BOT_STUCK_SEC,
  BOT_STUCK_SPEED,
  BOT_TEAMMATE_REPULSION,
  BOT_TEAMMATE_SPACING,
  rand,
  secToTicks,
  type MatchState,
  type PlayerState,
} from '../sim';
import type { BotMemory } from './memory';
import { horizontalSpeed } from './world';

const DEG = Math.PI / 180;

/** Déplacement voulu pour ce tick (monde). */
export interface MoveCommand {
  /** Direction monde unitaire (ou nulle). */
  dirX: number;
  dirZ: number;
  /** Inclinaison 0..1. */
  mag: number;
  sprint: boolean;
  /** Saut demandé (sortie de blocage). */
  jump: boolean;
}

/** Tourne (x, z) de `a` radians (sens trigonométrique du plan XZ, comme le yaw). */
function rotate(x: number, z: number, a: number): { x: number; z: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, z: z * c - x * s };
}

/**
 * Contournement des zones de ralentissement adverses : direction (dx, dz) unitaire vers le point visé (gx, gz), tournée
 * vers la tangente de la première zone adverse sur la route (voir l'en-tête). PURE.
 */
export function avoidZones(state: Readonly<MatchState>, me: PlayerState, dx: number, dz: number, gx: number, gz: number): { x: number; z: number } {
  let best = Infinity;
  let out = { x: dx, z: dz };
  for (const zn of state.zones) {
    if (zn.team === me.team) continue;
    const r = zn.radius + BOT_ZONE_AVOID_MARGIN;
    const cx = zn.pos.x - me.pos.x;
    const cz = zn.pos.z - me.pos.z;
    const dist = Math.sqrt(cx * cx + cz * cz);
    if (dist <= r || dist - r > BOT_ZONE_AVOID_LOOKAHEAD) continue; // dedans (on sort vers le but) ou trop loin
    if ((gx - zn.pos.x) ** 2 + (gz - zn.pos.z) ** 2 <= zn.radius * zn.radius) continue; // le but est dans la zone
    const along = cx * dx + cz * dz;
    if (along <= 0) continue; // la zone est derrière
    const goalDist = Math.sqrt((gx - me.pos.x) ** 2 + (gz - me.pos.z) ** 2);
    if (goalDist < dist - r) continue; // le but est avant la zone
    const perp = cx * dz - cz * dx; // > 0 : centre à droite (sens trigonométrique du plan XZ)
    if (Math.abs(perp) >= r || dist >= best) continue;
    // Tangente : angle asin(r / dist) de part et d'autre de la direction du centre, côté opposé au centre.
    const a = Math.asin(Math.min(1, r / dist));
    const ux = cx / dist;
    const uz = cz / dist;
    const s = perp > 0 ? -1 : 1; // tourner du côté où la route passe déjà
    const c = Math.cos(a * s);
    const sn = Math.sin(a * s);
    out = { x: ux * c + uz * sn, z: uz * c - ux * sn };
    best = dist;
  }
  return out;
}

/** Direction et inclinaison voulues d'après la décision courante (sans le suivi de blocage). PURE vis-à-vis de l'état. */
export function steer(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState): MoveCommand {
  const d = mem.decision;
  if (d.role === 'idle') return { dirX: 0, dirZ: 0, mag: 0, sprint: false, jump: false };
  let dx = 0;
  let dz = 0;
  let mag = 0;
  let far = true;
  if (d.dirX !== 0 || d.dirZ !== 0) {
    dx = d.dirX;
    dz = d.dirZ;
    mag = 1;
  } else {
    const vx = d.goalX - me.pos.x;
    const vz = d.goalZ - me.pos.z;
    const dist = Math.sqrt(vx * vx + vz * vz);
    far = dist > BOT_SPRINT_MIN_DIST;
    if (dist > BOT_ARRIVE_RADIUS) {
      dx = vx / dist;
      dz = vz / dist;
      mag = dist < BOT_SLOW_RADIUS ? Math.max(BOT_MIN_MOVE_INPUT, dist / BOT_SLOW_RADIUS) : 1;
      if (state.zones.length > 0) {
        const a = avoidZones(state, me, dx, dz, d.goalX, d.goalZ);
        dx = a.x;
        dz = a.z;
      }
    }
  }
  // Écartement des coéquipiers (pas d'agglutinement), sauf porteur et receveur qui gardent leur course.
  if (d.role !== 'carrier' && d.role !== 'receive') {
    let rx = 0;
    let rz = 0;
    for (const m of state.players) {
      if (m.id === me.id || m.team !== me.team || m.status !== 'active') continue;
      const ox = me.pos.x - m.pos.x;
      const oz = me.pos.z - m.pos.z;
      const l = Math.sqrt(ox * ox + oz * oz);
      if (l >= BOT_TEAMMATE_SPACING) continue;
      const w = (1 - l / BOT_TEAMMATE_SPACING) * BOT_TEAMMATE_REPULSION;
      // Exactement superposés : on s'écarte selon l'id (déterministe).
      rx += l > 1e-6 ? (ox / l) * w : me.id < m.id ? w : -w;
      rz += l > 1e-6 ? (oz / l) * w : 0;
    }
    const vx = dx * mag + rx;
    const vz = dz * mag + rz;
    const vl = Math.sqrt(vx * vx + vz * vz);
    if (mag > 0 || vl > BOT_IDLE_PUSH_MIN) {
      if (vl > 1e-6) {
        dx = vx / vl;
        dz = vz / vl;
        mag = Math.min(1, Math.max(mag, vl));
      }
    }
  }
  if (mem.detourTicks > 0 && mag > 0) {
    const r = rotate(dx, dz, mem.detourSign * BOT_DETOUR_ANGLE_DEG * DEG);
    dx = r.x;
    dz = r.z;
  }
  return { dirX: dx, dirZ: dz, mag, sprint: d.sprint && far && mag >= 0.99, jump: false };
}

/**
 * Suivi du blocage (une fois par tick, après le choix de la direction finale) : met à jour la mémoire et renvoie vrai
 * s'il faut sauter (début d'un détour). Mesure aussi le plus long blocage (`maxBlockedTicks`, lu par les tests).
 */
export function trackStuck(mem: BotMemory, me: PlayerState, mag: number): boolean {
  if (mem.detourTicks > 0) mem.detourTicks--;
  const wants = mag >= BOT_STUCK_MIN_MOVE_MAG && me.status === 'active';
  const slow = horizontalSpeed(me) < BOT_STUCK_SPEED;
  mem.blockedTicks = wants && slow ? mem.blockedTicks + 1 : 0;
  if (mem.blockedTicks > mem.maxBlockedTicks) mem.maxBlockedTicks = mem.blockedTicks;
  mem.stuckTicks = wants && slow && me.move === 'run' ? mem.stuckTicks + 1 : 0;
  if (mem.stuckTicks < Math.max(1, secToTicks(BOT_STUCK_SEC))) return false;
  mem.stuckTicks = 0;
  mem.detourTicks = secToTicks(BOT_DETOUR_SEC);
  mem.detourSign = rand(mem) < 0.5 ? -1 : 1;
  return true;
}

/** Remet à zéro le suivi de blocage (phase figée, joueur au sol). */
export function resetStuck(mem: BotMemory): void {
  mem.stuckTicks = 0;
  mem.blockedTicks = 0;
  mem.detourTicks = 0;
}
