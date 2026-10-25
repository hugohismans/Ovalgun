/**
 * Étape 5 : tir, projectiles, stabilité, plaquage, régénération, sprint boosté de l'ailier.
 * Les valeurs attendues sont relues dans les constantes : les tests restent valides quand on règle le feeling.
 */
import { describe, expect, it } from 'vitest';
import {
  AIM_SPEED_MULT,
  BALL_AIR_DRAG,
  BALL_GRAVITY,
  BALL_MAX_SUBSTEPS,
  BALL_SUBSTEP_MAX_DIST,
  BOOST_ACCEL_MULT,
  BOOST_SPEED_MULT,
  Buttons,
  CARRIER_DAMAGE_MULT,
  CARRIER_SPEED_MULT,
  DIVE_INVULN_SEC,
  DOWN_DURATION_SEC,
  GETUP_DURATION_SEC,
  GETUP_INVULN_SEC,
  LAST_MINUTE_COOLDOWN_MULT,
  PLAYER_HEIGHT,
  PLAYER_LOW_HEIGHT,
  PLAYER_RADIUS,
  PROJECTILE_HIT_RADIUS,
  REGEN_DELAY_SEC,
  REGEN_RATE,
  ROLES,
  SPRINT_SPEED_MULT,
  TACKLE_DROP_CARRY_KEEP,
  TACKLE_DROP_MAX_CARRY,
  TACKLE_DROP_POP_FORWARD,
  TACKLE_DROP_POP_UP,
  TACKLE_PICKUP_BLOCK_SEC,
  TACKLE_SLIDE_DECEL,
  TACKLE_SLIDE_MAX_SPEED,
  TICK_DT,
  TICK_RATE,
  aimDir,
  aimOrigin,
  canShoot,
  carryPosition,
  cloneState,
  damageFalloff,
  debugGiveBall,
  fireIntervalTicks,
  makeInput,
  secToTicks,
  segmentCapsuleEntry,
  segmentTerrainEntry,
  spreadDirection,
  step,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type PlayerState,
  type Role,
  type TerrainFeature,
  type Vec3,
} from '../../src/sim';
import { createPlayMatch, hSpeed } from './helpers';

const W = ROLES.ailier.weapon;
const DEG = Math.PI / 180;
/** Distance parcourue par une balle d'ailier en un tick (m). */
const STEP_LEN = W.speed * TICK_DT;
/** Rayon effectif d'une capsule pour une balle (PLAYER_RADIUS + rayon du projectile). */
const HIT_R = PLAYER_RADIUS + PROJECTILE_HIT_RADIUS;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Match 5v5 sur terrain plat (ou `features`) : joueurs 0 (ailier) et 1 (ailier) dans l'équipe 0, 5 (ailier) et
 * 6 (pilier) dans l'équipe 1 ; tous rangés le long de la touche x < 0 (hors des lignes de tir), ballon immobile dans
 * un coin (personne ne le ramasse). Chaque test place les joueurs dont il a besoin.
 */
function arena(features: TerrainFeature[] = [], seed = 5): MatchState {
  const roles: [Role[], Role[]] = [
    ['ailier', 'ailier', 'demi', 'demi', 'demi'],
    ['ailier', 'pilier', 'demi', 'demi', 'demi'],
  ];
  const s = createPlayMatch({ teamSize: 5, seed, roles });
  s.field.features = features;
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 1, y: 0, z: -40 + p.id * 3 };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  s.ball.pos = { x: s.field.width / 2 - 1, y: 0.12, z: -s.field.length / 2 + 1 };
  s.ball.vel = { x: 0, y: 0, z: 0 };
  return s;
}

function place(s: MatchState, id: number, x: number, z: number, yaw = 0): PlayerState {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw;
  p.pitch = 0;
  return p;
}

