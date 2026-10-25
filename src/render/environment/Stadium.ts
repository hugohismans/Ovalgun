/**
 * Stade autour du terrain : gradins (couleurs d'équipe derrière les en-buts, violet / rose le long des touches),
 * escaliers, mur du fond, toits des tribunes latérales, 4 pylônes avec projecteurs et halos, panneaux publicitaires
 * sur le muret avant, écrans géants « OVALGUN » derrière les en-buts, et foule instanciée qui sautille.
 * 5 appels de dessin : boîtes (une seule InstancedMesh, couleur par instance), projecteurs, halos, panneaux + écrans,
 * foule. Géométries de base et matériaux partagés (StadiumResources) ; seules les instances sont reconstruites.
 */

import * as THREE from 'three';
import { ENVIRONMENT as E, PALETTE } from '../palette';
import type { Atlas, UvRect } from './atlas';
import { InstanceBatch } from './instancing';
import { pylonPositions, rowHeight, rowSpan, sideFrame, type SideFrame, type SideIndex, type StadiumLayout } from './layout';
import { createRng } from './rng';

export interface StadiumResources {
  box: THREE.BufferGeometry;
  fan: THREE.BufferGeometry;
  glowQuad: THREE.BufferGeometry;
  boxMat: THREE.Material;
  lampMat: THREE.Material;
  glowMat: THREE.Material;
  adMat: THREE.Material;
  crowdMat: THREE.Material;
  atlas: Atlas;
}

/** Niveau de détail du décor (qualité graphique, palette.ts QUALITY). */
export interface EnvDetail {
  crowd: number;
  cityProps: boolean;
}

export interface Built {
  group: THREE.Group;
  /** Applique un niveau de détail (sans rien reconstruire). */
  setDetail(d: EnvDetail): void;
  dispose(): void;
}

const SIDES: readonly SideIndex[] = [0, 1, 2, 3];

/** Hauteur des épaules d'un spectateur (m, géométrie locale) : pivot des bras. */
export const FAN_SHOULDER_Y = 0.66;

/**
 * Spectateur : corps (aPart 0), tête (1), bras (2, levés en V quand il s'enthousiasme, le long du corps sinon : voir
 * createCrowdMaterial) ; pieds en y = 0, regard vers +Z.
 */
