/**
 * Rendu Three.js du match. Lit deux MatchState (précédent / courant) et interpole avec alpha ;
 * n'écrit JAMAIS dans l'état. Style flat coloré : ciel en dégradé vif, lumières hémisphérique +
 * directionnelle, brouillard léger, couleurs saturées (palette.ts).
 * Étape 4 : indicateurs du porteur local (cible de la passe assistée recalculée à chaque frame avec le yaw
 * courant, cône de passe, point de chute du coup de pied) et effets des événements (`handleEvents`).
 * Étape 5 : traceurs, flashs, étincelles, éclats de plaquage (CombatFxView), joueur touché qui clignote,
 * barres de stabilité face caméra, posture au sol (PlayerView).
 * Étape 7 : bouclier du pilier (PlayerView, flash sur 'blocked'), grenades et explosions (CombatFxView), zones de
 * ralentissement et aperçus du demi local — point de pose de la zone quand la capacité est prête, point d'impact de la
 * grenade en visée (ZoneView) ; zone de capture de la mêlée (ScrumView : rayon exact, répartition, progression,
 * prolongation).
 * Étape 8 : caméra « spectateur » (`ViewInput.spectator` : fond du menu, match bots contre bots, SpectatorCamera) et
 * lectures pour le HUD : position affichée du ballon (`ballDisplayPos`), passage en repère caméra (`toCameraSpace`),
 * champ de vision (`tanHalfFovY`) — la mini-flèche vers le ballon hors champ (src/game/ballArrow.ts).
 * Passe finale : joueurs estompés près de la caméra et entre la caméra et le joueur local, joueur local estompé quand la
 * caméra vient contre lui (`updateFades`, fadeMath.ts) ; risque de la passe assistée (`passRisk`, couleur des indicateurs) ;
 * rapport de pixels réappliqué à chaque `resize()` (zoom, écran HiDPI) ; préférence « animations réduites ».
 */

import * as THREE from 'three';
import {
  aimDir,
  aimOrigin,
  canCarrierAct,
  canShoot,
  carryPosition,
  groundHeight,
  kickLaunch,
  passAimDirection,
  playerHeight,
  predictBallLanding,
  predictGrenadeImpact,
  ROLES,
  BOT_PASS_MIN_OPENNESS,
  BOT_PASS_MIN_OPENNESS_OWN_THIRD,
  PLAYER_RADIUS,
  selectPassTarget,
  slowZonePlacement,
  type MatchEvent,
  type MatchState,
  type Vec3,
} from '../sim';
import { BallView } from './BallView';
import { CombatFxView } from './CombatFxView';
import { FieldView } from './FieldView';
import { localFade, occluderFade, pointSegmentDistance, segmentSegmentDistance, type Point3 } from './fadeMath';
import { FxView } from './FxView';
import { lerpPos, lerpYaw } from './interpolate';
import { PALETTE, STYLE } from './palette';
import { PassIndicatorView, type PassIndicatorFrame } from './PassIndicatorView';
import { characterLibrary } from './characters/CharacterLibrary';
import { PlayerAssets, PlayerView, type PlayerFrame } from './PlayerView';
import { ShoulderCamera } from './ShoulderCamera';
import { SpectatorCamera } from './SpectatorCamera';
import { ScrumView } from './ScrumView';
import { ZoneView, type AimPreviewFrame } from './ZoneView';

/** Paramètres de caméra du joueur local pour une frame. */
export interface ViewInput {
  /** Id du joueur suivi par la caméra. */
  localId: number;
  /** Orientation courante (souris / manette), non interpolée. */
  yaw: number;
  pitch: number;
  aiming: boolean;
  /**
   * Étape 8 : caméra spectateur (vue de biais qui suit le ballon, fond du menu) au lieu de la caméra épaule ; les
   * indicateurs du joueur local (passe, aperçus du demi) sont masqués.
   */
  spectator?: boolean;
}