/** Yaw / pitch qui visent le point (pieds de `t` + `h`) depuis l'origine de visée de `p`. */
function aimAt(p: PlayerState, t: Vec3, h: number): { yaw: number; pitch: number } {
  let yaw = Math.atan2(t.x - p.pos.x, t.z - p.pos.z);
  let pitch = 0;
  for (let i = 0; i < 3; i++) {
    const o = aimOrigin(p.pos, yaw);
    const dx = t.x - o.x;
    const dy = t.y + h - o.y;
    const dz = t.z - o.z;
    yaw = Math.atan2(dx, dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return { yaw, pitch };
}

/** Entrée du joueur `id` qui vise le centre de la capsule de `target` (et rien pour les autres). */
function shootAt(s: MatchState, id: number, targetId: number, buttons: number): InputFrame {
  const t = s.players[targetId];
  const a = aimAt(s.players[id], t.pos, PLAYER_HEIGHT / 2);
  return { [id]: makeInput({ ...a, buttons }) };
}

/** Simule `n` ticks et collecte les événements (avec le tick relatif). */
function runLog(s: MatchState, n: number, inputs: (t: number) => InputFrame): Logged[] {
  const log: Logged[] = [];
  for (let t = 0; t < n; t++) {
    step(s, inputs(t));
    for (const e of s.events) log.push({ ...e, t });
  }
  return log;
}

/** Projectile forgé (comme ceux de la sim) : départ `from`, direction `dir`, à la vitesse de l'arme du tireur. */
function spawn(s: MatchState, ownerId: number, from: Vec3, dir: Vec3): number {
  const owner = s.players[ownerId];
  const w = ROLES[owner.role].weapon;
  const l = Math.hypot(dir.x, dir.y, dir.z);
  const id = s.nextEntityId++;
  s.projectiles.push({
    id,
    kind: w.projectile,
    ownerId,
    team: owner.team,
    pos: { ...from },
    vel: { x: (dir.x / l) * w.speed, y: (dir.y / l) * w.speed, z: (dir.z / l) * w.speed },
    ttl: 90,
    traveled: 0,
    damage: w.damage,
  });
  return id;
}

type Logged = MatchEvent & { t: number };
type LoggedOf<K extends MatchEvent['type']> = Extract<MatchEvent, { type: K }> & { t: number };
/** Événements d'un type, typés (avec le tick relatif). */
function types<K extends MatchEvent['type']>(log: readonly Logged[], type: K): Array<LoggedOf<K>> {
  return log.filter((e): e is LoggedOf<K> => e.type === type);
}
const AIMED = Buttons.FIRE | Buttons.AIM;

// ---------------------------------------------------------------------------
// Tir
// ---------------------------------------------------------------------------

describe('tir : cadence, chargeur, rechargement', () => {
  it('cadence exacte : un tir tous les fireIntervalTicks ticks (non accéléré en dernière minute)', () => {
    for (const lastMinute of [false, true]) {
      const s = arena();
      s.lastMinute = lastMinute;
      place(s, 0, 0, 0);
      const log = runLog(s, 20, () => ({ 0: makeInput({ buttons: Buttons.FIRE }) }));
      const shots = types(log, 'shot').map((e) => e.t);
      const k = fireIntervalTicks(W);
      expect(k).toBe(Math.max(1, Math.round(W.fireInterval * TICK_RATE)));
      expect(shots).toEqual(Array.from({ length: Math.ceil(20 / k) }, (_, i) => i * k));
      expect(s.players[0].ammo).toBe(W.magazine - shots.length);
      expect(s.players[0].stats.shotsFired).toBe(shots.length * W.pellets);
    }
  });

  it('chargeur vide => rechargement automatique de reloadSec, puis le tir reprend', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const k = fireIntervalTicks(W);
    const reload = secToTicks(W.reloadSec);
    const n = (W.magazine - 1) * k + 1 + reload + 2 * k;
    const log = runLog(s, n, () => ({ 0: makeInput({ buttons: Buttons.FIRE }) }));
    const shots = types(log, 'shot').map((e) => e.t);
    const lastOfMag = (W.magazine - 1) * k;
    expect(shots.slice(0, W.magazine)).toEqual(Array.from({ length: W.magazine }, (_, i) => i * k));
    const reloads = types(log, 'reload');
    expect(reloads.map((e) => e.t)).toEqual([lastOfMag]);
    // Aucun tir pendant le rechargement ; premier tir au tick où le chargeur est plein.
    expect(shots[W.magazine]).toBe(lastOfMag + reload);
  });

  it('rechargement manuel (front montant RELOAD) seulement chargeur incomplet ; rien chargeur plein', () => {
    const s = arena();
    place(s, 0, 0, 0);
    expect(types(runLog(s, 3, () => ({ 0: makeInput({ buttons: Buttons.RELOAD }) })), 'reload')).toHaveLength(0);
    runLog(s, 9, () => ({ 0: makeInput({ buttons: Buttons.FIRE }) }));
    expect(s.players[0].ammo).toBe(W.magazine - 5);
    const reload = secToTicks(W.reloadSec);
    const log = runLog(s, reload + 1, (t) => ({ 0: makeInput({ buttons: t === 0 ? Buttons.RELOAD | Buttons.FIRE : Buttons.FIRE }) }));
    expect(types(log, 'reload').map((e) => e.t)).toEqual([0]);
    // Le rechargement prime sur le tir du même tick, puis aucun tir jusqu'au chargeur plein.
    expect(types(log, 'shot').map((e) => e.t)).toEqual([reload]);
    expect(s.players[0].ammo).toBe(W.magazine - 1);
  });

  it('dernière minute : rechargement raccourci (LAST_MINUTE_COOLDOWN_MULT)', () => {
    const s = arena();
    s.lastMinute = true;
    place(s, 0, 0, 0);
    runLog(s, 3, () => ({ 0: makeInput({ buttons: Buttons.FIRE }) }));
    runLog(s, 1, () => ({ 0: makeInput({ buttons: Buttons.RELOAD }) }));
    expect(s.players[0].reloadTicks).toBe(secToTicks(W.reloadSec * LAST_MINUTE_COOLDOWN_MULT));
  });

  it('le porteur ne tire pas ; un joueur au sol / qui se relève non plus ; en saut et en esquive, si ; en glissade, non', () => {
    const s = arena();
    place(s, 0, 0, 0);
    debugGiveBall(s, 0);
    expect(canShoot(s, s.players[0])).toBe(false);
    expect(types(runLog(s, 6, () => ({ 0: makeInput({ buttons: Buttons.FIRE }) })), 'shot')).toHaveLength(0);
    for (const status of ['down', 'getting_up'] as const) {
      const t = arena();
      const p = place(t, 1, 0, 0);
      p.status = status;
      p.statusTicks = 100;
      expect(types(runLog(t, 6, () => ({ 1: makeInput({ buttons: Buttons.FIRE }) })), 'shot'), status).toHaveLength(0);
      expect(t.projectiles).toHaveLength(0);
    }
    const a = arena();
    const p = place(a, 0, 0, 0);
    // Saut, esquive (en l'air ou au sol) : on tire. Glissade (posture basse) : pas de tir.
    const moveAtStart: string[] = [];
    const log = runLog(a, 40, (t) => {
      moveAtStart.push(p.move);
      return { 0: makeInput({ moveY: 1, buttons: Buttons.FIRE | (t === 0 ? Buttons.JUMP : 0) | (t === 3 ? Buttons.DODGE : 0) | (t === 20 ? Buttons.SLIDE : 0) }) };
    });
    expect(types(log, 'jump').length).toBeGreaterThan(0);
    expect(types(log, 'dodge').length).toBe(1);
    expect(types(log, 'slide').length).toBe(1);
    const shots = types(log, 'shot').map((e) => e.t);
    const sliding = moveAtStart.map((m, t) => (m === 'slide' ? t : -1)).filter((t) => t >= 0);
    expect(sliding.length).toBeGreaterThan(5);
    expect(shots.filter((t) => sliding.includes(t))).toEqual([]);
    expect(shots.filter((t) => t < 20)).toEqual(Array.from({ length: Math.ceil(20 / fireIntervalTicks(W)) }, (_, i) => i * fireIntervalTicks(W)));
    expect(shots.some((t) => t > sliding[sliding.length - 1])).toBe(true); // il tire de nouveau après la glissade
  });

  it('glissade derrière un muret : on ne tire pas par-dessus (la hitbox basse serait cachée)', () => {
    // Muret de 1,1 m entre le tireur qui glisse (z ≈ 0 -> +Z) et un adversaire à 12 m.
    const s = arena([{ kind: 'wall', x: 0, z: 6, length: 8, thickness: 0.6, height: 1.1, rotation: Math.PI / 2 }]);
    const p = place(s, 0, 0, -4);
    const t = place(s, 5, 0, 12);
    for (let k = 0; k < 12; k++) step(s, { 0: makeInput({ moveY: 1 }) });
    step(s, { 0: makeInput({ moveY: 1, buttons: Buttons.SLIDE }) });
    expect(p.move).toBe('slide');
    expect(canShoot(s, p)).toBe(false);
    const log: Logged[] = [];
    while (p.move === 'slide') {
      step(s, { 0: makeInput({ ...aimAt(p, t.pos, PLAYER_HEIGHT * 0.8), buttons: Buttons.FIRE }) });
      for (const e of s.events) log.push({ ...e, t: 0 });
    }
    expect(types(log, 'shot')).toHaveLength(0);
    expect(t.stability).toBe(ROLES[t.role].stabilityMax);
  });

  it('pas de tir pendant une glissade, un plongeon ni une grimpe', () => {
    const s = arena();
    const p = place(s, 0, 0, 0);
    for (const move of ['slide', 'dive', 'dive_recover', 'climb'] as const) {
      p.move = move;
      expect(canShoot(s, p), move).toBe(false);
    }
    p.move = 'run';
    expect(canShoot(s, p)).toBe(true);
  });

  it('tir contre sprint : FIRE maintenu => le sprint est ignoré (le tir l’emporte) ; en rechargement, le sprint reprend', () => {
    const run = (buttons: number, prep?: (s: MatchState) => void) => {
      const s = arena();
      place(s, 0, 0, 0);
      prep?.(s);
      const log = runLog(s, 20, () => ({ 0: makeInput({ moveY: 1, buttons }) }));
      return { speed: hSpeed(s.players[0].vel), shots: types(log, 'shot').length };
    };
    const base = ROLES.ailier.runSpeed;
    expect(run(Buttons.SPRINT).speed).toBeCloseTo(base * SPRINT_SPEED_MULT, 6);
    const firing = run(Buttons.SPRINT | Buttons.FIRE);
    expect(firing.speed).toBeCloseTo(base, 6);
    expect(firing.shots).toBe(Math.ceil(20 / fireIntervalTicks(W)));
    // Rechargement long en cours : le tir est impossible, le sprint s'applique.
    const reloading = run(Buttons.SPRINT | Buttons.FIRE, (s) => {
      s.players[0].ammo = 0;
      s.players[0].reloadTicks = 100;
    });
    expect(reloading.speed).toBeCloseTo(base * SPRINT_SPEED_MULT, 6);
    expect(reloading.shots).toBe(0);
    // La visée ralentit toujours (et coupe le sprint), tir ou pas.
    expect(run(Buttons.SPRINT | Buttons.FIRE | Buttons.AIM).speed).toBeCloseTo(base * AIM_SPEED_MULT, 6);
  });
});

describe('porteur : actions du ballon et arme', () => {
  it('Y à la manette (KICK + RELOAD) : le coup de pied part, sans rechargement au même tick', () => {
    const s = arena();
    const p = place(s, 0, 0, 0);
    p.ammo = 12;
    debugGiveBall(s, 0);
    step(s, { 0: makeInput({ yaw: 0 }) });
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.KICK | Buttons.RELOAD }) });
    const evs = s.events.map((e) => e.type);
    expect(evs).toContain('kick');
    expect(evs).not.toContain('reload');
    expect(p.reloadTicks).toBe(0);
    expect(p.ammo).toBe(12);
    // Au tick suivant, il n'est plus porteur : RELOAD (nouveau front montant) recharge normalement.
    step(s, { 0: makeInput({ yaw: 0 }) });
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.RELOAD }) });
    expect(s.events.map((e) => e.type)).toContain('reload');
  });

  it('passe et tir au même tick : le porteur du début du tick ne tire pas', () => {
    const s = arena();
    const p = place(s, 0, 0, 0);
    place(s, 1, -3, -4); // coéquipier derrière : la passe part
    debugGiveBall(s, 0);
    step(s, { 0: makeInput({ yaw: 0 }) });
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.PASS | Buttons.FIRE }) });
    const evs = s.events.map((e) => e.type);
    expect(evs).toContain('pass');
    expect(evs).not.toContain('shot');
    // Il tire au tick suivant (FIRE maintenu).
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.FIRE }) });
    expect(s.events.map((e) => e.type)).toContain('shot');
    expect(p.ammo).toBe(W.magazine - 1);
  });
});

