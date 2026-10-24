/**
 * Ballon : chute, rebonds seedés, roulement, arrêt, murs, murets, ballon porté.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_BOUNCE_DEVIATION_DEG,
  BALL_CARRY_HEIGHT,
  BALL_RADIUS,
  createField,
  createMatch,
  groundHeight,
  step,
  type MatchState,
  type TerrainFeature,
  type Vec3,
} from '../../src/sim';
import { ROLES_5, hSpeed, only0, run, soloMatch } from './helpers';

/** Match où seul le ballon compte : joueurs rangés au fond, terrain donné, ballon placé. */
function ballMatch(seed: number, pos: Vec3, vel: Vec3, features: TerrainFeature[] = []): MatchState {
  const s = createMatch({ teamSize: 5, seed, roles: ROLES_5 });
  s.field.features = features;
  s.players.forEach((p, i) => {
    p.pos = { x: -20 + i * 3, y: 0, z: s.field.length / 2 - 1.5 };
  });
  s.ball.pos = { ...pos };
  s.ball.vel = { ...vel };
  return s;
}

interface Trace {
  bounces: { tick: number; speed: number }[];
  apexes: number[];
  restTick: number;
  s: MatchState;
}

function trace(s: MatchState, ticks: number): Trace {
  const bounces: { tick: number; speed: number }[] = [];
  const apexes: number[] = [];
  let restTick = -1;
  let prevVy = s.ball.vel.y;
  run(s, ticks, () => ({}), (st, t) => {
    for (const e of st.events) if (e.type === 'bounce') bounces.push({ tick: t, speed: e.speed });
    if (prevVy > 0 && st.ball.vel.y <= 0) apexes.push(st.ball.pos.y);
    prevVy = st.ball.vel.y;
    const v = st.ball.vel;
    if (restTick < 0 && v.x === 0 && v.y === 0 && v.z === 0) restTick = t;
  });
  return { bounces, apexes, restTick, s };
}

