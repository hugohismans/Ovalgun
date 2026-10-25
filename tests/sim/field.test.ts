/**
 * Terrain : symétrie, échelle 3v3, bornes des reliefs, zones dégagées, cohérence des requêtes.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_CENTER_CLEARANCE,
  FIELD_FEATURES_HALF_5V5,
  FIELD_LENGTH_5V5,
  FIELD_SCALE_3V3,
  FIELD_TRY_LINE_CLEARANCE,
  FIELD_WIDTH_5V5,
  IN_GOAL_DEPTH_5V5,
  KICKOFF_DEFEND_OFFSET,
  KICKOFF_RECEIVE_OFFSET,
  MAX_CLIMB_HEIGHT,
  PLAYER_RADIUS,
  createField,
  createMatch,
  faceContact,
  formationSlot,
  groundGradient,
  groundHeight,
  groundNormal,
  supportHeight,
  type FieldLayout,
  type TeamSize,
} from '../../src/sim';
import { ROLES_3 } from './helpers';

const sizes: TeamSize[] = [3, 5];

/** Grille de points couvrant tout le terrain. */
function grid(f: FieldLayout, stepM = 0.5): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let x = -f.width / 2; x <= f.width / 2; x += stepM) {
    for (let z = -f.length / 2; z <= f.length / 2; z += stepM) pts.push([x, z]);
  }
  return pts;
}