describe('dispersion seedée', () => {
  it('spreadDirection : unitaire, dans le cône, bords exacts', () => {
    const half = 3 * DEG;
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.4],
      [-2.5, -0.7],
    ]) {
      const d = aimDir(yaw, pitch);
      for (const [u1, u2] of [
        [0, 0],
        [1, 0.25],
        [0.5, 0.7],
        [0.999, 0.999],
      ]) {
        const v = spreadDirection(yaw, pitch, half, u1, u2);
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12);
        const ang = Math.acos(Math.min(1, v.x * d.x + v.y * d.y + v.z * d.z));
        expect(ang).toBeLessThanOrEqual(half + 1e-9);
        if (u1 === 0) expect(ang).toBeCloseTo(0, 6);
        if (u1 === 1) expect(ang).toBeCloseTo(half, 9);
      }
    }
  });

  it('reproductible (même seed => mêmes directions), différente avec une autre seed ; hanche plus large qu’en visée', () => {
    const dirs = (seed: number, buttons: number): Vec3[] => {
      const s = arena([], seed);
      place(s, 0, 0, 0, 0.3);
      const out: Vec3[] = [];
      for (let t = 0; t < 40; t++) {
        step(s, { 0: makeInput({ yaw: 0.3, pitch: 0.1, buttons }) });
        for (const p of s.projectiles) if (p.traveled <= W.speed * TICK_DT + 1e-9) out.push(p.vel);
      }
      return out;
    };
    const a = dirs(11, Buttons.FIRE);
    expect(dirs(11, Buttons.FIRE)).toEqual(a);
    expect(dirs(12, Buttons.FIRE)).not.toEqual(a);
    const maxAngle = (vs: Vec3[]) => {
      const d = aimDir(0.3, 0.1);
      return Math.max(...vs.map((v) => Math.acos(Math.min(1, (v.x * d.x + v.y * d.y + v.z * d.z) / Math.hypot(v.x, v.y, v.z)))));
    };
    const hip = maxAngle(a);
    const aim = maxAngle(dirs(11, AIMED));
    expect(hip).toBeLessThanOrEqual(W.spreadHipDeg * DEG + 1e-9);
    expect(aim).toBeLessThanOrEqual(W.spreadAimDeg * DEG + 1e-9);
    expect(hip).toBeGreaterThan(aim);
    expect(hip).toBeGreaterThan(W.spreadAimDeg * DEG); // la hanche exploite bien son cône plus large
  });

  it('plombs : `pellets` projectiles par tir, une seule munition', () => {
    const s = arena();
    place(s, 6, 0, 0);
    const pw = ROLES.pilier.weapon;
    const log = runLog(s, 1, () => ({ 6: makeInput({ yaw: 0, buttons: Buttons.FIRE }) }));
    expect(types(log, 'shot')).toHaveLength(1);
    expect(s.projectiles.filter((p) => p.ownerId === 6)).toHaveLength(pw.pellets);
    expect(s.players[6].ammo).toBe(pw.magazine - 1);
    expect(s.players[6].stats.shotsFired).toBe(pw.pellets);
  });
});

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

