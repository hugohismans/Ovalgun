/**
 * Ville autour du stade (placement : layout.ts) : sol (place, rues, trottoirs, parcelles), parcs, immeubles à
 * fenêtres, tours en murs-rideaux, équipements de toit, arbres (boules et cônes), voitures qui roulent, silhouettes
 * lointaines. 9 appels de dessin, tout en InstancedMesh (sauf le sol et les parcs, une géométrie chacun).
 */

import * as THREE from 'three';
import { ENVIRONMENT as E } from '../palette';
import { InstanceBatch } from './instancing';
import type { BoxSpec, CityLayout } from './layout';
import type { Built } from './Stadium';

export interface CityResources {
  box: THREE.BufferGeometry;
  roundTree: THREE.BufferGeometry;
  coneTree: THREE.BufferGeometry;
  car: THREE.BufferGeometry;
  groundMat: THREE.Material;
  parkMat: THREE.Material;
  blockMat: THREE.Material;
  towerMat: THREE.Material;
  propMat: THREE.Material;
  treeMat: THREE.Material;
  carMat: THREE.Material;
  skylineMat: THREE.Material;
}

/** Hauteur du haut du tronc des arbres (m, géométrie locale) : le shader des arbres colore en brun en dessous. */
export const TRUNK_TOP = 1.2;
/** Hauteur du bas de la cabine des voitures (m, géométrie locale). */
export const CAR_CABIN_Y = 0.85;

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of parts) {
    const g = g0.index === null ? g0 : g0.toNonIndexed();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** Arbre rond : tronc + boule low-poly. */
export function createRoundTree(): THREE.BufferGeometry {
  return merge([new THREE.CylinderGeometry(0.22, 0.3, TRUNK_TOP + 0.4, 5).translate(0, (TRUNK_TOP + 0.4) / 2, 0), new THREE.IcosahedronGeometry(2.1, 0).translate(0, TRUNK_TOP + 2.0, 0)]);
}

/** Arbre en cône (sapin stylisé) : tronc + deux cônes. */
export function createConeTree(): THREE.BufferGeometry {
  return merge([
    new THREE.CylinderGeometry(0.2, 0.26, TRUNK_TOP + 0.3, 5).translate(0, (TRUNK_TOP + 0.3) / 2, 0),
    new THREE.ConeGeometry(2.0, 3.6, 7).translate(0, TRUNK_TOP + 1.8, 0),
    new THREE.ConeGeometry(1.45, 2.8, 7).translate(0, TRUNK_TOP + 3.6, 0),
  ]);
}

/** Voiture : caisse + cabine (vitres via le shader au-dessus de CAR_CABIN_Y), avant vers +X. */
export function createCarGeometry(): THREE.BufferGeometry {
  return merge([new THREE.BoxGeometry(4.2, 0.85, 1.9).translate(0, 0.425 + 0.25, 0), new THREE.BoxGeometry(2.3, 0.7, 1.7).translate(-0.3, 1.1 + 0.25 - 0.1, 0)]);
}

function boxes(list: readonly BoxSpec[], colors: readonly string[], geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
  const b = new InstanceBatch();
  for (const s of list) b.add(s.x, s.y, s.z, s.w, s.h, s.d, colors[s.color]);
  return b.build(geo, mat);
}

export function buildCity(city: CityLayout, res: CityResources): Built {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const meshes: THREE.InstancedMesh[] = [];

  // Sol : un grand plan sous le terrain (le sol du FieldView ne couvre que l'intérieur du stade).
  const size = 2 * (E.cityRadius + 2 * E.cityBlock);
  const groundGeo = new THREE.PlaneGeometry(size, size);
  groundGeo.rotateX(-Math.PI / 2);
  geos.push(groundGeo);
  const ground = new THREE.Mesh(groundGeo, res.groundMat);
  ground.position.y = -0.04;
  group.add(ground);

  // Parcs : quads verts fusionnés, juste au-dessus du sol.
  const pp: number[] = [];
  const pi: number[] = [];
  for (const p of city.parks) {
    const b = pp.length / 3;
    const hx = p.w / 2;
    const hz = p.d / 2;
    pp.push(p.x - hx, 0, p.z - hz, p.x - hx, 0, p.z + hz, p.x + hx, 0, p.z + hz, p.x + hx, 0, p.z - hz);
    pi.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const parkGeo = new THREE.BufferGeometry();
  parkGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  parkGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pp.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  parkGeo.setIndex(pi);
  geos.push(parkGeo);
  const parks = new THREE.Mesh(parkGeo, res.parkMat);
  parks.position.y = 0.02;
  group.add(parks);

  meshes.push(boxes(city.blocks, E.facades, res.box, res.blockMat));
  meshes.push(boxes(city.towers, E.towerFacades, res.box, res.towerMat));
  meshes.push(boxes(city.roofProps, E.roofProps, res.box, res.propMat));
  meshes.push(boxes(city.skyline, E.skylineColors, res.box, res.skylineMat));

  const round = new InstanceBatch();
  const cone = new InstanceBatch();
  // Rotation des arbres tirée de leur position (déterministe, sans PRNG supplémentaire).
  for (const t of city.trees) (t.kind === 0 ? round : cone).add(t.x, 0, t.z, t.scale, t.scale, t.scale, E.treeGreens[t.color], (t.x * 0.37 + t.z * 0.11) % (Math.PI * 2));
  meshes.push(round.build(res.roundTree, res.treeMat), cone.build(res.coneTree, res.treeMat));

  const cars = new InstanceBatch();
  for (const c of city.cars) cars.add(c.x, 0, c.z, 1, 1, 1, E.carColors[c.color], Math.atan2(-c.dz, c.dx));
  const carMesh = cars.build(res.car, res.carMat);
  // Les voitures bougent dans le shader : pas de découpage par sphère englobante.
  carMesh.frustumCulled = false;
  meshes.push(carMesh);

  group.add(...meshes);
  return {
    group,
    dispose(): void {
      for (const m of meshes) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
