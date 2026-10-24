/**
 * Joueurs (Three.js) : capsule couleur d'équipe à contour cartoon (inverted hull), visière sombre
 * orientée selon le yaw, arme côté droit (inclinée selon le pitch), signe distinctif du rôle sur la
 * tête, posture basse (capsule écrasée à la hauteur de la hitbox de la sim, PLAYER_LOW_HEIGHT, à peine
 * inclinée) en glissade / plongeon / au sol, ombre portée au sol,
 * anneau sous le joueur humain, losange au-dessus du porteur visible à travers le relief, coque blanche
 * pulsante pendant l'invulnérabilité (plongeon, relevé : on voit d'un coup d'œil que le joueur est intouchable).
 * Étape 5 : clignotement quand il est touché (`flash`), barre de stabilité au-dessus de la tête des AUTRES joueurs
 * (visible quand la jauge n'est pas pleine), posture au sol COUCHÉE avec des étoiles qui tournent, puis relevé.
 *
 * Géométries et matériaux partagés (PlayerAssets) ; seuls le corps (clignotement) et la jauge (couleur) ont un
 * matériau propre à chaque joueur. Aucune allocation par frame.
 */

import * as THREE from 'three';
import {
  GETUP_DURATION_SEC,
  PLAYER_HEIGHT,
  PLAYER_LOW_HEIGHT,
  PLAYER_RADIUS,
  playerHeight,
  ROLES,
  secToTicks,
  type PlayerState,
  type Role,
  type TeamId,
  type Vec3,
} from '../sim';
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
  /** Barre de stabilité (plan unité) et étoiles du joueur au sol. */
  readonly bar = new THREE.PlaneGeometry(1, 1);
  readonly star = starShape(5, 0.45);

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
  readonly barBackMat = new THREE.MeshBasicMaterial({ color: PALETTE.stabilityBarBack, transparent: true, opacity: STYLE.stabilityBarBackOpacity, depthWrite: false });
  readonly starMat = new THREE.MeshBasicMaterial({ color: PALETTE.dizzyStar, side: THREE.DoubleSide });

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
      this.bar,
      this.star,
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
      this.barBackMat,
      this.starMat,
    ];
    for (const m of mats) m.dispose();
    this.gradient.dispose();
  }
}

