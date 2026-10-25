/**
 * Ciel du décor : dôme en dégradé (zénith, milieu, horizon = brouillard) avec soleil plat (disque, liseré, halo,
 * anneaux) dans la direction de la lumière directionnelle, nuages low-poly qui dérivent lentement, oiseaux qui
 * tournent au-dessus du stade, dirigeable « OVALGUN » et montgolfières au loin. Construit une seule fois (indépendant
 * de la taille du terrain) ; 6 appels de dessin. Aucune allocation par image.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENVIRONMENT as E } from '../palette';
import type { Atlas, UvRect } from './atlas';
import { createRng } from './rng';

const DEG = Math.PI / 180;

function createDome(sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(E.skyTop) },
      uMid: { value: new THREE.Color(E.skyMid) },
      uHorizon: { value: new THREE.Color(E.skyHorizon) },
      uBelow: { value: new THREE.Color(E.skyBelow) },
      uHeights: { value: new THREE.Vector2(E.skyMidHeight, E.skyTopHeight) },
      uSunDir: { value: sunDir.clone() },
      uSunCore: { value: new THREE.Color(E.sunCore) },
      uSunRim: { value: new THREE.Color(E.sunRim) },
      uSunHalo: { value: new THREE.Color(E.sunHalo) },
      uSunGlow: { value: new THREE.Color(E.sunGlow) },
      // cos(disque), cos(liseré), exposant du halo, intensité du halo
      uSun: { value: new THREE.Vector4(Math.cos(E.sunDiskDeg * DEG), Math.cos(E.sunRimDeg * DEG), E.sunHaloPower, E.sunHaloStrength) },
      // lueur de l'horizon, cos(anneau), intensité des anneaux
      uSunExtra: { value: new THREE.Vector3(E.sunGlowStrength, Math.cos(E.sunRingDeg * DEG), E.sunRingStrength) },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = position;',
      '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = p.xyww;', // toujours au fond
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec2 uHeights;',
      'uniform vec3 uSunDir; uniform vec3 uSunCore; uniform vec3 uSunRim; uniform vec3 uSunHalo; uniform vec3 uSunGlow;',
      'uniform vec4 uSun; uniform vec3 uSunExtra;',
      'varying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir);',
      '  float h = d.y;',
      '  vec3 c;',
      '  if (h >= 0.0) {',
      '    c = mix(uHorizon, uMid, smoothstep(0.0, uHeights.x, h));',
      '    c = mix(c, uTop, smoothstep(uHeights.x, uHeights.y, h));',
      '  } else {',
      '    c = mix(uHorizon, uBelow, smoothstep(0.0, 0.08, -h));',
      '  }',
      '  float sd = dot(d, uSunDir);',
      // Lueur chaude de l'horizon du côté du soleil.
      '  vec2 hd = normalize(d.xz + vec2(1e-5));',
      '  float az = max(dot(hd, normalize(uSunDir.xz)), 0.0);',
      '  c = mix(c, uSunGlow, uSunExtra.x * az * az * az * (1.0 - smoothstep(0.0, 0.32, abs(h))));',
      // Halo doux puis deux anneaux plats (aplat cartoon) et disque à bords francs anticrénelés.
      '  c += uSunHalo * uSun.w * pow(max(sd, 0.0), uSun.z);',
      '  float aa = max(fwidth(sd), 1e-5);',
      '  float ring1 = smoothstep(uSunExtra.y - aa, uSunExtra.y + aa, sd);',
      '  float ring2 = smoothstep(mix(uSunExtra.y, uSun.y, 0.55) - aa, mix(uSunExtra.y, uSun.y, 0.55) + aa, sd);',
      '  c = mix(c, uSunHalo, uSunExtra.z * (ring1 + ring2));',
      '  c = mix(c, uSunRim, smoothstep(uSun.y - aa, uSun.y + aa, sd));',
      '  c = mix(c, uSunCore, smoothstep(uSun.x - aa, uSun.x + aa, sd));',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(E.skyRadius, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  return dome;
}

/** Ombrage plat des nuages : face au soleil -> `cloudLit`, dessous -> `cloudShade` (sans brouillard ni lumières). */
function createCloudMaterial(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uLit: { value: new THREE.Color(E.cloudLit) },
      uShade: { value: new THREE.Color(E.cloudShade) },
    },
    vertexShader: [
      'uniform vec3 uSunDir;',
      'varying float vLight;',
      'void main() {',
      '  mat4 m = modelMatrix * instanceMatrix;',
      '  vec3 n = normalize(mat3(m) * normal);',
      '  vLight = clamp(0.45 * dot(n, uSunDir) + 0.55 * n.y + 0.4, 0.0, 1.0);',
      '  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uLit; uniform vec3 uShade;',
      'varying float vLight;',
      'void main() {',
      '  gl_FragColor = vec4(mix(uShade, uLit, vLight), 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
}

