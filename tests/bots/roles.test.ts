/**
 * Bots de l'étape 7 : pilier (fusil à pompe de près, bouclier sous le feu de face ou en portant le ballon), demi (tir en
 * cloche balistique vers les pieds de la cible, zone de ralentissement devant le porteur adverse), contournement des
 * zones adverses ; matchs complets bots contre bots avec les trois rôles.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  aimOrigin,
  BOT_ZONE_AHEAD,
  BOT_ZONE_LEAD_SEC,
  BOT_ZONE_PLACE_TOLERANCE,
  Buttons,
  createMatch,
  debugGiveBall,
  inSlowZone,
  makeInput,
  ROLES,
  startPlayNow,
  step,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
  type Role,
  type TeamSize,
} from '../../src/sim';
import { botInput, createBotMemory, type BotMemory } from '../../src/bots';
import { findBadValues } from '../sim/helpers';
import { matchConfig, runBotMatch, type MatchRun } from './helpers';

// ---------------------------------------------------------------------------
// Scènes construites (même principe que behaviors.test.ts)
// ---------------------------------------------------------------------------

/**
 * Match 3v3 en jeu (rôles des tests de bots : 0 ailier, 1 pilier, 2 demi ; 3 ailier, 4 pilier, 5 demi), terrain plat,
 * TOUS les joueurs « garés » au sol ; ballon libre dans un coin. On réveille ensuite les joueurs de la scène.
 */
function scene(teamSize: TeamSize = 3, seed = 3): MatchState {
  const s = createMatch(matchConfig(teamSize, seed));
  startPlayNow(s);
  s.field.features = [];
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 1 + p.id, y: 0, z: -s.field.length / 2 + 1 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.status = 'down';
    p.statusTicks = 100000;
    p.stability = 0;
  }
  const b = s.ball;
  b.mode = 'loose';
  b.carrierId = -1;
  b.lastTeam = -1;
  b.pos = { x: s.field.width / 2 - 1, y: 0.12, z: s.field.length / 2 - 1 };
  b.vel = { x: 0, y: 0, z: 0 };
  s.events = [];
  return s;
}

function wake(s: MatchState, id: number, x: number, z: number, yaw = 0): void {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw;
  p.status = 'active';
  p.statusTicks = 0;
  p.stability = ROLES[p.role].stabilityMax;
}

interface Logged {
  t: number;
  e: MatchEvent;
  s: MatchState;
}

/**
 * Simule `ticks` ticks : les joueurs de `bots` pilotés par des bots (difficulté normale), les autres par `scripted`
 * (entrée neutre par défaut). `snapshot` : copie de l'état joint à chaque événement (positions au moment de l'événement).
 */
function play(s: MatchState, bots: number[], ticks: number, scripted: (s: MatchState, t: number) => InputFrame = () => ({})): Logged[] {
  const mems = new Map<number, BotMemory>(bots.map((id) => [id, createBotMemory(id, 'normal', 11)]));
  const log: Logged[] = [];
  for (let t = 0; t < ticks; t++) {
    const frame: Record<number, PlayerInput | undefined> = { ...scripted(s, t) };
    for (const [id, m] of mems) frame[id] = botInput(m, s, id);
    step(s, frame);
    if (s.events.length > 0) {
      const snap = JSON.parse(JSON.stringify(s)) as MatchState;
      for (const e of s.events) log.push({ t, e, s: snap });
    }
  }
  return log;
}

/** Entrée qui vise le centre de la capsule de `targetId` depuis `id` (yaw / pitch, deux passes pour l'épaule). */
function aimInput(s: MatchState, id: number, targetId: number, buttons: number, moveY = 0): PlayerInput {
  const me = s.players[id];
  const t = s.players[targetId];
  let yaw = Math.atan2(t.pos.x - me.pos.x, t.pos.z - me.pos.z);
  let pitch = 0;
  for (let i = 0; i < 2; i++) {
    const o = aimOrigin(me.pos, yaw);
    const dx = t.pos.x - o.x;
    const dz = t.pos.z - o.z;
    yaw = Math.atan2(dx, dz);
    pitch = Math.atan2(t.pos.y + 0.9 - o.y, Math.hypot(dx, dz));
  }
  return makeInput({ yaw, pitch, buttons, moveY });
}

