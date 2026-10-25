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
 */

import {
  BOT_ARRIVE_RADIUS,
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
