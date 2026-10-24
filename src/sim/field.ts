/**
 * Terrain : création de la disposition et requêtes de hauteur / normale / faces.
 *
 * Fonctions PURES, partagées par la simulation (joueurs, ballon) et le rendu
 * (construction des maillages Three.js) : un seul modèle du relief, aucune
 * divergence possible entre ce qu'on voit et ce sur quoi on court.
 *
 * Repère local d'un relief orienté (rampe, muret) — `rotation` = yaw de l'axe local +Z :
 *   axe local +Z (longueur) = (sin r, 0, cos r)   (même convention que forward(yaw))
 *   axe local +X            = (cos r, 0, -sin r)
 *   lz = dx·sin r + dz·cos r ;  lx = dx·cos r − dz·sin r   (dx, dz relatifs au centre)
 *
 * Profils :
 *   - butte  : h · (0,5 + 0,5·cos(π·d/R)) pour d < R (bosse lisse, pente nulle au sommet et au bord) ;
 *   - rampe  : coin qui monte linéairement de 0 (lz = −L/2) à h (lz = +L/2), puis retombe verticalement ;
 *   - muret  : boîte de hauteur h.
 * La hauteur du sol est le max des reliefs (0 hors relief).
 */

import {
  FIELD_FEATURES_HALF_5V5,
  FIELD_LENGTH_5V5,
  FIELD_SCALE_3V3,
  FIELD_WIDTH_5V5,
  IN_GOAL_DEPTH_5V5,
} from './constants';
import type { FieldLayout, RampFeature, TeamSize, TerrainFeature, WallFeature } from './types';
import { wrapAngle, type Vec3 } from './vec';

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/** Facteur d'échelle du terrain pour une taille d'équipe (1 en 5v5, FIELD_SCALE_3V3 en 3v3). */
export const fieldScaleFor = (teamSize: TeamSize): number => (teamSize === 3 ? FIELD_SCALE_3V3 : 1);

/** Copie d'un relief avec positions et tailles horizontales multipliées par `s` (hauteur inchangée). */
function scaleFeature(f: TerrainFeature, s: number): TerrainFeature {
  switch (f.kind) {
    case 'mound':
      return { kind: 'mound', x: f.x * s, z: f.z * s, radius: f.radius * s, height: f.height };
    case 'ramp':
      return {
        kind: 'ramp',
        x: f.x * s,
        z: f.z * s,
        width: f.width * s,
        length: f.length * s,
        height: f.height,
        rotation: f.rotation,
      };
    case 'wall':
      return {
        kind: 'wall',
        x: f.x * s,
        z: f.z * s,
        length: f.length * s,
        thickness: f.thickness * s,
        height: f.height,
        rotation: f.rotation,
      };
  }
}

/**
 * Image d'un relief par la rotation de 180° autour du centre du terrain.
 * (`0 - v` plutôt que `-v` : pas de -0 dans l'état, qui ne survivrait pas à un aller-retour JSON.)
 */
export function mirrorFeature(f: TerrainFeature): TerrainFeature {
  if (f.kind === 'mound') return { ...f, x: 0 - f.x, z: 0 - f.z };
  return { ...f, x: 0 - f.x, z: 0 - f.z, rotation: wrapAngle(f.rotation + Math.PI) };
}

/**
 * Crée le terrain pour une taille d'équipe. Disposition fixe (FIELD_FEATURES_HALF_5V5),
 * symétrique par rotation de 180°. Les reliefs du camp de l'équipe 0 (z < 0) viennent
 * d'abord, puis leurs images dans le même ordre.
 */
export function createField(teamSize: TeamSize): FieldLayout {
  const s = fieldScaleFor(teamSize);
  const length = FIELD_LENGTH_5V5 * s;
  const inGoalDepth = IN_GOAL_DEPTH_5V5 * s;
  const half = FIELD_FEATURES_HALF_5V5.map((f) => scaleFeature(f, s));
  return {
    width: FIELD_WIDTH_5V5 * s,
    length,
    inGoalDepth,
    tryLineZ: length / 2 - inGoalDepth,
    scale: s,
    features: [...half, ...half.map(mirrorFeature)],
  };
}

