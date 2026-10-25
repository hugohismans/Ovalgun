/**
 * Effets flat des événements (Three.js) : anneaux qui s'agrandissent et s'estompent, au sol ou face caméra
 * (ramassage, réception, interception, coup de pied, plongeon, passe, passe refusée ; étape 5 : plaquage, relevé,
 * capacité ; étape 7 : déclenchement et résolution d'une mêlée). Traceurs, flashs, étincelles et éclats du combat : CombatFxView. Table des effets :
 * `FX` (palette.ts) ; choix de l'effet et de son ancrage : `fxForEvent` (PURE, testée).
 * Pool d'anneaux préalloué (STYLE.fxPoolSize) : aucune allocation par frame ni par événement.
 */

import * as THREE from 'three';
import { carryPosition, type MatchEvent, type MatchState, type Vec3 } from '../sim';
import { FX, STYLE, type RingFx } from './palette';

/** Effet à jouer pour un événement : anneaux et point d'ancrage (pieds du joueur concerné ou ballon). */
export interface FxRequest {
  rings: readonly RingFx[];
  /** Ancrage au sol (pieds) pour les anneaux au sol. */
  ground: Vec3;
  /** Ancrage en l'air (ballon) pour les anneaux face caméra. */
  air: Vec3;
}

/** Effet correspondant à un événement de la sim (null : aucun). `state` = état juste après le tick. */
export function fxForEvent(e: MatchEvent, state: MatchState): FxRequest | null {
  const at = (id: number, rings: readonly RingFx[], air?: Vec3): FxRequest | null => {
    const p = state.players[id];
    if (p === undefined) return null;
    return { rings, ground: p.pos, air: air ?? carryPosition(p.pos, p.yaw) };
  };
  switch (e.type) {
    case 'pickup':
      return at(e.playerId, FX.pickup);
    case 'catch':
      return at(e.playerId, e.intercepted ? FX.intercept : FX.catch);
    case 'kick':
      return at(e.playerId, FX.kick, state.ball.pos);
    case 'dive':
      return at(e.playerId, FX.dive);
    case 'pass':
      return at(e.fromId, FX.pass, state.ball.pos);
    case 'pass_denied':
      return at(e.playerId, FX.passDenied);
    case 'tackled':
      return at(e.targetId, FX.tackled);
    case 'getup':
      return at(e.playerId, FX.getup);
    case 'ability':
      return at(e.playerId, FX.ability);
    case 'try':
      return at(e.scorerId, FX.try, state.ball.pos);
    case 'scrum_start':
      return { rings: FX.scrumStart, ground: e.pos, air: state.ball.pos };
    case 'scrum_won':
      return at(e.playerId, FX.scrumWon);
    default:
      return null;
  }
}

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  billboard: boolean;
  start: number;
  duration: number;
  r0: number;
  r1: number;
}

export class FxView {
  readonly group = new THREE.Group();
  private readonly geo: THREE.RingGeometry;
  private readonly slots: Slot[] = [];
  private next = 0;

  constructor() {
    this.geo = new THREE.RingGeometry(1 - STYLE.fxRingThickness, 1, 40);
    for (let i = 0; i < STYLE.fxPoolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, active: false, billboard: false, start: 0, duration: 1, r0: 0, r1: 1 });
    }
  }

  /** Joue l'effet d'un événement (s'il y en a un). */
  handle(e: MatchEvent, state: MatchState, timeSec: number): void {
    const req = fxForEvent(e, state);
    if (req === null) return;
    for (const r of req.rings) {
      const s = this.slots[this.next];
      this.next = (this.next + 1) % this.slots.length; // le plus ancien est recyclé
      const anchor = r.billboard ? req.air : req.ground;
      s.active = true;
      s.billboard = r.billboard;
      s.start = timeSec + r.delay;
      s.duration = r.duration;
      s.r0 = r.r0;
      s.r1 = r.r1;
      s.mat.color.set(r.color);
      s.mesh.position.set(anchor.x, anchor.y + r.lift, anchor.z);
      s.mesh.rotation.set(r.billboard ? 0 : -Math.PI / 2, 0, 0);
      s.mesh.visible = false;
    }
  }

  /** Avance les effets ; les anneaux face caméra s'orientent vers `camera`. */
  update(timeSec: number, camera: THREE.Camera): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      const u = (timeSec - s.start) / s.duration;
      if (u >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      if (u < 0) continue; // délai
      const ease = 1 - (1 - u) * (1 - u);
      s.mesh.visible = true;
      s.mesh.scale.setScalar(s.r0 + (s.r1 - s.r0) * ease);
      s.mat.opacity = 1 - u;
      if (s.billboard) s.mesh.quaternion.copy(camera.quaternion);
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const s of this.slots) s.mat.dispose();
  }
}