/** Oiseaux : deux ailes en V qui battent dans le vertex shader (phase par instance). */
function createBirdMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: time, uColor: { value: new THREE.Color(E.birdColor) }, uRate: { value: E.birdFlapRate } },
    vertexShader: [
      'uniform float uTime; uniform float uRate;',
      'void main() {',
      '  vec3 p = position;',
      '  p.y += sin(uTime * uRate + float(gl_InstanceID) * 1.7) * abs(p.x) * 0.7;',
      '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: ['uniform vec3 uColor;', 'void main() {', '  gl_FragColor = vec4(uColor, 1.0);', '  #include <colorspace_fragment>', '}'].join('\n'),
  });
}

function birdGeometry(): THREE.BufferGeometry {
  const s = E.birdSpan / 2;
  // Ailes en flèche (pointes vers l'arrière, +Z) ; l'avant du corps vers −Z.
  const pos = new Float32Array([0, 0, -0.35, -s, 0, 0.35, 0, 0, 0.2, 0, 0, -0.35, 0, 0, 0.2, s, 0, 0.35]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

/** Couleur par sommet d'une géométrie (fusion du dirigeable en un seul appel de dessin). */
function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((x: number, y: number, z: number) => THREE.ColorRepresentation)): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.set(typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color);
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Bandeau courbe collé au flanc du dirigeable (côté `side` = ±1), texte de l'atlas. */
function bannerGeometry(L: number, R: number, uv: UvRect, side: 1 | -1): THREE.BufferGeometry {
  const seg = 10;
  const half = L * 0.24;
  const h = R * 0.62;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    // Lu de gauche à droite vu de ce côté : vers +X pour side = +1 (vu depuis +Z), vers −X sinon.
    const x = side * (-half + 2 * half * t);
    const r = R * Math.sqrt(Math.max(0, 1 - (x / (L / 2)) ** 2)) + 0.06;
    const z = side * Math.sqrt(Math.max(0, r * r - (h / 2) ** 2));
    pos.push(x, -h / 2, z, x, h / 2, z);
    const u = uv.u0 + (uv.u1 - uv.u0) * t;
    uvs.push(u, uv.v0, u, uv.v1);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function blimpGeometry(): THREE.BufferGeometry {
  const L = E.blimpLength;
  const R = L * 0.16;
  const body = new THREE.SphereGeometry(1, 24, 14);
  body.scale(L / 2, R, R);
  paint(body, (x) => (x > L * 0.36 ? E.blimpNose : E.blimpBody));
  const parts: THREE.BufferGeometry[] = [body];
  const finV = new THREE.BoxGeometry(L * 0.16, R * 1.1, 0.25);
  for (const s of [-1, 1]) {
    const f = finV.clone().translate(-L * 0.4, s * R * 0.75, 0);
    parts.push(paint(f.toNonIndexed(), E.blimpFin));
    const fh = new THREE.BoxGeometry(L * 0.16, 0.25, R * 1.1).translate(-L * 0.4, 0, s * R * 0.75);
    parts.push(paint(fh.toNonIndexed(), E.blimpFin));
    fh.dispose();
    f.dispose();
  }
  finV.dispose();
  const gondola = new THREE.BoxGeometry(L * 0.14, R * 0.32, R * 0.4).translate(L * 0.04, -R * 1.05, 0);
  parts.push(paint(gondola.toNonIndexed(), E.blimpGondola));
  gondola.dispose();
  // Toutes les parties non indexées pour la fusion.
  parts[0] = body.toNonIndexed();
  body.dispose();
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function balloonGeometry(): THREE.BufferGeometry {
  const env = new THREE.SphereGeometry(1, 14, 10);
  const p = env.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) {
      // Bas en goutte d'eau : rétréci vers le panier.
      const k = 1 + y * 0.62;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, y * 1.25);
    }
  }
  env.computeVertexNormals();
  const basket = new THREE.BoxGeometry(0.28, 0.22, 0.28).translate(0, -1.62, 0);
  const merged = mergeGeometries([env.toNonIndexed(), basket.toNonIndexed()]);
  env.dispose();
  basket.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function balloonMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const uniforms = { uBasket: { value: new THREE.Color(E.balloonBasket) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 vOgLocal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOgLocal = position;');
    shader.fragmentShader =
      'varying vec3 vOgLocal;\nuniform vec3 uBasket;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '  float ogGore = step(0.5, fract(atan(vOgLocal.z, vOgLocal.x) / 6.2831853 * 10.0));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ogGore);',
          '  if (vOgLocal.y < -1.45) diffuseColor.rgb = uBasket;',
        ].join('\n'),
      );
  };
  return mat;
}