// ---------------------------------------------------------------------------
// Géométrie d'un relief orienté (rampe / muret)
// ---------------------------------------------------------------------------

/** Demi-extensions locales (X = largeur/épaisseur, Z = longueur) d'un relief orienté. */
function halfExtents(f: RampFeature | WallFeature): { hx: number; hz: number } {
  return f.kind === 'ramp' ? { hx: f.width / 2, hz: f.length / 2 } : { hx: f.thickness / 2, hz: f.length / 2 };
}

/** Hauteur du dessus d'un relief orienté en un point local SITUÉ dans son empreinte. */
function boxTopAt(f: RampFeature | WallFeature, lz: number, hz: number): number {
  if (f.kind === 'wall') return f.height;
  return hz > 0 ? (f.height * (lz + hz)) / (2 * hz) : f.height;
}

/**
 * Hauteur de support d'un relief en (x, z) pour un corps de rayon `radius` (0 = point).
 * Rampe / muret : empreinte élargie du rayon (rectangle aux coins arrondis), hauteur prise
 * au point de l'empreinte le plus proche. Butte : échantillonnée au centre du corps.
 * Renvoie 0 hors du relief.
 */
export function featureSupport(f: TerrainFeature, x: number, z: number, radius: number): number {
  const dx = x - f.x;
  const dz = z - f.z;
  if (f.kind === 'mound') {
    const d2 = dx * dx + dz * dz;
    if (d2 >= f.radius * f.radius) return 0;
    const d = Math.sqrt(d2);
    return f.height * (0.5 + 0.5 * Math.cos((Math.PI * d) / f.radius));
  }
  const s = Math.sin(f.rotation);
  const c = Math.cos(f.rotation);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const { hx, hz } = halfExtents(f);
  if (lx > hx + radius || lx < -hx - radius || lz > hz + radius || lz < -hz - radius) return 0;
  const cx = lx < -hx ? -hx : lx > hx ? hx : lx;
  const cz = lz < -hz ? -hz : lz > hz ? hz : lz;
  const ex = lx - cx;
  const ez = lz - cz;
  if (ex * ex + ez * ez > radius * radius) return 0;
  return boxTopAt(f, cz, hz);
}

// ---------------------------------------------------------------------------
// Requêtes publiques
// ---------------------------------------------------------------------------

/** Hauteur du sol au point (x, z) : max des reliefs, 0 sur le terrain plat. */
export function groundHeight(field: FieldLayout, x: number, z: number): number {
  let h = 0;
  for (const f of field.features) {
    const fh = featureSupport(f, x, z, 0);
    if (fh > h) h = fh;
  }
  return h;
}

/**
 * Hauteur de support pour un corps de rayon `radius` centré en (x, z) (joueurs) :
 * murets et rampes portent le corps dès que son disque touche leur empreinte ;
 * les buttes sont échantillonnées au centre. supportHeight(f, x, z, 0) = groundHeight(f, x, z).
 */
export function supportHeight(field: FieldLayout, x: number, z: number, radius: number): number {
  let h = 0;
  for (const f of field.features) {
    const fh = featureSupport(f, x, z, radius);
    if (fh > h) h = fh;
  }
  return h;
}

/**
 * Gradient (dh/dx, dh/dz) du sol en (x, z), calculé ANALYTIQUEMENT sur le relief qui donne
 * la hauteur maximale (exact, et sans artefact au bord des faces verticales).
 */
