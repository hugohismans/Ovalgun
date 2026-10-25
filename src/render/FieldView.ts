/**
 * Terrain (Three.js), construit UNE fois à partir des mêmes données que la simulation
 * (FieldLayout et groundHeight) : ce qu'on voit correspond exactement aux collisions.
 *
 *  - Pelouse à bandes de tonte et en-buts teintés (shader de sol en coordonnées monde, appliqué
 *    aussi aux buttes : les bandes suivent le relief).
 *  - Lignes blanches : lignes d'essai, médiane, lignes de ballon mort, touches.
 *  - Murs invisibles : bordure basse claire + voile translucide dégradé.
 *  - Reliefs : buttes lisses (profil groundHeight), rampes en coin, murets (boîtes claires à liseré coloré).
 */

import * as THREE from 'three';
import { groundHeight, type FieldLayout, type RampFeature, type TerrainFeature, type WallFeature } from '../sim';
import { PALETTE, STYLE } from './palette';

/** Couleur d'équipe du camp dans lequel se trouve un relief (équipe 0 défend −Z). */
const sideColor = (f: TerrainFeature): string => PALETTE.teams[f.z < 0 ? 0 : 1].main;

/** Matériau de sol : bandes de tonte, en-buts à la couleur (éclaircie) de l'équipe qui les défend, extérieur de l'arène. */
function createGroundMaterial(field: FieldLayout, polygonOffset: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -2;
  }
  const uniforms = {
    uGrassA: { value: new THREE.Color(PALETTE.grassA) },
    uGrassB: { value: new THREE.Color(PALETTE.grassB) },
    uOutside: { value: new THREE.Color(PALETTE.outside) },
    uTeam0: { value: new THREE.Color(PALETTE.teams[0].main) },
    uTeam1: { value: new THREE.Color(PALETTE.teams[1].main) },
    uHalf: { value: new THREE.Vector2(field.width / 2, field.length / 2) },
    uTryZ: { value: field.tryLineZ },
    uStripe: { value: STYLE.stripeWidth * field.scale },
    uTint: { value: STYLE.inGoalTint },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 vOgWorld;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vOgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader =
      [
        'varying vec3 vOgWorld;',
        'uniform vec3 uGrassA; uniform vec3 uGrassB; uniform vec3 uOutside;',
        'uniform vec3 uTeam0; uniform vec3 uTeam1;',
        'uniform vec2 uHalf; uniform float uTryZ; uniform float uStripe; uniform float uTint;',
        'vec3 ogGround(vec3 p) {',
        '  if (abs(p.x) > uHalf.x || abs(p.z) > uHalf.y) return uOutside;',
        '  float s = mod(floor((p.z + uHalf.y) / uStripe), 2.0);',
        '  vec3 c = mix(uGrassA, uGrassB, s);',
        '  float k = mix(1.0, 0.9, s);',
        '  if (p.z > uTryZ) c = mix(uTeam1, vec3(1.0), uTint) * k;',
        '  else if (p.z < -uTryZ) c = mix(uTeam0, vec3(1.0), uTint) * k;',
        '  return c;',
        '}',
        '',
      ].join('\n') +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= ogGround(vOgWorld);',
      );
  };
  return mat;
}

