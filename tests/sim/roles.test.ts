/**
 * Étape 7 (1re partie) : pilier (fusil à pompe, bouclier frontal) et demi (lance-grenades, knockback, zone de
 * ralentissement). Les valeurs attendues sont relues dans les constantes : les tests restent valides quand on règle
 * le feeling.
 */
import { describe, expect, it } from 'vitest';
import {
  BLAST_LOS_BACKOFF,
  Buttons,
  CARRIER_DAMAGE_MULT,
  CARRIER_SPEED_MULT,
  KNOCKBACK_MAX_HORIZONTAL_SPEED,
  PLAYER_GRAVITY,
  PLAYER_RADIUS,
  PROJECTILE_MAX_LIFE_SEC,
  ROLES,
  SHIELD_BLAST_KNOCKBACK_MULT,
  SHIELD_CANCEL_MIN_COOLDOWN_FRACTION,
  SHIELD_SPEED_MULT,
  SLOW_ZONE_PLACE_RANGE,
  SLOW_ZONE_RADIUS,
  SLOW_ZONE_SPEED_MULT,
  STRAFE_SPEED_MULT,
  TICK_DT,
  aimDir,
  aimOrigin,
  blastDistance,
  cloneState,
  debugGiveBall,
  fireIntervalTicks,
  inSlowZone,
  makeInput,
  predictGrenadeImpact,
  secToTicks,
  shieldFacing,
  shieldUp,
  slowZonePlacement,
  step,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type PlayerState,
  type Role,
  type TerrainFeature,
  type Vec3,
} from '../../src/sim';
import { createPlayMatch, findBadValues, hSpeed } from './helpers';

const SG = ROLES.pilier.weapon;
const GL = ROLES.demi.weapon;
const SHIELD = ROLES.pilier.ability;
const ZONE = ROLES.demi.ability;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Match 5v5 sur terrain plat (ou `features`) : équipe 0 = 0 pilier, 1 ailier, 2 demi, 3–4 demis ; équipe 1 = 5 ailier,
 * 6 pilier, 7 demi, 8–9 demis. Tous rangés le long de la touche x < 0 ; ballon immobile dans un coin.
 */