export function groundGradient(field: FieldLayout, x: number, z: number): { gx: number; gz: number } {
  let best: TerrainFeature | null = null;
  let h = 0;
  for (const f of field.features) {
    const fh = featureSupport(f, x, z, 0);
    if (fh > h) {
      h = fh;
      best = f;
    }
  }
  if (best === null || best.kind === 'wall') return { gx: 0, gz: 0 };
  if (best.kind === 'mound') {
    const dx = x - best.x;
    const dz = z - best.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-9) return { gx: 0, gz: 0 };
    const k = -0.5 * best.height * Math.sin((Math.PI * d) / best.radius) * (Math.PI / best.radius);
    return { gx: (k * dx) / d, gz: (k * dz) / d };
  }
  const slope = best.length > 0 ? best.height / best.length : 0;
  return { gx: slope * Math.sin(best.rotation), gz: slope * Math.cos(best.rotation) };
}

/** Normale unitaire du sol en (x, z) (vers le haut). */
export function groundNormal(field: FieldLayout, x: number, z: number): Vec3 {
  const { gx, gz } = groundGradient(field, x, z);
  const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
  return { x: 0 - gx * inv, y: inv, z: 0 - gz * inv }; // `0 - v` : pas de -0 sur le plat
}

/** Contact avec une face verticale de relief (muret, côtés et dos de rampe). */
export interface FaceContact {
  /** Normale horizontale unitaire sortante (vers l'extérieur du relief). */
  nx: number;
  nz: number;
  /** Pénétration horizontale à corriger (m). */
  depth: number;
  /** Hauteur du dessus du relief au point de contact. */
  top: number;
}

/**
 * Cherche un contact LATÉRAL entre un corps (disque horizontal de rayon `radius` centré en
 * (x, z), base à la hauteur `bottomY`) et les faces verticales des murets / rampes.
 * Il n'y a contact que si la base du corps est plus basse que le dessus du relief de plus de
 * `tolerance` (sinon le corps est posé dessus ou passe au-dessus : c'est le sol qui gère).
 * La pente d'une rampe n'est pas une face : son extrémité basse (−Z local) ne repousse jamais.
 * Renvoie le contact le plus profond, ou null.
 */
export function faceContact(
  field: FieldLayout,
  x: number,
  bottomY: number,
  z: number,
  radius: number,
  tolerance: number,
): FaceContact | null {
  let best: FaceContact | null = null;
  for (const f of field.features) {
    if (f.kind === 'mound') continue;
    const s = Math.sin(f.rotation);
    const c = Math.cos(f.rotation);
    const dx = x - f.x;
    const dz = z - f.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const { hx, hz } = halfExtents(f);
    if (lx > hx + radius || lx < -hx - radius || lz > hz + radius || lz < -hz - radius) continue;
    const cx = lx < -hx ? -hx : lx > hx ? hx : lx;
    const cz = lz < -hz ? -hz : lz > hz ? hz : lz;
    const ex = lx - cx;
    const ez = lz - cz;
    const e2 = ex * ex + ez * ez;
    if (e2 > radius * radius) continue;
    const top = boxTopAt(f, cz, hz);
    if (bottomY >= top - tolerance) continue;
    let lnx: number;
    let lnz: number;
    let depth: number;
    if (e2 > 1e-12) {
      const e = Math.sqrt(e2);
      lnx = ex / e;
      lnz = ez / e;
      depth = radius - e;
      // Côté bas d'une rampe : c'est la pente, pas une face.
      if (f.kind === 'ramp' && lnz < -0.5) continue;
    } else {
      // Centre dans l'empreinte : sortie par le côté le moins enfoncé.
      lnx = 1;
      lnz = 0;
      depth = hx - lx + radius;
      const candidates: Array<[number, number, number]> = [
        [-1, 0, hx + lx + radius],
        [0, 1, hz - lz + radius],
      ];
      if (f.kind === 'wall') candidates.push([0, -1, hz + lz + radius]);
      for (const [cnx, cnz, cd] of candidates) {
        if (cd < depth) {
          lnx = cnx;
          lnz = cnz;
          depth = cd;
        }
      }
    }
    if (best === null || depth > best.depth) {
      // Local -> monde : axe X = (c, -s), axe Z = (s, c).
      best = { nx: lnx * c + lnz * s, nz: -lnx * s + lnz * c, depth, top };
    }
  }
  return best;
}
