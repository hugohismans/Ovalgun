/**
 * Boucle de match (étape 6) : coup d'envoi / remise en jeu, essai, pause d'essai, chrono, dernière minute, fin de
 * match, mode entraînement, déterminisme d'un match complet scripté, lectures pures pour les bots.
 */
import { describe, expect, it } from 'vitest';
import {
  activePlayers,
  attackDir,
  attackYaw,
  ballCarrier,
  ballLandingPoint,
  Buttons,
  cloneState,
  createMatch,
  debugGiveBall,
  debugResetBall,
  distanceToTryLine,
  DODGE_COOLDOWN_SEC,
  FIRST_KICKOFF_FREEZE_SEC,
  FIRST_KICKOFF_TEAM,
  groundHeight,
  hashState,
  isInOpponentInGoal,
  isInOwnInGoal,
  isPlayerActive,
  KICKOFF_DEFEND_OFFSET,
  KICKOFF_FREEZE_SEC,
  KICKOFF_RECEIVE_OFFSET,
  kickLaunch,
  LAST_MINUTE_BALL_SPEED_MULT,
  LAST_MINUTE_COOLDOWN_MULT,
  LAST_MINUTE_SEC,
  makeInput,
  MATCH_DURATION_SEC,
  opponentTeam,
  opponentTryLineZ,
  ownTryLineZ,
  planPass,
  possessionTeam,
  predictBallLanding,
  ROLES,
  secToTicks,
  setupKickoff,
  startPlayNow,
  step,
  supportHeight,
  PLAYER_RADIUS,
  TRY_PAUSE_SEC,
  TRY_POINTS,
  type InputFrame,
  type MatchConfig,
  type MatchEvent,
  type MatchEventType,
  type MatchState,
  type PlayerInput,
  type TeamId,
  type TeamSize,
} from '../../src/sim';
import { ROLES_3, ROLES_5, findBadValues, scriptedInputs } from './helpers';

const KICKOFF_TICKS = secToTicks(KICKOFF_FREEZE_SEC);
/** Décompte du PREMIER coup d'envoi (createMatch), plus long que celui des remises en jeu. */
const FIRST_KICKOFF_TICKS = secToTicks(FIRST_KICKOFF_FREEZE_SEC);
const TRY_TICKS = secToTicks(TRY_PAUSE_SEC);

const config = (teamSize: TeamSize, extra: Partial<MatchConfig> = {}): MatchConfig => ({
  teamSize,
  seed: 11,
  roles: teamSize === 3 ? ROLES_3 : ROLES_5,
  ...extra,
});

/**
 * Match EN JEU sur terrain plat : coup d'envoi sauté (startPlayNow), tous les joueurs rangés le long de la touche
 * x > 0 autour de la médiane (loin des en-buts), ballon libre immobile dans un coin. Chaque test place ensuite
 * le porteur dont il a besoin.
 */