interface Flyer {
  radius: number;
  height: number;
  speed: number;
  phase: number;
}

export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly clouds: THREE.InstancedMesh;
  private readonly birds: THREE.InstancedMesh;
  private readonly blimp = new THREE.Group();
  private readonly balloons: THREE.InstancedMesh;
  private readonly birdData: Flyer[] = [];
  private readonly balloonData: Flyer[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  // Objets de travail (aucune allocation par image).
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(sunDir: THREE.Vector3, atlas: Atlas, adMaterial: THREE.Material, time: { value: number }) {
    const rng = createRng(E.citySeed + 7);
    this.dome = createDome(sunDir);
    this.geometries.push(this.dome.geometry);
    this.materials.push(this.dome.material as THREE.Material);
    this.group.add(this.dome);

    // Nuages : amas de boules aplaties, bas à peu près alignés.
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const cloudMat = createCloudMaterial(sunDir);
    this.track(puff, cloudMat);
    const puffs: THREE.Matrix4[] = [];
    for (let c = 0; c < E.cloudCount; c++) {
      const a = (c / E.cloudCount) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const r = rng.range(E.cloudDistance[0], E.cloudDistance[1]);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = rng.range(E.cloudHeight[0], E.cloudHeight[1]);
      const n = E.cloudPuffs[0] + rng.int(E.cloudPuffs[1] - E.cloudPuffs[0] + 1);
      const size = rng.range(E.cloudPuffSize[0], E.cloudPuffSize[1]);
      // Axe de l'amas : tangent au cercle (on le voit de profil depuis le stade).
      const ax = -Math.sin(a);
      const az = Math.cos(a);
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1) - 0.5;
        const big = 1 - Math.abs(t) * 1.1;
        const ps = size * (0.55 + 0.5 * big) * rng.range(0.85, 1.15);
        const along = t * size * n * 0.75;
        this.e.set(0, rng.range(0, Math.PI), 0);
        this.q.setFromEuler(this.e);
        puffs.push(
          new THREE.Matrix4().compose(
            this.p.set(cx + ax * along + rng.range(-0.3, 0.3) * size, cy + ps * 0.35, cz + az * along + rng.range(-0.3, 0.3) * size),
            this.q,
            this.s.set(ps * 1.15, ps * 0.62, ps),
          ),
        );
      }
    }
    this.s.set(1, 1, 1);
    this.clouds = new THREE.InstancedMesh(puff, cloudMat, puffs.length);
    puffs.forEach((m, i) => this.clouds.setMatrixAt(i, m));
    this.clouds.computeBoundingSphere();
    this.group.add(this.clouds);

    // Oiseaux.
    const birdGeo = birdGeometry();
    const birdMat = createBirdMaterial(time);
    this.track(birdGeo, birdMat);
    this.birds = new THREE.InstancedMesh(birdGeo, birdMat, E.birdCount);
    this.birds.frustumCulled = false;
    for (let i = 0; i < E.birdCount; i++) {
      this.birdData.push({
        radius: rng.range(E.birdOrbit[0], E.birdOrbit[1]),
        height: rng.range(E.birdHeight[0], E.birdHeight[1]),
        speed: rng.range(E.birdSpeed[0], E.birdSpeed[1]),
        phase: rng.range(0, 0.9),
      });
    }
    this.group.add(this.birds);

    // Dirigeable : corps fusionné (couleurs par sommet) + bandeaux texte de l'atlas (matériau des panneaux du stade).
    const blimpGeo = blimpGeometry();
    // Léger émissif : le ventre du dirigeable (vu d'en dessous) reste clair.
    const blimpMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3a48 });
    const L = E.blimpLength;
    const R = L * 0.16;
    const banner = mergeGeometries([bannerGeometry(L, R, atlas.ads[0], 1), bannerGeometry(L, R, atlas.ads[1], -1)]) ?? new THREE.BufferGeometry();
    this.track(blimpGeo, blimpMat);
    this.geometries.push(banner);
    this.blimp.add(new THREE.Mesh(blimpGeo, blimpMat), new THREE.Mesh(banner, adMaterial));
    this.group.add(this.blimp);

    // Montgolfières.
    const balloonGeo = balloonGeometry();
    const balloonMat = balloonMaterial();
    this.track(balloonGeo, balloonMat);
    const nb = E.balloonColors.length;
    this.balloons = new THREE.InstancedMesh(balloonGeo, balloonMat, nb);
    this.balloons.frustumCulled = false;
    const col = new THREE.Color();
    for (let i = 0; i < nb; i++) {
      this.balloonData.push({
        radius: rng.range(E.balloonDistance[0], E.balloonDistance[1]),
        height: rng.range(E.balloonHeight[0], E.balloonHeight[1]),
        speed: E.balloonDrift * rng.range(0.6, 1.4),
        phase: (i / nb) * Math.PI * 2 + rng.range(-0.4, 0.4),
      });
      this.balloons.setColorAt(i, col.set(E.balloonColors[i]));
    }
    this.group.add(this.balloons);
    this.update(0, 0, new THREE.Vector3());
  }

  private track(g: THREE.BufferGeometry, m: THREE.Material): void {
    this.geometries.push(g);
    this.materials.push(m);
  }

  update(_dt: number, timeSec: number, cameraPos: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
    this.clouds.rotation.y = timeSec * E.cloudDriftRate;

    // Oiseaux : vol circulaire au-dessus du stade, légère inclinaison vers l'intérieur.
    for (let i = 0; i < this.birdData.length; i++) {
      const b = this.birdData[i];
      const a = b.phase * Math.PI * 2 + timeSec * b.speed;
      this.p.set(Math.cos(a) * b.radius, b.height + Math.sin(timeSec * 0.6 + i) * 1.5, Math.sin(a) * b.radius);
      // Direction du mouvement (−sin a, cos a) ; l'avant de l'oiseau est son −Z local.
      this.e.set(0, Math.atan2(Math.sin(a), -Math.cos(a)), -0.25);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.s);
      this.birds.setMatrixAt(i, this.m);
    }
    this.birds.instanceMatrix.needsUpdate = true;

    // Dirigeable : grand cercle lent, nez (+X local) dans le sens du mouvement.
    const a = timeSec * E.blimpSpeed + 0.8;
    this.blimp.position.set(Math.cos(a) * E.blimpOrbit, E.blimpHeight + Math.sin(timeSec * 0.2) * 2, Math.sin(a) * E.blimpOrbit);
    this.blimp.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);

    // Montgolfières : dérive lente et léger balancement vertical.
    for (let i = 0; i < this.balloonData.length; i++) {
      const b = this.balloonData[i];
      const ang = b.phase + timeSec * b.speed;
      const r = E.balloonRadius;
      this.p.set(Math.cos(ang) * b.radius, b.height + Math.sin(timeSec * 0.25 + i * 2) * 3, Math.sin(ang) * b.radius);
      this.e.set(0, 0, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.s.set(r, r, r));
      this.balloons.setMatrixAt(i, this.m);
    }
    this.s.set(1, 1, 1);
    this.balloons.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.clouds.dispose();
    this.birds.dispose();
    this.balloons.dispose();
  }
}
