/**
 * Effets du combat (étape 5), Three.js, pools préalloués (aucune allocation par frame) :
 *  - traceurs des projectiles en vol (balles longues et vives, plombs courts), interpolés entre deux ticks ; un
 *    projectile qui disparaît pendant le tick (impact, portée) est prolongé jusqu'à son point final ('projectile_end') ;
 *    visuellement, le traceur part du CANON de l'arme affichée et rejoint la vraie trajectoire (qui part de
 *    l'origine de visée, sur l'épaule) en STYLE.tracerConvergeDist mètres ;
 *  - flash de bouche ('shot'), étincelles d'impact ('hit' sur un joueur, 'projectile_end' sur le relief ou un bouclier),
 *    éclat en étoile du plaquage ('tackled') ;
 *  - étape 7 : plombs du fusil à pompe (traceurs courts, `pellet`) ; GRENADES en vol (sphère sombre cerclée de la couleur
 *    de l'équipe + petite traînée), interpolées sur leur parabole (`grenadePoint`) ; EXPLOSIONS ('explosion') : boule
 *    flat qui s'étend jusqu'au rayon d'explosion et s'estompe, onde au sol.
 * Ne lit que des MatchState et des événements ; n'écrit jamais dans l'état.
 */

import * as THREE from 'three';
import {
  forward,
  groundHeight,
  right,
  ROLES,
  TICK_DT,
  type MatchEvent,
  type MatchState,
  type Projectile,
  type ProjectileKind,
  type TeamId,
  type Vec3,
} from '../sim';
import { PALETTE, STYLE } from './palette';

