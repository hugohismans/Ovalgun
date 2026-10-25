/**
 * Un personnage 3D animé (instance d'un modèle de CharacterLibrary) : skin appliquée (rendu toon, couleurs d'équipe),
 * contour cartoon sur les maillages animés, arme tenue en main, animations pilotées par l'état de la sim.
 *
 * Animation en couches (même squelette pour tous les modèles) :
 *  - bas du corps (bassin, jambes) : cycles de course mélangés selon la direction du déplacement par rapport au regard
 *    (avant / droite / arrière / gauche) ou immobile ;
 *  - haut du corps (buste, bras, tête) : arme pointée, tir, ou bras libres du porteur ;
 *  - corps entier : chute au plaquage (relevé = la chute jouée à l'envers), célébration ;
 *  - gestes ponctuels par-dessus : passe, coup de pied, tir reçu.
 * Puis des retouches procédurales (après le mixeur) : buste et tête qui suivent le pitch de visée, bras du porteur qui
 * serre le ballon, genoux repliés en l'air, bascule du corps en glissade / plongeon / esquive, tête agrandie.
 *
 * Repère du personnage : pieds à l'origine, regard vers +Z, droite = −X (même convention que la sim, vec.ts).
 */

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PlayerState, TeamId } from '../../sim';
import { CHARACTER_STYLE as CS, PALETTE } from '../palette';
import { approachExp, bodyMode, locomotionWeights, runTimeScale, type BodyMode } from './animState';
import { resolveSkinColor, type CharacterDef, type SkinDef, type WeaponShape } from './characterDefs';
import type { CharacterTemplate } from './CharacterLibrary';

/** Données de frame calculées par PlayerView (état interpolé). */
export interface CharacterFrame {
  pitch: number;
  /** Vitesse horizontale projetée sur l'avant / la droite du regard (m/s). */
  velFwd: number;
  velSide: number;
  carrier: boolean;
  /** Le joueur a tiré il y a peu. */
  shooting: boolean;
  celebrate: boolean;
}

const sanitize = (n: string): string => THREE.PropertyBinding.sanitizeNodeName(n);

const LOWER_CLIPS = { idle: 'Idle', forward: 'Run', back: 'Run_Back', left: 'Run_Left', right: 'Run_Right' } as const;
type LowerKey = keyof typeof LOWER_CLIPS;
const UPPER_CLIPS = { carryIdle: 'Idle', carryRun: 'Run', aim: 'Idle_Gun_Pointing', shoot: 'Idle_Gun_Shoot', throw: 'Punch_Right', hit: 'HitRecieve' } as const;
type UpperKey = keyof typeof UPPER_CLIPS;
const FULL_CLIPS = { death: 'Death', wave: 'Wave', kick: 'Kick_Right' } as const;
type FullKey = keyof typeof FULL_CLIPS;

const AX_RIGHT = new THREE.Vector3(-1, 0, 0);
const AX_FWD = new THREE.Vector3(0, 0, 1);

/** Construit l'arme tenue en main (axe du canon = +Z local, crosse à l'origine). */
function buildWeapon(shape: WeaponShape, body: THREE.Material, accent: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  const tube = (r: number, len: number, m: THREE.Material, x: number, y: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), m);
    mesh.position.set(x, y, z + len / 2);
    g.add(mesh);
  };
  if (shape === 'smg') {
    box(0.07, 0.1, 0.32, body, 0, 0.02, 0.1);
    box(0.05, 0.11, 0.06, dark, 0, -0.07, 0.03); // poignée
    box(0.045, 0.14, 0.05, accent, 0, -0.07, 0.14); // chargeur
    tube(0.018, 0.14, dark, 0, 0.03, 0.26); // canon
  } else if (shape === 'shotgun') {
    box(0.1, 0.12, 0.42, body, 0, 0.02, 0.12);
    box(0.06, 0.12, 0.07, dark, 0, -0.08, 0.0);
    tube(0.035, 0.3, dark, 0, 0.04, 0.3);
    box(0.08, 0.06, 0.16, accent, 0, -0.03, 0.34); // pompe
  } else {
    box(0.09, 0.1, 0.3, body, 0, 0.0, 0.08);
    box(0.06, 0.12, 0.07, dark, 0, -0.08, 0.0);
    tube(0.075, 0.34, accent, 0, 0.05, 0.12);
  }
  return g;
}