describe('projectiles : collisions balayées', () => {
  it('segmentCapsuleEntry : exact, sans tunnel, posture, départ dans la capsule', () => {
    const base = { x: 0, y: 0, z: 7.5 };
    // Segment de 0 à 10 m qui passe à travers la capsule (entrée à z = 7.05).
    expect(segmentCapsuleEntry({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 1.2, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBeCloseTo(0.705, 9);
    // Au-dessus de la tête (1,9 m) : rien ; à 1,3 m sur une capsule basse : rien.
    expect(segmentCapsuleEntry({ x: 0, y: 1.9, z: 0 }, { x: 0, y: 1.9, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBe(-1);
    expect(segmentCapsuleEntry({ x: 0, y: 1.3, z: 0 }, { x: 0, y: 1.3, z: 10 }, base, PLAYER_LOW_HEIGHT, PLAYER_RADIUS)).toBe(-1);
    // Frôlement latéral : 0,44 m touche, 0,46 m non.
    expect(segmentCapsuleEntry({ x: 0.44, y: 1, z: 0 }, { x: 0.44, y: 1, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBeGreaterThan(0);
    expect(segmentCapsuleEntry({ x: 0.46, y: 1, z: 0 }, { x: 0.46, y: 1, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBe(-1);
    // Calotte supérieure (la sphère du haut, pas le cylindre).
    expect(segmentCapsuleEntry({ x: 0, y: 1.75, z: 0 }, { x: 0, y: 1.75, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBeGreaterThan(0.705);
    expect(segmentCapsuleEntry({ x: 0, y: 1, z: 7.5 }, { x: 0, y: 1, z: 10 }, base, PLAYER_HEIGHT, PLAYER_RADIUS)).toBe(0);
  });

  it('balle rapide (`speed` × TICK_DT m par tick) : une capsule entièrement entre deux positions est touchée (pas de tunnel)', () => {
    const s = arena();
    place(s, 0, 0, 0);
    // Capsule centrée à 1,5 pas : entièrement entre les positions de fin du 1er et du 2e tick.
    expect(2 * HIT_R).toBeLessThan(STEP_LEN);
    const target = place(s, 5, 0, 1.5 * STEP_LEN);
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    const log = runLog(s, 3, () => ({}));
    const hits = types(log, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBe(1);
    expect(hits[0].targetId).toBe(5);
    expect(hits[0].pos.z).toBeCloseTo(1.5 * STEP_LEN - HIT_R, 9);
    expect(target.stability).toBeCloseTo(ROLES.ailier.stabilityMax - W.damage, 9);
    expect(s.projectiles).toHaveLength(0);
    expect(s.players[0].stats.shotsHit).toBe(1);
  });

  it('adversaire collé à l’épaule (contient l’origine du tir) : touché seulement si l’on tire vers lui', () => {
    for (const towards of [false, true]) {
      const s = arena();
      const p = place(s, 0, 0, 0, 0);
      const o = aimOrigin(p.pos, p.yaw);
      // Adversaire dont la capsule contient l'origine de visée (à 0,3 m à droite de l'épaule).
      const e = place(s, 5, o.x - 0.3, o.z);
      expect(segmentCapsuleEntry(o, { x: o.x, y: o.y, z: o.z + 1 }, e.pos, PLAYER_HEIGHT, HIT_R)).toBe(0);
      // L'origine (1,6 m) est au-dessus et à gauche de l'axe de sa capsule : vers le ciel, le tir s'en éloigne ;
      // vers le bas devant soi (pitch −1), il va vers son axe.
      const input = makeInput({ yaw: 0, pitch: towards ? -1 : 1.2, buttons: AIMED });
      step(s, { 0: input });
      const hits = s.events.filter((x) => x.type === 'hit');
      expect(hits.length, towards ? 'vers lui' : 'vers le ciel').toBe(towards ? 1 : 0);
    }
  });

  it('cible qui court en travers à 6 m : viser son centre AFFICHÉ (interpolé entre deux ticks) touche', () => {
    // Le client affiche lerp(état précédent, état courant, alpha) ; les projectiles sont testés contre les capsules du
    // début du tick (ce que le tireur voyait) et ont un rayon : pas d'avance à prendre à courte distance.
    for (const alpha of [0, 0.5, 0.99]) {
      const s = arena();
      place(s, 0, 0, -6);
      const t = place(s, 5, -15, 0, Math.PI / 2);
      debugGiveBall(s, 5); // porteur qui sprinte (le plus rapide)
      let prev = cloneState(s);
      let shots = 0;
      let hits = 0;
      for (let k = 0; k < 120 && t.pos.x < 15; k++) {
        const c = t.pos;
        const pv = prev.players[5].pos;
        const shown = { x: pv.x + (c.x - pv.x) * alpha, y: pv.y + (c.y - pv.y) * alpha, z: pv.z + (c.z - pv.z) * alpha };
        const a = aimAt(s.players[0], shown, PLAYER_HEIGHT / 2);
        prev = cloneState(s);
        step(s, { 0: makeInput({ ...a, buttons: AIMED }), 5: makeInput({ yaw: Math.PI / 2, moveY: 1, buttons: Buttons.SPRINT }) });
        for (const e of s.events) {
          if (e.type === 'shot' && e.playerId === 0) shots++;
          if (e.type === 'hit' && e.sourceId === 0) hits++;
        }
        t.stability = ROLES[t.role].stabilityMax; // il ne tombe pas : on compte les touches
        s.players[0].ammo = W.magazine;
      }
      expect(shots).toBeGreaterThan(30);
      expect(hits / shots, `alpha ${alpha}`).toBeGreaterThan(0.85);
    }
  });

  it('pas de tir ami : le coéquipier sur la trajectoire est traversé, l’adversaire derrière est touché', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const mate = place(s, 1, 0, 5);
    const enemy = place(s, 5, 0, 12);
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    const log = runLog(s, 4, () => ({}));
    expect(types(log, 'hit').map((e) => e.targetId)).toEqual([5]);
    expect(mate.stability).toBe(ROLES.ailier.stabilityMax);
    expect(enemy.stability).toBeLessThan(ROLES.ailier.stabilityMax);
  });

  it('deux adversaires alignés : le premier sur la trajectoire prend la balle', () => {
    const s = arena();
    place(s, 0, 0, 0);
    place(s, 6, 0, 9);
    place(s, 5, 0, 8);
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(types(runLog(s, 3, () => ({})), 'hit').map((e) => e.targetId)).toEqual([5]);
  });

  it('posture basse : glissade et récupération de plongeon évitent un tir à hauteur de torse', () => {
    for (const move of ['slide', 'dive_recover', 'run'] as const) {
      const s = arena();
      place(s, 0, 0, 0);
      const t = place(s, 5, 0, 10);
      t.move = move;
      t.moveTicks = 100; // reste dans ce mouvement pendant le test (vitesse nulle)
      spawn(s, 0, { x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: 1 });
      const hits = types(runLog(s, 4, () => ({})), 'hit');
      expect(hits.length, move).toBe(move === 'run' ? 1 : 0);
    }
  });

  it('le relief arrête les tirs : muret, butte, sol ; événement projectile_end « terrain »', () => {
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 6, length: 6, thickness: 0.6, height: 1.3, rotation: Math.PI / 2 };
    const mound: TerrainFeature = { kind: 'mound', x: 0, z: 6, radius: 3, height: 2 };
    for (const f of [wall, mound]) {
      const s = arena([f]);
      const shooter = place(s, 0, 0, 0);
      const t = place(s, 5, 0, 12);
      const log = runLog(s, 6, (k) => (k === 0 ? shootAt(s, 0, 5, AIMED) : {}));
      expect(types(log, 'hit'), f.kind).toHaveLength(0);
      const end = types(log, 'projectile_end');
      expect(end.map((e) => e.reason)).toEqual(['terrain']);
      expect(Math.abs(end[0].pos.z - 6)).toBeLessThan(f.kind === 'wall' ? 0.31 : 3);
      expect(t.stability).toBe(ROLES.demi.stabilityMax);
      expect(shooter.stats.shotsHit).toBe(0);
    }
    // Sans relief : touché.
    const open = arena();
    place(open, 0, 0, 0);
    place(open, 5, 0, 12);
    expect(types(runLog(open, 6, (k) => (k === 0 ? shootAt(open, 0, 5, AIMED) : {})), 'hit')).toHaveLength(1);
    // Tir vers le sol : impact au sol.
    const g = arena();
    place(g, 0, 0, 0);
    const end = types(runLog(g, 3, (k) => (k === 0 ? { 0: makeInput({ pitch: -0.5, buttons: AIMED }) } : {})), 'projectile_end');
    expect(end[0].reason).toBe('terrain');
    expect(end[0].pos.y).toBeCloseTo(0, 9);
  });

  it('segmentTerrainEntry : rampe (pente et dos), mur invisible franchi vers l’extérieur seulement', () => {
    const s = arena([{ kind: 'ramp', x: 0, z: 10, width: 4, length: 6, height: 1, rotation: 0 }]);
    // Horizontal à 0,5 m : touche la pente à mi-longueur (lz = 0 => z = 10).
    expect(segmentTerrainEntry(s.field, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.5, z: 20 })).toBeCloseTo(0.5, 9);
    // Depuis l'arrière (z décroissant) à 0,5 m : touche la face verticale du dos (z = 13).
    expect(segmentTerrainEntry(s.field, { x: 0, y: 0.5, z: 20 }, { x: 0, y: 0.5, z: 0 })).toBeCloseTo(7 / 20, 9);
    const hw = s.field.width / 2;
    expect(segmentTerrainEntry(s.field, { x: hw - 1, y: 1, z: -30 }, { x: hw + 1, y: 1, z: -30 })).toBeCloseTo(0.5, 9);
    expect(segmentTerrainEntry(s.field, { x: hw + 0.3, y: 1, z: -30 }, { x: hw + 1, y: 1, z: -30 })).toBe(-1);
  });

  it('portée max : au-delà de `range`, ni dégâts ni projectile ; fin « expired » à exactement `range`', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const t = place(s, 5, 0, W.range + 2);
    const o = { x: 0, y: 1.2, z: 0 };
    spawn(s, 0, o, { x: 0, y: 0, z: 1 });
    const log = runLog(s, 15, () => ({}));
    expect(types(log, 'hit')).toHaveLength(0);
    const end = types(log, 'projectile_end');
    expect(end.map((e) => e.reason)).toEqual(['expired']);
    expect(end[0].pos.z).toBeCloseTo(W.range, 9);
    expect(t.stability).toBe(ROLES.ailier.stabilityMax);
    expect(s.projectiles).toHaveLength(0);
  });

  it('atténuation : dégâts pleins jusqu’à falloffStart, puis linéaires jusqu’à falloffMinMult à `range`', () => {
    expect(damageFalloff(W, 0)).toBe(1);
    expect(damageFalloff(W, W.falloffStart)).toBe(1);
    expect(damageFalloff(W, (W.falloffStart + W.range) / 2)).toBeCloseTo((1 + W.falloffMinMult) / 2, 12);
    expect(damageFalloff(W, W.range)).toBeCloseTo(W.falloffMinMult, 12);
    for (const z of [10, 35]) {
      const s = arena();
      place(s, 0, 0, 0);
      const t = place(s, 5, 0, z + HIT_R);
      spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
      const hit = types(runLog(s, 10, () => ({})), 'hit')[0];
      expect(hit.amount).toBeCloseTo(W.damage * damageFalloff(W, z), 9);
      expect(t.stability).toBeCloseTo(ROLES.ailier.stabilityMax - hit.amount, 9);
    }
  });

  it('le porteur subit CARRIER_DAMAGE_MULT', () => {
    const s = arena();
    place(s, 0, 0, 0);
    place(s, 5, 0, 10);
    debugGiveBall(s, 5);
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    const hit = types(runLog(s, 3, () => ({})), 'hit')[0];
    expect(hit.amount).toBeCloseTo(W.damage * CARRIER_DAMAGE_MULT, 12);
  });

  it('invulnérables traversés sans effet : plongeon du porteur, relevé, au sol', () => {
    const cases: Array<(p: PlayerState) => void> = [
      (p) => (p.invulnTicks = 10),
      (p) => {
        p.status = 'getting_up';
        p.statusTicks = 10;
      },
      (p) => {
        p.status = 'down';
        p.statusTicks = 50;
      },
    ];
    for (const prep of cases) {
      const s = arena();
      place(s, 0, 0, 0);
      const t = place(s, 5, 0, 10);
      prep(t);
      const stab = t.stability;
      spawn(s, 0, { x: 0, y: 0.6, z: 0 }, { x: 0, y: 0, z: 1 });
      expect(types(runLog(s, 3, () => ({})), 'hit')).toHaveLength(0);
      expect(t.stability).toBe(stab);
    }
    // Plongeon réel. Les projectiles sont testés contre l'état de la fin du tick précédent (ce que le tireur voyait) :
    // une balle du tick du plongeon touche encore ; ensuite, exactement secToTicks(DIVE_INVULN_SEC) ticks protégés.
    const hitAfter = (k: number): boolean => {
      const s = arena();
      place(s, 0, 0, 0);
      const c = place(s, 5, 0, 20, Math.PI);
      debugGiveBall(s, 5);
      for (let i = 0; i < k; i++) step(s, { 5: makeInput({ yaw: Math.PI, moveY: 1, buttons: i === 0 ? Buttons.SLIDE : 0 }) });
      // Balle basse (0,4 m : touche aussi la capsule basse du plongeon) qui traverse le porteur pendant ce tick.
      spawn(s, 0, { x: c.pos.x, y: c.pos.y + 0.4, z: c.pos.z - 2 }, { x: 0, y: 0, z: 1 });
      step(s, { 5: makeInput({ yaw: Math.PI, moveY: 1, buttons: k === 0 ? Buttons.SLIDE : 0 }) });
      return s.events.some((e) => e.type === 'hit');
    };
    const inv = secToTicks(DIVE_INVULN_SEC);
    expect(hitAfter(0)).toBe(true);
    for (let k = 1; k <= inv; k++) expect(hitAfter(k), `tick +${k}`).toBe(false);
    expect(hitAfter(inv + 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stabilité, plaquage, régénération
// ---------------------------------------------------------------------------

describe('stabilité : régénération et plaquage', () => {
  it('régénération : rien pendant REGEN_DELAY_SEC après le dernier coup, puis REGEN_RATE points/s jusqu’au max', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const t = place(s, 5, 0, 1.5 * STEP_LEN);
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    step(s, {});
    step(s, {}); // touché à ce tick (2e segment)
    const after = ROLES.ailier.stabilityMax - W.damage;
    expect(t.stability).toBeCloseTo(after, 12);
    const delay = secToTicks(REGEN_DELAY_SEC);
    const seen: number[] = [];
    for (let k = 1; k <= delay + 10; k++) {
      step(s, {});
      seen.push(t.stability);
    }
    for (let k = 1; k < delay; k++) expect(seen[k - 1], `tick +${k}`).toBeCloseTo(after, 12);
    expect(seen[delay - 1]).toBeCloseTo(after + REGEN_RATE * TICK_DT, 9);
    expect(seen[delay + 1] - seen[delay]).toBeCloseTo(REGEN_RATE * TICK_DT, 9);
    for (let k = 0; k < 200; k++) step(s, {});
    expect(t.stability).toBe(ROLES.ailier.stabilityMax);
  });

  it('plaquage à 0 : au sol DOWN_DURATION_SEC exactement, relevé GETUP_DURATION_SEC, puis debout, invulnérable GETUP_INVULN_SEC, jauge pleine', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const t = place(s, 5, 0, 1.5 * STEP_LEN);
    t.stability = 3;
    spawn(s, 0, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 });
    // Le plaqué essaie de bouger et de tirer pendant tout le test (vers −Z : son tir ne touche personne).
    const statuses: string[] = [];
    const invuln: number[] = [];
    const log: Logged[] = [];
    for (let k = 0; k < 140; k++) {
      step(s, { 5: makeInput({ yaw: Math.PI, moveX: k < 100 ? 0 : 1, buttons: Buttons.FIRE }) });
      statuses.push(t.status);
      invuln.push(t.invulnTicks);
      if (k === 99) expect(t.pos).toEqual({ x: 0, y: 0, z: 1.5 * STEP_LEN }); // immobile au sol puis en se relevant
      for (const e of s.events) log.push({ ...e, t: k });
    }
    const tackled = types(log, 'tackled');
    expect(tackled).toHaveLength(1);
    expect(tackled[0]).toMatchObject({ targetId: 5, byId: 0, t: 1 });
    expect(s.players[0].stats.tackles).toBe(1);
    const down = statuses.filter((x) => x === 'down').length;
    const up = statuses.filter((x) => x === 'getting_up').length;
    expect(down).toBe(secToTicks(DOWN_DURATION_SEC));
    expect(up).toBe(secToTicks(GETUP_DURATION_SEC));
    const firstActive = 1 + down + up;
    expect(statuses[firstActive]).toBe('active');
    // Posée à secToTicks(GETUP_INVULN_SEC) au relevé, décomptée après les projectiles du même tick : elle arrête
    // exactement secToTicks(GETUP_INVULN_SEC) segments de projectiles, dès le tick du relevé.
    expect(invuln[firstActive]).toBe(secToTicks(GETUP_INVULN_SEC) - 1);
    expect(types(log, 'getup').map((e) => e.t)).toEqual([firstActive]);
    expect(t.stability).toBe(ROLES.ailier.stabilityMax);
    // Au sol et en se relevant : aucun tir ; il tire de nouveau une fois debout.
    const shots = types(log, 'shot').map((e) => e.t);
    expect(shots.every((k) => k === 0 || k >= firstActive)).toBe(true);
    expect(shots.some((k) => k >= firstActive)).toBe(true);
  });

  it('le plaqué glisse au sol (vitesse plafonnée à TACKLE_SLIDE_MAX_SPEED, TACKLE_SLIDE_DECEL) puis s’arrête ; sa capacité en cours est terminée', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const t = place(s, 5, 0, 7, 0);
    // Il court vers +Z à pleine vitesse, capacité active.
    for (let k = 0; k < 10; k++) step(s, { 5: makeInput({ moveY: 1, buttons: k === 0 ? Buttons.ABILITY : 0 }) });
    expect(t.abilityTicks).toBeGreaterThan(0);
    const v0 = hSpeed(t.vel);
    t.stability = 0.5;
    spawn(s, 0, { x: t.pos.x, y: 1.2, z: t.pos.z - 2 }, { x: 0, y: 0, z: 1 });
    step(s, { 5: makeInput({ moveY: 1 }) });
    expect(t.status).toBe('down');
    expect(t.abilityTicks).toBe(0);
    expect(t.abilityCd).toBeGreaterThan(0);
    const z0 = t.pos.z;
    const speeds: number[] = [];
    for (let k = 0; k < 40; k++) {
      step(s, { 5: makeInput({ moveY: 1 }) });
      speeds.push(hSpeed(t.vel));
    }
    // Le tick du plaquage, il a encore couru (déplacement avant la stabilité), puis sa vitesse est plafonnée ;
    // ensuite il freine à TACKLE_SLIDE_DECEL.
    const vt = Math.min(v0, TACKLE_SLIDE_MAX_SPEED);
    expect(speeds[0]).toBeCloseTo(vt - TACKLE_SLIDE_DECEL * TICK_DT, 6);
    expect(speeds[39]).toBe(0);
    const slide = t.pos.z - z0;
    expect(slide).toBeGreaterThan(0.3);
    expect(slide).toBeLessThan((vt * vt) / (2 * TACKLE_SLIDE_DECEL) + 0.3);
  });

  it('plaqué en esquive, en plongeon ou en sprint : glissade du corps < 2,5 m, ballon lâché à moins de 8 m', () => {
    const cases = [
      { name: 'esquive', carrier: false, buttons: Buttons.DODGE },
      { name: 'esquive (porteur)', carrier: true, buttons: Buttons.DODGE },
      { name: 'plongeon', carrier: true, buttons: Buttons.SLIDE },
      { name: 'sprint (porteur)', carrier: true, buttons: 0 },
    ];
    for (const c of cases) {
      const s = arena();
      const p = place(s, 0, 0, -20, 0);
      if (c.carrier) debugGiveBall(s, 0);
      for (let k = 0; k < 30; k++) step(s, { 0: makeInput({ moveY: 1, buttons: Buttons.SPRINT }) });
      step(s, { 0: makeInput({ moveY: 1, buttons: Buttons.SPRINT | c.buttons }) });
      // Esquive (21 m/s) / plongeon (17 m/s) en cours, ou sprint du porteur : plus vite que le plafond de glissade.
      expect(hSpeed(p.vel), c.name).toBeGreaterThan(c.buttons === 0 ? TACKLE_SLIDE_MAX_SPEED : 15);
      p.stability = -1; // jauge vidée : plaquage au prochain tick (étape 8)
      step(s, { 0: makeInput({ moveY: 1, buttons: Buttons.SPRINT }) });
      expect(p.status, c.name).toBe('down');
      const z0 = p.pos.z;
      let landZ = Number.NaN; // premier contact du ballon avec le sol
      for (let k = 0; k < 60; k++) {
        step(s, { 0: makeInput({ moveY: 1, buttons: Buttons.SPRINT }) });
        if (Number.isNaN(landZ) && s.events.some((e) => e.type === 'bounce')) landZ = s.ball.pos.z;
      }
      expect(p.pos.z - z0, c.name).toBeLessThan(2.5);
      if (c.carrier) {
        expect(s.ball.mode, c.name).toBe('loose');
        expect(landZ - z0, c.name).toBeLessThan(8);
        expect(landZ - z0, c.name).toBeGreaterThan(1); // il part quand même vers l'avant
      }
    }
  });

  it('un corps plaqué qui glisse contre un muret ne le grimpe pas (aucun événement « climb »)', () => {
    // Face du muret à z = −18,8 ; l'appui du joueur (disque de PLAYER_RADIUS) la touche dès z = −19,25.
    const s = arena([{ kind: 'wall', x: 0, z: -18.5, length: 8, thickness: 0.6, height: 0.8, rotation: Math.PI / 2 }]);
    const p = place(s, 0, 0, -30, 0);
    const go = (): InputFrame => ({ 0: makeInput({ moveY: 1, buttons: Buttons.SPRINT }) });
    while (p.pos.z < -20) step(s, go());
    expect(p.move).toBe('run');
    p.stability = -1; // plaqué à ~0,8 m de la face, lancé à pleine vitesse : il glisse jusqu'au muret
    const log = runLog(s, 60, go);
    expect(types(log, 'tackled')).toHaveLength(1);
    expect(types(log, 'climb')).toHaveLength(0);
    expect(p.pos.z).toBeGreaterThan(-19.4); // il a bien glissé jusqu'à la face…
    expect(p.pos.z).toBeLessThanOrEqual(-19.25 + 1e-6); // …sans la franchir
    expect(p.pos.y).toBe(0);
  });

  it('porteur plaqué : ballon lâché (position de port, rebond vers l’avant), ramassage bloqué pour lui seul', () => {
    const s = arena();
    place(s, 0, 0, 0);
    const c = place(s, 5, 0, 8, 0);
    debugGiveBall(s, 5);
    // Il court vers +Z.
    for (let k = 0; k < 8; k++) step(s, { 5: makeInput({ moveY: 1 }) });
    c.stability = 1;
    spawn(s, 0, { x: 0, y: 1.2, z: c.pos.z - 3 }, { x: 0, y: 0, z: 1 });
    // Vitesse de course établie : c'est celle qu'il a encore au moment du plaquage (déplacement avant la stabilité).
    const v = { ...c.vel };
    step(s, { 5: makeInput({ moveY: 1 }) });
    const evs = s.events.map((e) => e.type);
    expect(evs).toContain('tackled');
    expect(evs.indexOf('drop')).toBeGreaterThan(evs.indexOf('tackled'));
    const b = s.ball;
    expect(b.mode).toBe('loose');
    expect(b.carrierId).toBe(-1);
    expect(b.throwerId).toBe(5);
    expect(c.pickupBlockTicks).toBe(secToTicks(TACKLE_PICKUP_BLOCK_SEC));
    // Lâcher : position de port (pieds et regard du plaqué en fin de déplacement), vitesse horizontale =
    // min(KEEP × la sienne, MAX) + POP_FORWARD dans le sens de course, verticale POP_UP. Puis un tick de physique du
    // ballon (même intégrateur que ball.ts, en l'air sans contact) : comparé à 1e-9.
    const sp = Math.hypot(v.x, v.z);
    expect(sp).toBeCloseTo(ROLES.ailier.runSpeed * CARRIER_SPEED_MULT, 6);
    const horiz = Math.min(sp * TACKLE_DROP_CARRY_KEEP, TACKLE_DROP_MAX_CARRY) + TACKLE_DROP_POP_FORWARD;
    const pos = carryPosition(c.pos, c.yaw);
    const vel = { x: (v.x / sp) * horiz, y: TACKLE_DROP_POP_UP, z: (v.z / sp) * horiz };
    const speed0 = Math.hypot(vel.x, vel.y, vel.z) + BALL_GRAVITY * TICK_DT;
    const n = Math.min(BALL_MAX_SUBSTEPS, Math.max(1, Math.ceil((speed0 * TICK_DT) / BALL_SUBSTEP_MAX_DIST)));
    const h = TICK_DT / n;
    const drag = 1 - BALL_AIR_DRAG * h;
    for (let k = 0; k < n; k++) {
      pos.x += vel.x * h;
      pos.y += (vel.y - 0.5 * BALL_GRAVITY * h) * h;
      pos.z += vel.z * h;
      vel.y -= BALL_GRAVITY * h;
      vel.x *= drag;
      vel.y *= drag;
      vel.z *= drag;
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(b.pos[axis], `pos.${axis}`).toBeCloseTo(pos[axis], 9);
      expect(b.vel[axis], `vel.${axis}`).toBeCloseTo(vel[axis], 9);
    }
    // Le corps, lui, glisse à TACKLE_SLIDE_MAX_SPEED au plus.
    expect(hSpeed(c.vel)).toBeCloseTo(Math.min(sp, TACKLE_SLIDE_MAX_SPEED), 9);
    expect(s.players[0].stats.tackles).toBe(1);
    // Il rebondit (ballon libre, physique seedée) ; personne ne l'a pris (le plaqué est bloqué et au sol).
    expect(types(runLog(s, 60, () => ({})), 'bounce').length).toBeGreaterThan(0);
    expect(s.ball.mode).toBe('loose');
    // Un autre joueur (pas bloqué) le ramasse aussitôt en entrant dans le cercle.
    place(s, 1, s.ball.pos.x + 0.3, s.ball.pos.z + 0.3);
    for (let k = 0; k < 30 && s.ball.mode !== 'carried'; k++) step(s, {});
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(1);
  });

  it('deux balles dans le même tick sur une jauge presque vide : la seconde traverse (crédit au premier tireur)', () => {
    const s = arena();
    place(s, 0, 0, 0);
    place(s, 1, 2, 0);
    const t = place(s, 5, 0, 7);
    t.stability = 2;
    spawn(s, 0, { x: 0, y: 1.2, z: 4 }, { x: 0, y: 0, z: 1 });
    spawn(s, 1, { x: 0.2, y: 1.2, z: 4 }, { x: 0, y: 0, z: 1 });
    step(s, {});
    expect(s.events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(s.players[0].stats.tackles).toBe(1);
    expect(s.players[1].stats.tackles).toBe(0);
    expect(t.status).toBe('down');
  });
});

// ---------------------------------------------------------------------------
// Ailier : sprint boosté
// ---------------------------------------------------------------------------

describe('ailier : sprint boosté', () => {
  const A = ROLES.ailier.ability;

  it('vitesse × BOOST_SPEED_MULT pendant la durée exacte, cooldown qui démarre à la fin, événement « ability »', () => {
    const s = arena();
    const p = place(s, 0, 0, -40);
    const dur = secToTicks(A.duration);
    const cd = secToTicks(A.cooldown);
    const log = runLog(s, dur + 20, (t) => ({ 0: makeInput({ moveY: 1, buttons: t === 0 ? Buttons.ABILITY : 0 }) }));
    expect(types(log, 'ability')).toHaveLength(1);
    expect(p.abilityTicks).toBe(0);
    expect(p.abilityCd).toBe(cd - 19); // démarré au tick `dur`, décompté depuis
    expect(hSpeed(p.vel)).toBeCloseTo(ROLES.ailier.runSpeed, 6);
    // Vitesse pendant la capacité.
    const s2 = arena();
    const p2 = place(s2, 0, 0, -40);
    const v: number[] = [];
    for (let t = 0; t < dur + 5; t++) {
      step(s2, { 0: makeInput({ moveY: 1, buttons: t === 0 ? Buttons.ABILITY : 0 }) });
      v.push(hSpeed(p2.vel));
    }
    expect(v[dur - 1]).toBeCloseTo(ROLES.ailier.runSpeed * BOOST_SPEED_MULT, 6);
    expect(p2.abilityTicks).toBe(0);
    // Réactivable exactement `cooldown` après la fin de la durée.
    const s3 = arena();
    place(s3, 0, 0, -40);
    const acts = types(
      runLog(s3, dur + cd + 3, (t) => ({ 0: makeInput({ buttons: t % 2 === 0 ? Buttons.ABILITY : 0 }) })),
      'ability',
    ).map((e) => e.t);
    expect(acts).toEqual([0, dur + cd]);
  });

  it('cumulé avec le sprint ; accélération × BOOST_ACCEL_MULT ; utilisable en portant le ballon', () => {
    const top = (buttons: number, carrier: boolean, ticks = 30) => {
      const s = arena();
      const p = place(s, 0, 0, -40);
      if (carrier) debugGiveBall(s, 0);
      const v: number[] = [];
      for (let t = 0; t < ticks; t++) {
        step(s, { 0: makeInput({ moveY: 1, buttons: buttons | (t === 0 ? Buttons.ABILITY : 0) }) });
        v.push(hSpeed(p.vel));
      }
      return v;
    };
    const run = ROLES.ailier.runSpeed;
    expect(top(Buttons.SPRINT, false).at(-1)).toBeCloseTo(run * SPRINT_SPEED_MULT * BOOST_SPEED_MULT, 6);
    expect(top(0, true).at(-1)).toBeCloseTo(run * CARRIER_SPEED_MULT * BOOST_SPEED_MULT, 6);
    // Accélération : premier tick depuis l'arrêt = GROUND_ACCEL × BOOST_ACCEL_MULT × dt (borné par la cible).
    const boosted = top(0, false, 2)[0];
    const s = arena();
    const p = place(s, 0, 0, -40);
    step(s, { 0: makeInput({ moveY: 1 }) });
    expect(boosted / hSpeed(p.vel)).toBeCloseTo(BOOST_ACCEL_MULT, 6);
  });

  it('joueur au sol : ABILITY sans effet, quel que soit le rôle (pilier et demi : tests/sim/roles.test.ts)', () => {
    for (const id of [6, 2]) {
      const s = arena();
      const p = place(s, id, 0, 0);
      p.status = 'down';
      p.statusTicks = 50;
      expect(types(runLog(s, 3, () => ({ [id]: makeInput({ buttons: Buttons.ABILITY }) })), 'ability')).toHaveLength(0);
      expect(p.abilityCd).toBe(0);
      expect(s.zones).toHaveLength(0);
    }
    const d = arena();
    const p = place(d, 0, 0, 0);
    p.status = 'down';
    p.statusTicks = 50;
    expect(types(runLog(d, 3, () => ({ 0: makeInput({ buttons: Buttons.ABILITY }) })), 'ability')).toHaveLength(0);
  });

  it('dernière minute : cooldown de capacité raccourci', () => {
    const s = arena();
    s.lastMinute = true;
    const p = place(s, 0, 0, -40);
    const dur = secToTicks(A.duration);
    runLog(s, dur + 1, (t) => ({ 0: makeInput({ buttons: t === 0 ? Buttons.ABILITY : 0 }) }));
    expect(p.abilityTicks).toBe(0);
    expect(p.abilityCd).toBe(secToTicks(A.cooldown * LAST_MINUTE_COOLDOWN_MULT));
  });
});

// ---------------------------------------------------------------------------
// Réglage : temps pour plaquer (précision parfaite, docs/TESTING.md)
// ---------------------------------------------------------------------------

describe('temps pour plaquer (guide de réglage)', () => {
  /**
   * Ticks entre le premier tir et le plaquage, en visée, cible immobile à `dist` m (précision parfaite : la
   * dispersion en visée reste dans la capsule jusqu'à ~70 m). Formule : n = ⌈max / (dégâts × atténuation ×
   * porteur)⌉ coups, (n − 1) intervalles de tir, plus le temps de vol de la dernière balle (⌈(dist − r) / pas⌉ − 1 ticks,
   * r = PLAYER_RADIUS + PROJECTILE_HIT_RADIUS, pas = speed × TICK_DT).
   */
  function measure(dist: number, carrier: boolean): number {
    const s = arena();
    place(s, 0, 0, 0);
    place(s, 5, 0, dist);
    if (carrier) debugGiveBall(s, 5);
    for (let t = 0; t < 200; t++) {
      step(s, s.players[5].status === 'active' ? shootAt(s, 0, 5, AIMED) : {});
      if (s.events.some((e) => e.type === 'tackled')) return t;
    }
    return -1;
  }
  const expected = (dist: number, carrier: boolean): number => {
    const dmg = W.damage * damageFalloff(W, dist - HIT_R) * (carrier ? CARRIER_DAMAGE_MULT : 1);
    const n = Math.ceil(ROLES.ailier.stabilityMax / dmg - 1e-9);
    const flight = Math.ceil((dist - HIT_R) / STEP_LEN) - 1;
    return (n - 1) * fireIntervalTicks(W) + flight;
  };

  it.each([
    [10, false],
    [10, true],
    [25, false],
    [25, true],
  ])('à %d m, porteur : %s', (dist, carrier) => {
    const ticks = measure(dist, carrier);
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBe(expected(dist, carrier));
  });
});
