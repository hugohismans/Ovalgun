/**
 * Joueurs (Three.js) : capsule couleur d'équipe à contour cartoon (inverted hull), visière sombre
 * orientée selon le yaw, arme côté droit (inclinée selon le pitch), signe distinctif du rôle sur la
 * tête, posture basse (capsule écrasée à la hauteur de la hitbox de la sim, PLAYER_LOW_HEIGHT, à peine
 * inclinée) en glissade / plongeon / au sol, ombre portée au sol,
 * anneau sous le joueur humain, losange au-dessus du porteur visible à travers le relief, halo pulsant pendant
 * l'invulnérabilité (plongeon, relevé : on voit d'un coup d'œil que le joueur est intouchable).
 * Étape 5 : clignotement quand il est touché (`flash`), barre de stabilité au-dessus de la tête des AUTRES joueurs
 * (visible quand la jauge n'est pas pleine), posture au sol COUCHÉE avec des étoiles qui tournent, puis relevé.
 * Étape 7 : bouclier frontal du pilier (même géométrie que la sim, shield.ts : arc de cylindre de rayon SHIELD_DISTANCE
 * sur ±SHIELD_HALF_ANGLE_DEG, des pieds à SHIELD_HEIGHT), translucide à la couleur de l'équipe, liseré blanc, qui
 * flashe quand il bloque (`shieldFlash`) ; il se déploie / se replie en STYLE.shieldDeploySec.
 *
 * Passe finale : estompage près de la caméra (`setFade`, calculé par le Renderer avec fadeMath.ts) — les matériaux du
 * corps, du contour, de la visière, de l'arme et du signe sont PROPRES à chaque joueur, en « alpha hash » (tramage stable
 * dans la passe opaque : pas de tri, pas de recompilation quand l'opacité change) ; halo d'invulnérabilité à la couleur
 * claire de l'équipe, faces arrière seulement (la couleur d'équipe du corps reste visible), pulsation lente, coupée sous
 * `prefers-reduced-motion` (`PlayerAssets.reducedMotion`).
 *
 * Géométries partagées (PlayerAssets). Aucune allocation par frame.
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
  SHIELD_DISTANCE,
  SHIELD_HALF_ANGLE_DEG,
  SHIELD_HEIGHT,
  shieldUp,
  type PlayerState,
  type Role,
  type TeamId,
  type Vec3,
} from '../sim';
import { SHIELD_FLASH, TEAM_MAIN } from './colors';
import { smoothstep, type Point3 } from './fadeMath';
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
  /** Bouclier du pilier : arc de cylindre ouvert centré sur +Z local (forward), pieds à SHIELD_HEIGHT (origine au milieu). */
  readonly shield = new THREE.CylinderGeometry(
    SHIELD_DISTANCE,
    SHIELD_DISTANCE,
    SHIELD_HEIGHT,
    STYLE.shieldSegments,
    1,
    true,
    -SHIELD_HALF_ANGLE_DEG * (Math.PI / 180),
    2 * SHIELD_HALF_ANGLE_DEG * (Math.PI / 180),
  );
  /** Liseré du bouclier : arcs du haut et du bas + deux bords verticaux (segments). */
  readonly shieldRim = shieldRimGeometry();

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
  /** Préférence « animations réduites » du système (Renderer.setReducedMotion) : halo d'invulnérabilité sans pulsation. */
  reducedMotion = false;

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
      this.barBackMat,
      this.starMat,
    ];
    for (const m of mats) m.dispose();
    this.gradient.dispose();
    this.shield.dispose();
    this.shieldRim.dispose();
  }
}

/** Liseré du bouclier (LineSegments) : arcs à y = ±SHIELD_HEIGHT / 2 et deux bords verticaux, dans le repère du bouclier. */
function shieldRimGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  const half = SHIELD_HALF_ANGLE_DEG * (Math.PI / 180);
  const n = STYLE.shieldSegments;
  const hy = SHIELD_HEIGHT / 2;
  const at = (a: number, y: number): [number, number, number] => [SHIELD_DISTANCE * Math.sin(a), y, SHIELD_DISTANCE * Math.cos(a)];
  for (const y of [-hy, hy]) {
    for (let i = 0; i < n; i++) {
      const a0 = -half + (2 * half * i) / n;
      const a1 = -half + (2 * half * (i + 1)) / n;
      pts.push(...at(a0, y), ...at(a1, y));
    }
  }
  pts.push(...at(-half, -hy), ...at(-half, hy), ...at(half, -hy), ...at(half, hy));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
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

/**
 * Atténuation du halo d'invulnérabilité d'un joueur estompé : il disparaît plus vite que le corps (ses faces arrière se
 * verraient à travers le tramage du corps et le délaveraient).
 */