/** Géométrie d'une butte : grille radiale dont les hauteurs viennent de groundHeight (profil exact). */
function moundGeometry(field: FieldLayout, cx: number, cz: number, radius: number): THREE.BufferGeometry {
  const rings = 18;
  const segs = 56;
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(cx, groundHeight(field, cx, cz), cz);
  for (let r = 1; r <= rings; r++) {
    const rr = (radius * r) / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      pos.push(x, groundHeight(field, x, z), z);
    }
  }
  const ringStart = (r: number): number => 1 + (r - 1) * segs;
  for (let s = 0; s < segs; s++) {
    const a = ringStart(1) + s;
    const b = ringStart(1) + ((s + 1) % segs);
    idx.push(0, b, a);
  }
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = ringStart(r) + s;
      const b = ringStart(r) + ((s + 1) % segs);
      const c = ringStart(r + 1) + s;
      const d = ringStart(r + 1) + ((s + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Coin d'une rampe (repère local : monte de 0 en −Z à `height` en +Z, puis retombe verticalement). */
function rampGeometry(f: RampFeature): THREE.BufferGeometry {
  const hx = f.width / 2;
  const hz = f.length / 2;
  const h = f.height;
  const A = [-hx, 0, -hz];
  const B = [hx, 0, -hz];
  const C = [hx, h, hz];
  const D = [-hx, h, hz];
  const A2 = [-hx, 0, hz];
  const B2 = [hx, 0, hz];
  // Triangles orientés vers l'extérieur (normales plates).
  const tris = [A, C, B, A, D, C, A2, B2, C, A2, C, D, B, C, B2, A, A2, D];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

export class FieldView {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(readonly field: FieldLayout) {
    this.buildGround();
    this.buildLines();
    this.buildBorders();
    for (const f of field.features) this.buildFeature(f);
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildGround(): void {
    const f = this.field;
    const ground = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(f.width * 6, f.length * 4)),
      this.mat(createGroundMaterial(f, false)),
    );
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);
    const moundMat = this.mat(createGroundMaterial(f, true));
    for (const feat of f.features) {
      if (feat.kind !== 'mound') continue;
      this.group.add(new THREE.Mesh(this.track(moundGeometry(f, feat.x, feat.z, feat.radius)), moundMat));
    }
  }

  private buildLines(): void {
    const f = this.field;
    const lw = STYLE.lineWidth;
    const mat = this.mat(
      new THREE.MeshBasicMaterial({ color: PALETTE.line, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    );
    const add = (cx: number, cz: number, sx: number, sz: number): void => {
      const m = new THREE.Mesh(this.track(new THREE.PlaneGeometry(sx, sz)), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 0.01, cz);
      this.group.add(m);
    };
    const hw = f.width / 2;
    const hl = f.length / 2;
    // Lignes transversales : ballon mort, essai, médiane.
    for (const z of [-hl + lw / 2, -f.tryLineZ, 0, f.tryLineZ, hl - lw / 2]) add(0, z, f.width, z === 0 || Math.abs(z) === f.tryLineZ ? lw * 1.6 : lw);
    // Touches.
    add(-hw + lw / 2, 0, lw, f.length);
    add(hw - lw / 2, 0, lw, f.length);
    // Pointillés des « 10 m » de part et d'autre de la médiane (repères de lecture du jeu).
    const dashZ = f.length * 0.2;
    for (const z of [-dashZ, dashZ]) {
      for (let x = -hw + 1; x < hw - 1; x += 3) add(x + 0.75, z, 1.5, lw * 0.8);
    }
  }

  private buildBorders(): void {
    const f = this.field;
    const hw = f.width / 2;
    const hl = f.length / 2;
    const t = STYLE.borderThickness;
    const h = STYLE.borderHeight;
    const borderMat = this.mat(new THREE.MeshLambertMaterial({ color: PALETTE.border }));
    const capMats = [0, 1].map((team) => this.mat(new THREE.MeshLambertMaterial({ color: PALETTE.teams[team].main })));
    const addBox = (cx: number, cz: number, sx: number, sz: number, m: THREE.Material): void => {
      const b = new THREE.Mesh(this.track(new THREE.BoxGeometry(sx, h, sz)), m);
      b.position.set(cx, h / 2, cz);
      this.group.add(b);
    };
    // Bordure juste à l'extérieur des murs invisibles (n'empiète pas sur l'aire de jeu).
    addBox(-hw - t / 2, 0, t, f.length + 2 * t, borderMat);
    addBox(hw + t / 2, 0, t, f.length + 2 * t, borderMat);
    addBox(0, -hl - t / 2, f.width, t, capMats[0]);
    addBox(0, hl + t / 2, f.width, t, capMats[1]);

    // Voile translucide (dégradé vertical) au-dessus de la bordure.
    const fenceMat = this.mat(
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: true }),
    );
    const addFence = (cx: number, cz: number, length: number, rotY: number, color: string): void => {
      const g = this.track(new THREE.PlaneGeometry(length, STYLE.fenceHeight, 1, 1));
      const c = new THREE.Color(color);
      const pos = g.getAttribute('position');
      const cols = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const top = pos.getY(i) > 0;
        cols.set([c.r, c.g, c.b, top ? 0 : STYLE.fenceOpacity], i * 4);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 4));
      const m = new THREE.Mesh(g, fenceMat);
      m.position.set(cx, h + STYLE.fenceHeight / 2, cz);
      m.rotation.y = rotY;
      m.renderOrder = 2;
      this.group.add(m);
    };
    addFence(-hw, 0, f.length, Math.PI / 2, PALETTE.border);
    addFence(hw, 0, f.length, Math.PI / 2, PALETTE.border);
    addFence(0, -hl, f.width, 0, PALETTE.teams[0].light);
    addFence(0, hl, f.width, 0, PALETTE.teams[1].light);
  }

  private buildFeature(f: TerrainFeature): void {
    if (f.kind === 'mound') return; // construite avec le sol
    const body = this.mat(
      new THREE.MeshLambertMaterial({ color: PALETTE.feature, emissive: PALETTE.feature, emissiveIntensity: 0.35, flatShading: true }),
    );
    const accent = this.mat(new THREE.MeshLambertMaterial({ color: sideColor(f) }));
    const edgeMat = this.mat(new THREE.LineBasicMaterial({ color: PALETTE.featureEdge }));
    const root = new THREE.Group();
    root.position.set(f.x, 0, f.z);
    root.rotation.y = f.rotation; // axe local +Z = (sin r, 0, cos r), comme la sim
    if (f.kind === 'wall') this.buildWall(root, f, body, accent, edgeMat);
    else this.buildRamp(root, f, body, accent, edgeMat);
    this.group.add(root);
  }

  private buildWall(root: THREE.Group, f: WallFeature, body: THREE.Material, accent: THREE.Material, edgeMat: THREE.LineBasicMaterial): void {
    const g = this.track(new THREE.BoxGeometry(f.thickness, f.height, f.length));
    const m = new THREE.Mesh(g, body);
    m.position.y = f.height / 2;
    root.add(m);
    const edges = new THREE.LineSegments(this.track(new THREE.EdgesGeometry(g)), edgeMat);
    edges.position.y = f.height / 2;
    root.add(edges);
    // Liseré coloré sur le dessus (dans l'empreinte : pas de débord hors collision).
    const capH = Math.min(0.1, f.height * 0.15);
    const cap = new THREE.Mesh(this.track(new THREE.BoxGeometry(f.thickness * 1.002, capH, f.length * 1.002)), accent);
    cap.position.y = f.height - capH / 2 + 0.002;
    root.add(cap);
    // Bande colorée au pied (lisibilité de la hauteur).
    const foot = new THREE.Mesh(this.track(new THREE.BoxGeometry(f.thickness * 1.004, 0.06, f.length * 1.004)), accent);
    foot.position.y = 0.03;
    root.add(foot);
  }

  private buildRamp(root: THREE.Group, f: RampFeature, body: THREE.Material, accent: THREE.Material, edgeMat: THREE.LineBasicMaterial): void {
    const g = this.track(rampGeometry(f));
    root.add(new THREE.Mesh(g, body));
    root.add(new THREE.LineSegments(this.track(new THREE.EdgesGeometry(g, 1)), edgeMat));
    // Bandes colorées sur la pente (chevrons) pour lire le sens de montée.
    const n = 3;
    const slopeLen = Math.hypot(f.length, f.height);
    const angle = Math.atan2(f.height, f.length);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const stripe = new THREE.Mesh(this.track(new THREE.PlaneGeometry(f.width * 0.8, slopeLen * 0.08)), accent);
      stripe.rotation.x = -Math.PI / 2 - angle; // normale (0, cos a, −sin a) : celle de la pente
      stripe.position.set(0, f.height * t + 0.012, -f.length / 2 + f.length * t);
      root.add(stripe);
    }
    // Liseré sur l'arête haute (la face verticale arrière est un obstacle).
    const lip = new THREE.Mesh(this.track(new THREE.BoxGeometry(f.width, 0.08, 0.08)), accent);
    lip.position.set(0, f.height - 0.04, f.length / 2 - 0.04);
    root.add(lip);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
