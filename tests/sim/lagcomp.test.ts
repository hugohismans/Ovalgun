/**
 * Compensation de latence (en ligne) : un projectile qui porte `lag` est testé contre la géométrie rembobinée des
 * joueurs ; sans options, la sim est inchangée.
 */
import { describe, expect, it } from 'vitest';
import { Buttons, clampLag, LAG_COMP_MAX_TICKS, makeInput, PoseHistory, ROLES, step, TICK_DT, type MatchState, type Vec3 } from '../../src/sim';
import { soloMatch } from './helpers';

const TARGET = 5;

/** Joueur 0 (ailier) en (0, 0, 0) ; cible adverse en x = `oldX` il y a un tick, en x = `nowX` maintenant. */
function scene(oldX: number, nowX: number): { s: MatchState; history: PoseHistory } {
  const s = soloMatch('ailier');
  const t = s.players[TARGET];
  const history = new PoseHistory();
  t.pos = { x: oldX, y: 0, z: 12 };
  t.vel = { x: 0, y: 0, z: 0 };
  history.record(s);
  s.tick++;
  t.pos = { x: nowX, y: 0, z: 12 };
  history.record(s);
  return { s, history };
}

function fire(s: MatchState, from: Vec3, lag?: number): void {
  const w = ROLES.ailier.weapon;
  s.projectiles.push({
    id: s.nextEntityId++,
    kind: w.projectile,
    ownerId: 0,
    team: 0,
    pos: { ...from },
    vel: { x: 0, y: 0, z: w.speed },
    ttl: 90,
    traveled: 0,
    damage: w.damage,
    ...(lag !== undefined ? { lag } : {}),
  });
}

const hitTarget = (s: MatchState): boolean => s.events.some((e) => e.type === 'projectile_end' && e.reason === 'player');

describe('compensation de latence', () => {
  it('un tir vers l’ancienne position touche avec lag + historique, rate sans', () => {
    const a = scene(0, 3);
    fire(a.s, { x: 0, y: 1.2, z: 8 }, 1);
    step(a.s, {}, TICK_DT, { history: a.history });
    expect(hitTarget(a.s)).toBe(true);

    const b = scene(0, 3);
    fire(b.s, { x: 0, y: 1.2, z: 8 }, 1);
    step(b.s, {});
    expect(hitTarget(b.s)).toBe(false);

    const c = scene(0, 3);
    fire(c.s, { x: 0, y: 1.2, z: 8 });
    step(c.s, {}, TICK_DT, { history: c.history });
    expect(hitTarget(c.s)).toBe(false);
  });

  it('un tir vers la position actuelle rate si la vue du tireur était ailleurs (pas de double avantage)', () => {
    const a = scene(0, 3);
    fire(a.s, { x: 3, y: 1.2, z: 8 }, 1);
    step(a.s, {}, TICK_DT, { history: a.history });
    expect(hitTarget(a.s)).toBe(false);
  });

  it('les nouveaux projectiles reçoivent le retard (borné) de leur tireur ; les autres non', () => {
    const s = soloMatch('ailier');
    s.players[0].pitch = 0;
    const history = new PoseHistory();
    history.record(s);
    step(s, { 0: makeInput({ buttons: Buttons.FIRE }) }, TICK_DT, { lag: { 0: 99, 5: 2 }, history });
    const shots = s.projectiles.filter((p) => p.ownerId === 0);
    expect(shots.length).toBeGreaterThan(0);
    for (const p of shots) expect(p.lag).toBe(LAG_COMP_MAX_TICKS);
    expect(clampLag(-3)).toBe(0);
    expect(clampLag(Number.NaN)).toBe(0);
    expect(clampLag(4.5)).toBe(4.5);
  });

  it('historique : position interpolée entre deux ticks, bornée aux extrémités', () => {
    const { s, history } = scene(0, 4);
    const t = s.players[TARGET];
    expect(history.rewound(t, s.tick - 0.25).pos.x).toBeCloseTo(3, 9);
    expect(history.rewound(t, s.tick - 50).pos.x).toBe(0);
    expect(history.rewound(t, s.tick + 5).pos.x).toBe(4);
    expect(history.rewound(t, s.tick - 1).stability).toBe(t.stability);
  });
});
