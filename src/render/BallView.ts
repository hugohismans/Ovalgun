/**
 * Ballon (Three.js) : ovale (sphère étirée) jaune vif avec bande blanche et contour, orientation
 * depuis ball.spin / ball.tumble (cap = direction du mouvement, ou yaw du porteur), traînée
 * (ruban des dernières positions interpolées qui s'estompe), cercle de ramassage au sol quand il
 * est libre, ombre portée.
 */

import * as THREE from 'three';
import { BALL_LENGTH, BALL_PICKUP_RADIUS, BALL_RADIUS, BALL_WIDTH, lerpAngle, type BallState, type Vec3 } from '../sim';
import { PALETTE, STYLE } from './palette';

/** Vitesse horizontale (m/s) au-dessus de laquelle le cap du ballon suit sa vitesse. */
const HEADING_MIN_SPEED = 0.6;
/** Distance minimale (m) entre deux points de la traînée. */
const TRAIL_MIN_STEP = 0.06;

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  t: number;
}

export class BallView {
  readonly group = new THREE.Group();
  private readonly ball = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly trail: THREE.Mesh;
  private readonly trailGeo: THREE.BufferGeometry;
  private readonly trailPos: Float32Array;
  private readonly trailCol: Float32Array;
  /** Tampon circulaire préalloué des points de traînée (du plus ancien au plus récent). */
  private readonly points: TrailPoint[] = Array.from({ length: STYLE.trailMaxPoints }, () => ({ x: 0, y: 0, z: 0, t: 0 }));
  private trailStart = 0;
  private trailCount = 0;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private heading = 0;
  private readonly trailColor = new THREE.Color(PALETTE.ballTrail);
  // Vecteurs de travail (pas d'allocation par frame).
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();