describe.each(sizes)('terrain %i joueurs par équipe', (teamSize) => {
  const f = createField(teamSize);
  const s = f.scale;

  it('dimensions et ligne d’essai', () => {
    expect(f.scale).toBe(teamSize === 3 ? FIELD_SCALE_3V3 : 1);
    expect(f.width).toBeCloseTo(FIELD_WIDTH_5V5 * s, 12);
    expect(f.length).toBeCloseTo(FIELD_LENGTH_5V5 * s, 12);
    expect(f.inGoalDepth).toBeCloseTo(IN_GOAL_DEPTH_5V5 * s, 12);
    expect(f.tryLineZ).toBeCloseTo(f.length / 2 - f.inGoalDepth, 12);
  });

  it('symétrique par rotation de 180° (équité)', () => {
    const n = f.features.length / 2;
    expect(n).toBe(FIELD_FEATURES_HALF_5V5.length);
    for (let i = 0; i < n; i++) {
      const a = f.features[i];
      const b = f.features[i + n];
      expect(b.kind).toBe(a.kind);
      expect(b.x).toBeCloseTo(-a.x, 12);
      expect(b.z).toBeCloseTo(-a.z, 12);
    }
    for (const [x, z] of grid(f, 0.37)) {
      expect(groundHeight(f, -x, -z)).toBeCloseTo(groundHeight(f, x, z), 9);
      expect(supportHeight(f, -x, -z, PLAYER_RADIUS)).toBeCloseTo(supportHeight(f, x, z, PLAYER_RADIUS), 9);
    }
  });

  it('hauteurs dans les bornes, toutes franchissables', () => {
    let mounds = 0;
    let ramps = 0;
    let walls = 0;
    for (const ft of f.features) {
      expect(ft.height).toBeLessThanOrEqual(MAX_CLIMB_HEIGHT);
      if (ft.kind === 'mound') {
        mounds++;
        expect(ft.height).toBeGreaterThanOrEqual(0.8);
        expect(ft.height).toBeLessThanOrEqual(1.4);
      } else if (ft.kind === 'ramp') {
        ramps++;
        expect(ft.height).toBeLessThanOrEqual(1.1);
      } else {
        walls++;
        expect(ft.height).toBeGreaterThanOrEqual(0.6);
        expect(ft.height).toBeLessThanOrEqual(1.0);
      }
    }
    expect(mounds / 2).toBeGreaterThanOrEqual(1);
    expect(ramps / 2).toBeGreaterThanOrEqual(1);
    expect(walls / 2).toBeGreaterThanOrEqual(2);
    let maxH = 0;
    for (const [x, z] of grid(f)) maxH = Math.max(maxH, groundHeight(f, x, z));
    expect(maxH).toBeLessThanOrEqual(MAX_CLIMB_HEIGHT);
  });

  it('rien dans les en-buts, près des lignes d’essai, dans le couloir central ni au bord', () => {
    const tryClear = f.tryLineZ - FIELD_TRY_LINE_CLEARANCE * s;
    const centerClear = FIELD_CENTER_CLEARANCE * s;
    for (const [x, z] of grid(f, 0.25)) {
      const free = Math.abs(z) >= tryClear || Math.abs(z) <= centerClear || Math.abs(x) >= f.width / 2 - 1;
      if (free) expect(supportHeight(f, x, z, PLAYER_RADIUS), `(${x}, ${z})`).toBe(0);
    }
  });

  it('positions de formation et de remise en jeu sur du plat', () => {
    const dists = [KICKOFF_DEFEND_OFFSET * s, f.tryLineZ - KICKOFF_RECEIVE_OFFSET * s];
    for (const d of dists) {
      for (const team of [0, 1] as const) {
        for (let i = 0; i < teamSize; i++) {
          const slot = formationSlot(f, teamSize, team, i, d);
          expect(supportHeight(f, slot.x, slot.z, PLAYER_RADIUS * 3)).toBe(0);
        }
      }
    }
  });

  it('de vrais couloirs de course : au moins 4 lignes droites dégagées d’un bout à l’autre', () => {
    let lanes = 0;
    let inLane = false;
    for (let x = -f.width / 2 + PLAYER_RADIUS; x <= f.width / 2 - PLAYER_RADIUS; x += 0.1) {
      let clear = true;
      for (let z = -f.length / 2; z <= f.length / 2 && clear; z += 0.2) clear = supportHeight(f, x, z, PLAYER_RADIUS) === 0;
      if (clear && !inLane) lanes++;
      inLane = clear;
    }
    expect(lanes).toBeGreaterThanOrEqual(4);
  });

  it('groundHeight et supportHeight cohérents', () => {
    for (const [x, z] of grid(f, 0.31)) {
      const g = groundHeight(f, x, z);
      expect(supportHeight(f, x, z, 0)).toBe(g);
      expect(supportHeight(f, x, z, PLAYER_RADIUS)).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(0);
    }
    // Sur un muret : hauteur du muret, même au bord intérieur ; juste à côté : portée par le rayon seulement.
    const wall = f.features.find((ft) => ft.kind === 'wall' && Math.abs(Math.sin(ft.rotation)) < 1e-9);
    expect(wall).toBeDefined();
    if (wall && wall.kind === 'wall') {
      const edge = wall.x + wall.thickness / 2;
      expect(groundHeight(f, wall.x, wall.z)).toBe(wall.height);
      expect(groundHeight(f, edge - 1e-6, wall.z)).toBe(wall.height);
      expect(groundHeight(f, edge + 0.2, wall.z)).toBe(0);
      expect(supportHeight(f, edge + 0.2, wall.z, PLAYER_RADIUS)).toBe(wall.height);
      expect(supportHeight(f, edge + PLAYER_RADIUS + 0.01, wall.z, PLAYER_RADIUS)).toBe(0);
    }
  });

  it('normale du sol unitaire, verticale sur le plat, cohérente avec le gradient numérique', () => {
    const flat = groundNormal(f, 0, 0);
    // Comparaison numérique (=== ignore le signe du zéro) ; le sens « pas de -0 » est vérifié à part.
    expect(flat.x === 0 && flat.y === 1 && flat.z === 0).toBe(true);
    expect(Object.is(flat.x, -0) || Object.is(flat.z, -0)).toBe(false);
    const eps = 1e-4;
    for (const ft of f.features) {
      if (ft.kind === 'wall') continue;
      // Points à l'intérieur du relief, loin des bords.
      const probes: Array<[number, number]> =
        ft.kind === 'mound'
          ? [[ft.x + ft.radius * 0.5, ft.z], [ft.x, ft.z - ft.radius * 0.3], [ft.x - ft.radius * 0.2, ft.z + ft.radius * 0.4]]
          : [[ft.x, ft.z]];
      for (const [x, z] of probes) {
        const n = groundNormal(f, x, z);
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 12);
        expect(n.y).toBeGreaterThan(0.8);
        const { gx, gz } = groundGradient(f, x, z);
        const ngx = (groundHeight(f, x + eps, z) - groundHeight(f, x - eps, z)) / (2 * eps);
        const ngz = (groundHeight(f, x, z + eps) - groundHeight(f, x, z - eps)) / (2 * eps);
        expect(gx).toBeCloseTo(ngx, 5);
        expect(gz).toBeCloseTo(ngz, 5);
      }
    }
  });

  it('faces verticales : contact latéral au pied d’un muret, pas au-dessus, pas sur la pente d’une rampe', () => {
    for (const ft of f.features) {
      if (ft.kind === 'mound') continue;
      // Point juste à côté de la face +X locale, à mi-longueur.
      const c = Math.cos(ft.rotation);
      const sn = Math.sin(ft.rotation);
      const hx = (ft.kind === 'wall' ? ft.thickness : ft.width) / 2;
      const off = hx + 0.1;
      const lz = ft.kind === 'ramp' ? ft.length * 0.4 : 0; // côté haut de la rampe
      const x = ft.x + off * c + lz * sn;
      const z = ft.z - off * sn + lz * c;
      const hit = faceContact(f, x, 0, z, 0.12, 0.12);
      expect(hit).not.toBeNull();
      if (hit) {
        expect(hit.nx).toBeCloseTo(c, 9);
        expect(hit.nz).toBeCloseTo(-sn, 9);
        expect(hit.depth).toBeCloseTo(0.02, 9);
      }
      expect(faceContact(f, x, ft.height + 0.01, z, 0.12, 0.12)).toBeNull();
      if (ft.kind === 'ramp') {
        // Bas de la pente (−Z local) : pas une face.
        const bx = ft.x - (ft.length / 2 + 0.05) * sn;
        const bz = ft.z - (ft.length / 2 + 0.05) * c;
        expect(faceContact(f, bx, 0, bz, 0.12, 0.12)).toBeNull();
      }
    }
  });
});