/** Géométrie d'étoile plate (branches de rayon 1, creux de rayon `inner`). */
function starShape(points: number, inner: number): THREE.ShapeGeometry {
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

/**
 * Posture visuelle. `low` (0 debout, 1 bas) suit EXACTEMENT la hitbox de la sim (playerHeight : capsule
 * verticale de PLAYER_LOW_HEIGHT en glissade / plongeon) ; la bascule n'est qu'un indice de
 * lisibilité (en arrière en glissade, en avant en plongeon), bornée à STYLE.lowPostureLean
 * pour que le corps affiché ne déborde pas de la hitbox. AU SOL (plaqué, intouchable : aucune hitbox à
 * respecter), le joueur est COUCHÉ de tout son long (`targetFall`), pas écrasé.
 */
function targetLow(p: PlayerState): number {
  if (p.status !== 'active') return 0;
  return playerHeight(p) < PLAYER_HEIGHT ? 1 : 0;
}

const BAR_HIGH = new THREE.Color(PALETTE.stabilityBarHigh);
const BAR_LOW = new THREE.Color(PALETTE.stabilityBarLow);

/** Chute visuelle (0 debout, 1 couché) : couché au sol, puis se redresse pendant le relevé. */
const GETUP_TICKS = Math.max(1, secToTicks(GETUP_DURATION_SEC));
export function targetFall(p: PlayerState): number {
  if (p.status === 'down') return 1;
  if (p.status === 'getting_up') return Math.min(1, Math.max(0, p.statusTicks / GETUP_TICKS));
  return 0;
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
  /** Barre de stabilité (face caméra), au-dessus de la tête des autres joueurs. */
  readonly bar = new THREE.Group();
  private readonly yawGroup = new THREE.Group();
  /** Bascule au sol (pivot aux pieds), entre le lacet et la posture. */
  private readonly fallGroup = new THREE.Group();
  private readonly pose = new THREE.Group();
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly barFill: THREE.Mesh;
  private readonly barFillMat: THREE.MeshBasicMaterial;
  private readonly dizzy = new THREE.Group();
  private readonly stars: THREE.Mesh[] = [];
  private readonly role: Role;
  private hitAt = -1;
  private fall = 0;
  /**
   * Lacet figé au moment du plaquage : la sim met à jour la visée de tous les joueurs, même au sol ; le corps
   * couché ne tourne pas avec la souris / l'entrée du plaqué (« aiguille de boussole »). NaN : debout.
   */
  private downYaw = Number.NaN;
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
    this.role = role;
    this.root.add(this.yawGroup);
    this.yawGroup.add(this.fallGroup);
    this.fallGroup.add(this.pose);

    // Corps + contour. Matériau propre (clignotement émissif quand il est touché).
    this.bodyMat = assets.teamMats[team].clone();
    this.bodyMat.emissive.set(PALETTE.hitFlash);
    this.bodyMat.emissiveIntensity = 0;
    const body = new THREE.Mesh(assets.capsule, this.bodyMat);
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

    // Barre de stabilité (fond + jauge ancrée à gauche), dessinée au-dessus du décor.
    const back = new THREE.Mesh(assets.bar, assets.barBackMat);
    back.scale.set(STYLE.stabilityBarWidth + STYLE.stabilityBarBackMargin, STYLE.stabilityBarHeight + STYLE.stabilityBarBackMargin, 1);
    back.renderOrder = 900;
    this.barFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.stabilityBarHigh, depthWrite: false, transparent: true });
    this.barFill = new THREE.Mesh(assets.bar, this.barFillMat);
    this.barFill.position.z = 0.002;
    this.barFill.renderOrder = 901;
    this.bar.add(back, this.barFill);
    this.bar.visible = false;

    // Étoiles qui tournent au-dessus du joueur au sol.
    for (let i = 0; i < STYLE.dizzyStars; i++) {
      const st = new THREE.Mesh(assets.star, assets.starMat);
      st.scale.setScalar(STYLE.dizzyStarSize);
      this.stars.push(st);
      this.dizzy.add(st);
    }
    this.dizzy.visible = false;
    this.dizzy.position.z = PLAYER_HEIGHT * STYLE.dizzyForwardFraction; // au-dessus du corps couché vers l'avant
    this.yawGroup.add(this.dizzy);
  }

  /** Le joueur vient d'être touché : clignotement (STYLE.hitFlashSec). */
  flash(timeSec: number): void {
    this.hitAt = timeSec;
  }

  /** Oriente la barre de stabilité vers la caméra (après la mise à jour de la caméra). */
  faceCamera(q: THREE.Quaternion): void {
    if (this.bar.visible) this.bar.quaternion.copy(q);
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.barFillMat.dispose();
  }

  /** Met à jour la vue pour une frame (état interpolé). */
  update(p: PlayerState, f: PlayerFrame, dt: number, timeSec: number): void {
    this.root.position.set(f.feet.x, f.feet.y, f.feet.z);
    if (p.status === 'active') this.downYaw = Number.NaN;
    else if (Number.isNaN(this.downYaw)) this.downYaw = f.yaw;
    this.yawGroup.rotation.y = Number.isNaN(this.downYaw) ? f.yaw : this.downYaw;

    // Au sol : couché face contre terre, vers l'avant (pivot aux pieds, posé sur son rayon ; le joueur local tombe
    // donc loin de sa caméra), puis se redresse pendant le relevé.
    const tf = targetFall(p);
    this.fall = tf + (this.fall - tf) * Math.exp(-STYLE.fallRate * dt);
    this.fallGroup.rotation.x = this.fall * (Math.PI / 2);
    this.fallGroup.position.y = this.fall * PLAYER_RADIUS;
    this.dizzy.visible = p.status === 'down';
    if (this.dizzy.visible) {
      for (let i = 0; i < this.stars.length; i++) {
        const a = timeSec * STYLE.dizzySpinRate + (i / this.stars.length) * Math.PI * 2;
        const st = this.stars[i];
        st.position.set(Math.cos(a) * STYLE.dizzyRadius, STYLE.dizzyHeight + STYLE.dizzyBob * Math.sin(a * 2), Math.sin(a) * STYLE.dizzyRadius);
        st.rotation.set(0, -a, 0);
      }
    }

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
    // L'arme reste pointée vers l'avant (contre-rotation de la posture et de la chute) et suit le pitch debout.
    this.weapon.rotation.x = -this.lean - this.fall * (Math.PI / 2) - f.pitch * (1 - k) * (1 - this.fall);
    this.weapon.visible = !f.carrier; // le porteur ne tire pas : le ballon prend la place de l'arme
    this.invulnShell.visible = p.invulnTicks > 0 || p.status === 'getting_up';
    // Clignotement quand il est touché.
    const since = this.hitAt < 0 ? Infinity : timeSec - this.hitAt;
    this.bodyMat.emissiveIntensity = since < STYLE.hitFlashSec ? STYLE.hitFlashIntensity * (1 - since / STYLE.hitFlashSec) : 0;
    if (this.invulnShell.visible) {
      this.invulnMat.opacity = STYLE.invulnOpacity + STYLE.invulnPulse * Math.sin(timeSec * STYLE.invulnPulseRate);
    }

    // Ombre au sol : plus petite et plus claire quand le joueur est en l'air.
    const air = Math.max(0, f.feet.y - f.ground);
    const fade = Math.max(0, 1 - air / STYLE.shadowFadeHeight);
    this.groundGroup.position.set(f.feet.x, f.ground + 0.015, f.feet.z);
    this.shadow.scale.setScalar(STYLE.playerShadowMinScale + (1 - STYLE.playerShadowMinScale) * fade);

    // Barre de stabilité : autres joueurs actifs, jauge non pleine.
    const ratio = Math.max(0, Math.min(1, p.stability / ROLES[this.role].stabilityMax));
    this.bar.visible = !this.isHuman && p.status === 'active' && ratio < 1 - 1e-6;
    if (this.bar.visible) {
      const w = STYLE.stabilityBarWidth;
      this.bar.position.set(f.feet.x, f.feet.y + PLAYER_HEIGHT * scaleY + STYLE.stabilityBarAboveHead, f.feet.z);
      this.barFill.scale.set(Math.max(1e-3, w * ratio), STYLE.stabilityBarHeight, 1);
      this.barFill.position.x = -w / 2 + (w * ratio) / 2;
      this.barFillMat.color.copy(ratio <= STYLE.stabilityBarLowFraction ? BAR_LOW : BAR_HIGH);
    }

    // Marqueur du porteur : flotte et tourne au-dessus de la tête.
    this.marker.visible = f.carrier;
    if (f.carrier) {
      const bob = Math.sin(timeSec * STYLE.markerBobRate) * STYLE.markerBobAmp;
      const lift = this.bar.visible ? STYLE.stabilityBarAboveHead : 0; // le losange passe au-dessus de la jauge
      this.marker.position.set(f.feet.x, f.feet.y + PLAYER_HEIGHT * scaleY + STYLE.markerAboveHead + lift + bob, f.feet.z);
      this.marker.rotation.y = timeSec * STYLE.markerSpinRate;
      this.marker.scale.setScalar(this.isHuman ? STYLE.markerHumanScale : 1); // plus discret au-dessus de sa propre tête
    }
  }
}
