/**
 * Joueurs (Three.js) : capsule couleur d'équipe à contour cartoon (inverted hull), visière sombre
 * orientée selon le yaw, arme côté droit (inclinée selon le pitch), signe distinctif du rôle sur la
 * tête, posture basse (capsule écrasée à la hauteur de la hitbox de la sim, PLAYER_LOW_HEIGHT, à peine
 * inclinée) en glissade / plongeon / au sol, ombre portée au sol,
 * anneau sous le joueur humain, losange au-dessus du porteur visible à travers le relief, coque blanche
 * pulsante pendant l'invulnérabilité (plongeon : on voit d'un coup d'œil que le porteur est intouchable).
 *
 * Géométries et matériaux partagés (PlayerAssets) : aucune allocation par frame.
 */

import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_LOW_HEIGHT, PLAYER_RADIUS, playerHeight, type PlayerState, type Role, type TeamId, type Vec3 } from '../sim';
import { PALETTE, STYLE } from './palette';

/** Dégradé à 3 paliers pour MeshToonMaterial (ombrage flat). */
function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Ressources partagées par toutes les vues de joueurs. */
export class PlayerAssets {
  readonly gradient = toonGradient();
  readonly capsule = new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - 2 * PLAYER_RADIUS, 8, 20);
  readonly visor = new THREE.BoxGeometry(0.66, 0.2, 0.22);
  readonly glint = new THREE.BoxGeometry(0.16, 0.05, 0.02);
  readonly weapons: Record<Role, THREE.BufferGeometry> = {
    pilier: new THREE.BoxGeometry(0.22, 0.22, 0.62),
    ailier: new THREE.BoxGeometry(0.12, 0.16, 0.72),
    demi: new THREE.CylinderGeometry(0.12, 0.12, 0.66, 12).rotateX(Math.PI / 2),
  };
  readonly signs: Record<Role, THREE.BufferGeometry> = {
    // Pilier : crête large et plate (casque).
    pilier: new THREE.BoxGeometry(0.56, 0.14, 0.26),
    // Ailier : aileron pointu.
    ailier: new THREE.ConeGeometry(0.13, 0.4, 4),
    // Demi : auréole.
    demi: new THREE.TorusGeometry(0.22, 0.05, 8, 24).rotateX(Math.PI / 2),
  };
  readonly shadow = new THREE.CircleGeometry(PLAYER_RADIUS * 1.15, 24).rotateX(-Math.PI / 2);
  readonly ring = new THREE.RingGeometry(STYLE.humanRingInner, STYLE.humanRingOuter, 40).rotateX(-Math.PI / 2);
  readonly marker = new THREE.OctahedronGeometry(STYLE.markerSize, 0).scale(1, 1.45, 1);

  readonly teamMats: [THREE.MeshToonMaterial, THREE.MeshToonMaterial];
  readonly teamDarkMats: [THREE.MeshToonMaterial, THREE.MeshToonMaterial];
  readonly outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
  readonly visorMat = new THREE.MeshBasicMaterial({ color: PALETTE.visor });
  readonly glintMat = new THREE.MeshBasicMaterial({ color: PALETTE.visorGlint });
  readonly weaponMat: THREE.MeshToonMaterial;
  readonly signMat: THREE.MeshToonMaterial;
  readonly shadowMat = new THREE.MeshBasicMaterial({
    color: PALETTE.shadow,
    transparent: true,
    opacity: STYLE.shadowOpacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  readonly ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.humanRing,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  /** Coque d'invulnérabilité (plongeon, relevé) : blanche, translucide, pulsante. */
  readonly invulnMat = new THREE.MeshBasicMaterial({ color: PALETTE.invuln, transparent: true, opacity: STYLE.invulnOpacity, depthWrite: false });
  /** Losange du porteur : pas de test de profondeur => visible à travers les obstacles. */
  readonly markerMat = new THREE.MeshBasicMaterial({ color: PALETTE.carrierMarker, depthTest: false, depthWrite: false, transparent: true });
  readonly markerOutlineMat = new THREE.MeshBasicMaterial({
    color: PALETTE.outline,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });

  constructor() {
    const toon = (color: string): THREE.MeshToonMaterial => new THREE.MeshToonMaterial({ color, gradientMap: this.gradient });
    this.teamMats = [toon(PALETTE.teams[0].main), toon(PALETTE.teams[1].main)];
    this.teamDarkMats = [toon(PALETTE.teams[0].dark), toon(PALETTE.teams[1].dark)];
    this.weaponMat = toon(PALETTE.weapon);
    this.signMat = toon(PALETTE.roleSign);
  }

  dispose(): void {
    const geos = [
      this.capsule,
      this.visor,
      this.glint,
      ...Object.values(this.weapons),
      ...Object.values(this.signs),
      this.shadow,
      this.ring,
      this.marker,
    ];
    for (const g of geos) g.dispose();
    const mats = [
      ...this.teamMats,
      ...this.teamDarkMats,
      this.outlineMat,
      this.visorMat,
      this.glintMat,
      this.weaponMat,
      this.signMat,
      this.shadowMat,
      this.ringMat,
      this.markerMat,
      this.markerOutlineMat,
      this.invulnMat,
    ];
    for (const m of mats) m.dispose();
    this.gradient.dispose();
  }
}

/**
 * Posture visuelle. `low` (0 debout, 1 bas) suit EXACTEMENT la hitbox de la sim (playerHeight : capsule
 * verticale de PLAYER_LOW_HEIGHT en glissade / plongeon / au sol) ; la bascule n'est qu'un indice de
 * lisibilité (en arrière en glissade et au sol, en avant en plongeon), bornée à STYLE.lowPostureLean
 * pour que le corps affiché ne déborde pas de la hitbox.
 */
function targetLow(p: PlayerState): number {
  return playerHeight(p) < PLAYER_HEIGHT ? 1 : 0;
}

function targetLean(p: PlayerState): number {
  if (targetLow(p) === 0) return 0;
  return p.move === 'dive' || p.move === 'dive_recover' ? STYLE.lowPostureLean : -STYLE.lowPostureLean;
}

/** Échelle verticale de la capsule en posture basse : hauteur affichée = hauteur de la hitbox. */
const LOW_RATIO = PLAYER_LOW_HEIGHT / PLAYER_HEIGHT;

/** Données interpolées d'un joueur pour une frame. */
export interface PlayerFrame {
  feet: Vec3;
  yaw: number;
  pitch: number;
  /** Hauteur du sol sous le joueur (ombre, anneau). */
  ground: number;
  carrier: boolean;
}

export class PlayerView {
  /** Racine positionnée aux pieds. */
  readonly root = new THREE.Group();
  /** Objets posés au sol (ombre, anneau), indépendants de la hauteur du joueur. */
  readonly groundGroup = new THREE.Group();
  readonly marker = new THREE.Group();
  private readonly yawGroup = new THREE.Group();
  private readonly pose = new THREE.Group();
  private readonly weapon = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly invulnShell: THREE.Mesh;
  private readonly invulnMat: THREE.MeshBasicMaterial;
  private lean = 0;
  private low = 0;

  constructor(
    assets: PlayerAssets,
    readonly id: number,
    team: TeamId,
    role: Role,
    private readonly isHuman: boolean,
  ) {
    const H = PLAYER_HEIGHT;
    const R = PLAYER_RADIUS;
    this.root.add(this.yawGroup);
    this.yawGroup.add(this.pose);

    // Corps + contour.
    const body = new THREE.Mesh(assets.capsule, assets.teamMats[team]);
    const outline = new THREE.Mesh(assets.capsule, assets.outlineMat);
    outline.scale.setScalar(STYLE.outlineScale);
    this.pose.add(body, outline);

    // Visière (avant = +Z local), à hauteur des yeux.
    const visor = new THREE.Mesh(assets.visor, assets.visorMat);
    visor.position.set(0, H * 0.31, R * 0.82);
    const glint = new THREE.Mesh(assets.glint, assets.glintMat);
    glint.position.set(-0.14, H * 0.31 + 0.04, R * 0.82 + 0.115);
    this.pose.add(visor, glint);

    // Arme côté droit (droite = −X local, cf. right(yaw)), inclinée selon le pitch.
    const gun = new THREE.Mesh(assets.weapons[role], assets.weaponMat);
    gun.position.set(0, 0, 0.22);
    const gunOutline = new THREE.Mesh(assets.weapons[role], assets.outlineMat);
    gunOutline.position.copy(gun.position);
    gunOutline.scale.setScalar(1.18);
    const grip = new THREE.Mesh(assets.weapons.ailier, assets.teamDarkMats[team]);
    grip.scale.set(0.9, 0.9, 0.35);
    grip.position.set(0, -0.02, -0.08);
    this.weapon.add(gun, gunOutline, grip);
    this.weapon.position.set(-(R + 0.1), H * 0.12, 0.1);
    this.pose.add(this.weapon);

    // Signe du rôle sur la tête.
    const sign = new THREE.Mesh(assets.signs[role], assets.signMat);
    sign.position.set(0, H / 2 + (role === 'ailier' ? 0.12 : 0.02), role === 'ailier' ? -0.1 : 0);
    if (role === 'ailier') sign.rotation.x = -0.5;
    const signOutline = new THREE.Mesh(assets.signs[role], assets.outlineMat);
    signOutline.position.copy(sign.position);
    signOutline.rotation.copy(sign.rotation);
    signOutline.scale.setScalar(1.2);
    this.pose.add(sign, signOutline);

    // Coque d'invulnérabilité (suit la posture : écrasée en plongeon comme la hitbox).
    this.invulnMat = assets.invulnMat;
    this.invulnShell = new THREE.Mesh(assets.capsule, assets.invulnMat);
    this.invulnShell.scale.setScalar(STYLE.invulnScale);
    this.invulnShell.renderOrder = 2;
    this.invulnShell.visible = false;
    this.pose.add(this.invulnShell);

    // Ombre et anneau du joueur humain.
    this.shadow = new THREE.Mesh(assets.shadow, assets.shadowMat);
    this.shadow.renderOrder = 1;
    this.groundGroup.add(this.shadow);
    if (isHuman) {
      const ring = new THREE.Mesh(assets.ring, assets.ringMat);
      ring.position.y = 0.02;
      ring.renderOrder = 1;
      this.groundGroup.add(ring);
    }

    // Losange du porteur (dessiné en dernier, sans test de profondeur).
    const gem = new THREE.Mesh(assets.marker, assets.markerMat);
    gem.renderOrder = 1001;
    const gemOutline = new THREE.Mesh(assets.marker, assets.markerOutlineMat);
    gemOutline.scale.setScalar(1.25);
    gemOutline.renderOrder = 1000;
    this.marker.add(gemOutline, gem);
    this.marker.visible = false;
  }

  /** Met à jour la vue pour une frame (état interpolé). */
  update(p: PlayerState, f: PlayerFrame, dt: number, timeSec: number): void {
    this.root.position.set(f.feet.x, f.feet.y, f.feet.z);
    this.yawGroup.rotation.y = f.yaw;

    // Posture lissée (rendu seulement) : capsule écrasée à la hauteur de la hitbox, légèrement inclinée.
    const blend = Math.exp(-STYLE.poseRate * dt);
    const targetL = targetLean(p);
    const targetK = targetLow(p);
    this.lean = targetL + (this.lean - targetL) * blend;
    this.low = targetK + (this.low - targetK) * blend;
    const k = this.low;
    const scaleY = 1 + (LOW_RATIO - 1) * k;
    this.pose.rotation.x = this.lean;
    this.pose.scale.set(1, scaleY, 1);
    this.pose.position.y = (PLAYER_HEIGHT * scaleY) / 2;
    // L'arme reste pointée vers l'avant (contre-rotation de la posture) et suit le pitch debout.
    this.weapon.rotation.x = -this.lean - f.pitch * (1 - k);
    this.weapon.visible = !f.carrier; // le porteur ne tire pas : le ballon prend la place de l'arme
    this.invulnShell.visible = p.invulnTicks > 0;
    if (this.invulnShell.visible) {
      this.invulnMat.opacity = STYLE.invulnOpacity + STYLE.invulnPulse * Math.sin(timeSec * STYLE.invulnPulseRate);
    }

    // Ombre au sol : plus petite et plus claire quand le joueur est en l'air.
    const air = Math.max(0, f.feet.y - f.ground);
    const fade = Math.max(0, 1 - air / STYLE.shadowFadeHeight);
    this.groundGroup.position.set(f.feet.x, f.ground + 0.015, f.feet.z);
    this.shadow.scale.setScalar(STYLE.playerShadowMinScale + (1 - STYLE.playerShadowMinScale) * fade);

    // Marqueur du porteur : flotte et tourne au-dessus de la tête.
    this.marker.visible = f.carrier;
    if (f.carrier) {
      const bob = Math.sin(timeSec * STYLE.markerBobRate) * STYLE.markerBobAmp;
      this.marker.position.set(f.feet.x, f.feet.y + PLAYER_HEIGHT * scaleY + STYLE.markerAboveHead + bob, f.feet.z);
      this.marker.rotation.y = timeSec * STYLE.markerSpinRate;
      this.marker.scale.setScalar(this.isHuman ? STYLE.markerHumanScale : 1); // plus discret au-dessus de sa propre tête
    }
  }
}