/**
 * Risque de la passe assistée (passe finale), d'après le démarquage du receveur (`openness`) et les seuils des bots :
 * 0 = démarqué (≥ BOT_PASS_MIN_OPENNESS), 1 = risqué, 2 = marqué (< BOT_PASS_MIN_OPENNESS_OWN_THIRD, passe que les bots
 * ne tentent jamais : interceptée plus d'une fois sur deux sous 0,15).
 */
export type PassRisk = 0 | 1 | 2;
export function passRiskOf(openness: number): PassRisk {
  return openness >= BOT_PASS_MIN_OPENNESS ? 0 : openness >= BOT_PASS_MIN_OPENNESS_OWN_THIRD ? 1 : 2;
}

/** Ciel : sphère à dégradé vertical (haut / horizon / bas), sans brouillard. */
function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uBottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = normalize(position);',
      '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = p.xyww;', // toujours au fond
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;',
      'varying vec3 vDir;',
      'void main() {',
      '  float h = vDir.y;',
      '  vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

/**
 * Décor : tribunes en gradins autour de l'arène (couleurs d'équipe derrière les en-buts, violet / rose
 * le long des touches), loin des murs invisibles. Purement décoratif.
 */
function createBackdrop(width: number, length: number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mats = new Map<string, THREE.MeshLambertMaterial>();
  const mat = (c: string): THREE.MeshLambertMaterial => {
    let m = mats.get(c);
    if (m === undefined) {
      m = new THREE.MeshLambertMaterial({ color: c });
      mats.set(c, m);
    }
    return m;
  };
  const gap = STYLE.standsGap; // distance entre la bordure et le premier gradin (m)
  const tiers = STYLE.standsTiers;
  const depth = STYLE.standsDepth;
  const rise = STYLE.standsRise;
  // side : 0 = −Z (équipe 0), 1 = +Z (équipe 1), 2 = −X, 3 = +X.
  for (let side = 0; side < 4; side++) {
    const alongZ = side >= 2;
    const span = (alongZ ? length : width) + 2 * gap;
    const base = (alongZ ? width : length) / 2 + gap;
    const colors =
      side === 0
        ? [PALETTE.teams[0].main, PALETTE.teams[0].light]
        : side === 1
          ? [PALETTE.teams[1].main, PALETTE.teams[1].light]
          : [PALETTE.backdropA, PALETTE.backdropB];
    const sign = side === 0 || side === 2 ? -1 : 1;
    for (let t = 0; t < tiers; t++) {
      const m = new THREE.Mesh(box, mat(colors[t % 2]));
      const h = rise * (t + 1);
      const len = span + 2 * depth * t;
      const off = sign * (base + depth * (t + 0.5));
      if (alongZ) {
        m.scale.set(depth, h, len);
        m.position.set(off, h / 2, 0);
      } else {
        m.scale.set(len, h, depth);
        m.position.set(0, h / 2, off);
      }
      g.add(m);
    }
  }
  g.userData.dispose = () => {
    box.dispose();
    for (const m of mats.values()) m.dispose();
  };
  return g;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly shoulder: ShoulderCamera;
  private readonly spectatorCam = new SpectatorCamera();
  private readonly tmpVec = new THREE.Vector3();
  private readonly assets = new PlayerAssets();
  /** Personnages 3D (chargés en tâche de fond ; capsules en attendant). */
  private readonly characters = characterLibrary();
  private field: FieldView | null = null;
  private backdrop: THREE.Group | null = null;
  private players: PlayerView[] = [];
  private readonly ball = new BallView();
  private readonly passIndicator = new PassIndicatorView();
  private readonly fx = new FxView();
  private readonly combatFx = new CombatFxView();
  private readonly zones = new ZoneView();
  private readonly scrum = new ScrumView();
  private readonly aimPreview: AimPreviewFrame = { zone: null, grenade: null, team: 0 };
  private readonly zonePreviewPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly sky = createSky();
  /** Cible de la passe assistée affichée à la dernière frame (-1 : aucune, ou le joueur local ne porte pas). */
  passTargetId = -1;
  /** Risque de cette passe (passRiskOf ; 0 sans cible). */
  passRisk: PassRisk = 0;
  /** Joueur humain du match (éclat de plaquage réduit) ; -1 en fond de menu. */
  private humanId = -1;
  // Objets de travail de l'estompage.
  private readonly fadeBase: Point3 = { x: 0, y: 0, z: 0 };
  private readonly fadeTop: Point3 = { x: 0, y: 0, z: 0 };
  private readonly lineEnd: Point3 = { x: 0, y: 0, z: 0 };
  /** Pieds interpolés de chaque joueur pour la frame courante (indicateurs). */
  private interpFeet: Vec3[] = [];
  private readonly kickLandingShifted: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly passFrame: PassIndicatorFrame = {
    visible: false,
    team: 0,
    carrierFeet: { x: 0, y: 0, z: 0 },
    carrierGround: 0,
    aim: { x: 0, z: -1 },
    targetFeet: null,
    targetHeight: 0,
    kickLanding: null,
    risk: 0,
  };
  // Objets de travail réutilisés à chaque frame.
  private readonly feet: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly ballPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly vel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly frame: PlayerFrame = { feet: this.feet, yaw: 0, pitch: 0, ground: 0, carrier: false, vel: this.vel, celebrate: false };
  private readonly localFeet: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.shoulder = new ShoulderCamera(1);

    this.scene.background = new THREE.Color(PALETTE.skyHorizon);
    this.scene.fog = new THREE.Fog(PALETTE.fog, STYLE.fogNear, STYLE.fogFar);
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, STYLE.hemiIntensity));
    const sun = new THREE.DirectionalLight(PALETTE.sun, STYLE.sunIntensity);
    sun.position.set(18, 30, -10);
    this.scene.add(sun);
    this.scene.add(this.ball.group, this.passIndicator.group, this.fx.group, this.combatFx.group, this.zones.group, this.scrum.group);
    this.resize();
    void this.characters.load();
  }

  /** (Re)construit le terrain et les joueurs pour un match. */
  setMatch(state: MatchState, humanId: number): void {
    this.clearMatch();
    this.humanId = humanId;
    this.ball.reset();
    this.field = new FieldView(state.field);
    this.scene.add(this.field.group);
    this.backdrop = createBackdrop(state.field.width, state.field.length);
    this.scene.add(this.backdrop);
    this.players = state.players.map((p) => {
      const v = new PlayerView(this.assets, p.id, p.team, p.role, p.id === humanId, this.characters);
      this.scene.add(v.root, v.groundGroup, v.marker, v.bar);
      return v;
    });
    this.interpFeet = state.players.map(() => ({ x: 0, y: 0, z: 0 }));
    this.spectatorCam.reset();
  }

  /** Position AFFICHÉE du ballon à la dernière frame (interpolée, ballon porté replacé sur le porteur). */
  get ballDisplayPos(): Readonly<Vec3> {
    return this.ballPos;
  }

  /** Point du monde dans le repère de la caméra de la dernière frame (x droite, y haut, la caméra regarde vers −z). */
  toCameraSpace(p: Readonly<Vec3>, out: Vec3): Vec3 {
    const cam = this.shoulder.camera;
    this.tmpVec.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse);
    out.x = this.tmpVec.x;
    out.y = this.tmpVec.y;
    out.z = this.tmpVec.z;
    return out;
  }

  /** Tangente du demi-angle vertical du champ de vision courant. */
  get tanHalfFovY(): number {
    return Math.tan((this.shoulder.camera.fov * Math.PI) / 360);
  }

  /** Taille d'affichage du canvas (px CSS). */
  get viewportWidth(): number {
    return Math.max(1, this.canvas.clientWidth);
  }

  get viewportHeight(): number {
    return Math.max(1, this.canvas.clientHeight);
  }

  private clearMatch(): void {
    if (this.field !== null) {
      this.scene.remove(this.field.group);
      this.field.dispose();
      this.field = null;
    }
    if (this.backdrop !== null) {
      this.scene.remove(this.backdrop);
      (this.backdrop.userData.dispose as () => void)();
      this.backdrop = null;
    }
    for (const v of this.players) {
      this.scene.remove(v.root, v.groundGroup, v.marker, v.bar);
      v.dispose();
    }
    this.players = [];
  }

  /** Préférence système « animations réduites » : halo d'invulnérabilité sans pulsation. */
  setReducedMotion(reduced: boolean): void {
    this.assets.reducedMotion = reduced;
  }

  /**
   * Adapte la taille du rendu à celle du canvas (CSS) et au rapport de pixels courant (zoom du navigateur, fenêtre passée
   * sur un écran HiDPI : la session rappelle resize() quand `devicePixelRatio` change, même sans redimensionnement).
   */
  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, STYLE.maxPixelRatio);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.shoulder.setAspect(w / h);
  }

  /**
   * Dessine une frame : interpolation prev -> curr avec `alpha` (0..1), caméra épaule sur le
   * joueur local avec son orientation courante.
   */
  render(prev: MatchState, curr: MatchState, alpha: number, view: ViewInput, dt: number, timeSec: number): void {
    const a = Math.min(1, Math.max(0, alpha));
    const field = curr.field;
    const carrierId = curr.ball.mode === 'carried' ? curr.ball.carrierId : -1;

    for (let i = 0; i < curr.players.length; i++) {
      const pc = curr.players[i];
      const pp = prev.players[i] ?? pc;
      const v = this.players[i];
      if (v === undefined) continue;
      lerpPos(this.feet, pp.pos, pc.pos, a);
      const local = pc.id === view.localId;
      this.frame.yaw = local ? view.yaw : lerpYaw(pp.yaw, pc.yaw, a);
      this.frame.pitch = local ? view.pitch : pp.pitch + (pc.pitch - pp.pitch) * a;
      this.frame.ground = groundHeight(field, this.feet.x, this.feet.z);
      this.frame.carrier = pc.id === carrierId;
      lerpPos(this.vel, pp.vel, pc.vel, a);
      // Pause d'essai : l'équipe qui a marqué célèbre (kickoffTeam = l'équipe qui a encaissé).
      this.frame.celebrate = curr.phase === 'try' && pc.team !== curr.kickoffTeam;
      v.update(pc, this.frame, dt, timeSec);
      const cache = this.interpFeet[i];
      if (cache !== undefined) {
        cache.x = this.feet.x;
        cache.y = this.feet.y;
        cache.z = this.feet.z;
      }
      if (local) {
        this.localFeet.x = this.feet.x;
        this.localFeet.y = this.feet.y;
        this.localFeet.z = this.feet.z;
      }
    }

    // Caméra épaule (avant le ballon : la traînée s'oriente vers la caméra).
    const lp = curr.players[view.localId];
    const lpPrev = prev.players[view.localId] ?? lp;
    const spectator = view.spectator ?? false;
    if (lp !== undefined && !spectator) {
      const vx = lpPrev.vel.x + (lp.vel.x - lpPrev.vel.x) * a;
      const vz = lpPrev.vel.z + (lp.vel.z - lpPrev.vel.z) * a;
      this.shoulder.update(
        field,
        this.localFeet,
        view.yaw,
        view.pitch,
        { aiming: view.aiming, carrier: lp.id === carrierId, speed: Math.hypot(vx, vz), runSpeed: ROLES[lp.role].runSpeed },
        dt,
      );
    }

    // Ballon : un ballon porté suit exactement le porteur interpolé (yaw courant pour le joueur local).
    let carrierYaw: number | null = null;
    const c = carrierId >= 0 ? curr.players[carrierId] : undefined;
    if (c !== undefined) {
      // Même placement que la sim (carryPosition de ball.ts), à partir du porteur interpolé et de son yaw visuel.
      const cp = prev.players[carrierId] ?? c;
      carrierYaw = c.id === view.localId ? view.yaw : lerpYaw(cp.yaw, c.yaw, a);
      lerpPos(this.feet, cp.pos, c.pos, a);
      carryPosition(this.feet, carrierYaw, this.ballPos);
    } else {
      lerpPos(this.ballPos, prev.ball.pos, curr.ball.pos, a);
    }
    const ballGround = groundHeight(field, this.ballPos.x, this.ballPos.z);
    if (spectator) {
      this.spectatorCam.update(this.shoulder.camera, field, this.ballPos, dt, timeSec);
      this.shoulder.camera.updateMatrixWorld();
    }
    this.ball.update(curr.ball, prev.ball, a, this.ballPos, carrierYaw, ballGround, this.shoulder.camera.position, timeSec);

    this.updatePassIndicator(curr, view, carrierId, timeSec);
    this.fx.update(timeSec, this.shoulder.camera);
    this.combatFx.update(curr, a, this.shoulder.camera, dt, timeSec);
    this.updateAimPreview(curr, view);
    this.zones.update(curr, this.aimPreview, timeSec);
    this.scrum.update(curr.scrum, a, timeSec);
    this.updateFades(view);
    for (const v of this.players) v.faceCamera(this.shoulder.camera.quaternion);

    this.sky.position.copy(this.shoulder.camera.position);
    this.renderer.render(this.scene, this.shoulder.camera);
  }

  /**
   * Estompage (passe finale, fadeMath.ts) : chaque joueur selon la distance de la caméra à la surface de sa capsule
   * affichée ; les autres aussi selon leur distance au segment caméra -> dos du joueur local (pivot de la caméra moins
   * STYLE.lineFadeBehind le long du regard). Rien en caméra spectateur.
   */
  private updateFades(view: ViewInput): void {
    const pose = this.shoulder.lastPose;
    if (view.spectator === true || pose === null) {
      for (const v of this.players) v.setFade(1);
      return;
    }
    const cam = this.shoulder.camera.position;
    const behind = Math.min(STYLE.lineFadeBehind, pose.distance);
    const hasLine = pose.distance - behind > 1e-3;
    this.lineEnd.x = pose.origin.x - pose.dir.x * behind;
    this.lineEnd.y = pose.origin.y + pose.raise - pose.dir.y * behind;
    this.lineEnd.z = pose.origin.z - pose.dir.z * behind;
    for (const v of this.players) {
      v.bodyAxis(this.fadeBase, this.fadeTop);
      const bodyDist = pointSegmentDistance(cam, this.fadeBase, this.fadeTop) - PLAYER_RADIUS;
      if (v.id === view.localId) {
        v.setFade(localFade(bodyDist));
        continue;
      }
      const lineDist = hasLine ? segmentSegmentDistance(cam, this.lineEnd, this.fadeBase, this.fadeTop) - PLAYER_RADIUS : Infinity;
      v.setFade(occluderFade(bodyDist, lineDist));
    }
  }

  /**
   * Indicateurs du porteur local : cible de la passe assistée (selectPassTarget de la sim, avec le yaw
   * COURANT de la caméra : la cible suit le regard à chaque frame), cône, point de chute du coup de pied.
   * Masqués quand la sim ignorerait PASS / KICK (canCarrierAct : plongeon, récupération au sol) : l'écran ne
   * promet jamais une passe qui ne partira pas.
   */
  private updatePassIndicator(curr: MatchState, view: ViewInput, carrierId: number, timeSec: number): void {
    const f = this.passFrame;
    const me = curr.players[view.localId];
    f.visible = me !== undefined && me.id === carrierId && canCarrierAct(me) && view.spectator !== true;
    this.passTargetId = -1;
    this.passRisk = 0;
    if (me !== undefined && f.visible) {
      const target = selectPassTarget(curr, me.id, view.yaw);
      this.passTargetId = target?.targetId ?? -1;
      this.passRisk = target === null ? 0 : passRiskOf(target.openness);
      f.risk = this.passRisk;
      const tp = target === null ? undefined : curr.players[target.targetId];
      f.team = me.team;
      f.carrierFeet = this.localFeet;
      f.carrierGround = groundHeight(curr.field, this.localFeet.x, this.localFeet.z);
      f.aim = passAimDirection(me.team, view.yaw);
      f.targetFeet = tp === undefined ? null : (this.interpFeet[tp.id] ?? tp.pos);
      f.targetHeight = tp === undefined ? 0 : playerHeight(tp);
      // Point de chute : lancement depuis l'état courant, décalé de l'écart d'interpolation du porteur (pas de saccade à 30 Hz).
      const launch = kickLaunch(curr, me.id, view.yaw, view.pitch);
      if (launch !== null) {
        const land = predictBallLanding(curr.field, launch.pos, launch.vel);
        this.kickLandingShifted.x = land.x + this.localFeet.x - me.pos.x;
        this.kickLandingShifted.z = land.z + this.localFeet.z - me.pos.z;
        this.kickLandingShifted.y = groundHeight(curr.field, this.kickLandingShifted.x, this.kickLandingShifted.z);
        f.kickLanding = this.kickLandingShifted;
      } else {
        f.kickLanding = null;
      }
    }
    this.passIndicator.update(f, timeSec);
  }

  /**
   * Aperçus du demi local (étape 7) : point de pose de sa zone (capacité prête, slowZonePlacement de la sim avec le regard
   * COURANT, recalé sur sa position interpolée) et point d'impact de sa grenade en visée (predictGrenadeImpact, relief
   * seulement). Masqués pour les autres rôles, au sol, ou quand l'action est impossible.
   */
  private updateAimPreview(curr: MatchState, view: ViewInput): void {
    const f = this.aimPreview;
    f.zone = null;
    f.grenade = null;
    const me = curr.players[view.localId];
    if (me === undefined || me.role !== 'demi' || me.status !== 'active' || view.spectator === true) return;
    f.team = me.team;
    if (me.abilityCd === 0) {
      const at = slowZonePlacement(curr, me, view.yaw, view.pitch);
      const x = at.x + this.localFeet.x - me.pos.x;
      const z = at.z + this.localFeet.z - me.pos.z;
      this.zonePreviewPos.x = x;
      this.zonePreviewPos.y = groundHeight(curr.field, x, z);
      this.zonePreviewPos.z = z;
      f.zone = this.zonePreviewPos;
    }
    if (view.aiming && canShoot(curr, me)) {
      const w = ROLES.demi.weapon;
      const d = aimDir(view.yaw, view.pitch);
      f.grenade = predictGrenadeImpact(curr.field, aimOrigin(this.localFeet, view.yaw), { x: d.x * w.speed, y: d.y * w.speed, z: d.z * w.speed }, w);
    }
  }

  /**
   * Effets des événements d'un tick (appelé par la session après chaque step, avec l'état juste après et l'état
   * juste avant : un projectile terminé pendant le tick est prolongé jusqu'à son point d'impact).
   */
  handleEvents(events: readonly MatchEvent[], state: MatchState, timeSec: number, prev: MatchState | null = null): void {
    for (const e of events) {
      this.fx.handle(e, state, timeSec);
      if (e.type === 'hit') this.players[e.targetId]?.flash(timeSec);
      if (e.type === 'shot') this.players[e.playerId]?.shot(timeSec);
      if (e.type === 'pass') this.players[e.fromId]?.gesture('pass');
      if (e.type === 'kick') this.players[e.playerId]?.gesture('kick');
      // Le demi lance sa zone de ralentissement : même geste de bras que la passe.
      if (e.type === 'ability' && e.role === 'demi') this.players[e.playerId]?.gesture('pass');
      if (e.type === 'blocked') this.players[e.targetId]?.shieldFlash(timeSec);
      this.scrum.handleEvent(e);
    }
    this.combatFx.handleEvents(events, state, prev, timeSec, this.humanId);
  }

  dispose(): void {
    this.clearMatch();
    this.ball.dispose();
    this.passIndicator.dispose();
    this.fx.dispose();
    this.combatFx.dispose();
    this.zones.dispose();
    this.scrum.dispose();
    this.assets.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.renderer.dispose();
    // Libère aussi le contexte WebGL (sinon ils s'accumulent à chaque rechargement à chaud de Vite).
    this.renderer.forceContextLoss();
  }
}
