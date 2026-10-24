/**
 * Indicateurs du porteur LOCAL (Three.js) :
 *  - flèche vive (cône + anneau) au-dessus du coéquipier qui recevrait la passe assistée, visible à travers
 *    le relief, et trait au sol du porteur vers lui ;
 *  - chevron au sol au bord de l'éventail, pointé vers ce coéquipier : le receveur est presque toujours
 *    DERRIÈRE le porteur, donc hors champ avec une caméra épaule ; l'éventail est entre la caméra et le
 *    porteur, donc toujours à l'écran ;
 *  - éventail au sol derrière le porteur = cône de passe (relatif au TERRAIN : vers son propre en-but), vert
 *    quand une cible existe, rouge sinon (état « aucune cible » lisible d'un coup d'œil), avec un repère du
 *    regard replié (passAimDirection) : on voit de quel côté la passe partira ;
 *  - point de chute prévu du coup de pied, discret (anneau + balise verticale fine, lisible de loin).
 * La cible est recalculée à chaque frame par le Renderer (selectPassTarget de la sim, avec le yaw courant).
 * Aucune allocation par frame.
 */

import * as THREE from 'three';
import { backwardZ, type TeamId, type Vec3 } from '../sim';
import { PALETTE, STYLE } from './palette';

/** Données d'une frame. */
export interface PassIndicatorFrame {
  /** Le joueur local porte le ballon (sinon tout est masqué). */
  visible: boolean;
  team: TeamId;
  /** Pieds interpolés du porteur et hauteur du sol sous lui. */
  carrierFeet: Vec3;
  carrierGround: number;
  /** Direction de visée repliée dans le demi-plan arrière (passAimDirection). */
  aim: { x: number; z: number };
  /** Pieds interpolés de la cible, ou null (aucune cible). */
  targetFeet: Vec3 | null;
  /** Hauteur de la capsule de la cible (posture). */
  targetHeight: number;
  /** Point de chute prévu du coup de pied, ou null. */
  kickLanding: Vec3 | null;
}

const groundMat = (color: string, opacity: number, depthTest = true): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });

export class PassIndicatorView {
  readonly group = new THREE.Group();
  private readonly arrow = new THREE.Group();
  private readonly fan: THREE.Mesh;
  private readonly fanMat: THREE.MeshBasicMaterial;
  private readonly aimTick: THREE.Mesh;
  private readonly aimMat: THREE.MeshBasicMaterial;
  private readonly line: THREE.Mesh;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly kick: THREE.Group;
  private readonly chevron = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly targetColor = new THREE.Color(PALETTE.passTarget);
  private readonly noneColor = new THREE.Color(PALETTE.passNone);