/** Géométrie d'étoile plate (branches alternant rayon 1 et `inner`). */
function starGeometry(points: number, inner: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 1 : inner;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Description d'un traceur : droite de la trajectoire, distance parcourue par la tête, tireur. */
export interface TracerSpec {
  /** Point de départ de la trajectoire (origine de visée du tir) et direction unitaire. */
  origin: Vec3;
  dir: Vec3;
  /** Distance (m) de la tête depuis l'origine. */
  head: number;
  kind: ProjectileKind;
  /** Yaw du tireur (position du canon affiché). */
  ownerYaw: number;
}

/**
 * Point visuel d'un traceur à la distance `s` de l'origine (PURE) : sur la trajectoire, décalé vers le canon de
 * l'arme affichée d'autant plus que `s` est petit (décalage nul au-delà de STYLE.tracerConvergeDist).
 */
export function tracerPoint(spec: TracerSpec, s: number, out: Vec3): Vec3 {
  const k = Math.max(0, 1 - s / STYLE.tracerConvergeDist);
  const f = forward(spec.ownerYaw);
  const r = right(spec.ownerYaw);
  out.x = spec.origin.x + spec.dir.x * s + (r.x * STYLE.muzzleRight + f.x * STYLE.muzzleForward) * k;
  out.y = spec.origin.y + spec.dir.y * s + STYLE.muzzleUp * k;
  out.z = spec.origin.z + spec.dir.z * s + (r.z * STYLE.muzzleRight + f.z * STYLE.muzzleForward) * k;
  return out;
}

/**
 * Traceur d'un projectile EN VOL dans l'état courant, interpolé (PURE) : la sim l'a déjà avancé de vel·dt pendant
 * le dernier tick, donc sa position affichée est pos − vel·dt·(1 − alpha) (trajectoire rectiligne des balles).
 * Écrit dans `out` et le renvoie.
 */
export function inFlightTracer(p: Projectile, alpha: number, ownerYaw: number, out: TracerSpec): TracerSpec {
  const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
  const inv = speed > 1e-9 ? 1 / speed : 0;
  out.dir.x = p.vel.x * inv;
  out.dir.y = p.vel.y * inv;
  out.dir.z = p.vel.z * inv;
  out.origin.x = p.pos.x - out.dir.x * p.traveled;
  out.origin.y = p.pos.y - out.dir.y * p.traveled;
  out.origin.z = p.pos.z - out.dir.z * p.traveled;
  out.head = Math.max(0, p.traveled - speed * TICK_DT * (1 - alpha));
  out.kind = p.kind;
  out.ownerYaw = ownerYaw;
  return out;
}

/**
 * Position affichée d'une grenade EN VOL (PURE) : la sim l'a avancée d'un tick sur sa parabole ; on remonte de
 * τ = TICK_DT·(1 − alpha) + `back` secondes : pos − vel·τ − ½·g·τ²·ŷ (vel = vitesse à la fin du tick). Écrit dans `out`.
 */
export function grenadePoint(p: Projectile, gravity: number, alpha: number, back: number, out: Vec3): Vec3 {
  const tau = TICK_DT * (1 - alpha) + back;
  out.x = p.pos.x - p.vel.x * tau;
  out.y = p.pos.y - p.vel.y * tau - 0.5 * gravity * tau * tau;
  out.z = p.pos.z - p.vel.z * tau;
  return out;
}

const newSpec = (): TracerSpec => ({ origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, head: 0, kind: 'bullet', ownerYaw: 0 });

/** Projectile terminé pendant le dernier tick : de sa position au début du tick à son point final. */
interface Ending {
  team: TeamId;
  ownerId: number;
  kind: ProjectileKind;
  /** Origine de la trajectoire, direction, distance au début du tick et au point final. */
  origin: Vec3;
  dir: Vec3;
  from: number;
  to: number;
}

/** Explosion affichée : boule et onde au sol. */
interface Blast {
  ball: THREE.Mesh;
  ballMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  active: boolean;
  start: number;
  radius: number;
}

/** Grenade affichée : sphère (+ bande d'équipe) et traînée. */
interface GrenadeSlot {
  body: THREE.Group;
  band: THREE.Mesh;
  trail: THREE.Mesh;
}

interface Particle {
  mesh: THREE.Mesh;
  active: boolean;
  start: number;
  duration: number;
  size: number;
  vel: Vec3;
}

export class CombatFxView {
  readonly group = new THREE.Group();
  private readonly tracerGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true).rotateX(Math.PI / 2);
  private readonly tracerMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly tracers: THREE.Mesh[] = [];
  private readonly flashGeo = starGeometry(4, 0.32);
  private readonly burstGeo = starGeometry(5, 0.45);
  private readonly sparkGeo = starGeometry(4, 0.45);
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly sparkMats: { hit: THREE.MeshBasicMaterial; terrain: THREE.MeshBasicMaterial };
  private readonly flashes: Particle[] = [];
  private readonly sparks: Particle[] = [];
  private readonly bursts: Array<Particle & { mat: THREE.MeshBasicMaterial }> = [];
  private nextFlash = 0;
  private nextSpark = 0;
  private nextBurst = 0;
  private readonly endings: Ending[] = [];
  // Étape 7 : grenades et explosions.
  private readonly grenadeGeo = new THREE.SphereGeometry(1, 14, 10);
  private readonly grenadeBandGeo = new THREE.TorusGeometry(1.02, 0.18, 6, 18);
  private readonly grenadeMat: THREE.MeshBasicMaterial;
  private readonly grenadeBandMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly grenadeTrailMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly grenades: GrenadeSlot[] = [];
  private readonly blastGeo = new THREE.IcosahedronGeometry(1, 2);
  private readonly blastRingGeo = new THREE.RingGeometry(1 - STYLE.explosionRingThickness, 1, 48).rotateX(-Math.PI / 2);
  private readonly blasts: Blast[] = [];
  private nextBlast = 0;
  private readonly gp: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly gq: Vec3 = { x: 0, y: 0, z: 0 };
  private endingCount = 0;
  /**
   * Fins de projectiles des ticks PRÉCÉDENTS de la même frame (plusieurs ticks par frame à ≤ 30 i/s ou après un
   * à-coup) : les `endingFull` premières entrées sont dessinées en entier (jusqu'au point final) ; seules celles du
   * dernier tick suivent alpha. Remis à zéro après chaque image dessinée.
   */
  private endingFull = 0;
  private endingsDrawn = true;
  private flashSpin = 0;
  // Objets de travail.
  private readonly spec = newSpec();
  private readonly a: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly b: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 0, 1);

  constructor() {
    const basic = (color: string, opacity = 1): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.tracerMats = [basic(PALETTE.tracers[0], STYLE.tracerOpacity), basic(PALETTE.tracers[1], STYLE.tracerOpacity)];
    this.flashMat = basic(PALETTE.muzzleFlash);
    this.sparkMats = { hit: basic(PALETTE.sparkHit), terrain: basic(PALETTE.sparkTerrain) };
    for (let i = 0; i < STYLE.tracerPoolSize; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMats[0]);
      m.visible = false;
      m.renderOrder = 6;
      m.frustumCulled = false;
      this.tracers.push(m);
      this.group.add(m);
    }
    const particle = (geo: THREE.BufferGeometry, mat: THREE.Material): Particle => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      return { mesh, active: false, start: 0, duration: 1, size: 1, vel: { x: 0, y: 0, z: 0 } };
    };
    for (let i = 0; i < STYLE.muzzlePoolSize; i++) this.flashes.push(particle(this.flashGeo, this.flashMat));
    for (let i = 0; i < STYLE.sparkPoolSize; i++) this.sparks.push(particle(this.sparkGeo, this.sparkMats.hit));
    for (let i = 0; i < STYLE.tackleBurstPoolSize; i++) {
      const mat = basic(PALETTE.tackleBurst);
      this.bursts.push({ ...particle(this.burstGeo, mat), mat });
    }
    // Grenades : sphère sombre + bande de couleur d'équipe, traînée claire (cylindre orienté comme un traceur).
    this.grenadeMat = new THREE.MeshBasicMaterial({ color: PALETTE.grenade, fog: false });
    this.grenadeBandMats = [new THREE.MeshBasicMaterial({ color: PALETTE.grenadeBand[0] }), new THREE.MeshBasicMaterial({ color: PALETTE.grenadeBand[1] })];
    this.grenadeTrailMats = [basic(PALETTE.grenadeTrail[0], STYLE.grenadeTrailOpacity), basic(PALETTE.grenadeTrail[1], STYLE.grenadeTrailOpacity)];
    for (let i = 0; i < STYLE.grenadePoolSize; i++) {
      const body = new THREE.Group();
      const sphere = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
      const band = new THREE.Mesh(this.grenadeBandGeo, this.grenadeBandMats[0]);
      band.rotation.x = Math.PI / 2;
      body.add(sphere, band);
      body.scale.setScalar(STYLE.grenadeRadius);
      body.visible = false;
      const trail = new THREE.Mesh(this.tracerGeo, this.grenadeTrailMats[0]);
      trail.visible = false;
      trail.renderOrder = 6;
      trail.frustumCulled = false;
      this.grenades.push({ body, band, trail });
      this.group.add(body, trail);
    }
    // Explosions : boule flat + onde au sol (matériaux propres : opacité animée).
    for (let i = 0; i < STYLE.explosionPoolSize; i++) {
      const ballMat = basic(PALETTE.explosionCore, STYLE.explosionOpacity);
      const ringMat = basic(PALETTE.explosionRing, 1);
      const ball = new THREE.Mesh(this.blastGeo, ballMat);
      const ring = new THREE.Mesh(this.blastRingGeo, ringMat);
      ball.visible = false;
      ring.visible = false;
      ball.renderOrder = 7;
      ring.renderOrder = 5;
      this.blasts.push({ ball, ballMat, ring, ringMat, active: false, start: 0, radius: 1 });
      this.group.add(ball, ring);
    }
    for (let i = 0; i < STYLE.tracerPoolSize; i++) {
      this.endings.push({ team: 0, ownerId: 0, kind: 'bullet', origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, from: 0, to: 0 });
    }
  }

  /**
   * Événements d'un tick (appelé après chaque step, avec l'état après et l'état avant le tick). Les projectiles
   * terminés pendant ce tick sont retenus pour être prolongés jusqu'à leur point final à l'affichage.
   */
  handleEvents(events: readonly MatchEvent[], state: MatchState, prev: MatchState | null, timeSec: number): void {
    if (this.endingsDrawn) {
      this.endingCount = 0;
      this.endingsDrawn = false;
    }
    // Les fins déjà retenues (ticks précédents de cette frame) seront dessinées en entier.
    this.endingFull = this.endingCount;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.spawnFlash(e.pos, e.dir, state.players[e.playerId]?.yaw ?? 0, timeSec);
          break;
        case 'hit':
          this.spawnSparks(e.pos, STYLE.sparksPerHit, this.sparkMats.hit, timeSec);
          break;
        case 'projectile_end':
          this.recordEnding(e, events, prev);
          if (e.reason === 'terrain' || e.reason === 'blocked') this.spawnSparks(e.pos, STYLE.sparksPerTerrain, this.sparkMats.terrain, timeSec);
          break;
        case 'tackled': {
          const p = state.players[e.targetId];
          if (p !== undefined) this.spawnBurst(p.pos, timeSec);
          break;
        }
        case 'explosion':
          this.spawnBlast(state, e.pos, e.radius, state.players[e.ownerId]?.team ?? 0, timeSec);
          break;
        default:
          break;
      }
    }
  }

  private recordEnding(e: Extract<MatchEvent, { type: 'projectile_end' }>, events: readonly MatchEvent[], prev: MatchState | null): void {
    // Une grenade qui disparaît explose : l'explosion prend le relais (pas de traceur prolongé).
    if (this.endingCount >= this.endings.length || e.kind === 'grenade') return;
    const p = prev?.projectiles.find((q) => q.id === e.projectileId);
    const end = this.endings[this.endingCount];
    let fx: number;
    let fy: number;
    let fz: number;
    let from: number;
    if (p !== undefined) {
      fx = p.pos.x;
      fy = p.pos.y;
      fz = p.pos.z;
      from = p.traveled;
      end.team = p.team;
    } else {
      // Né et terminé dans le même tick (tir à bout portant) : il part de l'origine du tir de ce tick.
      const shot = events.find((x): x is Extract<MatchEvent, { type: 'shot' }> => x.type === 'shot' && x.playerId === e.ownerId);
      if (shot === undefined) return;
      fx = shot.pos.x;
      fy = shot.pos.y;
      fz = shot.pos.z;
      from = 0;
      end.team = prev?.players[e.ownerId]?.team ?? 0;
    }
    const dx = e.pos.x - fx;
    const dy = e.pos.y - fy;
    const dz = e.pos.z - fz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    end.dir.x = dx / len;
    end.dir.y = dy / len;
    end.dir.z = dz / len;
    end.origin.x = fx - end.dir.x * from;
    end.origin.y = fy - end.dir.y * from;
    end.origin.z = fz - end.dir.z * from;
    end.from = from;
    end.to = from + len;
    end.kind = e.kind;
    end.ownerId = e.ownerId;
    this.endingCount++;
  }

  /** Copie la fin `from` dans l'emplacement `to` (pool préalloué, sans allocation). */
  private copyEnding(from: number, to: number): void {
    const a = this.endings[from];
    const b = this.endings[to];
    b.team = a.team;
    b.ownerId = a.ownerId;
    b.kind = a.kind;
    b.origin.x = a.origin.x;
    b.origin.y = a.origin.y;
    b.origin.z = a.origin.z;
    b.dir.x = a.dir.x;
    b.dir.y = a.dir.y;
    b.dir.z = a.dir.z;
    b.from = a.from;
    b.to = a.to;
  }

  private spawnFlash(pos: Vec3, dir: Vec3, yaw: number, timeSec: number): void {
    const s = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % this.flashes.length;
    const f = forward(yaw);
    const r = right(yaw);
    s.mesh.position.set(
      pos.x + r.x * STYLE.muzzleRight + f.x * STYLE.muzzleForward + dir.x * STYLE.muzzleFlashAhead,
      pos.y + STYLE.muzzleUp + dir.y * STYLE.muzzleFlashAhead,
      pos.z + r.z * STYLE.muzzleRight + f.z * STYLE.muzzleForward + dir.z * STYLE.muzzleFlashAhead,
    );
    s.active = true;
    s.start = timeSec;
    s.duration = STYLE.muzzleFlashSec;
    s.size = STYLE.muzzleFlashSize;
    this.flashSpin += STYLE.muzzleFlashSpinStep;
    s.vel.x = this.flashSpin; // rotation dans le plan de l'écran (pas de vitesse pour un flash)
  }

  private spawnSparks(pos: Vec3, n: number, mat: THREE.MeshBasicMaterial, timeSec: number): void {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % this.sparks.length;
      // Directions réparties (rendu seulement : pas besoin d'aléatoire reproductible).
      const a = Math.random() * Math.PI * 2;
      const up = STYLE.sparkUpMin + Math.random() * STYLE.sparkUpRange;
      const sp = STYLE.sparkSpeed * (STYLE.sparkSpeedMin + Math.random() * STYLE.sparkSpeedRange);
      s.vel.x = Math.cos(a) * sp;
      s.vel.y = up * sp;
      s.vel.z = Math.sin(a) * sp;
      s.mesh.material = mat;
      s.mesh.position.set(pos.x, pos.y, pos.z);
      s.active = true;
      s.start = timeSec;
      s.duration = STYLE.sparkSec * (STYLE.sparkLifeMin + Math.random() * STYLE.sparkLifeRange);
      s.size = STYLE.sparkSize;
    }
  }

  private spawnBlast(state: MatchState, pos: Vec3, radius: number, team: TeamId, timeSec: number): void {
    const b = this.blasts[this.nextBlast];
    this.nextBlast = (this.nextBlast + 1) % this.blasts.length;
    b.active = true;
    b.start = timeSec;
    b.radius = radius;
    b.ball.position.set(pos.x, pos.y, pos.z);
    b.ring.position.set(pos.x, groundHeight(state.field, pos.x, pos.z) + 0.05, pos.z);
    b.ballMat.color.set(PALETTE.explosionCore);
    b.ringMat.color.set(PALETTE.teams[team].light);
  }

  private spawnBurst(feet: Vec3, timeSec: number): void {
    const s = this.bursts[this.nextBurst];
    this.nextBurst = (this.nextBurst + 1) % this.bursts.length;
    s.mesh.position.set(feet.x, feet.y + STYLE.tackleBurstHeight, feet.z);
    s.active = true;
    s.start = timeSec;
    s.duration = STYLE.tackleBurstSec;
    s.size = STYLE.tackleBurstSize;
  }

  /** Place un traceur (pool) entre les distances `s0` et `s1` de la trajectoire `spec`. */
  private drawTracer(i: number, team: TeamId, spec: TracerSpec, s0: number, s1: number): void {
    const m = this.tracers[i];
    tracerPoint(spec, s0, this.a);
    tracerPoint(spec, s1, this.b);
    this.va.set(this.a.x, this.a.y, this.a.z);
    this.vb.set(this.b.x - this.a.x, this.b.y - this.a.y, this.b.z - this.a.z);
    const len = this.vb.length();
    if (len < 1e-4) {
      m.visible = false;
      return;
    }
    this.vb.multiplyScalar(1 / len);
    m.visible = true;
    m.material = this.tracerMats[team];
    m.position.set(this.a.x + this.vb.x * len * 0.5, this.a.y + this.vb.y * len * 0.5, this.a.z + this.vb.z * len * 0.5);
    m.quaternion.setFromUnitVectors(this.axis, this.vb);
    const w = spec.kind === 'pellet' ? STYLE.pelletTracerWidth : STYLE.tracerWidth;
    m.scale.set(w, w, len);
  }

  /** Une frame : traceurs (état courant interpolé + projectiles terminés au dernier tick), particules. */
  update(curr: MatchState, alpha: number, camera: THREE.Camera, dt: number, timeSec: number): void {
    let n = 0;
    const max = this.tracers.length;
    let ng = 0;
    for (const p of curr.projectiles) {
      if (p.kind === 'grenade') {
        if (ng < this.grenades.length) this.drawGrenade(this.grenades[ng++], curr, p, alpha);
        continue;
      }
      if (n >= max) continue;
      const yaw = curr.players[p.ownerId]?.yaw ?? 0;
      const spec = inFlightTracer(p, alpha, yaw, this.spec);
      const len = p.kind === 'pellet' ? STYLE.pelletTracerLength : STYLE.tracerLength;
      this.drawTracer(n++, p.team, spec, Math.max(0, spec.head - len), spec.head);
    }
    for (let i = 0; i < this.endingCount && n < max; i++) {
      const e = this.endings[i];
      const spec = this.spec;
      spec.origin.x = e.origin.x;
      spec.origin.y = e.origin.y;
      spec.origin.z = e.origin.z;
      spec.dir.x = e.dir.x;
      spec.dir.y = e.dir.y;
      spec.dir.z = e.dir.z;
      spec.kind = e.kind;
      spec.ownerYaw = curr.players[e.ownerId]?.yaw ?? 0;
      spec.head = i < this.endingFull ? e.to : e.from + (e.to - e.from) * alpha;
      const len = e.kind === 'pellet' ? STYLE.pelletTracerLength : STYLE.tracerLength;
      this.drawTracer(n++, e.team, spec, Math.max(0, spec.head - len), spec.head);
    }
    for (let i = n; i < max; i++) this.tracers[i].visible = false;
    for (let i = ng; i < this.grenades.length; i++) {
      this.grenades[i].body.visible = false;
      this.grenades[i].trail.visible = false;
    }
    for (const b of this.blasts) {
      if (!b.active) continue;
      const u = (timeSec - b.start) / STYLE.explosionSec;
      const ur = (timeSec - b.start) / STYLE.explosionRingSec;
      if (u >= 1 && ur >= 1) {
        b.active = false;
        b.ball.visible = false;
        b.ring.visible = false;
        continue;
      }
      const ease = 1 - (1 - Math.min(1, u)) * (1 - Math.min(1, u));
      b.ball.visible = u < 1;
      b.ball.scale.setScalar(b.radius * (STYLE.explosionStartFraction + (1 - STYLE.explosionStartFraction) * ease));
      b.ballMat.opacity = STYLE.explosionOpacity * (1 - Math.min(1, u));
      b.ring.visible = ur < 1;
      const er = 1 - (1 - Math.min(1, ur)) * (1 - Math.min(1, ur));
      b.ring.scale.setScalar(Math.max(1e-3, b.radius * er));
      b.ringMat.opacity = 1 - Math.min(1, ur);
    }
    // Les fins des ticks précédents n'ont été montrées qu'une image ; celles du dernier tick restent jusqu'au prochain.
    if (this.endingFull > 0) {
      for (let i = this.endingFull; i < this.endingCount; i++) this.copyEnding(i, i - this.endingFull);
      this.endingCount -= this.endingFull;
      this.endingFull = 0;
    }
    this.endingsDrawn = true;

    for (const s of this.flashes) {
      if (!s.active) continue;
      const u = (timeSec - s.start) / s.duration;
      if (u >= 1 || u < 0) {
        s.active = u < 0;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.rotateZ(s.vel.x);
      s.mesh.scale.setScalar(s.size * (1 - STYLE.muzzleFlashShrink * u));
    }
    for (const s of this.sparks) {
      if (!s.active) continue;
      const u = (timeSec - s.start) / s.duration;
      if (u >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= STYLE.sparkGravity * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      s.mesh.visible = true;
      s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.scale.setScalar(s.size * (1 - u));
    }
    for (const s of this.bursts) {
      if (!s.active) continue;
      const u = (timeSec - s.start) / s.duration;
      if (u >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const ease = 1 - (1 - u) * (1 - u);
      s.mesh.visible = true;
      s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.rotateZ(u * STYLE.tackleBurstSpin);
      s.mesh.scale.setScalar(s.size * (STYLE.tackleBurstStartScale + (1 - STYLE.tackleBurstStartScale) * ease));
      s.mat.opacity = 1 - u;
    }
  }

  /** Place une grenade en vol (position interpolée sur la parabole) et sa traînée. */
  private drawGrenade(slot: GrenadeSlot, curr: MatchState, p: Projectile, alpha: number): void {
    const owner = curr.players[p.ownerId];
    const g = owner === undefined ? 0 : ROLES[owner.role].weapon.gravity;
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    grenadePoint(p, g, alpha, 0, this.gp);
    slot.body.visible = true;
    slot.body.position.set(this.gp.x, this.gp.y, this.gp.z);
    slot.band.material = this.grenadeBandMats[p.team];
    slot.body.rotation.y = p.traveled * STYLE.grenadeSpinPerMeter; // rotation visuelle (lisibilité de la bande)
    // Traînée : de la position il y a STYLE.grenadeTrailSec (au plus depuis le départ) à la position affichée.
    const back = Math.min(STYLE.grenadeTrailSec, speed > 1e-6 ? p.traveled / speed : 0);
    grenadePoint(p, g, alpha, back, this.gq);
    this.vb.set(this.gp.x - this.gq.x, this.gp.y - this.gq.y, this.gp.z - this.gq.z);
    const len = this.vb.length();
    if (len < 1e-3) {
      slot.trail.visible = false;
      return;
    }
    this.vb.multiplyScalar(1 / len);
    slot.trail.visible = true;
    slot.trail.material = this.grenadeTrailMats[p.team];
    slot.trail.position.set((this.gp.x + this.gq.x) / 2, (this.gp.y + this.gq.y) / 2, (this.gp.z + this.gq.z) / 2);
    slot.trail.quaternion.setFromUnitVectors(this.axis, this.vb);
    slot.trail.scale.set(STYLE.grenadeTrailWidth, STYLE.grenadeTrailWidth, len);
  }

  dispose(): void {
    this.grenadeGeo.dispose();
    this.grenadeBandGeo.dispose();
    this.grenadeMat.dispose();
    for (const m of this.grenadeBandMats) m.dispose();
    for (const m of this.grenadeTrailMats) m.dispose();
    this.blastGeo.dispose();
    this.blastRingGeo.dispose();
    for (const b of this.blasts) {
      b.ballMat.dispose();
      b.ringMat.dispose();
    }
    this.tracerGeo.dispose();
    this.flashGeo.dispose();
    this.burstGeo.dispose();
    this.sparkGeo.dispose();
    for (const m of this.tracerMats) m.dispose();
    this.flashMat.dispose();
    this.sparkMats.hit.dispose();
    this.sparkMats.terrain.dispose();
    for (const b of this.bursts) b.mat.dispose();
  }
}
