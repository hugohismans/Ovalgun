/**
 * Outils communs du décor : accumulation d'instances (matrices + couleurs) avant de créer UN InstancedMesh, boîte
 * unité posée au sol, fragment GLSL de hachage partagé par les shaders du décor.
 */

import * as THREE from 'three';

/** Hachage 2D -> [0, 1) (GLSL), identique dans tous les shaders du décor. */
export const GLSL_HASH = [
  'float ogHash(vec2 p) {',
  '  p = fract(p * vec2(123.34, 456.21));',
  '  p += dot(p, p + 45.32);',
  '  return fract(p.x * p.y);',
  '}',
].join('\n');

/** Boîte 1 × 1 × 1 dont le pied est en y = 0 (les instances se placent par le centre de leur pied). */
export function unitBox(): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** Instances en attente : `build` crée l'InstancedMesh d'un coup (allocations au montage du décor seulement). */
export class InstanceBatch {
  private readonly matrices: number[] = [];
  private readonly colors: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  get count(): number {
    return this.matrices.length / 16;
  }

  /** Instance posée : pied en (x, y, z), échelle (sx, sy, sz), rotations (ordre YXZ : cap, puis inclinaison). */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0): void {
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.addMatrix(this.m, color);
  }

  addMatrix(m: THREE.Matrix4, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 16; i++) this.matrices.push(m.elements[i]);
    this.c.set(color);
    this.colors.push(this.c.r, this.c.g, this.c.b);
  }

  /**
   * Mélange l'ordre des instances (Fisher-Yates, `rand` dans [0, 1)) : les `n` premières forment alors un échantillon
   * uniforme, ce qui permet d'en dessiner une partie seulement (`InstancedMesh.count`, qualité graphique).
   */
  shuffle(rand: () => number): void {
    const n = this.count;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      if (j === i) continue;
      for (let k = 0; k < 16; k++) {
        const t = this.matrices[i * 16 + k];
        this.matrices[i * 16 + k] = this.matrices[j * 16 + k];
        this.matrices[j * 16 + k] = t;
      }
      for (let k = 0; k < 3; k++) {
        const t = this.colors[i * 3 + k];
        this.colors[i * 3 + k] = this.colors[j * 3 + k];
        this.colors[j * 3 + k] = t;
      }
    }
  }

  build(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.instanceMatrix.array.set(this.matrices);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3);
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  }
}
