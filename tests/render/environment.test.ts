/**
 * Décor (src/render/environment) : placement déterministe du stade et de la ville pour les deux tailles de terrain,
 * rien dans la place qui entoure le stade, décor hors de portée de la caméra épaule, budget d'appels de dessin,
 * reconstruction / libération, excitation de la foule. Sans WebGL : graphe de scène et données de placement seulement.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Environment, cityLayout, pylonPositions, stadiumLayout } from '../../src/render/environment';
import { ENVIRONMENT } from '../../src/render/palette';
import { CAMERA_DISTANCE_CARRY, CAMERA_CARRY_RAISE } from '../../src/sim/constants';
import { createField } from '../../src/sim/field';

const SIZES = [3, 5] as const;

/** Un rectangle (centre, demi-dimensions) chevauche-t-il le rectangle centré |x| < hx, |z| < hz ? */
const overlaps = (x: number, z: number, hw: number, hd: number, hx: number, hz: number): boolean => Math.abs(x) - hw < hx && Math.abs(z) - hd < hz;

describe('Décor : placement', () => {
  it('stade au-delà de la portée de la caméra épaule, pour les deux terrains', () => {
    for (const n of SIZES) {
      const f = createField(n);
      const st = stadiumLayout(f.width, f.length);
      // La caméra reste à au plus ≈ distance du porteur + montée (+ marge d'épaule) des murs invisibles.
      const reach = CAMERA_DISTANCE_CARRY + CAMERA_CARRY_RAISE + 1;
      expect(st.innerX - f.width / 2).toBeGreaterThan(reach);
      expect(st.innerZ - f.length / 2).toBeGreaterThan(reach);
      expect(st.outerX).toBeGreaterThan(st.innerX);
      expect(st.wallHeight).toBeGreaterThan(st.topHeight);
    }
  });

  it('ville déterministe, et rien (immeuble, arbre, parc, voiture) dans la place autour du stade', () => {
    for (const n of SIZES) {
      const f = createField(n);
      const st = stadiumLayout(f.width, f.length);
      const a = cityLayout(st);
      const b = cityLayout(st);
      expect(b).toEqual(a);
      // La place contient le stade et sa marge.
      expect(a.plazaX).toBeGreaterThanOrEqual(st.outerX + ENVIRONMENT.plazaMargin);
      expect(a.plazaZ).toBeGreaterThanOrEqual(st.outerZ + ENVIRONMENT.plazaMargin);
      expect(a.blocks.length).toBeGreaterThan(200);
      expect(a.towers.length).toBeGreaterThan(5);
      for (const s of [...a.blocks, ...a.towers, ...a.roofProps, ...a.skyline]) {
        expect(overlaps(s.x, s.z, s.w / 2, s.d / 2, a.plazaX, a.plazaZ), `immeuble en ${s.x}, ${s.z}`).toBe(false);
      }
      for (const p of a.parks) expect(overlaps(p.x, p.z, p.w / 2, p.d / 2, a.plazaX, a.plazaZ)).toBe(false);
      for (const c of a.cars) {
        // Les voitures roulent sur toute la longueur de leur rue : la rue elle-même est hors de la place.
        if (c.dz !== 0) expect(Math.abs(c.x)).toBeGreaterThan(a.plazaX);
        else expect(Math.abs(c.z)).toBeGreaterThan(a.plazaZ);
      }
      // Arbres : hors du stade (ceux de la place sont plantés entre le stade et la ville).
      for (const t of a.trees) expect(overlaps(t.x, t.z, 2, 2, st.outerX, st.outerZ), `arbre en ${t.x}, ${t.z}`).toBe(false);
      // Pylônes : derrière les tribunes, dans la place.
      for (const p of pylonPositions(st)) {
        expect(Math.abs(p.x)).toBeGreaterThan(st.outerX);
        expect(Math.abs(p.x)).toBeLessThan(a.plazaX);
        expect(Math.abs(p.z)).toBeLessThan(a.plazaZ);
      }
    }
  });
});

describe('Décor : Environment', () => {
  const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible) out.push(o);
    });
    return out;
  };

  it('peu d\'appels de dessin, instances partout, transparents en une seule passe', () => {
    const env = new Environment();
    const f = createField(5);
    env.build(f.width, f.length);
    const meshes = meshesOf(env.group);
    // Un appel de dessin par maillage (aucun matériau multiple) : budget du décor < 40.
    expect(meshes.length).toBeLessThan(30);
    const instanced = meshes.filter((m) => m instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    const total = instanced.reduce((s, m) => s + m.count, 0);
    expect(total).toBeGreaterThan(3000); // foule, immeubles, arbres, voitures… en InstancedMesh
    for (const m of meshes) {
      const mat = m.material as THREE.Material;
      expect(Array.isArray(m.material)).toBe(false);
      if (mat.transparent && mat.side === THREE.DoubleSide) expect(mat.forceSinglePass).toBe(true);
    }
    env.dispose();
  });

  it('reconstruit seulement quand la taille du terrain change, et libère l\'ancien décor', () => {
    const env = new Environment();
    const small = createField(3);
    const big = createField(5);
    env.build(small.width, small.length);
    const first = env.group.children.slice();
    env.build(small.width, small.length);
    expect(env.group.children).toEqual(first);
    let disposed = 0;
    for (const c of first) c.traverse((o) => o instanceof THREE.InstancedMesh && o.addEventListener('dispose', () => disposed++));
    env.build(big.width, big.length);
    expect(disposed).toBeGreaterThan(5);
    expect(env.group.children.length).toBe(first.length);
    env.dispose();
  });

  it('excitation de la foule : bornée, montée rapide, descente lente', () => {
    const env = new Environment();
    const cam = new THREE.PerspectiveCamera();
    env.setExcitement(5);
    env.update(0.1, 1, cam);
    const up = env.currentExcitement;
    expect(up).toBeGreaterThan(ENVIRONMENT.crowdIdleExcitement);
    for (let i = 0; i < 100; i++) env.update(0.1, 1 + i * 0.1, cam);
    expect(env.currentExcitement).toBeCloseTo(1, 3);
    env.setExcitement(0);
    env.update(0.1, 20, cam);
    // Descente plus lente que la montée.
    expect(1 - env.currentExcitement).toBeLessThan(up - ENVIRONMENT.crowdIdleExcitement);
    env.dispose();
  });
});
