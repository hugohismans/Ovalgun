/**
 * Tourelle d'entraînement (étape 5) : producteur d'entrées PUR et déterministe (PRNG propre au bot, hors MatchState).
 */
import { describe, expect, it } from 'vitest';
import {
  angleDiff,
  Buttons,
  createMatch,
  debugGiveBall,
  makeInput,
  PLAYER_HEIGHT,
  ROLES,
  step,
  TURRET_ENGAGE_RANGE_MULT,
  type InputFrame,
  type MatchState,
  type PlayerInput,
  type Role,
} from '../../src/sim';
import { createTurret, createTurretMemory, turretInput } from '../../src/bots/turret';
import { leadAimPoint } from '../../src/bots/aim';

/** 3v3 plat : la tourelle (ailier, joueur 3) face au joueur 0 ; tout le reste rangé dans un coin, hors de portée. */
function range(seed = 9, targetZ = -12): MatchState {
  const roles: [Role[], Role[]] = [
    ['ailier', 'demi', 'pilier'],
    ['ailier', 'demi', 'pilier'],
  ];
  const s = createMatch({ teamSize: 3, seed, roles });
  s.field.features = [];
  // Rangés dans le coin opposé, hors de portée de la tourelle.
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 1, y: 0, z: -s.field.length / 2 + 1 + p.id * 1.5 };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  s.players[3].pos = { x: 0, y: 0, z: 15 };
  s.players[3].yaw = Math.PI;
  s.players[0].pos = { x: 4, y: 0, z: 15 + targetZ };
  s.ball.pos = { x: s.field.width / 2 - 1, y: 0.12, z: s.field.length / 2 - 1 };
  s.ball.vel = { x: 0, y: 0, z: 0 };
  return s;
}

/** Simule `n` ticks avec la tourelle sur le joueur 3 ; renvoie les entrées produites. */
function simulate(s: MatchState, seed: number, n: number, others: (t: number) => InputFrame = () => ({})): PlayerInput[] {
  const bot = createTurret(seed, 3);
  const out: PlayerInput[] = [];
  for (let t = 0; t < n; t++) {
    const inp = bot(s, 3);
    out.push(inp);
    step(s, { ...others(t), 3: inp });
  }
  return out;
}

describe('tourelle d’entraînement', () => {
  it('pure : ne modifie jamais l’état lu', () => {
    const s = range();
    const mem = createTurretMemory(1, 3);
    for (let t = 0; t < 60; t++) {
      const before = JSON.stringify(s);
      const inp = turretInput(mem, s, 3);
      expect(JSON.stringify(s)).toBe(before);
      step(s, { 3: inp });
    }
  });

  it('déterministe : même seed => mêmes entrées ; autre seed => imprécision différente', () => {
    const a = simulate(range(), 4, 120);
    expect(simulate(range(), 4, 120)).toEqual(a);
    expect(simulate(range(), 5, 120)).not.toEqual(a);
  });

  it('se tourne vers l’ennemi le plus proche, tire par rafales, et touche', () => {
    const s = range();
    const me = s.players[3];
    const t = s.players[0];
    const want = Math.atan2(t.pos.x - me.pos.x, t.pos.z - me.pos.z);
    let yawAt25 = 0;
    const inputs = simulate(s, 2, 150, (k) => {
      if (k === 25) yawAt25 = me.yaw; // avant que la cible soit plaquée (la tourelle changerait alors de cible)
      return {};
    });
    expect(Math.abs(angleDiff(yawAt25, want))).toBeLessThan(0.1);
    const firing = inputs.map((i) => (i.buttons & Buttons.FIRE) !== 0);
    // Rafales : plusieurs débuts de rafale séparés par des pauses.
    const starts = firing.filter((f, i) => f && !firing[i - 1]).length;
    expect(starts).toBeGreaterThanOrEqual(2);
    expect(firing.filter(Boolean).length).toBeLessThan(firing.length * 0.6);
    // Immobile, et ses balles touchent.
    expect(inputs.every((i) => i.moveX === 0 && i.moveY === 0)).toBe(true);
    expect(me.stats.shotsHit).toBeGreaterThan(0);
  });

  it('aucune cible à portée, ou plaquée / porteuse : ne tire pas et garde son orientation', () => {
    const far = range(9, -(ROLES.ailier.weapon.range * TURRET_ENGAGE_RANGE_MULT + 3));
    const inputs = simulate(far, 2, 40);
    expect(inputs.every((i) => i.buttons === 0 && i.yaw === Math.PI)).toBe(true);
    const down = range();
    down.players[3].status = 'down';
    down.players[3].statusTicks = 100;
    expect(simulate(down, 2, 30).every((i) => i.buttons === 0)).toBe(true);
  });

  it('passive (?dummies=off) : ne tire jamais', () => {
    const s = range();
    const bot = createTurret(1, 3, false);
    for (let t = 0; t < 60; t++) {
      const inp = bot(s, 3);
      expect(inp).toEqual(makeInput({ yaw: s.players[3].yaw, pitch: s.players[3].pitch }));
      step(s, { 3: inp });
    }
  });

  it('avance sur une cible qui court : un porteur qui sprinte en travers à 12 m finit plaqué', () => {
    const s = range(9, -12);
    const c = s.players[0];
    c.pos = { x: -12, y: 0, z: 3 };
    debugGiveBall(s, 0);
    const bot = createTurret(3, 3);
    let tackledAt = -1;
    for (let t = 0; t < 150 && tackledAt < 0; t++) {
      // Va-et-vient en travers (x de −12 à 12), toujours au sprint.
      const yaw = Math.floor(t / 70) % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
      step(s, { 0: makeInput({ yaw, moveY: 1, buttons: Buttons.SPRINT }), 3: bot(s, 3) });
      if (s.events.some((e) => e.type === 'tackled' && e.targetId === 0)) tackledAt = t;
    }
    expect(tackledAt).toBeGreaterThan(0);
    expect(s.players[3].stats.shotsHit / s.players[3].stats.shotsFired).toBeGreaterThan(0.5);
  });
});

describe('visée avec avance (aim.ts)', () => {
  it('leadAimPoint : centre de la capsule sans avance ; avance = vitesse × temps de vol (horizontale seulement)', () => {
    const s = range();
    const t = s.players[0];
    t.pos = { x: 0, y: 0, z: 30 };
    t.vel = { x: 10, y: 3, z: 0 };
    const o = { x: 0, y: 1.6, z: 0 };
    expect(leadAimPoint(o, t, 300, 0)).toEqual({ x: 0, y: PLAYER_HEIGHT / 2, z: 30 });
    const p = leadAimPoint(o, t, 300, 1);
    const d = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
    expect(p.x).toBeCloseTo(10 * (d / 300), 3);
    expect(p.y).toBe(PLAYER_HEIGHT / 2);
    expect(p.z).toBe(30);
    expect(leadAimPoint(o, t, 300, 0.5).x).toBeCloseTo(p.x / 2, 3);
  });
});