  constructor() {
    const s = STYLE.ballVisualScale;
    const body = new THREE.SphereGeometry(1, 24, 16).scale((BALL_WIDTH / 2) * s, (BALL_WIDTH / 2) * s, (BALL_LENGTH / 2) * s);
    const band = new THREE.TorusGeometry((BALL_WIDTH / 2) * s * 1.01, 0.012 * s, 6, 24);
    const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.ball, emissive: PALETTE.ball, emissiveIntensity: 0.25 });
    const bandMat = new THREE.MeshBasicMaterial({ color: PALETTE.ballBand });
    const outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
    const outline = new THREE.Mesh(body, outlineMat);
    outline.scale.setScalar(1.14);
    this.ball.add(new THREE.Mesh(body, bodyMat), new THREE.Mesh(band, bandMat), outline);
    this.ball.rotation.order = 'YXZ'; // cap (Y), culbute (X), vrille autour de l'axe long (Z)
    this.group.add(this.ball);

    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * s * 1.2, 20).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: PALETTE.shadow,
      transparent: true,
      opacity: STYLE.shadowOpacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);

    const ringGeo = new THREE.RingGeometry(BALL_PICKUP_RADIUS - 0.09, BALL_PICKUP_RADIUS, 56).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.pickupRing,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.renderOrder = 1;
    this.group.add(this.ring);

    // Traînée : ruban de 2 sommets par point, couleurs RGBA (alpha par sommet).
    const n = STYLE.trailMaxPoints;
    this.trailPos = new Float32Array(n * 2 * 3);
    this.trailCol = new Float32Array(n * 2 * 4);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.trailGeo.setIndex(idx);
    this.trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(this.trailGeo, trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 3;
    this.group.add(this.trail);

    this.disposables.push(body, band, bodyMat, bandMat, outlineMat, shadowGeo, shadowMat, ringGeo, this.ringMat, this.trailGeo, trailMat);
  }

  /**
   * Met à jour la vue. `b` / `prevB` = ballon courant / précédent, `alpha` = interpolation (la rotation
   * culbute / vrille est interpolée comme la position : pas de crans à 30 Hz) ; `pos` = centre interpolé ;
   * `carrierYaw` = yaw du porteur (ou null) ; `ground` = hauteur du sol sous le ballon ;
   * `camPos` = position caméra (orientation du ruban).
   */
  update(
    b: BallState,
    prevB: BallState,
    alpha: number,
    pos: Vec3,
    carrierYaw: number | null,
    ground: number,
    camPos: THREE.Vector3,
    timeSec: number,
  ): void {
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (carrierYaw !== null) this.heading = carrierYaw;
    else if (hs > HEADING_MIN_SPEED) this.heading = Math.atan2(b.vel.x, b.vel.z);
    this.ball.position.set(pos.x, pos.y, pos.z);
    // Moins de π par tick (vitesses de rotation bornées par la sim) : le plus court chemin est le bon.
    const tumble = lerpAngle(prevB.tumble, b.tumble, alpha);
    const spin = lerpAngle(prevB.spin, b.spin, alpha);
    this.ball.rotation.set(carrierYaw !== null ? STYLE.carriedBallTilt : tumble, this.heading, spin);

    const air = Math.max(0, pos.y - BALL_RADIUS - ground);
    const fade = Math.max(0, 1 - air / STYLE.shadowFadeHeight);
    this.shadow.position.set(pos.x, ground + 0.016, pos.z);
    this.shadow.scale.setScalar(STYLE.ballShadowMinScale + (1 - STYLE.ballShadowMinScale) * fade);
    this.shadow.visible = carrierYaw === null;

    this.ring.visible = b.mode === 'loose';
    if (this.ring.visible) {
      this.ring.position.set(pos.x, ground + 0.02, pos.z);
      this.ringMat.opacity = STYLE.pickupRingOpacity + STYLE.pickupRingPulse * Math.sin(timeSec * STYLE.pickupRingPulseRate);
    }

    this.updateTrail(pos, carrierYaw === null && b.mode !== 'dead', camPos, timeSec);
  }

  /** i-ème point de la traînée (0 = le plus ancien). */
  private pt(i: number): TrailPoint {
    return this.points[(this.trailStart + i) % this.points.length];
  }

  private updateTrail(pos: Vec3, emit: boolean, camPos: THREE.Vector3, now: number): void {
    const cap = this.points.length;
    while (this.trailCount > 0 && now - this.pt(0).t > STYLE.trailSec) {
      this.trailStart = (this.trailStart + 1) % cap;
      this.trailCount--;
    }
    if (emit) {
      const last = this.trailCount > 0 ? this.pt(this.trailCount - 1) : null;
      if (last === null || Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) >= TRAIL_MIN_STEP) {
        if (this.trailCount >= cap) {
          this.trailStart = (this.trailStart + 1) % cap;
          this.trailCount--;
        }
        const np = this.pt(this.trailCount);
        np.x = pos.x;
        np.y = pos.y;
        np.z = pos.z;
        np.t = now;
        this.trailCount++;
      } else {
        last.t = now; // ballon immobile : la traînée se résorbe
      }
    }
    const n = this.trailCount;
    if (n < 2) {
      this.trailGeo.setDrawRange(0, 0);
      return;
    }
    const c = this.trailColor;
    for (let i = 0; i < n; i++) {
      const p = this.pt(i);
      const prev = this.pt(Math.max(0, i - 1));
      const next = this.pt(Math.min(n - 1, i + 1));
      const tangent = this.tmpA.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
      const toCam = this.tmpB.set(camPos.x - p.x, camPos.y - p.y, camPos.z - p.z);
      const side = this.tmpC.crossVectors(tangent, toCam);
      const sl = side.length();
      if (sl > 1e-6) side.multiplyScalar(1 / sl);
      else side.set(0, 1, 0);
      const life = Math.max(0, 1 - (now - p.t) / STYLE.trailSec); // 1 = récent
      const w = STYLE.trailWidth * (0.25 + 0.75 * life) * (i / (n - 1));
      const o = i * 6;
      this.trailPos[o] = p.x + side.x * w;
      this.trailPos[o + 1] = p.y + side.y * w;
      this.trailPos[o + 2] = p.z + side.z * w;
      this.trailPos[o + 3] = p.x - side.x * w;
      this.trailPos[o + 4] = p.y - side.y * w;
      this.trailPos[o + 5] = p.z - side.z * w;
      const a = STYLE.trailOpacity * life * (i / (n - 1));
      const q = i * 8;
      this.trailCol[q] = c.r;
      this.trailCol[q + 1] = c.g;
      this.trailCol[q + 2] = c.b;
      this.trailCol[q + 3] = a;
      this.trailCol[q + 4] = c.r;
      this.trailCol[q + 5] = c.g;
      this.trailCol[q + 6] = c.b;
      this.trailCol[q + 7] = a;
    }
    (this.trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trailGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.trailGeo.setDrawRange(0, (n - 1) * 6);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