describe('échelle 3v3', () => {
  it('positions et tailles horizontales ×FIELD_SCALE_3V3, hauteurs inchangées', () => {
    const big = createField(5);
    const small = createField(3);
    expect(small.features.length).toBe(big.features.length);
    big.features.forEach((a, i) => {
      const b = small.features[i];
      expect(b.kind).toBe(a.kind);
      expect(b.x).toBeCloseTo(a.x * FIELD_SCALE_3V3, 12);
      expect(b.z).toBeCloseTo(a.z * FIELD_SCALE_3V3, 12);
      expect(b.height).toBe(a.height);
      if (a.kind === 'mound' && b.kind === 'mound') expect(b.radius).toBeCloseTo(a.radius * FIELD_SCALE_3V3, 12);
      if (a.kind === 'wall' && b.kind === 'wall') {
        expect(b.length).toBeCloseTo(a.length * FIELD_SCALE_3V3, 12);
        expect(b.rotation).toBe(a.rotation);
      }
    });
  });

  it('le match 3v3 utilise le terrain réduit et place les équipes chacune dans son camp', () => {
    const m = createMatch({ teamSize: 3, seed: 1, roles: ROLES_3 });
    expect(m.field.width).toBeCloseTo(FIELD_WIDTH_5V5 * FIELD_SCALE_3V3, 12);
    for (const p of m.players) {
      if (p.team === 0) {
        expect(p.pos.z).toBeLessThan(0);
        expect(p.yaw).toBe(0);
      } else {
        expect(p.pos.z).toBeGreaterThan(0);
        expect(p.yaw).toBe(Math.PI);
      }
      expect(Math.abs(p.pos.x)).toBeLessThan(m.field.width / 2);
    }
    // Étape 6 : le match commence par un coup d'envoi (ballon porté), détaillé dans rules.test.ts.
    expect(m.phase).toBe('kickoff');
    expect(m.ball.mode).toBe('carried');
  });
});