const haloFade = (k: number): number => smoothstep(STYLE.fadeDetailsBelow, 1, k);

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
  /** Matériaux propres (estompage) : corps, contour, visière, reflet, arme, signe, poignée. */
  private readonly fadeMats: THREE.Material[] = [];
  private readonly assets: PlayerAssets;
  /** Opacité d'estompage courante (1 : opaque) et opacités de base du halo / du bouclier calculées par `update`. */
  private fade = 1;
  private invulnBase = 0;
  private shieldBase = 0;
  private shieldRimBase = 0;
  private readonly barFill: THREE.Mesh;
  private readonly barFillMat: THREE.MeshBasicMaterial;
  private readonly dizzy = new THREE.Group();
  private readonly stars: THREE.Mesh[] = [];
  private readonly role: Role;
  private readonly team: TeamId;
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
  /** Bouclier (pilier seulement) : groupe, matériaux propres (flash), déploiement lissé 0..1, instant du dernier blocage. */
  private readonly shieldGroup: THREE.Group | null = null;
  private readonly shieldMat: THREE.MeshBasicMaterial | null = null;
  private readonly shieldRimMat: THREE.LineBasicMaterial | null = null;
  private shieldOpen = 0;
  private blockedAt = -1;

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
    this.team = team;
    this.assets = assets;
    // Copie propre au joueur, en alpha hash (estompage près de la caméra).
    const own = <M extends THREE.Material>(m: M): M => {
      const c = m.clone() as M;
      c.alphaHash = true;
      this.fadeMats.push(c);
      return c;
    };
    const outlineMat = own(assets.outlineMat);
    this.root.add(this.yawGroup);
    this.yawGroup.add(this.fallGroup);
    this.fallGroup.add(this.pose);

    // Corps + contour. Matériau propre (clignotement émissif quand il est touché).
    this.bodyMat = own(assets.teamMats[team]);
    this.bodyMat.emissive.set(PALETTE.hitFlash);
    this.bodyMat.emissiveIntensity = 0;
    const body = new THREE.Mesh(assets.capsule, this.bodyMat);
    const outline = new THREE.Mesh(assets.capsule, outlineMat);
    outline.scale.setScalar(STYLE.outlineScale);
    this.pose.add(body, outline);

    // Visière (avant = +Z local), à hauteur des yeux.
    const visor = new THREE.Mesh(assets.visor, own(assets.visorMat));
    visor.position.set(0, H * 0.31, R * 0.82);
    const glint = new THREE.Mesh(assets.glint, own(assets.glintMat));
    glint.position.set(-0.14, H * 0.31 + 0.04, R * 0.82 + 0.115);
    this.pose.add(visor, glint);

    // Arme côté droit (droite = −X local, cf. right(yaw)), inclinée selon le pitch.
    const gun = new THREE.Mesh(assets.weapons[role], own(assets.weaponMat));
    gun.position.set(0, 0, 0.22);
    const gunOutline = new THREE.Mesh(assets.weapons[role], outlineMat);
    gunOutline.position.copy(gun.position);
    gunOutline.scale.setScalar(1.18);
    const grip = new THREE.Mesh(assets.weapons.ailier, own(assets.teamDarkMats[team]));
    grip.scale.set(0.9, 0.9, 0.35);
    grip.position.set(0, -0.02, -0.08);
    this.weapon.add(gun, gunOutline, grip);
    this.weapon.position.set(-(R + 0.1), H * 0.12, 0.1);
    this.pose.add(this.weapon);

    // Signe du rôle sur la tête.
    const sign = new THREE.Mesh(assets.signs[role], own(assets.signMat));
    sign.position.set(0, H / 2 + (role === 'ailier' ? 0.12 : 0.02), role === 'ailier' ? -0.1 : 0);
    if (role === 'ailier') sign.rotation.x = -0.5;
    const signOutline = new THREE.Mesh(assets.signs[role], outlineMat);
    signOutline.position.copy(sign.position);
    signOutline.rotation.copy(sign.rotation);
    signOutline.scale.setScalar(1.2);
    this.pose.add(sign, signOutline);

    // Halo d'invulnérabilité (suit la posture : écrasé en plongeon comme la hitbox) : couleur claire de l'équipe, faces
    // arrière seulement => un liseré lumineux autour du corps, qui garde sa couleur d'équipe.
    this.invulnMat = new THREE.MeshBasicMaterial({
      color: PALETTE.teams[team].light,
      transparent: true,
      opacity: STYLE.invulnOpacity,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.invulnShell = new THREE.Mesh(assets.capsule, this.invulnMat);
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

    // Bouclier du pilier : sous le lacet (suit le regard), pas sous la posture (la sim le place des pieds à SHIELD_HEIGHT).
    if (role === 'pilier') {
      this.shieldMat = new THREE.MeshBasicMaterial({
        color: PALETTE.teams[team].main,
        transparent: true,
        opacity: STYLE.shieldOpacity,
        side: THREE.DoubleSide,
        // Une seule passe (sinon three.js dessine les faces arrière puis avant et recalcule le programme à chaque image).
        forceSinglePass: true,
        depthWrite: false,
      });
      this.shieldRimMat = new THREE.LineBasicMaterial({ color: PALETTE.shieldRim, transparent: true, opacity: STYLE.shieldRimOpacity });
      const panel = new THREE.Mesh(assets.shield, this.shieldMat);
      panel.renderOrder = 3;
      const rim = new THREE.LineSegments(assets.shieldRim, this.shieldRimMat);
      rim.renderOrder = 4;
      this.shieldGroup = new THREE.Group();
      this.shieldGroup.add(panel, rim);
      this.shieldGroup.position.y = SHIELD_HEIGHT / 2;
      this.shieldGroup.visible = false;
      this.yawGroup.add(this.shieldGroup);
    }
  }

  /** Le bouclier de ce joueur vient de bloquer un tir / une explosion : flash (STYLE.shieldFlashSec). */
  shieldFlash(timeSec: number): void {
    this.blockedAt = timeSec;
  }

  /** Le joueur vient d'être touché : clignotement (STYLE.hitFlashSec). */
  flash(timeSec: number): void {
    this.hitAt = timeSec;
  }

  /** Oriente la barre de stabilité vers la caméra (après la mise à jour de la caméra). */
  faceCamera(q: THREE.Quaternion): void {
    if (this.bar.visible) this.bar.quaternion.copy(q);
  }

  /**
   * Axe du corps affiché (pour l'estompage) : `base` = centre de la sphère basse, `top` = centre de la sphère haute
   * (posture basse et chute visuelle comprises ; couché, l'axe est horizontal vers l'avant du plaquage).
   */
  bodyAxis(base: Point3, top: Point3): void {
    const R = PLAYER_RADIUS;
    const len = Math.max(0, PLAYER_HEIGHT * this.pose.scale.y - 2 * R);
    const fall = this.fall * (Math.PI / 2);
    const yaw = this.yawGroup.rotation.y;
    const p = this.root.position;
    // Rotation de la chute autour de l'axe X local (vers +Z local = forward(yaw)), puis lacet.
    const up = Math.cos(fall);
    const fwd = Math.sin(fall);
    base.x = p.x;
    base.y = p.y + R;
    base.z = p.z;
    top.x = base.x + Math.sin(yaw) * fwd * len;
    top.y = base.y + up * len;
    top.z = base.z + Math.cos(yaw) * fwd * len;
  }

  /**
   * Opacité d'estompage pour cette frame (APRÈS `update`) : matériaux en alpha hash, halo et bouclier atténués, barre de
   * stabilité et étoiles masquées sous STYLE.fadeDetailsBelow, joueur masqué sous STYLE.fadeHideBelow.
   */
  setFade(f: number): void {
    const k = Math.min(1, Math.max(0, f));
    if (k !== this.fade) {
      this.fade = k;
      for (const m of this.fadeMats) m.opacity = k; // corps compris
    }
    this.root.visible = k > STYLE.fadeHideBelow;
    if (k < STYLE.fadeDetailsBelow) {
      this.bar.visible = false;
      this.dizzy.visible = false;
    }
    this.invulnMat.opacity = this.invulnBase * haloFade(k);
    if (this.shieldMat !== null && this.shieldRimMat !== null) {
      this.shieldMat.opacity = this.shieldBase * k;
      this.shieldRimMat.opacity = this.shieldRimBase * k;
    }
  }

  dispose(): void {
    for (const m of this.fadeMats) m.dispose();
    this.invulnMat.dispose();
    this.barFillMat.dispose();
    this.shieldMat?.dispose();
    this.shieldRimMat?.dispose();
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
    const pulse = this.assets.reducedMotion ? 0 : STYLE.invulnPulse * Math.sin(timeSec * STYLE.invulnPulseRate);
    this.invulnBase = STYLE.invulnOpacity + pulse;
    this.invulnMat.opacity = this.invulnBase * haloFade(this.fade);

    // Bouclier : se déploie (largeur et hauteur) quand il est levé, flashe quand il bloque.
    if (this.shieldGroup !== null && this.shieldMat !== null && this.shieldRimMat !== null) {
      const target = shieldUp(p) ? 1 : 0;
      this.shieldOpen = target + (this.shieldOpen - target) * Math.exp(-dt / STYLE.shieldDeploySec);
      if (Math.abs(this.shieldOpen - target) < 1e-3) this.shieldOpen = target;
      this.shieldGroup.visible = this.shieldOpen > 0.01;
      if (this.shieldGroup.visible) {
        const k = this.shieldOpen;
        this.shieldGroup.scale.set(k, 0.4 + 0.6 * k, k);
        this.shieldGroup.position.y = (SHIELD_HEIGHT / 2) * (0.4 + 0.6 * k);
        const since = this.blockedAt < 0 ? Infinity : timeSec - this.blockedAt;
        const flash = since < STYLE.shieldFlashSec ? 1 - since / STYLE.shieldFlashSec : 0;
        const shimmer = STYLE.shieldShimmer * Math.sin(timeSec * STYLE.shieldShimmerRate);
        this.shieldBase = Math.min(1, (STYLE.shieldOpacity + shimmer) * k + STYLE.shieldFlashOpacity * flash);
        this.shieldRimBase = Math.min(1, STYLE.shieldRimOpacity * k + flash);
        this.shieldMat.opacity = this.shieldBase * this.fade;
        this.shieldMat.color.copy(flash > 0.5 ? SHIELD_FLASH : TEAM_MAIN[this.team]);
        this.shieldRimMat.opacity = this.shieldRimBase * this.fade;
      }
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