function liveMatch(teamSize: TeamSize = 5, extra: Partial<MatchConfig> = {}): MatchState {
  const s = createMatch(config(teamSize, extra));
  startPlayNow(s);
  s.field.features = [];
  for (const p of s.players) {
    p.pos = { x: s.field.width / 2 - 1, y: 0, z: -6 + p.id * 1.4 };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  debugResetBall(s);
  s.ball.pos = { x: -s.field.width / 2 + 1, y: 0.12, z: 0 };
  s.events = [];
  return s;
}

/** Place le joueur `id` en (x, z), au sol, immobile, tourné vers l'en-but adverse. */
function place(s: MatchState, id: number, x: number, z: number): void {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = attackYaw(p.team);
  p.move = 'run';
  p.moveTicks = 0;
  p.onGround = true;
}

/** Entrée « courir vers l'en-but adverse » du joueur `id` (les autres : entrée neutre implicite). */
const runForward = (s: MatchState, id: number, buttons = 0): InputFrame => ({
  [id]: makeInput({ moveY: 1, yaw: attackYaw(s.players[id].team), buttons }),
});

/** Simule jusqu'au premier événement `type` (au plus `max` ticks) ; renvoie les événements de ce tick. */
function stepUntil(s: MatchState, type: MatchEventType, inputs: (s: MatchState) => InputFrame, max = 600): MatchEvent[] {
  for (let i = 0; i < max; i++) {
    step(s, inputs(s));
    if (s.events.some((e) => e.type === type)) return s.events;
  }
  throw new Error(`aucun événement ${type} en ${max} ticks`);
}

/** Porteur `id` placé à `before` m de la ligne d'essai adverse (côté terrain), ballon en main. */
function carrierBeforeLine(s: MatchState, id: number, before: number): void {
  const p = s.players[id];
  place(s, id, 0, opponentTryLineZ(s, p.team) - attackDir(p.team) * before);
  expect(debugGiveBall(s, id)).toBe(true);
}

// ---------------------------------------------------------------------------
// Coup d'envoi / remise en jeu
// ---------------------------------------------------------------------------

describe("coup d'envoi : placement", () => {
  for (const teamSize of [3, 5] as const) {
    for (const receiving of [0, 1] as const) {
      it(`${teamSize}v${teamSize}, l'équipe ${receiving} reçoit : lignes, orientation, terrain plat, porteur central`, () => {
        const s = createMatch(config(teamSize, { firstKickoffTeam: receiving }));
        const f = s.field;
        expect(s.phase).toBe('kickoff');
        expect(s.phaseTicks).toBe(FIRST_KICKOFF_TICKS);
        expect(s.kickoffTeam).toBe(receiving);
        expect(s.events).toEqual([{ type: 'kickoff', team: receiving }]);
        const defending = opponentTeam(receiving);
        for (const p of s.players) {
          const recv = p.team === receiving;
          // Équipe qui reçoit : KICKOFF_RECEIVE_OFFSET × échelle devant SA ligne d'essai ; l'autre :
          // KICKOFF_DEFEND_OFFSET × échelle derrière la médiane, dans son camp.
          const expectedZ = recv
            ? ownTryLineZ(s, p.team) + attackDir(p.team) * KICKOFF_RECEIVE_OFFSET * f.scale
            : -attackDir(p.team) * KICKOFF_DEFEND_OFFSET * f.scale;
          expect(p.pos.z).toBeCloseTo(expectedZ, 9);
          expect(p.pos.z * attackDir(p.team)).toBeLessThan(0); // dans son camp
          expect(p.yaw).toBe(attackYaw(p.team));
          expect(Math.abs(p.pos.x)).toBeLessThan(f.width / 2 - PLAYER_RADIUS);
          // Sur du plat, hors reliefs (rampes, murets, buttes).
          expect(p.pos.y).toBe(0);
          expect(supportHeight(f, p.pos.x, p.pos.z, PLAYER_RADIUS)).toBe(0);
          expect(groundHeight(f, p.pos.x, p.pos.z)).toBe(0);
        }
        // Étalés en largeur, sans doublon.
        for (const team of [receiving, defending]) {
          const xs = s.players.filter((p) => p.team === team).map((p) => p.pos.x);
          expect(new Set(xs).size).toBe(teamSize);
          expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(f.width * 0.5);
        }
        // Ballon PORTÉ par le joueur le plus central de l'équipe qui reçoit (effectif impair : celui du milieu).
        const carrier = ballCarrier(s);
        expect(s.ball.mode).toBe('carried');
        expect(carrier?.id).toBe(receiving * teamSize + (teamSize - 1) / 2);
        expect(carrier?.pos.x).toBe(0);
        expect(possessionTeam(s)).toBe(receiving);
        expect(s.ball.lastTeam).toBe(receiving);
        // État de départ propre : JSON pur, sans -0, aucun tirage aléatoire consommé.
        expect(findBadValues(s, 'state', [], true)).toEqual([]);
        expect(s.rng).toBe(createMatch(config(teamSize, { firstKickoffTeam: receiving, seed: 11 })).rng);
      });
    }
  }

  it('config.kickoffReceivers : receveur désigné par équipe (le joueur humain en solo), −1 = le plus central', () => {
    // Équipe 0 : index 0 (l'humain) ; équipe 1 : défaut (le plus central, index 1 en 3v3).
    const s = createMatch(config(3, { kickoffReceivers: [0, -1] }));
    expect(s.config.kickoffReceivers).toEqual([0, -1]);
    expect(ballCarrier(s)?.id).toBe(0);
    setupKickoff(s, 1);
    expect(ballCarrier(s)?.id).toBe(3 + 1);
    expect(s.phaseTicks).toBe(KICKOFF_TICKS); // remise en jeu : décompte court
    expect(createMatch(config(5)).config.kickoffReceivers).toEqual([-1, -1]);
    expect(ballCarrier(createMatch(config(5)))?.id).toBe(2);
    expect(() => createMatch(config(3, { kickoffReceivers: [3, -1] }))).toThrow();
    expect(() => createMatch(config(3, { kickoffReceivers: [0.5, -1] }))).toThrow();
  });

  it('une entrée à −0 (bot : direction × inclinaison nulle) ne met pas de −0 dans l’état', () => {
    const s = createMatch(config(3));
    startPlayNow(s);
    step(s, { 0: { moveX: -0, moveY: -0, yaw: -0, pitch: -0, buttons: 0 } });
    expect(findBadValues(s, 'state', [], true)).toEqual([]);
    expect(Object.is(s.players[0].lastMoveX, -0)).toBe(false);
    expect(Object.is(s.players[0].yaw, -0)).toBe(false);
  });

  it("équipe du premier coup d'envoi par défaut : FIRST_KICKOFF_TEAM", () => {
    expect(createMatch(config(3)).kickoffTeam).toBe(FIRST_KICKOFF_TEAM);
  });

  it("figé pendant FIRST_KICKOFF_FREEZE_SEC (seule la visée bouge), 'play' au tick exact, puis on court", () => {
    const s = createMatch(config(5));
    const start = cloneState(s);
    const fullClock = s.clockTicks;
    const all = (yawOff: number): InputFrame => {
      const f: Record<number, PlayerInput> = {};
      for (const p of s.players) {
        f[p.id] = makeInput({ moveY: 1, yaw: attackYaw(p.team) + yawOff, buttons: Buttons.SPRINT | Buttons.JUMP | Buttons.FIRE | Buttons.KICK });
      }
      return f;
    };
    for (let t = 1; t < FIRST_KICKOFF_TICKS; t++) {
      step(s, all(0.3));
      expect(s.phase).toBe('kickoff');
      expect(s.events.map((e) => e.type)).toEqual([]);
      expect(s.clockTicks).toBe(fullClock);
      expect(s.projectiles).toEqual([]);
      for (const p of s.players) {
        expect(p.pos).toEqual(start.players[p.id].pos);
        expect(p.yaw).toBeCloseTo(attackYaw(p.team) + 0.3 - (p.team === 1 ? 2 * Math.PI : 0), 9);
      }
      expect(s.ball.mode).toBe('carried');
    }
    step(s, all(0));
    expect(s.tick).toBe(FIRST_KICKOFF_TICKS);
    expect(s.phase).toBe('play');
    expect(s.phaseTicks).toBe(0);
    expect(s.events.map((e) => e.type)).toContain('play');
    // Ce tick est joué : déplacement et chrono.
    expect(s.clockTicks).toBe(fullClock - 1);
    for (const p of s.players) expect((p.pos.z - start.players[p.id].pos.z) * attackDir(p.team)).toBeGreaterThan(0);
  });

  it('startPlayNow saute le décompte (sans événement) ; sans effet hors du coup d’envoi', () => {
    const s = createMatch(config(3));
    expect(startPlayNow(s)).toBe(true);
    expect(s.phase).toBe('play');
    expect(s.phaseTicks).toBe(0);
    expect(startPlayNow(s)).toBe(false);
    step(s, {});
    expect(s.events.map((e) => e.type)).not.toContain('play');
  });
});

// ---------------------------------------------------------------------------
// Essai
// ---------------------------------------------------------------------------

describe('essai', () => {
  for (const team of [0, 1] as const) {
    it(`équipe ${team} : en courant, au tick exact où les pieds franchissent la ligne ; score, stats, événement`, () => {
      const s = liveMatch(5);
      const id = team * 5 + 1;
      carrierBeforeLine(s, id, 2);
      const line = opponentTryLineZ(s, team);
      let prevZ = s.players[id].pos.z;
      for (let i = 0; i < 60 && s.phase === 'play'; i++) {
        prevZ = s.players[id].pos.z;
        step(s, runForward(s, id));
      }
      const p = s.players[id];
      expect(s.phase).toBe('try');
      expect((prevZ - line) * attackDir(team)).toBeLessThan(0); // pas encore au tick précédent
      expect((p.pos.z - line) * attackDir(team)).toBeGreaterThanOrEqual(0);
      expect(s.events).toContainEqual({ type: 'try', team, scorerId: id });
      expect(s.score[team]).toBe(TRY_POINTS);
      expect(s.score[opponentTeam(team)]).toBe(0);
      expect(p.stats.tries).toBe(1);
      expect(s.ball.mode).toBe('dead');
      expect(s.ball.carrierId).toBe(-1);
      expect(s.ball.vel).toEqual({ x: 0, y: 0, z: 0 });
      expect(isInOpponentInGoal(s, team, s.ball.pos.z)).toBe(true); // aplati dans l'en-but
      expect(s.phaseTicks).toBe(TRY_TICKS);
      expect(s.kickoffTeam).toBe(opponentTeam(team));
    });

    it(`équipe ${team} : en PLONGEON (le plongeon permet d'aplatir)`, () => {
      const s = liveMatch(3);
      const id = team * 3;
      carrierBeforeLine(s, id, 2.5);
      // Sans rien faire : pas d'essai.
      for (let i = 0; i < 10; i++) step(s, {});
      expect(s.phase).toBe('play');
      const log: MatchEventType[] = [];
      for (let i = 0; i < 30 && s.phase === 'play'; i++) {
        step(s, { [id]: makeInput({ yaw: attackYaw(team), buttons: i === 0 ? Buttons.SLIDE : 0 }) });
        log.push(...s.events.map((e) => e.type));
      }
      expect(log[0]).toBe('dive');
      expect(log).toContain('try');
      expect(s.players[id].move).toBe('dive');
      expect(s.score[team]).toBe(TRY_POINTS);
    });

    it(`équipe ${team} : plaqué au tick où ses pieds franchissent la ligne = essai (vérifié avant les plaquages)`, () => {
      const s = liveMatch(3);
      const id = team * 3 + 1;
      carrierBeforeLine(s, id, 0.05);
      const p = s.players[id];
      p.vel = { x: 0, y: 0, z: attackDir(team) * 8 };
      p.stability = 0; // jauge vidée ce tick (comme par un projectile à l'étape 6) : plaquage à l'étape 8
      const clock = s.clockTicks;
      step(s, runForward(s, id));
      const types = s.events.map((e) => e.type);
      expect(types).toContain('try');
      expect(types).toContain('tackled'); // il tombe quand même, après avoir marqué
      expect(types).not.toContain('drop'); // le ballon était déjà aplati (mort)
      expect(types.indexOf('try')).toBeLessThan(types.indexOf('tackled'));
      expect(s.phase).toBe('try');
      expect(s.score[team]).toBe(TRY_POINTS);
      expect(s.ball.mode).toBe('dead');
      expect(s.clockTicks).toBe(clock - 1); // tick joué : le chrono a tourné
      expect(s.phaseTicks).toBe(TRY_TICKS);
    });

    it(`équipe ${team} : plaqué avant la ligne = pas d'essai, ballon lâché`, () => {
      const s = liveMatch(3);
      const id = team * 3 + 1;
      carrierBeforeLine(s, id, 1);
      const p = s.players[id];
      p.vel = { x: 0, y: 0, z: attackDir(team) * 8 };
      p.stability = 0;
      step(s, runForward(s, id));
      expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['tackled', 'drop']));
      expect(s.events.map((e) => e.type)).not.toContain('try');
      expect(s.phase).toBe('play');
      expect(s.ball.mode).toBe('loose');
      expect(s.score).toEqual([0, 0]);
    });

    it(`équipe ${team} : ballon libre ramassé dans l'en-but adverse = essai immédiat ; dans son propre en-but, rien`, () => {
      const s = liveMatch(5);
      const id = team * 5 + 2;
      // Propre en-but : ramassage, aucun essai, même en y restant.
      const own = ownTryLineZ(s, team) - attackDir(team) * 2;
      place(s, id, 3, own);
      expect(isInOwnInGoal(s, team, own)).toBe(true);
      s.ball.pos = { x: 3, y: 0.12, z: own };
      s.ball.vel = { x: 0, y: 0, z: 0 };
      step(s, {});
      expect(s.events).toContainEqual({ type: 'pickup', playerId: id });
      for (let i = 0; i < 20; i++) step(s, {});
      expect(s.phase).toBe('play');
      expect(s.score).toEqual([0, 0]);
      // En-but adverse : ramassage et essai au même tick.
      debugResetBall(s);
      const opp = opponentTryLineZ(s, team) + attackDir(team) * 2;
      place(s, id, -3, opp);
      s.ball.pos = { x: -3, y: 0.12, z: opp };
      step(s, {});
      expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['pickup', 'try']));
      expect(s.events.findIndex((e) => e.type === 'pickup')).toBeLessThan(s.events.findIndex((e) => e.type === 'try'));
      expect(s.score[team]).toBe(TRY_POINTS);
      expect(s.players[id].stats.tries).toBe(1);
    });
  }

  it("pause 'try' exacte, puis remise en jeu reçue par l'équipe qui a encaissé, puis 'play'", () => {
    const s = liveMatch(5);
    carrierBeforeLine(s, 1, 0.5);
    stepUntil(s, 'try', (st) => runForward(st, 1));
    const tryTick = s.tick;
    const clock = s.clockTicks;
    const frozen = cloneState(s);
    for (let i = 1; i < TRY_TICKS; i++) {
      step(s, runForward(s, 1, Buttons.JUMP | Buttons.SLIDE));
      expect(s.phase).toBe('try');
      expect(s.events).toEqual([]);
      expect(s.clockTicks).toBe(clock); // le chrono ne tourne pas pendant la pause
      expect(s.players[1].pos).toEqual(frozen.players[1].pos); // figés
      expect(s.ball.pos).toEqual(frozen.ball.pos);
    }
    step(s, {});
    expect(s.tick).toBe(tryTick + TRY_TICKS);
    expect(s.phase).toBe('kickoff');
    expect(s.events).toEqual([{ type: 'kickoff', team: 1 }]);
    expect(s.kickoffTeam).toBe(1);
    expect(ballCarrier(s)?.id).toBe(5 + 2);
    expect(s.clockTicks).toBe(clock);
    stepUntil(s, 'play', () => ({}));
    expect(s.tick).toBe(tryTick + TRY_TICKS + KICKOFF_TICKS);
    expect(s.clockTicks).toBe(clock - 1);
  });

  it("remise en jeu : état transitoire remis à zéro ; score, chrono, stats, rng, lastButtons conservés", () => {
    const s = liveMatch(5);
    s.players[0].stats.tackles = 3;
    s.players[6].stats.passes = 2;
    carrierBeforeLine(s, 1, 0.5);
    stepUntil(s, 'try', (st) => runForward(st, 1));
    // Pendant la pause, on salit l'état transitoire (comme si des actions venaient d'avoir lieu).
    while (s.phaseTicks > 1) step(s, { 3: makeInput({ buttons: Buttons.FIRE }) });
    const p2 = s.players[2];
    Object.assign(p2, {
      status: 'down',
      statusTicks: 40,
      stability: 0,
      regenDelayTicks: 30,
      dodgeCd: 20,
      slideCd: 12,
      diveCd: 9,
      invulnTicks: 5,
      fireCd: 2,
      ammo: 0,
      reloadTicks: 25,
      abilityCd: 50,
      abilityTicks: 4,
      pickupBlockTicks: 8,
      lastHitBy: 7,
      move: 'dodge',
      moveTicks: 3,
      airJumpsUsed: 1,
    });
    p2.vel = { x: 3, y: 2, z: 1 };
    s.zones.push({ id: 99, kind: 'slow', ownerId: 8, team: 1, pos: { x: 0, y: 0, z: 0 }, radius: 4, ttl: 50 });
    s.scrum = { center: { x: 0, y: 0, z: 0 }, radius: 6, ticks: 10, counts: [2, 3] };
    s.projectiles.push({ id: 98, kind: 'bullet', ownerId: 6, team: 1, pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 10 }, ttl: 9, traveled: 0, damage: 5 });
    const before = cloneState(s);
    step(s, { 3: makeInput({ buttons: Buttons.FIRE }) });
    expect(s.phase).toBe('kickoff');
    for (const p of s.players) {
      const role = ROLES[p.role];
      expect(p.status).toBe('active');
      expect(p.statusTicks).toBe(0);
      expect(p.stability).toBe(role.stabilityMax);
      expect(p.regenDelayTicks).toBe(0);
      expect([p.dodgeCd, p.slideCd, p.diveCd, p.invulnTicks, p.fireCd, p.reloadTicks, p.abilityCd, p.abilityTicks, p.pickupBlockTicks]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(p.ammo).toBe(role.weapon.magazine);
      expect(p.lastHitBy).toBe(-1);
      expect(p.move).toBe('run');
      expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
      expect(p.airJumpsUsed).toBe(0);
      expect(p.onGround).toBe(true);
      expect(p.stats).toEqual(before.players[p.id].stats);
    }
    expect(s.players[3].lastButtons).toBe(Buttons.FIRE); // suivi des fronts montants conservé
    expect(s.projectiles).toEqual([]);
    expect(s.zones).toEqual([]);
    expect(s.scrum).toBeNull();
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.throwerId).toBe(-1);
    expect(s.ball.passTargetId).toBe(-1);
    expect(s.ball.flightTicks).toBe(0);
    expect(s.score).toEqual(before.score);
    expect(s.clockTicks).toBe(before.clockTicks);
    expect(s.lastMinute).toBe(before.lastMinute);
    expect(s.rng).toBe(before.rng);
    expect(s.nextEntityId).toBe(before.nextEntityId);
    expect(s.players[0].stats.tackles).toBe(3);
    expect(s.players[1].stats.tries).toBe(1);
    expect(findBadValues(s)).toEqual([]);
  });

  it('outils de test refusés pendant la pause d’essai (ballon mort)', () => {
    const s = liveMatch(3);
    carrierBeforeLine(s, 0, 0.3);
    stepUntil(s, 'try', (st) => runForward(st, 0));
    const ball = JSON.stringify(s.ball);
    expect(debugGiveBall(s, 1)).toBe(false);
    expect(debugResetBall(s)).toBe(false);
    expect(JSON.stringify(s.ball)).toBe(ball);
  });
});