  constructor() {
    // Flèche : cône pointe en bas + anneau, sans test de profondeur (visible derrière les murets).
    const coneGeo = new THREE.ConeGeometry(STYLE.passArrowSize * 0.75, STYLE.passArrowSize * 1.5, 4).rotateX(Math.PI);
    const ringGeo = new THREE.TorusGeometry(STYLE.passArrowSize, STYLE.passArrowSize * 0.18, 6, 28).rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: PALETTE.passTarget, depthTest: false, depthWrite: false, transparent: true });
    const outlineMat = new THREE.MeshBasicMaterial({
      color: PALETTE.outline,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const cone = new THREE.Mesh(coneGeo, arrowMat);
    cone.position.y = STYLE.passArrowSize * 0.9;
    const coneOutline = new THREE.Mesh(coneGeo, outlineMat);
    coneOutline.position.copy(cone.position);
    coneOutline.scale.setScalar(1.3);
    const ring = new THREE.Mesh(ringGeo, arrowMat);
    cone.renderOrder = ring.renderOrder = 1003;
    coneOutline.renderOrder = 1002;
    this.arrow.add(coneOutline, cone, ring);

    // Éventail : demi-disque au sol orienté vers son propre en-but (axe Z du terrain).
    const fanGeo = new THREE.CircleGeometry(STYLE.passFanRadius, 40, 0, Math.PI).rotateX(-Math.PI / 2);
    this.fanMat = groundMat(PALETTE.passTarget, STYLE.passFanOpacity);
    this.fan = new THREE.Mesh(fanGeo, this.fanMat);
    this.fan.renderOrder = 2;

    // Repère du regard replié : trait le long du rayon de l'éventail (géométrie unité étirée sur Z local).
    const unitStrip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.aimMat = groundMat(PALETTE.passTarget, STYLE.passAimTickOpacity);
    this.aimTick = new THREE.Mesh(unitStrip, this.aimMat);
    this.aimTick.scale.set(STYLE.passAimTickWidth, 1, STYLE.passFanRadius);
    this.aimTick.renderOrder = 3;

    // Trait porteur -> cible (au-dessus du relief : pas de test de profondeur, faible opacité).
    this.lineMat = groundMat(PALETTE.passTarget, STYLE.passLineOpacity, false);
    this.line = new THREE.Mesh(unitStrip, this.lineMat);
    this.line.renderOrder = 4;

    // Chevron au sol pointé vers le receveur (+Z local), avec un contour sombre, toujours visible.
    const shape = new THREE.Shape();
    const c = STYLE.passChevronSize;
    shape.moveTo(0, c * 0.6);
    shape.lineTo(c * 0.5, -c * 0.25);
    shape.lineTo(0, 0);
    shape.lineTo(-c * 0.5, -c * 0.25);
    shape.closePath();
    const chevGeo = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2); // +Y de la forme -> +Z
    const chevMat = groundMat(PALETTE.passTarget, 0.95, false);
    const chevOutlineMat = groundMat(PALETTE.outline, 0.6, false);
    const chev = new THREE.Mesh(chevGeo, chevMat);
    chev.renderOrder = 7;
    const chevOutline = new THREE.Mesh(chevGeo, chevOutlineMat);
    chevOutline.scale.setScalar(1.3);
    chevOutline.position.z = -c * 0.05;
    chevOutline.renderOrder = 6;
    this.chevron.add(chevOutline, chev);

    // Point de chute du coup de pied : anneau au sol + balise verticale fine.
    const kickGeo = new THREE.RingGeometry(STYLE.kickMarkerRadius * 0.8, STYLE.kickMarkerRadius, 36).rotateX(-Math.PI / 2);
    const kickMat = groundMat(PALETTE.kickLanding, STYLE.kickMarkerOpacity);
    const beaconGeo = new THREE.CylinderGeometry(STYLE.kickBeaconRadius, STYLE.kickBeaconRadius, STYLE.kickBeaconHeight, 6).translate(
      0,
      STYLE.kickBeaconHeight / 2,
      0,
    );
    const beaconMat = new THREE.MeshBasicMaterial({ color: PALETTE.kickLanding, transparent: true, opacity: STYLE.kickBeaconOpacity, depthWrite: false });
    const kickRing = new THREE.Mesh(kickGeo, kickMat);
    kickRing.renderOrder = 2;
    this.kick = new THREE.Group();
    this.kick.add(kickRing, new THREE.Mesh(beaconGeo, beaconMat));

    this.group.add(this.arrow, this.fan, this.aimTick, this.line, this.kick, this.chevron);
    this.group.visible = false;
    this.disposables.push(
      coneGeo,
      ringGeo,
      arrowMat,
      outlineMat,
      fanGeo,
      this.fanMat,
      unitStrip,
      this.aimMat,
      this.lineMat,
      chevGeo,
      chevMat,
      chevOutlineMat,
      kickGeo,
      kickMat,
      beaconGeo,
      beaconMat,
    );
  }

  update(f: PassIndicatorFrame, timeSec: number): void {
    this.group.visible = f.visible;
    if (!f.visible) return;
    const has = f.targetFeet !== null;
    const color = has ? this.targetColor : this.noneColor;
    this.fanMat.color.copy(color);
    this.aimMat.color.copy(color);
    this.fanMat.opacity = has ? STYLE.passFanOpacity : STYLE.passFanOpacity * 1.4;

    const cf = f.carrierFeet;
    const y = f.carrierGround + 0.03;
    this.fan.position.set(cf.x, y, cf.z);
    // Le demi-disque de CircleGeometry (θ ∈ [0, π]) couvre z ≤ 0 une fois couché : tourné de π pour l'équipe 1.
    this.fan.rotation.y = backwardZ(f.team) === -1 ? 0 : Math.PI;
    this.aimTick.position.set(cf.x, y + 0.005, cf.z);
    this.aimTick.rotation.y = Math.atan2(f.aim.x, f.aim.z);

    this.arrow.visible = has;
    this.line.visible = has;
    this.chevron.visible = has;
    if (f.targetFeet !== null) {
      const t = f.targetFeet;
      const bob = Math.sin(timeSec * STYLE.passArrowBobRate) * STYLE.passArrowBobAmp;
      this.arrow.position.set(t.x, t.y + f.targetHeight + STYLE.passArrowAboveHead + bob, t.z);
      this.arrow.rotation.y = timeSec * STYLE.passArrowSpinRate;
      const dx = t.x - cf.x;
      const dz = t.z - cf.z;
      const len = Math.hypot(dx, dz);
      this.line.position.set(cf.x, Math.max(y, t.y + 0.03) + 0.01, cf.z);
      this.line.rotation.y = Math.atan2(dx, dz);
      this.line.scale.set(STYLE.passLineWidth, 1, Math.max(0.01, len));
      const ux = len > 1e-6 ? dx / len : 0;
      const uz = len > 1e-6 ? dz / len : 1;
      const d = Math.min(STYLE.passChevronDist, len) + Math.sin(timeSec * STYLE.passChevronBobRate) * STYLE.passChevronBobAmp;
      this.chevron.position.set(cf.x + ux * d, y + 0.02, cf.z + uz * d);
      this.chevron.rotation.y = Math.atan2(ux, uz);
    }

    this.kick.visible = f.kickLanding !== null;
    if (f.kickLanding !== null) {
      this.kick.position.set(f.kickLanding.x, f.kickLanding.y + 0.03, f.kickLanding.z);
      this.kick.rotation.y = -timeSec * STYLE.kickMarkerSpinRate;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