export class CharacterModel {
  /** Racine aux pieds, regard vers +Z. */
  readonly root = new THREE.Group();
  /** Matériaux propres à l'instance (estompage en alpha hash, clignotement). */
  readonly materials: THREE.Material[] = [];
  private readonly tilt = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly toon: THREE.MeshToonMaterial[] = [];
  private readonly outlineMat: THREE.MeshBasicMaterial;
  private readonly outlineWidth = { value: CS.outlineWidth as number };
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly lower = new Map<LowerKey, THREE.AnimationAction>();
  private readonly upper = new Map<UpperKey, THREE.AnimationAction>();
  private readonly full = new Map<FullKey, THREE.AnimationAction>();
  private readonly weights = new Map<THREE.AnimationAction, number>();
  /** Poids cibles de la frame (réutilisé : pas d'allocation par frame). */
  private readonly target = new Map<THREE.AnimationAction, number>();
  private readonly bone: Record<string, THREE.Bone | undefined> = {};
  private readonly weapon: THREE.Group;
  private mode: BodyMode = 'locomotion';
  private throwT = 0;
  private kickT = 0;
  private hitT = 0;
  private tiltX = 0;
  private tiltZ = 0;
  private air = 0;
  private carry = 0;
  private readonly headScale: number;
  private readonly getupSec: number;