// ---------------------------------------------------------------------------
// Chrono, dernière minute, fin
// ---------------------------------------------------------------------------

describe('chrono et dernière minute', () => {
  it("le chrono ne tourne qu'en 'play' : un tick par tick joué", () => {
    const s = createMatch(config(3));
    const full = secToTicks(MATCH_DURATION_SEC);
    expect(s.clockTicks).toBe(full);
    for (let i = 1; i < FIRST_KICKOFF_TICKS; i++) step(s, {});
    expect(s.clockTicks).toBe(full);
    for (let i = 0; i < 100; i++) step(s, {});
    expect(s.phase).toBe('play');
    expect(s.clockTicks).toBe(full - 100); // le premier des 100 est le tick du coup de sifflet, déjà joué
  });

  it("durationSec personnalisée ; dernière minute : drapeau et événement UNE fois, au tick exact", () => {
    const s = liveMatch(3, { durationSec: 90 });
    expect(s.clockTicks).toBe(secToTicks(90));
    const lm = secToTicks(LAST_MINUTE_SEC);
    s.clockTicks = lm + 2;
    step(s, {});
    expect(s.lastMinute).toBe(false);
    expect(s.events.map((e) => e.type)).not.toContain('last_minute');
    step(s, {});
    expect(s.clockTicks).toBe(lm);
    expect(s.lastMinute).toBe(true);
    expect(s.events.filter((e) => e.type === 'last_minute')).toHaveLength(1);
    let count = 0;
    for (let i = 0; i < 200; i++) {
      step(s, {});
      count += s.events.filter((e) => e.type === 'last_minute').length;
    }
    expect(count).toBe(0);
    expect(s.lastMinute).toBe(true);
  });

  it('dernière minute : cooldowns raccourcis et ballon plus rapide (passe, coup de pied)', () => {
    const measure = (last: boolean): { dodgeCd: number; kickVel: number; passFlight: number; kickH: number } => {
      const s = liveMatch(5);
      if (last) s.clockTicks = secToTicks(LAST_MINUTE_SEC) + 1;
      step(s, {}); // déclenche la dernière minute le cas échéant
      expect(s.lastMinute).toBe(last);
      // Esquive du joueur 2 (sans ballon) : cooldown fixé au déclenchement.
      place(s, 2, 0, 0);
      step(s, { 2: makeInput({ moveY: 1, buttons: Buttons.DODGE }) });
      const dodgeCd = s.players[2].dodgeCd;
      // Passe (receveur immobile à 12 m derrière) et coup de pied du porteur 0, arrêté.
      place(s, 0, -10, 10);
      place(s, 1, -10, -2);
      debugGiveBall(s, 0);
      const plan = planPass(s, 0, 1);
      const launch = kickLaunch(s, 0, 0, 0);
      step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.KICK }) });
      expect(s.ball.mode).toBe('kick');
      return {
        dodgeCd,
        kickVel: Math.hypot(launch?.vel.x ?? 0, launch?.vel.y ?? 0, launch?.vel.z ?? 0),
        passFlight: plan?.flightSec ?? 0,
        kickH: Math.hypot(s.ball.vel.x, s.ball.vel.z),
      };
    };
    const normal = measure(false);
    const last = measure(true);
    expect(normal.dodgeCd).toBe(secToTicks(DODGE_COOLDOWN_SEC));
    expect(last.dodgeCd).toBe(secToTicks(DODGE_COOLDOWN_SEC * LAST_MINUTE_COOLDOWN_MULT));
    expect(last.dodgeCd).toBeLessThan(normal.dodgeCd);
    expect(last.kickVel / normal.kickVel).toBeCloseTo(LAST_MINUTE_BALL_SPEED_MULT, 9);
    expect(normal.passFlight / last.passFlight).toBeCloseTo(LAST_MINUTE_BALL_SPEED_MULT, 9);
    // Le coup de pied réellement parti dans la sim (après un tick de traînée linéaire) garde le même rapport.
    expect(last.kickH / normal.kickH).toBeCloseTo(LAST_MINUTE_BALL_SPEED_MULT, 6);
  });

  it("fin exacte au tick : phase 'ended', 'match_end' (égalité possible), ballon mort, step sûr et tout figé", () => {
    const s = liveMatch(5);
    s.clockTicks = 5;
    // Un projectile en vol et un joueur qui court : tout s'arrête à la fin.
    place(s, 6, 0, 5);
    for (let i = 0; i < 4; i++) {
      step(s, { 3: makeInput({ moveY: 1, yaw: 0, buttons: Buttons.FIRE }), 6: makeInput({ moveY: 1, yaw: Math.PI }) });
      expect(s.phase).toBe('play');
    }
    step(s, { 3: makeInput({ moveY: 1, yaw: 0, buttons: Buttons.FIRE }) });
    expect(s.clockTicks).toBe(0);
    expect(s.phase).toBe('ended');
    expect(s.events).toContainEqual({ type: 'match_end', score: [0, 0] });
    expect(s.ball.mode).toBe('dead');
    expect(s.projectiles).toEqual([]);
    for (const p of s.players) expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
    // Ensuite : seuls tick, visée et lastButtons évoluent, quelles que soient les entrées.
    const strip = (st: MatchState): string =>
      JSON.stringify({ ...st, tick: 0, events: [], players: st.players.map((p) => ({ ...p, yaw: 0, pitch: 0, lastButtons: 0 })) });
    const frozen = strip(s);
    const endTick = s.tick;
    for (let i = 0; i < 90; i++) {
      const f: Record<number, PlayerInput> = {};
      for (const p of s.players) {
        f[p.id] = makeInput({ moveY: 1, moveX: 0.5, yaw: 0.01 * i, pitch: 0.2, buttons: i % 2 === 0 ? 0x3ff : Buttons.FIRE });
      }
      expect(() => step(s, f)).not.toThrow();
      expect(s.events).toEqual([]);
    }
    expect(s.tick).toBe(endTick + 90);
    expect(s.players[4].yaw).toBeCloseTo(0.89, 9);
    expect(s.players[4].pitch).toBeCloseTo(0.2, 9);
    expect(strip(s)).toBe(frozen);
    expect(s.phase).toBe('ended');
    expect(debugGiveBall(s, 0)).toBe(false);
    expect(debugResetBall(s)).toBe(false);
    expect(findBadValues(s)).toEqual([]);
  });

  it("essai au tick même où le chrono atteint 0 : il compte (essai puis fin, score final compris)", () => {
    const s = liveMatch(3);
    carrierBeforeLine(s, 4, 0.1);
    s.players[4].vel = { x: 0, y: 0, z: -8 };
    s.clockTicks = 1;
    step(s, runForward(s, 4));
    const types = s.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['try', 'match_end']));
    expect(types.indexOf('try')).toBeLessThan(types.indexOf('match_end'));
    expect(s.events).toContainEqual({ type: 'match_end', score: [0, TRY_POINTS] });
    expect(s.phase).toBe('ended');
    expect(s.score).toEqual([0, TRY_POINTS]);
  });

  it('entraînement : chrono figé, jamais de dernière minute ni de fin ; essais et remises en jeu identiques', () => {
    const s = liveMatch(3, { training: true });
    const clock = s.clockTicks;
    for (let i = 0; i < 300; i++) step(s, {});
    expect(s.clockTicks).toBe(clock);
    s.clockTicks = 1;
    for (let i = 0; i < 300; i++) step(s, {});
    expect(s.phase).toBe('play');
    expect(s.lastMinute).toBe(false);
    carrierBeforeLine(s, 0, 0.3);
    stepUntil(s, 'try', (st) => runForward(st, 0));
    expect(s.score[0]).toBe(TRY_POINTS);
    stepUntil(s, 'kickoff', () => ({}));
    expect(s.kickoffTeam).toBe(1);
    stepUntil(s, 'play', () => ({}));
    expect(s.clockTicks).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Match complet scripté : déterminisme
// ---------------------------------------------------------------------------

/**
 * Match complet (durée courte) avec entrées pseudo-aléatoires et interventions scriptées identiques à chaque
 * exécution : régulièrement, un joueur est posé avec le ballon juste devant la ligne adverse (essai quasi certain),
 * ce qui exerce essais, pauses, remises en jeu, puis dernière minute et fin.
 */
function simulateFullMatch(teamSize: TeamSize, seed: number, roundTripEvery = 0) {
  const durationSec = 75;
  let s = createMatch({ teamSize, seed, roles: teamSize === 3 ? ROLES_3 : ROLES_5, durationSec });
  // Borne large (chaque essai ajoute une pause et un coup d'envoi) ; on s'arrête 30 ticks après la fin.
  const ticks = secToTicks(durationSec) + 20 * (TRY_TICKS + KICKOFF_TICKS);
  const frames = scriptedInputs(seed + 7, teamSize * 2, ticks);
  let endedAt = -1;
  const counts: Partial<Record<MatchEventType, number>> = {};
  const hashes: string[] = [];
  let bad: string[] = [];
  for (let t = 0; t < ticks; t++) {
    if (endedAt >= 0 && t > endedAt + 30) break;
    if (t % 400 === 200 && s.phase === 'play') {
      const id = (t / 200) % s.players.length;
      const p = s.players[id];
      if (p.status === 'active') {
        p.pos = { x: p.pos.x * 0.5, y: 0, z: opponentTryLineZ(s, p.team) - attackDir(p.team) * 0.2 };
        p.vel = { x: 0, y: 0, z: attackDir(p.team) * 6 };
        p.move = 'run';
        debugGiveBall(s, id);
      }
    }
    if (roundTripEvery > 0 && t % roundTripEvery === 0) s = cloneState(s);
    step(s, frames[t]);
    for (const e of s.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (t % 50 === 0) hashes.push(hashState(s));
    if (t % 25 === 0 && bad.length === 0) bad = findBadValues(s).map((b) => `tick ${s.tick}: ${b}`);
    if (endedAt < 0 && s.phase === 'ended') endedAt = t;
  }
  return { s, counts, hashes, bad };
}

describe.each([3, 5] as const)('match complet scripté, équipes de %i', (teamSize) => {
  const ref = simulateFullMatch(teamSize, 21);

  it('va au bout : essais, remises en jeu, dernière minute, fin ; score = essais × TRY_POINTS', () => {
    const { s, counts } = ref;
    expect(s.phase).toBe('ended');
    expect(s.clockTicks).toBe(0);
    expect(counts.match_end).toBe(1);
    expect(counts.last_minute).toBe(1);
    expect(counts.try ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts.kickoff ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts.play ?? 0).toBeGreaterThanOrEqual(2);
    for (const team of [0, 1] as const) {
      const tries = s.players.filter((p) => p.team === team).reduce((n, p) => n + p.stats.tries, 0);
      expect(s.score[team]).toBe(tries * TRY_POINTS);
    }
    expect(s.score[0] + s.score[1]).toBe((counts.try ?? 0) * TRY_POINTS);
    expect(ref.bad).toEqual([]);
  });

  it('même seed + mêmes entrées => JSON identique ; aller-retour JSON en cours de route => idem', () => {
    const again = simulateFullMatch(teamSize, 21);
    expect(again.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(again.s)).toBe(JSON.stringify(ref.s));
    const rt = simulateFullMatch(teamSize, 21, 41);
    expect(rt.hashes).toEqual(ref.hashes);
    expect(JSON.stringify(rt.s)).toBe(JSON.stringify(ref.s));
  });
});

// ---------------------------------------------------------------------------
// Lectures pures pour les bots
// ---------------------------------------------------------------------------

describe('lectures pures (bots, HUD)', () => {
  it('sens d’attaque, lignes d’essai, distance au but, en-buts', () => {
    const s = createMatch(config(5));
    const L = s.field.tryLineZ;
    expect([attackDir(0), attackDir(1)]).toEqual([1, -1]);
    expect([attackYaw(0), attackYaw(1)]).toEqual([0, Math.PI]);
    expect([opponentTeam(0), opponentTeam(1)]).toEqual([1, 0]);
    expect([ownTryLineZ(s, 0), opponentTryLineZ(s, 0), ownTryLineZ(s, 1), opponentTryLineZ(s, 1)]).toEqual([-L, L, L, -L]);
    for (const team of [0, 1] as const) {
      const d = attackDir(team);
      expect(distanceToTryLine(s, team, 0)).toBe(L);
      expect(distanceToTryLine(s, team, d * (L - 3))).toBeCloseTo(3, 12);
      expect(distanceToTryLine(s, team, ownTryLineZ(s, team))).toBeCloseTo(2 * L, 12);
      expect(isInOpponentInGoal(s, team, d * L)).toBe(true); // ligne comprise
      expect(isInOpponentInGoal(s, team, d * (L - 0.01))).toBe(false);
      expect(isInOwnInGoal(s, team, -d * L)).toBe(true);
      expect(isInOwnInGoal(s, team, -d * (L - 0.01))).toBe(false);
    }
  });

  it('joueurs actifs, porteur, possession, point de chute du ballon', () => {
    const s = liveMatch(5);
    s.players[1].status = 'down';
    expect(isPlayerActive(s.players[1])).toBe(false);
    expect(activePlayers(s, 0).map((p) => p.id)).toEqual([0, 2, 3, 4]);
    expect(activePlayers(s, 1).map((p) => p.id)).toEqual([5, 6, 7, 8, 9]);
    expect(ballCarrier(s)).toBeNull();
    expect(possessionTeam(s)).toBe(-1);
    // Ballon au sol : sa position.
    expect(ballLandingPoint(s)).toEqual({ x: s.ball.pos.x, y: 0, z: s.ball.pos.z });
    place(s, 7, 0, 10);
    debugGiveBall(s, 7);
    expect(ballCarrier(s)?.id).toBe(7);
    expect(possessionTeam(s)).toBe(1 as TeamId);
    step(s, { 7: makeInput({ yaw: Math.PI, buttons: Buttons.KICK }) });
    expect(s.ball.mode).toBe('kick');
    const landing = ballLandingPoint(s);
    expect(landing).toEqual(predictBallLanding(s.field, s.ball.pos, s.ball.vel));
    expect(landing.z).toBeLessThan(0); // vers l'en-but de l'équipe 0
  });

  it('setupKickoff (API publique) place la remise en jeu demandée', () => {
    const s = liveMatch(3);
    s.events = [];
    setupKickoff(s, 1);
    expect(s.phase).toBe('kickoff');
    expect(s.kickoffTeam).toBe(1);
    expect(ballCarrier(s)?.id).toBe(4);
    expect(s.events).toEqual([{ type: 'kickoff', team: 1 }]);
  });
});