describe('ballon libre', () => {
  it('chute puis rebonds décroissants, puis arrêt au sol', () => {
    const t = trace(ballMatch(5, { x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0 }), 300);
    expect(t.bounces.length).toBeGreaterThanOrEqual(2);
    expect(t.bounces[0].speed).toBeCloseTo(Math.sqrt(2 * 16 * (3 - BALL_RADIUS)), 0);
    for (let i = 1; i < t.bounces.length; i++) expect(t.bounces[i].speed).toBeLessThan(t.bounces[i - 1].speed);
    for (let i = 1; i < t.apexes.length; i++) expect(t.apexes[i]).toBeLessThan(t.apexes[i - 1]);
    expect(t.restTick).toBeGreaterThan(0);
    expect(t.s.ball.pos.y).toBeCloseTo(BALL_RADIUS, 12);
    expect(t.s.ball.looseTicks).toBe(300);
  });

  it('un ballon lancé finit par s’arrêter et reste immobile', () => {
    const t = trace(ballMatch(8, { x: 0, y: 1, z: 0 }, { x: 2, y: 4, z: 9 }), 600);
    expect(t.restTick).toBeGreaterThan(0);
    const p = { ...t.s.ball.pos };
    run(t.s, 30, () => ({}));
    expect(t.s.ball.pos).toEqual(p);
  });

  it('déviation seedée : reproductible avec la même seed, différente sinon, bornée', () => {
    const throwFrom = (seed: number) => trace(ballMatch(seed, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }), 200).s.ball.pos;
    expect(throwFrom(11)).toEqual(throwFrom(11));
    const finals = [11, 12, 13, 14, 15].map(throwFrom).map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    expect(new Set(finals).size).toBe(5);

    // Angle entre les directions horizontales avant / après le premier rebond (frottement et traînée n'y changent rien).
    for (let seed = 1; seed <= 30; seed++) {
      const s = ballMatch(seed, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 });
      let before = { ...s.ball.vel };
      for (let t = 0; t < 120; t++) {
        before = { ...s.ball.vel };
        step(s, {});
        if (s.events.some((e) => e.type === 'bounce')) break;
      }
      const after = s.ball.vel;
      const a = Math.atan2(after.x, after.z) - Math.atan2(before.x, before.z);
      expect(Math.abs(a)).toBeLessThanOrEqual((BALL_BOUNCE_DEVIATION_DEG * Math.PI) / 180 + 1e-9);
    }
  });

  it('reste toujours dans le terrain (murs invisibles), même lancé très fort', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = ballMatch(seed, { x: 0, y: 1, z: 0 }, { x: 30 * (seed % 2 ? 1 : -1), y: 8, z: 25 * (seed > 2 ? 1 : -1) });
      const hw = s.field.width / 2 - BALL_RADIUS;
      const hl = s.field.length / 2 - BALL_RADIUS;
      let wallBounces = 0;
      run(s, 600, () => ({}), (st) => {
        expect(Math.abs(st.ball.pos.x)).toBeLessThanOrEqual(hw + 1e-9);
        expect(Math.abs(st.ball.pos.z)).toBeLessThanOrEqual(hl + 1e-9);
        expect(st.ball.pos.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
        for (const e of st.events) if (e.type === 'bounce' && (Math.abs(e.pos.x) >= hw - 1e-6 || Math.abs(e.pos.z) >= hl - 1e-6)) wallBounces++;
      });
      expect(wallBounces).toBeGreaterThan(0);
    }
  });

  it('rebondit sur la face d’un muret', () => {
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 5, length: 10, thickness: 0.6, height: 1.0, rotation: Math.PI / 2 };
    const s = ballMatch(3, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 3, z: 10 }, [wall]);
    const face = 5 - 0.3;
    let maxZ = -Infinity;
    let reversed = false;
    run(s, 90, () => ({}), (st) => {
      maxZ = Math.max(maxZ, st.ball.pos.z);
      if (st.ball.vel.z < -1) reversed = true;
    });
    expect(reversed).toBe(true);
    expect(maxZ).toBeLessThanOrEqual(face - BALL_RADIUS + 1e-9);
    expect(maxZ).toBeGreaterThan(face - BALL_RADIUS - 0.05);
  });

  it('passe par-dessus un muret si elle est assez haute, et peut rebondir dessus', () => {
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 5, length: 10, thickness: 2, height: 0.6, rotation: Math.PI / 2 };
    const over = ballMatch(3, { x: 0, y: 2, z: 0 }, { x: 0, y: 6, z: 9 }, [wall]);
    run(over, 300, () => ({}));
    expect(over.ball.pos.z).toBeGreaterThan(6);
    // Lâché au-dessus du muret : rebondit sur le dessus et s'y immobilise.
    const onTop = ballMatch(3, { x: 0, y: 2, z: 5 }, { x: 0, y: 0, z: 0 }, [wall]);
    const t = trace(onTop, 200);
    expect(t.bounces.length).toBeGreaterThan(0);
    expect(onTop.ball.pos.y).toBeCloseTo(0.6 + BALL_RADIUS, 12);
  });

  it('descend la pente d’une butte', () => {
    const mound: TerrainFeature = { kind: 'mound', x: 0, z: 0, radius: 5, height: 1.2 };
    const s = ballMatch(4, { x: 2.5, y: 0.6 + BALL_RADIUS + 0.01, z: 0 }, { x: 0, y: 0, z: 0 }, [mound]);
    const y0 = s.ball.pos.y;
    run(s, 90, () => ({}));
    expect(s.ball.pos.x).toBeGreaterThan(3);
    expect(s.ball.pos.y).toBeLessThan(y0 - 0.3);
  });

  it('un ballon qui roule jusqu’au pied d’une rampe la monte sans rebond ni tirage aléatoire, puis redescend', () => {
    // Rampe raide (BALL_GRAVITY·sin θ > BALL_GROUND_FRICTION) : le ballon y monte, s'arrête, redescend.
    const ramp: TerrainFeature = { kind: 'ramp', x: 0, z: 5, width: 4, length: 4, height: 1.2, rotation: 0 };
    for (const seed of [1, 2, 3]) {
      const s = ballMatch(seed, { x: 0, y: BALL_RADIUS, z: 2.9 }, { x: 0, y: 0, z: 8 }, [ramp]);
      const rng0 = s.rng;
      const t = trace(s, 300);
      expect(t.bounces).toEqual([]);
      expect(s.rng).toBe(rng0);
      expect(s.ball.pos.x).toBe(0); // aucune déviation latérale
      expect(s.ball.pos.z).toBeLessThan(3); // revenu au pied de la rampe
    }
  });

  it('un ballon posé sur le flanc raide d’une butte dévale ; il reste posé sur une rampe douce', () => {
    const mound: TerrainFeature = { kind: 'mound', x: 0, z: 0, radius: 5, height: 1.2 };
    for (const d of [1.5, 2.5, 3.5]) {
      const h = groundHeight({ ...createField(5), features: [mound] }, d, 0);
      const s = ballMatch(1, { x: d, y: h + BALL_RADIUS, z: 0 }, { x: 0, y: 0, z: 0 }, [mound]);
      run(s, 90, () => ({}));
      expect(s.ball.pos.x, `d=${d}`).toBeGreaterThan(d + 0.5);
      expect(s.ball.pos.y, `d=${d}`).toBeLessThan(h + BALL_RADIUS - 0.1);
    }
    // Rampe douce (pente 1/6 : BALL_GRAVITY·sin θ < BALL_GROUND_FRICTION) : le ballon y reste.
    const ramp: TerrainFeature = { kind: 'ramp', x: 0, z: 5, width: 4, length: 6, height: 1, rotation: 0 };
    const r = ballMatch(1, { x: 0, y: 0.5 + BALL_RADIUS, z: 5 }, { x: 0, y: 0, z: 0 }, [ramp]);
    run(r, 60, () => ({}));
    expect(r.ball.pos).toEqual({ x: 0, y: 0.5 + BALL_RADIUS, z: 5 });
  });

  it('une passe / un coup de pied qui touche le sol devient un ballon libre', () => {
    const s = ballMatch(6, { x: 0, y: 1, z: 0 }, { x: 0, y: 6, z: 12 });
    s.ball.mode = 'kick';
    run(s, 10, () => ({}));
    expect(s.ball.mode).toBe('kick');
    expect(s.ball.looseTicks).toBe(0);
    run(s, 60, () => ({}));
    expect(s.ball.mode).toBe('loose');
    expect(s.ball.looseTicks).toBeGreaterThan(0);
  });

  it('la rotation visuelle évolue après un rebond (et reste dans ]-PI, PI])', () => {
    const t = trace(ballMatch(5, { x: 0, y: 3, z: 0 }, { x: 1, y: 0, z: 2 }), 40);
    expect(t.s.ball.tumble).not.toBe(0);
    expect(Math.abs(t.s.ball.tumble)).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(t.s.ball.spin)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('ballon porté', () => {
  it('suit le porteur (devant lui, à sa vitesse) ; looseTicks remis à 0', () => {
    const s = soloMatch('ailier');
    s.ball.mode = 'carried';
    s.ball.carrierId = 0;
    s.ball.looseTicks = 50;
    run(s, 20, () => only0({ moveY: 1 }));
    const p = s.players[0];
    expect(s.ball.vel).toEqual(p.vel);
    expect(s.ball.pos.y).toBeCloseTo(p.pos.y + BALL_CARRY_HEIGHT, 12);
    expect(s.ball.pos.z).toBeGreaterThan(p.pos.z);
    expect(Math.hypot(s.ball.pos.x - p.pos.x, s.ball.pos.z - p.pos.z)).toBeLessThan(1);
    expect(s.ball.looseTicks).toBe(0);
    expect(s.ball.lastTeam).toBe(0);
    expect(hSpeed(s.ball.vel)).toBeGreaterThan(5);
  });
});