  constructor(
    template: CharacterTemplate,
    clips: readonly THREE.AnimationClip[],
    def: CharacterDef,
    skin: SkinDef,
    team: TeamId,
    gradient: THREE.Texture,
    getupSec: number,
  ) {
    this.headScale = def.headScale;
    this.getupSec = getupSec;
    this.model = SkeletonUtils.clone(template.scene);
    this.model.scale.setScalar(def.scale);
    this.root.add(this.tilt);
    this.tilt.add(this.model);

    // Contour : maillage animé dupliqué, faces arrière, poussé le long des normales APRÈS le skinning.
    this.outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide, alphaHash: true });
    this.outlineMat.onBeforeCompile = (sh) => {
      sh.uniforms.outlineWidth = this.outlineWidth;
      sh.vertexShader = `uniform float outlineWidth;\n${sh.vertexShader}`.replace(
        '#include <skinning_vertex>',
        '#include <skinning_vertex>\ntransformed += normalize( objectNormal ) * outlineWidth;',
      );
    };
    this.materials.push(this.outlineMat);

    // Skin : un matériau toon par nom de matériau du modèle.
    const byName = new Map<string, THREE.MeshToonMaterial>();
    const hidden = new Set((skin.hidden ?? []).map(sanitize));
    const skinned: THREE.SkinnedMesh[] = [];
    this.model.traverse((o) => {
      if (hidden.has(o.name)) o.visible = false;
      if (o instanceof THREE.Bone) this.bone[o.name] = o;
      if (!(o instanceof THREE.Mesh)) return;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const name = src.name;
      let m = byName.get(name);
      if (m === undefined) {
        const ref = skin.colors[name];
        const original = src instanceof THREE.MeshStandardMaterial ? src.color : new THREE.Color('#ffffff');
        m = new THREE.MeshToonMaterial({ color: ref !== undefined ? resolveSkinColor(ref, team) : original, gradientMap: gradient, alphaHash: true });
        m.name = name;
        m.emissive.set(PALETTE.hitFlash);
        m.emissiveIntensity = 0;
        byName.set(name, m);
        this.toon.push(m);
        this.materials.push(m);
      }
      o.material = m;
      o.frustumCulled = false; // boîte englobante de la pose de repos : évite les disparitions pendant les animations
      if (o instanceof THREE.SkinnedMesh) skinned.push(o);
    });
    for (const s of skinned) {
      const outline = new THREE.SkinnedMesh(s.geometry, this.outlineMat);
      outline.bind(s.skeleton, s.bindMatrix);
      outline.frustumCulled = false;
      outline.visible = s.visible;
      s.parent?.add(outline);
      outline.position.copy(s.position);
      outline.quaternion.copy(s.quaternion);
      outline.scale.copy(s.scale);
    }

    // Arme (construite en code), placée chaque frame au poignet droit et orientée selon la visée.
    const toon = (color: string): THREE.MeshToonMaterial => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, alphaHash: true });
      this.toon.push(m);
      this.materials.push(m);
      return m;
    };
    this.weapon = buildWeapon(def.weapon, toon(PALETTE.weapon), toon(PALETTE.teams[team].main), toon(PALETTE.teams[team].dark));
    this.weapon.scale.setScalar(CS.gunScale);
    this.weapon.traverse((o) => {
      if (o instanceof THREE.Mesh) this.geometries.push(o.geometry);
    });
    this.root.add(this.weapon);

    // Animations : clips filtrés en couches (haut du corps = buste et ses descendants).
    const upperBones = new Set<string>();
    const chest = this.bone[sanitize('Chest')];
    chest?.traverse((o) => upperBones.add(o.name));
    const filtered = (clipName: string, keep: (bone: string) => boolean): THREE.AnimationClip | null => {
      const clip = clips.find((c) => c.name === clipName);
      if (clip === undefined) return null;
      const tracks = clip.tracks.filter((t) => keep(t.name.split('.')[0]));
      return new THREE.AnimationClip(`${clipName}#${keep === isUpper ? 'up' : 'low'}`, clip.duration, tracks);
    };
    const isUpper = (b: string): boolean => upperBones.has(b);
    const isLower = (b: string): boolean => !upperBones.has(b);
    this.mixer = new THREE.AnimationMixer(this.model);
    const start = (clip: THREE.AnimationClip | null | undefined, loop: boolean): THREE.AnimationAction | null => {
      if (clip === null || clip === undefined) return null;
      const a = this.mixer.clipAction(clip);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      if (!loop) a.paused = true;
      this.weights.set(a, 0);
      return a;
    };
    for (const k of Object.keys(LOWER_CLIPS) as LowerKey[]) {
      const a = start(filtered(LOWER_CLIPS[k], isLower), true);
      if (a !== null) this.lower.set(k, a);
    }
    for (const k of Object.keys(UPPER_CLIPS) as UpperKey[]) {
      const once = k === 'throw' || k === 'hit';
      const a = start(filtered(UPPER_CLIPS[k], isUpper), !once);
      if (a !== null) this.upper.set(k, a);
    }
    for (const k of Object.keys(FULL_CLIPS) as FullKey[]) {
      const a = start(clips.find((c) => c.name === FULL_CLIPS[k]), k === 'wave');
      if (a !== null) this.full.set(k, a);
    }
  }

  /** Geste ponctuel déclenché par un événement de la sim. */
  gesture(kind: 'pass' | 'kick' | 'hit'): void {
    const restart = (a: THREE.AnimationAction | undefined): void => {
      if (a === undefined) return;
      a.reset();
      a.paused = false;
      a.play();
    };
    if (kind === 'pass') {
      this.throwT = CS.throwSec;
      restart(this.upper.get('throw'));
    } else if (kind === 'kick') {
      this.kickT = CS.kickSec;
      restart(this.full.get('kick'));
    } else {
      this.hitT = CS.hitSec;
      restart(this.upper.get('hit'));
    }
  }

  /** Clignotement (tir reçu) : intensité émissive 0..1+. */
  setFlash(intensity: number): void {
    for (const m of this.toon) m.emissiveIntensity = intensity;
  }

  /** Contour : couleur et épaisseur (halo d'invulnérabilité). */
  setOutline(color: THREE.ColorRepresentation, width: number): void {
    this.outlineMat.color.set(color);
    this.outlineWidth.value = width;
  }

  /** Position monde de la tête (étoiles du joueur au sol). */
  headWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.bone[sanitize('Head')];
    return h !== undefined ? h.getWorldPosition(out) : this.root.getWorldPosition(out).setY(out.y + 1.6);
  }

  update(p: PlayerState, f: CharacterFrame, dt: number): void {
    const mode = bodyMode({ status: p.status, move: p.move, onGround: p.onGround, celebrate: f.celebrate });
    this.enterMode(mode);
    this.throwT = Math.max(0, this.throwT - dt);
    this.kickT = Math.max(0, this.kickT - dt);
    this.hitT = Math.max(0, this.hitT - dt);

    // --- Poids cibles ---
    const target = this.target;
    target.clear();
    const set = (a: THREE.AnimationAction | undefined, w: number): void => {
      if (a !== undefined) target.set(a, (target.get(a) ?? 0) + w);
    };
    const speed = Math.hypot(f.velFwd, f.velSide);
    let fullW = 0;
    if (mode === 'down' || mode === 'getup') {
      set(this.full.get('death'), 1);
      fullW = 1;
    } else if (mode === 'celebrate') {
      set(this.full.get('wave'), 1);
      fullW = 1;
    } else if (this.kickT > 0) {
      const k = Math.min(1, this.kickT / 0.15, (CS.kickSec - this.kickT) / 0.08 + 0.2);
      set(this.full.get('kick'), k);
      fullW = k;
    }
    const rest = 1 - fullW;
    if (rest > 0) {
      // Bas du corps.
      const lowGround = mode === 'air' || mode === 'slide' || mode === 'dive';
      const lw = lowGround
        ? { idle: 1, forward: 0, back: 0, left: 0, right: 0 }
        : locomotionWeights(f.velFwd, f.velSide, CS.idleSpeed, CS.runBlendSpeed);
      for (const k of Object.keys(LOWER_CLIPS) as LowerKey[]) set(this.lower.get(k), lw[k] * rest);
      // Haut du corps : gestes ponctuels par-dessus la posture de base.
      const throwW = this.throwT > 0 ? Math.min(1, this.throwT / 0.12) : 0;
      const hitW = this.hitT > 0 && throwW === 0 ? CS.hitWeight * Math.min(1, this.hitT / 0.1) : 0;
      const baseW = rest * (1 - throwW - hitW);
      set(this.upper.get('throw'), rest * throwW);
      set(this.upper.get('hit'), rest * hitW);
      if (f.carrier) {
        const run = 1 - lw.idle;
        set(this.upper.get('carryRun'), baseW * run);
        set(this.upper.get('carryIdle'), baseW * (1 - run));
      } else {
        set(this.upper.get(f.shooting ? 'shoot' : 'aim'), baseW);
      }
    }

    // --- Lissage des poids et vitesses de lecture ---
    const blend = 1 - Math.exp(-CS.weightRate * dt);
    for (const [a, w] of this.weights) {
      const t = target.get(a) ?? 0;
      const nw = w + (t - w) * blend;
      this.weights.set(a, nw);
      a.setEffectiveWeight(nw);
    }
    const ts = mode === 'dodge' ? CS.dodgeTimeScale : runTimeScale(speed, CS.runClipSpeed, CS.runTimeScaleMin, CS.runTimeScaleMax);
    for (const k of ['forward', 'back', 'left', 'right'] as const) this.lower.get(k)?.setEffectiveTimeScale(ts);
    this.upper.get('carryRun')?.setEffectiveTimeScale(ts);
    this.mixer.update(dt);

    // --- Retouches procédurales ---
    this.applyPose(p, f, mode, dt);
  }

  private enterMode(mode: BodyMode): void {
    if (mode === this.mode) return;
    const death = this.full.get('death');
    if (death !== undefined) {
      if (mode === 'down') {
        death.reset();
        death.setEffectiveTimeScale(1);
        death.paused = false;
        death.play();
      } else if (mode === 'getup') {
        // Relevé : la chute jouée à l'envers sur la durée du relevé.
        const dur = death.getClip().duration;
        death.paused = false;
        death.time = dur;
        death.setEffectiveTimeScale(-dur / Math.max(0.1, this.getupSec));
        death.play();
      }
    }
    this.mode = mode;
  }

  private readonly qParent = new THREE.Quaternion();
  private readonly qInv = new THREE.Quaternion();
  private readonly qDelta = new THREE.Quaternion();
  private readonly qRoot = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  /** Tourne un os autour d'un axe exprimé dans le repère du personnage (indépendant des axes locaux du squelette). */
  private rotate(name: string, axisChar: THREE.Vector3, angle: number): void {
    const b = this.bone[sanitize(name)];
    if (b === undefined || b.parent === null || angle === 0) return;
    b.parent.getWorldQuaternion(this.qParent);
    this.axis.copy(axisChar).applyQuaternion(this.qRoot).normalize();
    this.qDelta.setFromAxisAngle(this.axis, angle);
    this.qInv.copy(this.qParent).invert();
    b.quaternion.premultiply(this.qInv.multiply(this.qDelta).multiply(this.qParent));
    b.updateMatrixWorld(true);
  }

  private applyPose(p: PlayerState, f: CharacterFrame, mode: BodyMode, dt: number): void {
    // Bascule du corps depuis les pieds : glissade (en arrière), plongeon (en avant), esquive (vers le dash).
    let tx = 0;
    let tz = 0;
    if (mode === 'slide') tx = CS.slideTilt;
    else if (mode === 'dive') tx = CS.diveTilt;
    else if (mode === 'dodge') {
      // moveDir est en repère monde : on le ramène dans le repère du personnage via le lacet du root (porté par le parent).
      this.root.getWorldQuaternion(this.qRoot);
      this.v.set(p.moveDir.x, 0, p.moveDir.z).applyQuaternion(this.qInv.copy(this.qRoot).invert());
      tx = CS.dodgeLean * this.v.z;
      tz = -CS.dodgeLean * this.v.x;
    }
    this.tiltX = approachExp(this.tiltX, tx, CS.poseRate, dt);
    this.tiltZ = approachExp(this.tiltZ, tz, CS.poseRate, dt);
    this.tilt.rotation.set(this.tiltX, 0, this.tiltZ);

    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.qRoot);

    // Tête un peu plus grosse (silhouette cartoon).
    this.bone[sanitize('Head')]?.scale.setScalar(this.headScale);

    const standing = mode === 'locomotion' || mode === 'air' || mode === 'dodge';
    // Buste et tête suivent le pitch de visée (le porteur regarde aussi où il va).
    if (standing && this.kickT === 0) {
      const pitch = f.pitch;
      this.rotate('Chest', AX_RIGHT, pitch * CS.aimChestFraction);
      this.rotate('Head', AX_RIGHT, pitch * CS.aimHeadFraction);
    }
    // Porteur : bras droit qui serre le ballon contre le flanc.
    this.carry = approachExp(this.carry, f.carrier && standing && this.throwT === 0 ? 1 : 0, CS.poseRate, dt);
    if (this.carry > 0.01) {
      this.rotate('UpperArm.R', AX_RIGHT, -CS.carryUpperArmForward * this.carry);
      this.rotate('UpperArm.R', AX_FWD, -CS.carryUpperArmIn * this.carry);
      this.rotate('LowerArm.R', AX_RIGHT, -CS.carryForearmBend * this.carry);
    }
    // En l'air : genoux repliés.
    this.air = approachExp(this.air, mode === 'air' ? 1 : 0, CS.poseRate, dt);
    if (this.air > 0.01) {
      for (const side of ['L', 'R'] as const) {
        this.rotate(`UpperLeg.${side}`, AX_RIGHT, -CS.airThigh * this.air);
        this.rotate(`LowerLeg.${side}`, AX_RIGHT, CS.airKnee * this.air);
      }
    }
    // Plongeon : bras tendus vers l'avant.
    if (mode === 'dive') {
      this.rotate('UpperArm.R', AX_RIGHT, -CS.diveArmsUp);
      this.rotate('UpperArm.L', AX_RIGHT, -CS.diveArmsUp);
    }

    // Arme : au poignet droit, pointée selon la visée ; rangée pour le porteur et au sol.
    const wrist = this.bone[sanitize('Wrist.R')];
    this.weapon.visible = !f.carrier && standing && wrist !== undefined;
    if (this.weapon.visible && wrist !== undefined) {
      wrist.getWorldPosition(this.v);
      this.root.worldToLocal(this.v);
      this.weapon.position.copy(this.v);
      this.weapon.position.z += CS.gunForward;
      this.weapon.rotation.set(-f.pitch, 0, 0);
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
  }
}