function arena(features: TerrainFeature[] = [], seed = 5): MatchState {
  const roles: [Role[], Role[]] = [
    ['pilier', 'ailier', 'demi', 'demi', 'demi'],
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

interface Logged {
  t: number;
  e: MatchEvent;
}

/** Simule `ticks` ticks et journalise les événements (tick relatif). */
function runLog(s: MatchState, ticks: number, inputs: (t: number) => InputFrame): Logged[] {
  const log: Logged[] = [];
  for (let t = 0; t < ticks; t++) {
    step(s, inputs(t));
    for (const e of s.events) log.push({ t, e });
  }
  return log;
}

const ofType = <T extends MatchEvent['type']>(log: Logged[], type: T): Array<Extract<MatchEvent, { type: T }>> =>
  log.map((l) => l.e).filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);

/** Somme des dégâts reçus par `id`. */
const damageTo = (log: Logged[], id: number): number => ofType(log, 'hit').filter((h) => h.targetId === id).reduce((a, h) => a + h.amount, 0);

/** Grenade forgée (état de test) du demi `ownerId`, en `pos` à la vitesse `vel`. */
function addGrenade(s: MatchState, ownerId: number, pos: Vec3, vel: Vec3): void {
  const o = s.players[ownerId];
  s.projectiles.push({
    id: s.nextEntityId++,
    kind: 'grenade',
    ownerId,
    team: o.team,
    pos: { ...pos },
    vel: { ...vel },
    ttl: secToTicks(PROJECTILE_MAX_LIFE_SEC),
    traveled: 0,
    damage: 0,
  });
}

/** Balle forgée (sans dispersion) du joueur `ownerId` (son arme), de `from` vers `to`. */
function addBullet(s: MatchState, ownerId: number, from: Vec3, to: Vec3): void {
  const o = s.players[ownerId];
  const w = ROLES[o.role].weapon;
  const l = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  s.projectiles.push({
    id: s.nextEntityId++,
    kind: w.projectile,
    ownerId,
    team: o.team,
    pos: { ...from },
    vel: { x: ((to.x - from.x) / l) * w.speed, y: ((to.y - from.y) / l) * w.speed, z: ((to.z - from.z) / l) * w.speed },
    ttl: secToTicks(PROJECTILE_MAX_LIFE_SEC),
    traveled: 0,
    damage: w.damage,
  });
}

/**
 * Avance jusqu'au tick de la première explosion (au plus `max` ticks) : événements de CE tick, joueurs tels qu'ils
 * étaient juste avant (les distances se mesurent avant le knockback), explosions du tick.
 */
function untilExplosion(s: MatchState, max = 30): { log: Logged[]; before: PlayerState[]; ex: Array<Extract<MatchEvent, { type: 'explosion' }>> } {
  for (let t = 0; t < max; t++) {
    const before = cloneState(s).players;
    step(s, {});
    const log = s.events.map((e) => ({ t, e }));
    const ex = ofType(log, 'explosion');
    if (ex.length > 0) return { log, before, ex };
  }
  throw new Error('aucune explosion');
}

/** Grenade qui tombe presque verticalement au sol en (x, z) au tick suivant (arrive à 0,2 m/tick du sol). */
const dropGrenade = (s: MatchState, ownerId: number, x: number, z: number): void => addGrenade(s, ownerId, { x, y: 0.3, z }, { x: 0, y: -12, z: 0 });

/** Facteur de knockback / dégâts à la distance `d` de la surface de la capsule (u = d / blastRadius). */
const lerpBlast = (center: number, edge: number, d: number): number => center + (edge - center) * Math.min(1, d / GL.blastRadius);

// ---------------------------------------------------------------------------
// Pilier : fusil à pompe
// ---------------------------------------------------------------------------

describe('pilier : fusil à pompe', () => {
  /** Dégâts totaux d'UN tir du pilier 0 sur l'ailier 5 placé à `dist` m (visé au centre), seed du match `seed`. */
  function volley(dist: number, seed: number, aiming = false): { damage: number; pellets: number; log: Logged[] } {
    const s = arena([], seed);
    const p = place(s, 0, 0, 0);
    const t = place(s, 5, 0, dist);
    const a = aimAt(p, t.pos, 0.9);
    const log = runLog(s, 8, (k) => ({ 0: makeInput({ ...a, buttons: k === 0 ? Buttons.FIRE | (aiming ? Buttons.AIM : 0) : 0 }) }));
    return { damage: damageTo(log, 5), pellets: s.players[0].stats.shotsFired, log };
  }

  it('un tir = `pellets` plombs (projectiles « pellet ») et UNE munition', () => {
    const r = volley(3, 1);
    expect(r.pellets).toBe(SG.pellets);
    expect(ofType(r.log, 'shot')).toHaveLength(1);
    expect(ofType(r.log, 'projectile_end').filter((e) => e.kind === 'pellet')).toHaveLength(SG.pellets);
  });

  it('dégâts : tous les plombs à 3 m (= pellets × damage), moins à 8 m, presque rien à 15 m, rien au-delà de la portée', () => {
    const avg = (dist: number): number => {
      let tot = 0;
      for (let seed = 1; seed <= 12; seed++) tot += volley(dist, seed).damage;
      return tot / 12;
    };
    const full = SG.pellets * SG.damage;
    expect(full).toBeGreaterThanOrEqual(50); // 2 tirs plaquent à bout portant
    expect(avg(3)).toBeCloseTo(full, 6);
    const at8 = avg(8);
    expect(at8).toBeLessThan(full);
    expect(at8).toBeGreaterThan(full * 0.5);
    const at15 = avg(15);
    expect(at15).toBeLessThan(full * 0.3); // inefficace au-delà de ~12–15 m
    expect(volley(SG.range + PLAYER_RADIUS + 0.5, 1).damage).toBe(0);
  });

  it('plaquage en 2 tirs à bout portant (3 m), au tir suivant la cadence', () => {
    const s = arena();
    const p = place(s, 0, 0, 0);
    const t = place(s, 5, 0, 3);
    const a = aimAt(p, t.pos, 0.9);
    const log = runLog(s, fireIntervalTicks(SG) + 4, () => ({ 0: makeInput({ ...a, buttons: Buttons.FIRE }) }));
    const tackled = log.filter((l) => l.e.type === 'tackled');
    expect(ofType(log, 'shot')).toHaveLength(2);
    expect(tackled).toHaveLength(1);
    expect(tackled[0].t).toBeGreaterThanOrEqual(fireIntervalTicks(SG));
    expect(s.players[0].stats.tackles).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pilier : bouclier frontal
// ---------------------------------------------------------------------------

describe('pilier : bouclier frontal', () => {
  /** L'ailier 1 (équipe 0) tire `ticks` ticks sur `target` (visée au centre, ou `h`) ; le pilier 6 (équipe 1) lève son bouclier au tick 0 si `raise`. */
  function shootPilier(yaw6: number, raise: boolean, ticks = 20) {
    const s = arena();
    const shooter = place(s, 1, 0, 0);
    place(s, 6, 0, 10, yaw6);
    const a = aimAt(shooter, s.players[6].pos, 0.9);
    const log = runLog(s, ticks, (t) => ({
      1: makeInput({ ...a, buttons: t >= 2 ? Buttons.FIRE : 0 }),
      6: makeInput({ yaw: yaw6, buttons: raise && t === 0 ? Buttons.ABILITY : 0 }),
    }));
    return { s, log };
  }

  it('de face : bloque tous les tirs (événement « blocked », fin « blocked », aucun dégât) ; sans bouclier, ils touchent', () => {
    const up = shootPilier(Math.PI, true);
    expect(damageTo(up.log, 6)).toBe(0);
    const blocked = ofType(up.log, 'blocked');
    expect(blocked.length).toBeGreaterThan(5);
    expect(blocked.every((b) => b.targetId === 6 && b.sourceId === 1)).toBe(true);
    expect(ofType(up.log, 'projectile_end').filter((e) => e.reason === 'blocked').length).toBe(blocked.length);
    expect(up.s.players[1].stats.shotsHit).toBe(0);
    const down = shootPilier(Math.PI, false);
    expect(damageTo(down.log, 6)).toBeGreaterThan(20);
  });

  it('dans le dos : le bouclier ne protège pas', () => {
    const r = shootPilier(0, true); // regarde vers +Z, le tireur est derrière lui (z = 0)
    expect(shieldUp(r.s.players[6])).toBe(true);
    expect(damageTo(r.log, 6)).toBeGreaterThan(20);
    expect(ofType(r.log, 'blocked')).toHaveLength(0);
  });

  it('protège un coéquipier qui est derrière (la surface arrête le tir qui ne touche pas la capsule du pilier)', () => {
    // Trajectoire parallèle à Z à 0,67 m de l'axe du pilier : hors de sa capsule + tolérance (0,6 m), mais elle entre dans
    // l'arc du bouclier (asin(0,67 / SHIELD_DISTANCE) ≈ 57° < SHIELD_HALF_ANGLE_DEG).
    const run = (raise: boolean) => {
      const s = arena();
      place(s, 1, 0.67, 0);
      place(s, 6, 0, 10, Math.PI);
      place(s, 5, 0.67, 13);
      const log = runLog(s, 12, (t) => {
        if (t >= 2) addBullet(s, 1, { x: 0.67, y: 1.0, z: 1 }, { x: 0.67, y: 1.0, z: 13 });
        return { 6: makeInput({ yaw: Math.PI, buttons: raise && t === 0 ? Buttons.ABILITY : 0 }) };
      });
      return log;
    };
    const up = run(true);
    expect(damageTo(up, 5)).toBe(0);
    expect(damageTo(up, 6)).toBe(0);
    expect(ofType(up, 'blocked').length).toBeGreaterThan(5);
    const down = run(false);
    expect(damageTo(down, 5)).toBeGreaterThan(20);
    expect(damageTo(down, 6)).toBe(0); // même trajectoire : elle ne touche pas le pilier
  });

  it('durée exacte, cooldown après la durée ; pendant le cooldown ABILITY ne relève pas le bouclier et les tirs touchent', () => {
    const s = arena();
    const p = place(s, 6, 0, 10, Math.PI);
    const dur = secToTicks(SHIELD.duration);
    const log = runLog(s, dur + 10, (t) => ({ 6: makeInput({ yaw: Math.PI, buttons: t === 0 || t === dur + 5 ? Buttons.ABILITY : 0 }) }));
    expect(ofType(log, 'ability')).toHaveLength(1);
    expect(p.abilityTicks).toBe(0);
    // Cooldown posé au tick `dur` (fin de la durée), décompté aux 9 ticks suivants.
    expect(p.abilityCd).toBe(secToTicks(SHIELD.cooldown) - 9);
    expect(shieldUp(p)).toBe(false);
    // Toujours en cooldown : un tireur de face le touche.
    const shooter = place(s, 1, 0, 0);
    const a = aimAt(shooter, p.pos, 0.9);
    const log2 = runLog(s, 12, () => ({ 1: makeInput({ ...a, buttons: Buttons.FIRE }), 6: makeInput({ yaw: Math.PI, buttons: Buttons.ABILITY }) }));
    expect(damageTo(log2, 6)).toBeGreaterThan(0);
    expect(ofType(log2, 'ability')).toHaveLength(0);
  });

  it('second appui : bouclier baissé, cooldown proportionnel à la durée utilisée (au moins la fraction minimale)', () => {
    const cancelAt = (k: number): number => {
      const s = arena();
      const p = place(s, 6, 0, 10, Math.PI);
      runLog(s, k + 1, (t) => ({ 6: makeInput({ yaw: Math.PI, buttons: t === 0 || t === k ? Buttons.ABILITY : 0 }) }));
      expect(p.abilityTicks).toBe(0);
      return p.abilityCd;
    };
    const dur = secToTicks(SHIELD.duration);
    // Appui au tick k : k ticks de bouclier ont été décomptés (minuteries avant les actions dans step).
    const used = (k: number): number => Math.max(SHIELD_CANCEL_MIN_COOLDOWN_FRACTION, k / dur);
    expect(cancelAt(46)).toBe(secToTicks(SHIELD.cooldown * used(46)));
    expect(cancelAt(3)).toBe(secToTicks(SHIELD.cooldown * SHIELD_CANCEL_MIN_COOLDOWN_FRACTION));
    expect(cancelAt(46)).toBeLessThan(secToTicks(SHIELD.cooldown));
  });

  it('bouclier levé : vitesse × SHIELD_SPEED_MULT, pas de tir (rechargement permis) ; utilisable en portant le ballon', () => {
    const speed = (carrier: boolean, ability: boolean): number => {
      const s = arena();
      const p = place(s, 0, 0, -30);
      if (carrier) debugGiveBall(s, 0);
      runLog(s, 30, (t) => ({ 0: makeInput({ moveY: 1, buttons: ability && t === 0 ? Buttons.ABILITY : 0 }) }));
      return hSpeed(p.vel);
    };
    const run = ROLES.pilier.runSpeed;
    expect(speed(false, true)).toBeCloseTo(run * SHIELD_SPEED_MULT, 6);
    expect(speed(true, true)).toBeCloseTo(run * CARRIER_SPEED_MULT * SHIELD_SPEED_MULT, 6);
    expect(speed(false, false)).toBeCloseTo(run, 6);

    const s = arena();
    const p = place(s, 0, 0, 0);
    p.ammo = 2;
    const log = runLog(s, 12, (t) => ({ 0: makeInput({ buttons: Buttons.FIRE | (t === 0 ? Buttons.ABILITY : 0) | (t === 5 ? Buttons.RELOAD : 0) }) }));
    expect(ofType(log, 'shot')).toHaveLength(0);
    expect(ofType(log, 'reload')).toHaveLength(1);
    expect(shieldFacing(p, p.pos.x, p.pos.z + 5)).toBe(true);
    expect(shieldFacing(p, p.pos.x, p.pos.z - 5)).toBe(false);
  });

  it('explosion de face : aucun dégât, knockback × SHIELD_BLAST_KNOCKBACK_MULT, « blocked » ; une grenade qui touche le bouclier y explose', () => {
    const blast = (raise: boolean) => {
      const s = arena();
      const p = place(s, 0, 0, 0, 0);
      place(s, 7, 0, 20, Math.PI);
      if (raise) runLog(s, 1, () => ({ 0: makeInput({ buttons: Buttons.ABILITY }) }));
      dropGrenade(s, 7, 0, 1.6); // au sol, 1,6 m devant lui
      const log = runLog(s, 1, () => ({ 0: makeInput({ buttons: 0 }) }));
      return { s, p, log };
    };
    const up = blast(true);
    const free = blast(false);
    expect(damageTo(up.log, 0)).toBe(0);
    expect(damageTo(free.log, 0)).toBeGreaterThan(0);
    expect(ofType(up.log, 'blocked').map((b) => b.targetId)).toEqual([0]);
    // Vitesse verticale juste après le tick (souffle − gravité d'un tick).
    const upV = up.p.vel.y + PLAYER_GRAVITY * TICK_DT;
    const freeV = free.p.vel.y + PLAYER_GRAVITY * TICK_DT;
    expect(upV / freeV).toBeCloseTo(SHIELD_BLAST_KNOCKBACK_MULT, 6);

    // Grenade lancée droit sur le bouclier levé : explosion contre lui (fin « blocked »), pilier indemne.
    const s = arena();
    const p = place(s, 0, 0, 0, 0);
    place(s, 7, 0, 20, Math.PI);
    runLog(s, 1, () => ({ 0: makeInput({ buttons: Buttons.ABILITY }) }));
    addGrenade(s, 7, { x: 0, y: 1.0, z: 4 }, { x: 0, y: 0, z: -30 });
    const log = runLog(s, 4, () => ({}));
    const end = ofType(log, 'projectile_end').find((e) => e.kind === 'grenade');
    expect(end?.reason).toBe('blocked');
    expect(ofType(log, 'explosion')).toHaveLength(1);
    expect(damageTo(log, 0)).toBe(0);
    expect(p.stability).toBe(ROLES.pilier.stabilityMax);
  });
});

// ---------------------------------------------------------------------------
// Demi : lance-grenades
// ---------------------------------------------------------------------------

describe('demi : lance-grenades', () => {
  it('trajectoire balistique EXACTE (parabole de gravité `gravity`), impact au point prévu par predictGrenadeImpact', () => {
    const s = arena();
    const p = place(s, 2, 0, -20, 0);
    const pitch = 0.35;
    const o = aimOrigin(p.pos, 0);
    const d = aimDir(0, pitch);
    // Dispersion nulle pour comparer à la parabole analytique (l'arme réelle disperse de spreadHipDeg).
    const v = { x: d.x * GL.speed, y: d.y * GL.speed, z: d.z * GL.speed };
    addGrenade(s, 2, o, v);
    const expected = predictGrenadeImpact(s.field, o, v, GL);
    let explosion: Vec3 | null = null;
    for (let k = 1; k < 200 && explosion === null; k++) {
      step(s, {});
      const g = s.projectiles.find((q) => q.kind === 'grenade');
      const ex = s.events.find((e) => e.type === 'explosion');
      if (ex !== undefined && ex.type === 'explosion') explosion = ex.pos;
      else if (g !== undefined) {
        const t = k * TICK_DT;
        expect(g.pos.x).toBeCloseTo(o.x + v.x * t, 9);
        expect(g.pos.y).toBeCloseTo(o.y + v.y * t - 0.5 * GL.gravity * t * t, 9);
        expect(g.pos.z).toBeCloseTo(o.z + v.z * t, 9);
      }
    }
    expect(explosion).not.toBeNull();
    expect(explosion?.y ?? 1).toBeCloseTo(0, 6);
    expect(explosion?.x ?? 99).toBeCloseTo(expected.x, 6);
    expect(explosion?.z ?? 99).toBeCloseTo(expected.z, 6);
  });

  it('le demi tire vraiment : FIRE => une grenade, une munition, cadence fireInterval, rechargement chargeur vide', () => {
    const s = arena();
    place(s, 2, 0, -20, 0);
    const log = runLog(s, fireIntervalTicks(GL) * GL.magazine + 2, () => ({ 2: makeInput({ pitch: 0.3, buttons: Buttons.FIRE }) }));
    const shots = log.filter((l) => l.e.type === 'shot');
    expect(shots).toHaveLength(GL.magazine);
    expect(shots.map((l) => l.t)).toEqual(Array.from({ length: GL.magazine }, (_, i) => i * fireIntervalTicks(GL)));
    expect(ofType(log, 'reload')).toHaveLength(1);
  });

  it('explose sur un muret (face), sur le sol, sur un joueur adverse (impact direct, bonus), en l’air en fin de vie', () => {
    // Muret en travers à z = 10 : la grenade tendue explose sur sa face.
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 10, length: 8, thickness: 0.6, height: 1.2, rotation: Math.PI / 2 };
    const s = arena([wall]);
    place(s, 2, 0, 0);
    addGrenade(s, 2, { x: 0, y: 0.8, z: 2 }, { x: 0, y: 0, z: 30 });
    const log = runLog(s, 10, () => ({}));
    const ex = ofType(log, 'explosion');
    expect(ex).toHaveLength(1);
    expect(ex[0].pos.z).toBeCloseTo(10 - 0.3, 3);
    expect(ofType(log, 'projectile_end')[0].reason).toBe('terrain');

    // Impact direct : dégâts = centre → bord selon la distance à la surface de la capsule + bonus (× porteur).
    for (const carrier of [false, true]) {
      const d = arena();
      place(d, 2, 0, 0);
      const target = place(d, 5, 0, 8);
      if (carrier) debugGiveBall(d, 5);
      addGrenade(d, 2, { x: 0, y: 1.0, z: 4 }, { x: 0, y: 0, z: 30 });
      const { log: l, before, ex } = untilExplosion(d);
      const e = ex[0];
      expect(ofType(l, 'projectile_end')[0].reason).toBe('player');
      expect(target.id).toBe(5);
      const dist = blastDistance(before[5], e.pos);
      const want = (lerpBlast(GL.blastDamageCenter, GL.blastDamageEdge, dist) + GL.directHitBonus) * (carrier ? CARRIER_DAMAGE_MULT : 1);
      expect(damageTo(l, 5)).toBeCloseTo(want, 6);
      expect(d.players[2].stats.shotsHit).toBe(1);
    }

    // Tir très en cloche : fin de vie (PROJECTILE_MAX_LIFE_SEC) en l'air => explosion en l'air, fin « expired ».
    const a = arena();
    const p = place(a, 2, 0, -20);
    const dir = aimDir(0, 1.4);
    addGrenade(a, 2, aimOrigin(p.pos, 0), { x: dir.x * GL.speed, y: dir.y * GL.speed, z: dir.z * GL.speed });
    const la = runLog(a, secToTicks(PROJECTILE_MAX_LIFE_SEC) + 2, () => ({}));
    expect(ofType(la, 'projectile_end')[0].reason).toBe('expired');
    expect(ofType(la, 'explosion')[0].pos.y).toBeGreaterThan(3);
  });

  it('dégâts dégressifs (centre → bord), personne au-delà du rayon ; une seule touche créditée par grenade', () => {
    const s = arena();
    place(s, 2, -20, 0);
    // Adversaires à distances croissantes de l'explosion au sol en (0, 0), écartés les uns des autres.
    place(s, 5, 1.0, 0);
    place(s, 6, -2.0, 0);
    place(s, 7, 0, 3.0);
    place(s, 8, 0, -(GL.blastRadius + PLAYER_RADIUS + 0.5));
    dropGrenade(s, 2, 0, 0);
    const { log, before, ex } = untilExplosion(s);
    const amounts: number[] = [];
    for (const id of [5, 6, 7, 8]) {
      const d = blastDistance(before[id], ex[0].pos);
      const got = damageTo(log, id);
      if (d > GL.blastRadius) expect(got).toBe(0);
      else expect(got).toBeCloseTo(lerpBlast(GL.blastDamageCenter, GL.blastDamageEdge, d), 6);
      amounts.push(got);
    }
    expect(amounts[0]).toBeGreaterThan(amounts[1]);
    expect(amounts[1]).toBeGreaterThan(amounts[2]);
    expect(amounts[2]).toBeGreaterThan(0);
    expect(amounts[3]).toBe(0);
    expect(s.players[2].stats.shotsHit).toBe(1);
  });

  it('knockback dégressif et self-knockback (« grenade jump ») sans dégâts pour le tireur', () => {
    const s = arena();
    const owner = place(s, 2, 0, 0);
    const near = place(s, 5, 6, 1.2);
    const far = place(s, 6, -6, 2.6);
    const startNear = cloneAtStart(near);
    const startFar = cloneAtStart(far);
    const startOwner = cloneAtStart(owner);
    dropGrenade(s, 2, 6, 0);
    dropGrenade(s, 2, -6, 0);
    dropGrenade(s, 2, 0, 0.9);
    const log = runLog(s, 1, () => ({}));
    const ex = ofType(log, 'explosion');
    expect(ex).toHaveLength(3);
    const check = (p: PlayerState, start: PlayerState, e: Vec3, self: boolean) => {
      const d = blastDistance(start, e);
      const k = (1 + (GL.knockbackEdgeMult - 1) * Math.min(1, d / GL.blastRadius)) * (self ? GL.selfKnockbackMult : 1);
      const hx = start.pos.x - e.x;
      const hz = start.pos.z - e.z;
      const hl = Math.max(Math.hypot(hx, hz), PLAYER_RADIUS);
      expect(hSpeed(p.vel)).toBeCloseTo(GL.knockback * k * (Math.hypot(hx, hz) / hl), 6);
      expect(p.vel.y + PLAYER_GRAVITY * TICK_DT).toBeCloseTo(GL.knockbackUp * k, 6);
      expect(p.onGround).toBe(false);
    };
    check(near, startNear, ex[0].pos, false);
    check(far, startFar, ex[1].pos, false);
    check(owner, startOwner, ex[2].pos, true);
    expect(hSpeed(near.vel)).toBeGreaterThan(hSpeed(far.vel));
    expect(damageTo(log, 2)).toBe(0);
    expect(owner.stability).toBe(ROLES.demi.stabilityMax);
    // Le joueur décolle puis atterrit, élan horizontal conservé en l'air.
    const v0 = hSpeed(near.vel);
    let landed = -1;
    for (let t = 0; t < 60 && landed < 0; t++) {
      step(s, {});
      if (near.onGround) landed = t;
      else expect(hSpeed(near.vel)).toBeCloseTo(v0, 6);
    }
    expect(landed).toBeGreaterThan(5);
    expect(findBadValues(s, 'state', [], true)).toEqual([]);
  });

  it('porteur projeté : il garde le ballon, vole, atterrit ; deux souffles au même tick ne se cumulent pas', () => {
    const s = arena();
    place(s, 2, -20, 0);
    const c = place(s, 5, 0, 1);
    debugGiveBall(s, 5);
    // Référence : le souffle le plus fort seul (centre en z = 0,1, le plus proche du porteur).
    const ref = cloneState(s);
    dropGrenade(ref, 2, 0, 0.1);
    step(ref, {});
    const strongest = hSpeed(ref.players[5].vel);
    for (let i = 0; i < 2; i++) dropGrenade(s, 2, 0, 0.1 * i); // deux explosions au même tick (sans le plaquer)
    step(s, {});
    // Vitesse minimale imposée le long du souffle : le second (même direction) n'ajoute rien au plus fort.
    expect(hSpeed(c.vel)).toBeCloseTo(strongest, 6);
    expect(hSpeed(c.vel)).toBeLessThan(KNOCKBACK_MAX_HORIZONTAL_SPEED);
    expect(c.onGround).toBe(false);
    const z0 = c.pos.z;
    for (let t = 0; t < 45; t++) {
      step(s, {});
      expect(s.ball.mode).toBe('carried');
      expect(s.ball.carrierId).toBe(5);
    }
    expect(c.onGround).toBe(true);
    expect(c.pos.z - z0).toBeGreaterThan(2);
  });

  it('souffle = vitesse MINIMALE le long de sa direction : un coureur qui fonce dessus est renvoyé, un fuyard plus rapide ne gagne rien', () => {
    // Explosion au sol en (0, 0), joueur 5 en (0, 1.5) : souffle vers +z. Référence : le même joueur immobile.
    const blastOn = (vx: number, vz: number): PlayerState => {
      const s = arena();
      place(s, 2, -20, 0);
      const p = place(s, 5, 0, 1.5);
      p.vel = { x: vx, y: 0, z: vz };
      dropGrenade(s, 2, 0, 0);
      step(s, {});
      return s.players[5];
    };
    const still = blastOn(0, 0);
    const push = still.vel.z;
    expect(push).toBeGreaterThan(5);
    // Coureur lancé vers l'explosion (8,8 m/s vers −z) : renvoyé à la vitesse du souffle (avant : 8,8 retranchés).
    const charger = blastOn(0, -ROLES.ailier.runSpeed);
    expect(charger.vel.z).toBeCloseTo(push, 6);
    expect(charger.vel.x).toBeCloseTo(0, 9);
    expect(charger.vel.y).toBeCloseTo(still.vel.y, 6);
    // Fuyard plus rapide que le souffle, dans son sens : vitesse horizontale inchangée (avant : accéléré).
    const runner = blastOn(0, push + 3);
    expect(runner.vel.z).toBeCloseTo(push + 3, 6);
    expect(runner.vel.y).toBeCloseTo(still.vel.y, 6);
    // Coureur en travers : composante latérale gardée, souffle complété, vitesse plafonnée.
    const cross = blastOn(14, 0);
    expect(hSpeed(cross.vel)).toBeCloseTo(KNOCKBACK_MAX_HORIZONTAL_SPEED, 6);
    expect(cross.vel.z).toBeGreaterThan(0);
  });

  it('pas de traversée de muret : projeté contre un mur haut, le joueur reste de son côté', () => {
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 10, length: 10, thickness: 0.6, height: 3, rotation: Math.PI / 2 };
    const s = arena([wall]);
    place(s, 2, -20, 0);
    const p = place(s, 5, 0, 9);
    dropGrenade(s, 2, 0, 8.4);
    for (let t = 0; t < 40; t++) {
      step(s, {});
      expect(p.pos.z).toBeLessThanOrEqual(10 - 0.3 - PLAYER_RADIUS + 1e-6);
    }
    expect(p.vel.z).toBeLessThanOrEqual(1e-9);
  });

  it('pas de tir ami ; joueurs au sol / invulnérables : ni dégâts ni knockback', () => {
    const s = arena();
    place(s, 2, -20, 0);
    const mate = place(s, 3, 1, 0); // coéquipier du tireur
    const down = place(s, 5, -1, 0);
    down.status = 'down';
    down.statusTicks = 60;
    down.stability = 0;
    const inv = place(s, 6, 0, 1);
    inv.invulnTicks = 10;
    dropGrenade(s, 2, 0, 0);
    const log = runLog(s, 1, () => ({}));
    expect(ofType(log, 'explosion')).toHaveLength(1);
    expect(ofType(log, 'hit')).toHaveLength(0);
    for (const p of [mate, down, inv]) {
      expect(hSpeed(p.vel)).toBe(0);
      expect(p.vel.y).toBeLessThanOrEqual(0);
    }
  });

  it('ligne de vue : une butte entre l’explosion et le joueur le protège', () => {
    const mound: TerrainFeature = { kind: 'mound', x: 0, z: 2, radius: 1.5, height: 1.2 };
    const hitBehind = (features: TerrainFeature[]): number => {
      const s = arena(features);
      place(s, 2, -20, 0);
      place(s, 5, 0, 3.6);
      dropGrenade(s, 2, 0, 0);
      return damageTo(runLog(s, 1, () => ({})), 5);
    };
    expect(hitBehind([])).toBeGreaterThan(0);
    expect(hitBehind([mound])).toBe(0);
    expect(BLAST_LOS_BACKOFF).toBeGreaterThan(0);
  });
});

/** Copie de l'état d'un joueur (distances mesurées depuis sa position avant le tick). */
function cloneAtStart(p: PlayerState): PlayerState {
  return JSON.parse(JSON.stringify(p)) as PlayerState;
}

// ---------------------------------------------------------------------------
// Demi : zone de ralentissement
// ---------------------------------------------------------------------------

describe('demi : zone de ralentissement', () => {
  it('posée au point visé au sol ; à portée max quand le regard ne touche pas le sol', () => {
    const s = arena();
    const p = place(s, 2, 0, 0, 0);
    const o = aimOrigin(p.pos, 0);
    const pitch = Math.atan2(-o.y, 8);
    const at = slowZonePlacement(s, p, 0, pitch);
    expect(at.x).toBeCloseTo(o.x, 6);
    expect(at.z).toBeCloseTo(o.z + 8, 1);
    expect(at.y).toBe(0);
    const far = slowZonePlacement(s, p, 0, 0.2);
    expect(far.z).toBeCloseTo(o.z + SLOW_ZONE_PLACE_RANGE, 6);
    // Dans la sim : ABILITY pose la zone là, id = nextEntityId, cooldown dès la pose, abilityTicks reste à 0.
    const id = s.nextEntityId;
    const log = runLog(s, 1, () => ({ 2: makeInput({ yaw: 0, pitch, buttons: Buttons.ABILITY }) }));
    expect(ofType(log, 'ability')).toEqual([{ type: 'ability', playerId: 2, role: 'demi' }]);
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0]).toMatchObject({ id, kind: 'slow', ownerId: 2, team: 0, radius: SLOW_ZONE_RADIUS });
    expect(s.zones[0].pos.z).toBeCloseTo(at.z, 6);
    expect(p.abilityTicks).toBe(0);
    expect(p.abilityCd).toBe(secToTicks(ZONE.cooldown));
  });

  it('ralentit les ADVERSAIRES qui courent dedans (× SLOW_ZONE_SPEED_MULT), pas les alliés ; elle vit exactement `duration`', () => {
    const s = arena();
    place(s, 2, 0, -12, 0);
    const foe = place(s, 5, 0, 0);
    const ally = place(s, 1, 4, 0);
    runLog(s, 1, () => ({ 2: makeInput({ yaw: 0, pitch: 0.3, buttons: Buttons.ABILITY }) }));
    const z = s.zones[0];
    foe.pos = { x: z.pos.x - 1, y: 0, z: z.pos.z - 1 };
    ally.pos = { x: z.pos.x + 1, y: 0, z: z.pos.z + 1 };
    expect(inSlowZone(s, foe)).toBe(true);
    expect(inSlowZone(s, ally)).toBe(false);
    // Course latérale (reste dans la zone pendant 10 ticks).
    runLog(s, 10, () => ({ 5: makeInput({ moveX: 1 }), 1: makeInput({ moveX: 1 }) }));
    expect(hSpeed(foe.vel)).toBeCloseTo(ROLES.ailier.runSpeed * STRAFE_SPEED_MULT * SLOW_ZONE_SPEED_MULT, 6);
    expect(hSpeed(ally.vel)).toBeCloseTo(ROLES.ailier.runSpeed * STRAFE_SPEED_MULT, 6);
    // Durée : la zone a été posée au tick 0 et a déjà vécu 11 ticks.
    const life = secToTicks(ZONE.duration);
    let alive = 11;
    while (s.zones.length > 0 && alive < life + 5) {
      step(s, {});
      alive++;
    }
    expect(alive).toBe(life);
  });

  it('une seule zone par demi : la nouvelle remplace l’ancienne (ids croissants) ; celle d’un autre demi reste', () => {
    const s = arena();
    const p = place(s, 2, 0, 0, 0);
    place(s, 3, 10, 0, 0);
    runLog(s, 1, () => ({ 2: makeInput({ yaw: 0, pitch: 0.2, buttons: Buttons.ABILITY }), 3: makeInput({ yaw: 0, pitch: 0.2, buttons: Buttons.ABILITY }) }));
    expect(s.zones.map((z) => z.ownerId)).toEqual([2, 3]);
    const first = s.zones[0].id;
    p.abilityCd = 0; // (outil de test : relance immédiate)
    runLog(s, 2, (t) => ({ 2: makeInput({ yaw: Math.PI / 2, pitch: 0.2, buttons: t === 1 ? Buttons.ABILITY : 0 }) }));
    expect(s.zones.map((z) => z.ownerId)).toEqual([3, 2]);
    expect(s.zones[1].id).toBeGreaterThan(first);
    expect(s.zones[1].pos.x).toBeGreaterThan(10);
    expect(JSON.parse(JSON.stringify(cloneState(s).zones))).toEqual(s.zones);
  });
});
