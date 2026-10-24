/**
 * Maths vectorielles minimales pour la simulation.
 *
 * Repère (identique à Three.js pour éviter toute conversion) :
 *   - X : largeur du terrain
 *   - Y : vertical (haut positif)
 *   - Z : longueur du terrain. L'équipe 0 attaque vers +Z, l'équipe 1 vers -Z.
 *
 * Angles :
 *   - yaw = 0 regarde vers +Z ; forward(yaw) = (sin yaw, 0, cos yaw).
 *     Tourner à droite = yaw diminue (souris vers la droite => yaw -= dx * sensibilité).
 *   - right(yaw) = (-cos yaw, 0, sin yaw).
 *   - pitch > 0 regarde vers le haut.
 *
 * Les vecteurs sont de simples objets {x, y, z} (sérialisables en JSON).
 * Les fonctions ne mutent jamais leurs arguments, sauf celles suffixées `Mut`.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const copy = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const lenXZ = (a: Vec3 | Vec2): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const distXZ = (a: Vec3 | Vec2, b: Vec3 | Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
};
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
};
/** Normalise la composante horizontale (y forcé à 0). */
export const normalizeXZ = (a: Vec3): Vec3 => {
  const l = lenXZ(a);
  return l > 1e-9 ? { x: a.x / l, y: 0, z: a.z / l } : v3();
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Copie b dans a (mutation). */
export const setMut = (a: Vec3, b: Vec3): Vec3 => {
  a.x = b.x;
  a.y = b.y;
  a.z = b.z;
  return a;
};

/** Direction horizontale du regard. */
export const forward = (yaw: number): Vec3 => ({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) });
/** Droite horizontale (perpendiculaire à forward). */
export const right = (yaw: number): Vec3 => ({ x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) });
/** Direction de visée 3D (unitaire). */
export const aimDir = (yaw: number, pitch: number): Vec3 => {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
};
/** Yaw correspondant à une direction horizontale. */
export const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

const TAU = Math.PI * 2;
/** Ramène un angle dans ]-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
};
/** Plus petite différence signée b - a. */
export const angleDiff = (a: number, b: number): number => wrapAngle(b - a);
/** Interpolation d'angle par le plus court chemin. */
export const lerpAngle = (a: number, b: number, t: number): number => a + angleDiff(a, b) * t;
/** Rapproche `v` de `target` d'au plus `maxDelta`. */
export const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);

/**
 * Distance au carré entre le point P et le segment [A, B], ainsi que le
 * paramètre t ∈ [0,1] du point le plus proche.
 */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): { t: number; d2: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (l2 > 1e-12) t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  const cx = a.x + abx * t - p.x;
  const cy = a.y + aby * t - p.y;
  const cz = a.z + abz * t - p.z;
  return { t, d2: cx * cx + cy * cy + cz * cz };
}

/**
 * Distance au carré entre deux segments [p1,q1] et [p2,q2] et paramètres
 * (s sur le premier, t sur le second). Algorithme classique (Ericson, RTCD 5.1.9).
 */
export function segmentSegment(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): { s: number; t: number; d2: number } {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const EPS = 1e-12;
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    return { s: 0, t: 0, d2: dot(r, r) };
  }
  if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = addScaled(p1, d1, s);
  const c2 = addScaled(p2, d2, t);
  const diff = sub(c1, c2);
  return { s, t, d2: dot(diff, diff) };
}