const by = (log: Logged[], type: MatchEvent['type'], pred: (e: MatchEvent) => boolean = () => true): Logged[] =>
  log.filter((l) => l.e.type === type && pred(l.e));

// ---------------------------------------------------------------------------
// Pilier
// ---------------------------------------------------------------------------

describe('bots : pilier', () => {
  it('se fait tirer dessus de face par un tireur hors de portée de son fusil => lève le bouclier, les tirs suivants sont bloqués', () => {
    const s = scene();
    wake(s, 1, 0, -10); // pilier bot (équipe 0)
    wake(s, 3, 0, 12, Math.PI); // ailier adverse scripté, à 22 m
    const log = play(s, [1], 120, (st) => ({ 3: aimInput(st, 3, 1, Buttons.FIRE | Buttons.AIM) }));
    const raised = by(log, 'ability', (e) => e.type === 'ability' && e.playerId === 1);
    expect(raised.length).toBeGreaterThan(0);
    const blocked = by(log, 'blocked', (e) => e.type === 'blocked' && e.targetId === 1);
    expect(blocked.length).toBeGreaterThan(3);
    expect(blocked[0].t).toBeGreaterThanOrEqual(raised[0].t);
  });

  it('porteur face à un défenseur armé => charge bouclier levé (il continue d’avancer)', () => {
    const s = scene();
    wake(s, 1, 0, -10);
    wake(s, 3, 0, 2, Math.PI); // défenseur passif devant lui
    debugGiveBall(s, 1);
    const z0 = s.players[1].pos.z;
    const log = play(s, [1], 30);
    expect(by(log, 'ability', (e) => e.type === 'ability' && e.playerId === 1).length).toBe(1);
    expect(s.players[1].pos.z).toBeGreaterThan(z0 + 2);
    expect(s.ball.carrierId).toBe(1);
  });

  it('presse le porteur adverse en se rapprochant, et tire de près (fusil à pompe)', () => {
    const s = scene();
    wake(s, 1, 0, -12); // pilier bot
    wake(s, 3, 0, 14, Math.PI); // porteur adverse scripté, immobile
    debugGiveBall(s, 3);
    const log = play(s, [1], 150);
    const shots = by(log, 'shot', (e) => e.type === 'shot' && e.playerId === 1);
    expect(shots.length).toBeGreaterThan(0);
    const first = shots[0].s;
    const d = Math.hypot(first.players[1].pos.x - first.players[3].pos.x, first.players[1].pos.z - first.players[3].pos.z);
    expect(d).toBeLessThan(11);
    expect(by(log, 'hit', (e) => e.type === 'hit' && e.sourceId === 1 && e.targetId === 3).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Demi
// ---------------------------------------------------------------------------

describe('bots : demi', () => {
  /** Demi bot 2 (équipe 0) face au porteur adverse 3 scripté qui court lentement vers notre en-but (−Z). */
  function demiVsCarrier(carrierZ: number, demiZ: number, ticks: number): { s: MatchState; log: Logged[] } {
    const s = scene();
    wake(s, 2, 0, demiZ);
    wake(s, 3, 2, carrierZ, Math.PI);
    debugGiveBall(s, 3);
    const log = play(s, [2], ticks, () => ({ 3: makeInput({ yaw: Math.PI, moveY: 0.35 }) }));
    return { s, log };
  }

  it('tir en cloche : la grenade explose près du porteur visé (pieds de la cible anticipée) et le touche', () => {
    const { log } = demiVsCarrier(10, -10, 150);
    const shots = by(log, 'shot', (e) => e.type === 'shot' && e.playerId === 2);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((l) => l.e.type === 'shot' && l.e.kind === 'grenade')).toBe(true);
    const near = by(log, 'explosion', (e) => e.type === 'explosion' && e.ownerId === 2).filter((l) => {
      const e = l.e as Extract<MatchEvent, { type: 'explosion' }>;
      const c = l.s.players[3];
      return Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) < 2.5;
    });
    expect(near.length).toBeGreaterThan(0);
    expect(by(log, 'hit', (e) => e.type === 'hit' && e.sourceId === 2 && e.targetId === 3).length).toBeGreaterThan(0);
    // Aucune grenade ne l'a fait exploser lui-même (il ne prend jamais de knockback de son propre tir).
    for (const l of by(log, 'explosion', (e) => e.type === 'explosion' && e.ownerId === 2)) {
      const e = l.e as Extract<MatchEvent, { type: 'explosion' }>;
      const me = l.s.players[2];
      expect(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)).toBeGreaterThan(ROLES.demi.weapon.blastRadius);
    }
  });

  it('pose la zone de ralentissement DEVANT le porteur adverse (entre lui et notre en-but), qui y court', () => {
    // 1 s de jeu : la zone part dans les premiers ticks (au-delà, les grenades plaquent le porteur avant qu'il l'atteigne).
    const { s, log } = demiVsCarrier(10, -10, 30);
    const placed = by(log, 'ability', (e) => e.type === 'ability' && e.playerId === 2);
    expect(placed.length).toBeGreaterThan(0);
    const at = placed[0].s;
    const zone = at.zones.find((z) => z.ownerId === 2);
    expect(zone).toBeDefined();
    const carrier = at.players[3];
    expect(zone?.pos.z ?? 99).toBeLessThan(carrier.pos.z); // vers notre en-but (−Z)
    // Sur sa course : au plus avance (BOT_ZONE_LEAD_SEC à sa vitesse) + BOT_ZONE_AHEAD + tolérance de pose.
    const reach = BOT_ZONE_AHEAD + ROLES[carrier.role].runSpeed * BOT_ZONE_LEAD_SEC + BOT_ZONE_PLACE_TOLERANCE;
    expect(Math.hypot((zone?.pos.x ?? 99) - carrier.pos.x, (zone?.pos.z ?? 99) - carrier.pos.z)).toBeLessThan(reach);
    // Le porteur scripté finit par traverser la zone (ralenti).
    let slowed = false;
    for (let t = 0; t < 120 && !slowed; t++) {
      step(s, { 3: makeInput({ yaw: Math.PI, moveY: 1 }) });
      slowed = inSlowZone(s, s.players[3]);
    }
    expect(slowed).toBe(true);
  });

  it('adversaire collé sur la trajectoire : pas de grenade qui lui explose au visage (pas d’auto-knockback)', () => {
    // Porteur visé à ≈ 15 m ; un adversaire (4) se tient à 1,2 m devant l'épaule du demi, sur la ligne de tir.
    const s = scene();
    wake(s, 2, 0, -10);
    wake(s, 3, 2, 5, Math.PI);
    wake(s, 4, 0, -8.8, Math.PI);
    debugGiveBall(s, 3);
    const glue = (st: MatchState): void => {
      const me = st.players[2];
      const c = st.players[3];
      const yaw = Math.atan2(c.pos.x - me.pos.x, c.pos.z - me.pos.z);
      const o = aimOrigin(me.pos, yaw);
      const l = Math.hypot(c.pos.x - o.x, c.pos.z - o.z);
      const blocker = st.players[4];
      blocker.pos = { x: o.x + ((c.pos.x - o.x) / l) * 1.2, y: 0, z: o.z + ((c.pos.z - o.z) / l) * 1.2 };
      blocker.vel = { x: 0, y: 0, z: 0 };
    };
    const log = play(s, [2], 120, (st) => {
      glue(st);
      return { 3: makeInput({ yaw: Math.PI, moveY: 0.35 }) };
    });
    for (const l of by(log, 'explosion', (e) => e.type === 'explosion' && e.ownerId === 2)) {
      const e = l.e as Extract<MatchEvent, { type: 'explosion' }>;
      const me = l.s.players[2];
      expect(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)).toBeGreaterThan(ROLES.demi.weapon.blastRadius);
    }
    expect(by(log, 'hit', (e) => e.type === 'hit' && e.sourceId === 2 && e.targetId === 4)).toHaveLength(0);
  });

  it('pas de grenade sur une cible trop proche (son propre souffle)', () => {
    const { log } = demiVsCarrier(-6, -10, 20);
    expect(by(log, 'shot', (e) => e.type === 'shot' && e.playerId === 2)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Zones adverses
// ---------------------------------------------------------------------------

describe('bots : zones adverses', () => {
  it('le coureur contourne une zone de ralentissement adverse sur sa route vers le ballon', () => {
    const s = scene();
    wake(s, 0, 0, -6);
    s.ball.pos = { x: 0, y: 0.12, z: 16 };
    s.zones.push({ id: s.nextEntityId++, kind: 'slow', ownerId: 5, team: 1, pos: { x: 0, y: 0, z: 5 }, radius: 4.5, ttl: 1000 });
    const mem = createBotMemory(0, 'normal', 4);
    let entered = false;
    let picked = false;
    for (let t = 0; t < 120 && !picked; t++) {
      step(s, { 0: botInput(mem, s, 0) });
      entered ||= inSlowZone(s, s.players[0]);
      picked = s.ball.mode === 'carried' && s.ball.carrierId === 0;
    }
    expect(entered).toBe(false);
    expect(picked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Matchs complets avec les trois rôles
// ---------------------------------------------------------------------------

/** Compteurs par rôle d'un match complet. */
interface RoleCounts {
  shots: number;
  tackles: number;
  abilities: number;
}

function runCounted(size: TeamSize, seed: number): { run: MatchRun; roles: Record<Role, RoleCounts>; blocked: number; explosions: number; zoneTicks: number } {
  const roles: Record<Role, RoleCounts> = {
    pilier: { shots: 0, tackles: 0, abilities: 0 },
    ailier: { shots: 0, tackles: 0, abilities: 0 },
    demi: { shots: 0, tackles: 0, abilities: 0 },
  };
  let blocked = 0;
  let explosions = 0;
  let zoneTicks = 0;
  const run = runBotMatch(size, seed, 'normal', {}, (s) => {
    for (const e of s.events) {
      if (e.type === 'shot') roles[s.players[e.playerId].role].shots++;
      else if (e.type === 'tackled' && e.byId >= 0) roles[s.players[e.byId].role].tackles++;
      else if (e.type === 'ability') roles[e.role].abilities++;
      else if (e.type === 'blocked') blocked++;
      else if (e.type === 'explosion') explosions++;
    }
    if (s.zones.length > 0) zoneTicks++;
  });
  return { run, roles, blocked, explosions, zoneTicks };
}

describe.each([
  [3, 3],
  [5, 5],
] as const)('bots : match complet %iv%i avec les trois rôles', (size, _same) => {
  let r: ReturnType<typeof runCounted>;
  beforeAll(() => {
    r = runCounted(size, 8);
  }, 60000);

  it('chaque rôle tire, plaque et utilise sa capacité au moins une fois ; boucliers, explosions et zones en jeu', () => {
    const info = JSON.stringify(r.roles);
    for (const role of ['pilier', 'ailier', 'demi'] as const) {
      expect(r.roles[role].shots, `${role} ${info}`).toBeGreaterThan(0);
      expect(r.roles[role].tackles, `${role} ${info}`).toBeGreaterThan(0);
      expect(r.roles[role].abilities, `${role} ${info}`).toBeGreaterThan(0);
    }
    expect(r.blocked).toBeGreaterThan(0);
    expect(r.explosions).toBeGreaterThan(0);
    expect(r.zoneTicks).toBeGreaterThan(0);
  });

  it('aucun NaN / Infinity / −0, match terminé ; déterministe (même hash à la seconde exécution)', () => {
    expect(r.run.state.phase).toBe('ended');
    expect(r.run.nonFinite).toBe(false);
    expect(r.run.badValues).toEqual([]);
    expect(findBadValues(r.run.memories, 'memories', [], true)).toEqual([]);
    expect(runBotMatch(size, 8, 'normal').hash).toBe(r.run.hash);
  });
});
