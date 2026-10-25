/**
 * Placement du décor, PUR (aucune dépendance à Three.js) : dimensions du stade à partir de celles du terrain, puis
 * ville déterministe autour (immeubles, tours, parcs, arbres, voitures, silhouettes lointaines). Testé sans WebGL
 * (tests/render/environment.test.ts) : rien n'entre dans la place qui entoure le stade, pour les deux tailles de terrain.
 *
 * Repère : celui du terrain (X largeur, Z longueur, centre en 0). Côtés des tribunes : 0 = −Z (derrière l'en-but de
 * l'équipe 0), 1 = +Z (équipe 1), 2 = −X, 3 = +X (le long des touches, les côtés longs).
 */

import { ENVIRONMENT as E } from '../palette';
import { createRng, type Rng } from './rng';

export type SideIndex = 0 | 1 | 2 | 3;

/** Dimensions du stade (m). */
export interface StadiumLayout {
  halfW: number;
  halfL: number;
  /** Distance du centre à l'avant des tribunes (muret du premier rang), en X et en Z. */
  innerX: number;
  innerZ: number;
  /** Profondeur totale des gradins. */
  rowsDepth: number;
  /** Distance du centre à l'arrière du mur du fond, en X et en Z. */
  outerX: number;
  outerZ: number;
  /** Hauteur du dernier rang, du mur du fond. */
  topHeight: number;
  wallHeight: number;
}

export function stadiumLayout(width: number, length: number): StadiumLayout {
  const halfW = width / 2;
  const halfL = length / 2;
  const innerX = halfW + E.standsGap;
  const innerZ = halfL + E.standsGap;
  const rowsDepth = E.standsRows * E.standsRowDepth;
  const topHeight = rowHeight(E.standsRows - 1);
  return {
    halfW,
    halfL,
    innerX,
    innerZ,
    rowsDepth,
    outerX: innerX + rowsDepth + E.backWallThickness,
    outerZ: innerZ + rowsDepth + E.backWallThickness,
    topHeight,
    wallHeight: topHeight + E.backWallExtra,
  };
}

/** Hauteur du dessus du rang r (0 = premier rang, au ras du muret avant). */
export function rowHeight(r: number): number {
  return E.standsFrontWall + E.standsRowRise * r;
}

/** Repère d'un côté des tribunes. */
export interface SideFrame {
  /** Côté le long de Z (tribune latérale, côté long). */
  alongZ: boolean;
  /** Normale sortante (du terrain vers la tribune). */
  nx: number;
  nz: number;
  /** Tangente : la droite de quelqu'un qui, depuis le terrain, regarde cette tribune (sens de lecture des panneaux). */
  tx: number;
  tz: number;
  /** Distance du centre à l'avant de la tribune. */
  inner: number;
}

export function sideFrame(st: StadiumLayout, side: SideIndex): SideFrame {
  const alongZ = side >= 2;
  const sign = side === 0 || side === 2 ? -1 : 1;
  const nx = alongZ ? sign : 0;
  const nz = alongZ ? 0 : sign;
  // Vue depuis le terrain (on regarde le long de +n), la droite est cross(n, haut) = (−nz, 0, nx).
  return { alongZ, nx, nz, tx: -nz, tz: nx, inner: alongZ ? st.innerX : st.innerZ };
}

/**
 * Longueur du rang r d'un côté. Les côtés longs s'allongent de `depth·r` de chaque côté, les côtés courts de
 * `depth·(r+1)` : les rangs pavent exactement les coins, sans recouvrement (pas de faces confondues).
 */
export function rowSpan(st: StadiumLayout, side: SideIndex, r: number): number {
  const d = E.standsRowDepth;
  return side >= 2 ? 2 * st.innerZ + 2 * d * r : 2 * st.innerX + 2 * d * (r + 1);
}

/** Pied des 4 pylônes d'éclairage (derrière les angles des tribunes). */
export function pylonPositions(st: StadiumLayout): { x: number; z: number }[] {
  const x = st.outerX + E.pylonOffset;
  const z = st.outerZ + E.pylonOffset;
  return [
    { x: -x, z: -z },
    { x, z: -z },
    { x: -x, z },
    { x, z },
  ];
}

/** Boîte posée : centre du pied (x, y, z), dimensions (w en X, h, d en Z), indice de couleur. */
export interface BoxSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
}

export interface TreeSpec {
  x: number;
  z: number;
  scale: number;
  /** 0 = boule, 1 = cône. */
  kind: 0 | 1;
  color: number;
}

export interface CarSpec {
  /** Position de départ (sur la voie). */
  x: number;
  z: number;
  /** Sens de circulation (vecteur unitaire le long de X ou de Z). */
  dx: number;
  dz: number;
  color: number;
}