export function createFanGeometry(): THREE.BufferGeometry {
  const arm = (side: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(0.11, 0.52, 0.11).translate(0, 0.26, 0);
    g.rotateZ(-side * 0.42);
    return g.translate(side * 0.25, FAN_SHOULDER_Y, 0);
  };
  const parts: [THREE.BufferGeometry, number][] = [
    [new THREE.BoxGeometry(0.46, 0.74, 0.3).translate(0, 0.37, 0), 0],
    [new THREE.BoxGeometry(0.28, 0.3, 0.28).translate(0, 0.92, 0), 1],
    [arm(-1), 2],
    [arm(1), 2],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  for (const [g0, id] of parts) {
    const g = g0.index === null ? g0 : g0.toNonIndexed();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      part.push(id);
    }
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return out;
}

/** Quads texturés (panneaux, écrans) fusionnés en une géométrie : un seul appel de dessin. */
class QuadBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  /** Quad de centre (cx, cy, cz), tourné vers −n (vers le terrain), lu de gauche à droite selon (tx, tz). */
  add(f: SideFrame, cx: number, cy: number, cz: number, w: number, h: number, r: UvRect): void {
    const b = this.pos.length / 3;
    const hx = (f.tx * w) / 2;
    const hz = (f.tz * w) / 2;
    this.pos.push(cx - hx, cy - h / 2, cz - hz, cx + hx, cy - h / 2, cz + hz, cx + hx, cy + h / 2, cz + hz, cx - hx, cy + h / 2, cz - hz);
    this.uv.push(r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Couleurs des sièges d'un côté : équipe qui défend l'en-but derrière lequel il se trouve, ou violet / rose. */
function seatColors(side: SideIndex): readonly [string, string] {
  if (side === 0) return [PALETTE.teams[0].main, PALETTE.teams[0].light];
  if (side === 1) return [PALETTE.teams[1].main, PALETTE.teams[1].light];
  return E.sidelineSeats;
}

export function buildStadium(st: StadiumLayout, res: StadiumResources): Built {
  const rng = createRng(E.citySeed + 101);
  const boxes = new InstanceBatch();
  const lamps = new InstanceBatch();
  const glows = new InstanceBatch();
  const fans = new InstanceBatch();
  const quads = new QuadBuilder();
  const d = E.standsRowDepth;
  const t = E.backWallThickness;
  let adIndex = 0;

  for (const side of SIDES) {
    const f = sideFrame(st, side);
    const seats = seatColors(side);
    // Équipe qui défend l'en-but derrière cette tribune (côtés 0 et 1 seulement).
    const endTeam = PALETTE.teams[side === 1 ? 1 : 0];
    // Place d'un objet : `out` m vers l'extérieur depuis le centre, `along` m le long de la tribune.
    const px = (out: number, along: number): number => f.nx * out + f.tx * along;
    const pz = (out: number, along: number): number => f.nz * out + f.tz * along;
    // Échelle d'une boîte : `len` le long de la tribune, `dep` en profondeur.
    const sx = (len: number, dep: number): number => (f.alongZ ? dep : len);
    const sz = (len: number, dep: number): number => (f.alongZ ? len : dep);
    const yawToField = Math.atan2(-f.nx, -f.nz);

    // Muret avant (sous les panneaux).
    const span0 = rowSpan(st, side, 0);
    boxes.add(px(f.inner - 0.05, 0), 0, pz(f.inner - 0.05, 0), sx(span0, 0.1), E.standsFrontWall, sz(span0, 0.1), E.frontWallColor);

    // Gradins, escaliers et foule.
    for (let r = 0; r < E.standsRows; r++) {
      const span = rowSpan(st, side, r);
      const h = rowHeight(r);
      const out = f.inner + d * (r + 0.5);
      boxes.add(px(out, 0), 0, pz(out, 0), sx(span, d), h, sz(span, d), seats[r % 2]);
      const aisles: number[] = [];
      const nA = Math.floor((span / 2 - 2) / E.aisleEvery);
      for (let k = -nA; k <= nA; k++) {
        const a = k * E.aisleEvery + E.aisleEvery / 2;
        if (Math.abs(a) > span / 2 - 2) continue;
        aisles.push(a);
        boxes.add(px(out, a), 0, pz(out, a), sx(E.aisleWidth, d), h + 0.03, sz(E.aisleWidth, d), E.aisleColor);
      }
      // Spectateurs posés sur le rang, tournés vers le terrain.
      const fanOut = f.inner + d * (r + 0.6);
      const n = Math.floor((span - 1.2) / E.crowdSpacing);
      for (let k = 0; k < n; k++) {
        const a = -span / 2 + 0.6 + (k + 0.5) * E.crowdSpacing + rng.range(-0.12, 0.12);
        if (rng.next() > E.crowdFill) continue;
        if (aisles.some((x) => Math.abs(x - a) < E.aisleWidth / 2 + 0.35)) continue;
        const ends = side < 2;
        const share = ends ? E.crowdTeamShareEnds : E.crowdTeamShareSides;
        const roll = rng.next();
        let c: string;
        if (ends && roll < share) c = rng.pick([endTeam.main, endTeam.main, endTeam.light, endTeam.dark]);
        else if (!ends && roll < share) c = rng.pick([PALETTE.teams[0].main, PALETTE.teams[0].light]);
        else if (!ends && roll < 2 * share) c = rng.pick([PALETTE.teams[1].main, PALETTE.teams[1].light]);
        else c = rng.pick(E.crowdColors);
        const s = E.crowdScale * rng.range(0.9, 1.08);
        fans.add(px(fanOut, a), h, pz(fanOut, a), s, s, s, c, yawToField + rng.range(-0.25, 0.25));
      }
    }

    // Mur du fond et bandeau.
    const wallOut = f.inner + st.rowsDepth + t / 2;
    const wallLen = f.alongZ ? 2 * (st.innerZ + st.rowsDepth + t) : 2 * (st.innerX + st.rowsDepth);
    boxes.add(px(wallOut, 0), 0, pz(wallOut, 0), sx(wallLen, t), st.wallHeight, sz(wallLen, t), E.backWallColor);
    const band = side < 2 ? endTeam.main : E.backWallBand;
    boxes.add(px(wallOut, 0), st.wallHeight, pz(wallOut, 0), sx(wallLen, t + 0.1), 0.5, sz(wallLen, t + 0.1), band);

    // Panneaux publicitaires sur le muret avant (tournés vers le terrain).
    const step = E.adLength + E.adGap;
    const nAds = Math.floor((span0 - 1) / step);
    for (let k = 0; k < nAds; k++) {
      const a = (k - (nAds - 1) / 2) * step;
      const out = f.inner - 0.12;
      quads.add(f, px(out, a), 0.18 + E.adHeight / 2, pz(out, a), E.adLength, E.adHeight, res.atlas.ads[adIndex % res.atlas.ads.length]);
      adIndex += 5;
    }

    if (f.alongZ) {
      // Toit des tribunes latérales : dalle inclinée (bord avant relevé), bandeau avant, poteaux à l'arrière.
      const sign = f.nx;
      const cover = E.roofCover * st.rowsDepth + t;
      const outer = f.inner + st.rowsDepth + t;
      const roofY = st.topHeight + E.roofLift;
      const roofLen = wallLen;
      const tilt = -sign * E.roofTilt;
      boxes.add(px(outer - cover / 2, 0), roofY, 0, cover, E.roofThickness, roofLen, E.roofColor, 0, 0, tilt);
      const frontY = roofY + (cover / 2) * Math.sin(E.roofTilt);
      boxes.add(px(outer - cover, 0), frontY - E.roofFasciaHeight * 0.55, 0, 0.35, E.roofFasciaHeight, roofLen, E.roofFascia);
      const backY = roofY - (cover / 2) * Math.sin(E.roofTilt);
      const nCol = Math.floor(roofLen / 2 / E.roofColumnEvery);
      for (let k = -nCol; k <= nCol; k++) {
        boxes.add(px(outer + 0.4, 0), 0, k * E.roofColumnEvery, 0.7, backY + 0.2, 0.7, E.roofColumnColor);
      }
    } else {
      // Écran géant derrière l'en-but, sur deux pieds au-dessus du mur du fond.
      const w = Math.min(E.screenWidth, st.halfW * 2 * E.screenWidthShare);
      const h = w * E.screenAspect;
      const y0 = st.wallHeight + 0.5 + E.screenLift;
      boxes.add(px(wallOut, 0), y0 - 0.4, pz(wallOut, 0), sx(w + 0.8, 0.6), h + 0.8, sz(w + 0.8, 0.6), E.screenFrame);
      for (const s of [-1, 1]) {
        const a = (s * w) / 3;
        boxes.add(px(wallOut + 0.1, a), st.wallHeight, pz(wallOut + 0.1, a), sx(0.6, 0.5), y0 - st.wallHeight, sz(0.6, 0.5), E.screenFrame);
      }
      quads.add(f, px(wallOut - 0.32, 0), y0 + h / 2, pz(wallOut - 0.32, 0), w, h, res.atlas.screen);
    }
  }

  // Pylônes d'éclairage : mât, socle, tête tournée vers le centre et inclinée, projecteurs, halo.
  const head = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const noRot = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const v = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const H = E.pylonHeight;
  for (const p of pylonPositions(st)) {
    boxes.add(p.x, 0, p.z, 2.6, 1.2, 2.6, E.pylonColor);
    boxes.add(p.x, 0, p.z, 1.1, H, 1.1, E.pylonColor);
    e.set(E.pylonTilt, Math.atan2(-p.x, -p.z), 0, 'YXZ');
    q.setFromEuler(e);
    head.compose(v.set(p.x, H, p.z), q, scale.set(1, 1, 1));
    // Boîte dans le repère de la tête (+Z local vers le terrain).
    const put = (batch: InstanceBatch, lx: number, ly: number, lz: number, w: number, h: number, dd: number, c: string): void => {
      local.compose(v.set(lx, ly, lz), noRot, scale.set(w, h, dd));
      batch.addMatrix(world.multiplyMatrices(head, local), c);
    };
    put(boxes, 0, -2.6, -0.4, 8.2, 5.2, 0.8, E.pylonHeadColor);
    const cols = E.lampCols;
    const rows = E.lampRows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        put(lamps, (i - (cols - 1) / 2) * 1.85, (j - (rows - 1) / 2) * 1.5 - 0.55, 0.0, 1.55, 1.15, 0.3, E.lampColor);
      }
    }
    v.set(0, 0, 1.4).applyMatrix4(head);
    glows.add(v.x, v.y, v.z, E.glowSize, E.glowSize, E.glowSize, E.glowColor);
  }

  const group = new THREE.Group();
  // Ordre des spectateurs mélangé : une qualité réduite en dessine une partie, répartie partout.
  fans.shuffle(() => rng.next());
  const fanTotal = fans.count;
  const meshes: THREE.InstancedMesh[] = [
    boxes.build(res.box, res.boxMat),
    lamps.build(res.box, res.lampMat),
    glows.build(res.glowQuad, res.glowMat),
    fans.build(res.fan, res.crowdMat),
  ];
  // Halos : dessinés après le reste (additifs), pas de découpage sur une sphère englobante trop petite.
  meshes[2].frustumCulled = false;
  meshes[2].renderOrder = 2;
  // Les sauts de la foule dépassent un peu de la sphère englobante : on l'agrandit d'autant.
  if (meshes[3].boundingSphere !== null) meshes[3].boundingSphere.radius += E.jumpMax * E.crowdScale + 1;
  const adGeo = quads.build();
  const ads = new THREE.Mesh(adGeo, res.adMat);
  group.add(...meshes, ads);
  return {
    group,
    setDetail(d: EnvDetail): void {
      meshes[3].count = Math.round(fanTotal * Math.min(1, Math.max(0, d.crowd)));
    },
    dispose(): void {
      for (const m of meshes) m.dispose();
      adGeo.dispose();
    },
  };
}
