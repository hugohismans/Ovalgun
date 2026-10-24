/**
 * Rendu Three.js du match. Lit deux MatchState (précédent / courant) et interpole avec alpha ;
 * n'écrit JAMAIS dans l'état. Style flat coloré : ciel en dégradé vif, lumières hémisphérique +
 * directionnelle, brouillard léger, couleurs saturées (palette.ts).
 */

import * as THREE from 'three';
import { carryPosition, groundHeight, ROLES, type MatchState, type Vec3 } from '../sim';
import { BallView } from './BallView';
import { FieldView } from './FieldView';
import { lerpPos, lerpYaw } from './interpolate';
import { PALETTE, STYLE } from './palette';
import { PlayerAssets, PlayerView, type PlayerFrame } from './PlayerView';
import { ShoulderCamera } from './ShoulderCamera';

/** Paramètres de caméra du joueur local pour une frame. */
export interface ViewInput {
  /** Id du joueur suivi par la caméra. */
  localId: number;
  /** Orientation courante (souris / manette), non interpolée. */
  yaw: number;
  pitch: number;
  aiming: boolean;
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
  private readonly assets = new PlayerAssets();
  private field: FieldView | null = null;
  private backdrop: THREE.Group | null = null;
  private players: PlayerView[] = [];
  private readonly ball = new BallView();
  private readonly sky = createSky();
  // Objets de travail réutilisés à chaque frame.
  private readonly feet: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly ballPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly frame: PlayerFrame = { feet: this.feet, yaw: 0, pitch: 0, ground: 0, carrier: false };
  private readonly localFeet: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.shoulder = new ShoulderCamera(1);

    this.scene.background = new THREE.Color(PALETTE.skyHorizon);
    this.scene.fog = new THREE.Fog(PALETTE.fog, STYLE.fogNear, STYLE.fogFar);
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, STYLE.hemiIntensity));
    const sun = new THREE.DirectionalLight(PALETTE.sun, STYLE.sunIntensity);
    sun.position.set(18, 30, -10);
    this.scene.add(sun);
    this.scene.add(this.ball.group);
    this.resize();
  }

  /** (Re)construit le terrain et les joueurs pour un match. */
  setMatch(state: MatchState, humanId: number): void {
    this.clearMatch();
    this.field = new FieldView(state.field);
    this.scene.add(this.field.group);
    this.backdrop = createBackdrop(state.field.width, state.field.length);
    this.scene.add(this.backdrop);
    this.players = state.players.map((p) => {
      const v = new PlayerView(this.assets, p.id, p.team, p.role, p.id === humanId);
      this.scene.add(v.root, v.groundGroup, v.marker);
      return v;
    });
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
    for (const v of this.players) this.scene.remove(v.root, v.groundGroup, v.marker);
    this.players = [];
  }

  /** Adapte la taille du rendu à celle du canvas (CSS). */
  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
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
      v.update(pc, this.frame, dt, timeSec);
      if (local) {
        this.localFeet.x = this.feet.x;
        this.localFeet.y = this.feet.y;
        this.localFeet.z = this.feet.z;
      }
    }

    // Caméra épaule (avant le ballon : la traînée s'oriente vers la caméra).
    const lp = curr.players[view.localId];
    const lpPrev = prev.players[view.localId] ?? lp;
    if (lp !== undefined) {
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
    this.ball.update(curr.ball, prev.ball, a, this.ballPos, carrierYaw, ballGround, this.shoulder.camera.position, timeSec);

    this.sky.position.copy(this.shoulder.camera.position);
    this.renderer.render(this.scene, this.shoulder.camera);
  }

  dispose(): void {
    this.clearMatch();
    this.ball.dispose();
    this.assets.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.renderer.dispose();
    // Libère aussi le contexte WebGL (sinon ils s'accumulent à chaque rechargement à chaud de Vite).
    this.renderer.forceContextLoss();
  }
}