export interface RectSpec {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface CityLayout {
  /** Demi-dimensions de la place autour du stade (bord intérieur de la rue qui en fait le tour). */
  plazaX: number;
  plazaZ: number;
  /** Rayon de la ville (m) : les voitures bouclent sur [−radius, radius]. */
  radius: number;
  /** Immeubles (façades à fenêtres) et tours (murs-rideaux) : couleurs dans E.facades / E.towerFacades. */
  blocks: BoxSpec[];
  towers: BoxSpec[];
  /** Équipements de toit (couleur dans E.roofProps). */
  roofProps: BoxSpec[];
  parks: RectSpec[];
  trees: TreeSpec[];
  cars: CarSpec[];
  /** Silhouettes lointaines (couleur dans E.skylineColors). */
  skyline: BoxSpec[];
}

/** Arrondit une largeur au multiple inférieur de la travée des fenêtres (au moins deux travées). */
function snapWidth(w: number): number {
  const c = E.windowCell[0];
  return Math.max(2 * c, Math.floor(w / c) * c);
}

/** Arrondit une hauteur à un nombre entier d'étages (+ acrotère). */
function snapHeight(h: number): number {
  const f = E.windowCell[1];
  return Math.max(2, Math.round((h - E.windowParapet) / f)) * f + E.windowParapet;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function addTree(out: TreeSpec[], rng: Rng, x: number, z: number, scale: number): void {
  const color = rng.next() < 0.12 ? E.treeGreens.length - 1 : rng.int(E.treeGreens.length - 1);
  out.push({ x, z, scale, kind: rng.next() < 0.4 ? 1 : 0, color });
}

/** Ville autour du stade : grille d'îlots, place calée sur la grille, hauteurs qui croissent avec la distance. */
export function cityLayout(st: StadiumLayout): CityLayout {
  const rng = createRng(E.citySeed);
  const P = E.cityBlock;
  const S = E.cityStreet;
  const sw = E.citySidewalk;
  // Place : le bord intérieur d'une rue, au moins à `plazaMargin` de l'arrière des tribunes.
  const plazaX = Math.ceil((st.outerX + E.plazaMargin + S / 2) / P) * P - S / 2;
  const plazaZ = Math.ceil((st.outerZ + E.plazaMargin + S / 2) / P) * P - S / 2;
  const R = E.cityRadius;
  const out: CityLayout = { plazaX, plazaZ, radius: R, blocks: [], towers: [], roofProps: [], parks: [], trees: [], cars: [], skyline: [] };
  const N = Math.ceil(R / P) + 1;
  const usable = P - S - 2 * sw;
  const span = R - Math.min(plazaX, plazaZ);

  for (let i = -N; i < N; i++) {
    for (let j = -N; j < N; j++) {
      const cx = (i + 0.5) * P;
      const cz = (j + 0.5) * P;
      if (Math.abs(cx) < plazaX && Math.abs(cz) < plazaZ) continue; // îlot dans la place
      if (Math.hypot(cx, cz) > R + rng.range(-P, P)) continue;
      const dd = Math.max(Math.abs(cx) - plazaX, Math.abs(cz) - plazaZ, 0);
      const t = Math.min(1, dd / span);
      if (rng.next() < E.parkShare) {
        out.parks.push({ x: cx, z: cz, w: P - S, d: P - S });
        const n = 4 + rng.int(6);
        for (let k = 0; k < n; k++) {
          addTree(out.trees, rng, cx + rng.range(-0.4, 0.4) * usable, cz + rng.range(-0.4, 0.4) * usable, rng.range(1.0, 1.6));
        }
        continue;
      }
      const hMin = lerp(E.heightNear[0], E.heightFar[0], t);
      const hMax = lerp(E.heightNear[1], E.heightFar[1], t);
      const height = (): number => hMin + (hMax - hMin) * Math.pow(rng.next(), 1.4);
      const kind = rng.next();
      if (t >= E.towerMinT && kind < lerp(E.towerShareNear, E.towerShareFar, (t - E.towerMinT) / (1 - E.towerMinT))) {
        // Tour : socle, fût étroit, parfois un retrait au sommet, antenne.
        const podiumH = snapHeight(rng.range(6, 12));
        out.blocks.push({ x: cx, y: 0, z: cz, w: snapWidth(usable - 1), h: podiumH, d: snapWidth(usable - 1), color: rng.int(E.facades.length) });
        const shaft = snapWidth(usable * rng.range(0.5, 0.68));
        const shaftH = snapHeight(height() * E.towerBoost + E.towerExtra);
        const color = rng.int(E.towerFacades.length);
        out.towers.push({ x: cx, y: podiumH, z: cz, w: shaft, h: shaftH, d: shaft, color });
        let top = podiumH + shaftH;
        if (rng.next() < 0.6) {
          const w2 = snapWidth(shaft * 0.66);
          const h2 = snapHeight(rng.range(8, 22));
          out.towers.push({ x: cx, y: top, z: cz, w: w2, h: h2, d: w2, color });
          top += h2;
        }
        out.roofProps.push({ x: cx, y: top, z: cz, w: 0.5, h: rng.range(6, 14), d: 0.5, color: 3 });
        continue;
      }
      // Immeubles : 1, 2 ou 4 parcelles.
      const split = kind < 0.45 ? 1 : kind < 0.75 ? 2 : 4;
      const alongX = rng.next() < 0.5;
      const parcels: RectSpec[] = [];
      if (split === 1) parcels.push({ x: cx, z: cz, w: usable, d: usable });
      else if (split === 2) {
        for (const s of [-1, 1]) {
          parcels.push(
            alongX
              ? { x: cx + (s * usable) / 4, z: cz, w: usable / 2, d: usable }
              : { x: cx, z: cz + (s * usable) / 4, w: usable, d: usable / 2 },
          );
        }
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) parcels.push({ x: cx + (sx * usable) / 4, z: cz + (sz * usable) / 4, w: usable / 2, d: usable / 2 });
      }
      for (const p of parcels) {
        const w = snapWidth(p.w - 2 * rng.range(0.3, 1.8));
        const d = snapWidth(p.d - 2 * rng.range(0.3, 1.8));
        const h = snapHeight(height());
        const x = p.x + rng.range(-0.5, 0.5) * (p.w - w);
        const z = p.z + rng.range(-0.5, 0.5) * (p.d - d);
        out.blocks.push({ x, y: 0, z, w, h, d, color: rng.int(E.facades.length) });
        // Équipements de toit : climatiseurs, réservoir.
        const props = rng.next() < 0.6 ? 1 + rng.int(3) : 0;
        for (let k = 0; k < props; k++) {
          const pw = rng.range(1.6, 3.6);
          const pd = rng.range(1.6, 3.6);
          out.roofProps.push({
            x: x + rng.range(-0.5, 0.5) * Math.max(0, w - pw - 1),
            y: h,
            z: z + rng.range(-0.5, 0.5) * Math.max(0, d - pd - 1),
            w: pw,
            h: rng.range(1.0, 2.6),
            d: pd,
            color: rng.int(3),
          });
        }
      }
      // Arbres d'alignement sur un trottoir de l'îlot.
      if (rng.next() < 0.35) {
        const side = rng.int(4);
        const half = (P - S) / 2 - sw / 2;
        for (let k = -1; k <= 1; k++) {
          const a = (k * usable) / 3;
          const x = side < 2 ? cx + a : cx + (side === 2 ? -half : half);
          const z = side < 2 ? cz + (side === 0 ? -half : half) : cz + a;
          addTree(out.trees, rng, x, z, rng.range(0.7, 0.95));
        }
      }
    }
  }

  // Place : arbres alignés le long de son bord, en laissant les pylônes dégagés.
  const inset = 5;
  const pylons = pylonPositions(st);
  const ringTree = (x: number, z: number): void => {
    for (const p of pylons) if (Math.hypot(x - p.x, z - p.z) < 8) return;
    addTree(out.trees, rng, x, z, rng.range(0.85, 1.1));
  };
  const tx = plazaX - inset;
  const tz = plazaZ - inset;
  for (let x = -tx; x <= tx + 1e-6; x += (2 * tx) / Math.max(1, Math.round((2 * tx) / E.treeSpacing))) {
    ringTree(x, -tz);
    ringTree(x, tz);
  }
  for (let z = -tz; z <= tz + 1e-6; z += (2 * tz) / Math.max(1, Math.round((2 * tz) / E.treeSpacing))) {
    if (Math.abs(Math.abs(z) - tz) < 1e-6) continue; // coins déjà plantés
    ringTree(-tx, z);
    ringTree(tx, z);
  }

  // Voitures : sur les rues entièrement hors de la place (elles ne la traversent jamais), deux sens par rue.
  const lane = S / 4;
  for (let k = -N; k <= N; k++) {
    const c = k * P;
    if (Math.abs(c) - S / 2 >= plazaX - 1e-6) {
      for (const dir of [-1, 1]) {
        for (let n = 0; n < E.carsPerLane; n++) out.cars.push({ x: c + dir * lane, z: rng.range(-R, R), dx: 0, dz: dir, color: rng.int(E.carColors.length) });
      }
    }
    if (Math.abs(c) - S / 2 >= plazaZ - 1e-6) {
      for (const dir of [-1, 1]) {
        for (let n = 0; n < E.carsPerLane; n++) out.cars.push({ x: rng.range(-R, R), z: c - dir * lane, dx: dir, dz: 0, color: rng.int(E.carColors.length) });
      }
    }
  }

  // Silhouettes lointaines : couronne de blocs hors du brouillard.
  for (let k = 0; k < E.skylineCount; k++) {
    const a = ((k + rng.range(-0.35, 0.35)) / E.skylineCount) * Math.PI * 2;
    const r = rng.range(E.skylineDistance[0], E.skylineDistance[1]);
    const w = rng.range(E.skylineWidth[0], E.skylineWidth[1]);
    out.skyline.push({
      x: Math.cos(a) * r,
      y: 0,
      z: Math.sin(a) * r,
      w,
      h: lerp(E.skylineHeight[0], E.skylineHeight[1], Math.pow(rng.next(), 1.3)),
      d: w * rng.range(0.6, 1.2),
      color: rng.int(E.skylineColors.length),
    });
  }
  return out;
}
