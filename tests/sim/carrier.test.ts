/**
 * Porteur (étape 4) : ramassage du ballon libre, réception / interception balayées, visée assistée de la
 * passe, trajectoire en cloche, coup de pied, plongeon, dernière minute, outils de test.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_CATCH_RADIUS,
  BALL_CARRY_SIDE,
  BALL_CATCH_REACH_ABOVE,
  BALL_GRAVITY,
  BALL_PICKUP_RADIUS,
  BALL_REACH_BELOW,
  Buttons,
  AIR_OVERSPEED_DECEL,
  CARRIER_SPEED_MULT,
  DIVE_COOLDOWN_SEC,
  DIVE_DURATION_SEC,
  DIVE_IN_AIR,
  DIVE_INVULN_SEC,
  DIVE_RECOVER_DECEL,
  DIVE_RECOVER_SEC,
  DIVE_SPEED,
  FIELD_SCALE_3V3,
  KICK_CHARGE_DOWN_RADIUS,
  KICK_ELEVATION_DEG,
  KICK_ELEVATION_MAX_DEG,
  KICK_PICKUP_BLOCK_SEC,
  KICK_SPEED,
  LAST_MINUTE_BALL_SPEED_MULT,
  LAST_MINUTE_COOLDOWN_MULT,
  PASS_IDEAL_RANGE,
  PASS_INTERCEPT_RADIUS,
  PASS_LEAD_MAX_SPEED,
  PASS_MAX_FLIGHT_SEC,
  PASS_MAX_RANGE,
  PASS_MIN_FLIGHT_SEC,
  PASS_PICKUP_BLOCK_SEC,
  PASS_TARGET_CATCH_RADIUS,
  PASS_TARGET_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_LOW_HEIGHT,
  PLAYER_RADIUS,
  ROLES,
  SPRINT_SPEED_MULT,
  TICK_DT,
  canCarrierAct,
  canShoot,
  debugGiveBall,
  debugResetBall,
  kickLaunch,
  makeInput,
  passAimDirection,
  planPass,
  predictPassCatch,
  predictBallLanding,
  secToTicks,
  selectPassTarget,
  step,
  type BallMode,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
  type TeamSize,
  type Vec3,
} from '../../src/sim';
import { hSpeed, newMatch } from './helpers';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Terrain plat, tous les joueurs rangés le long du mur du fond (+Z, loin de tout), ballon « mort » dans un
 * coin (immobile, ni ramassable ni attrapable) : chaque test place ensuite les joueurs dont il a besoin.
 */
function arena(teamSize: TeamSize = 5, seed = 3): MatchState {
  const s = newMatch(teamSize, seed);
  s.field.features = [];
  const back = s.field.length / 2 - 1;
  for (const p of s.players) {
    p.pos = { x: -s.field.width / 2 + 2 + p.id * 2, y: 0, z: back };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  s.ball.mode = 'dead';
  s.ball.pos = { x: s.field.width / 2 - 1, y: 0.12, z: -s.field.length / 2 + 1 };
  s.ball.vel = { x: 0, y: 0, z: 0 };
  return s;
}

function place(s: MatchState, id: number, x: number, z: number, yaw?: number): void {
  const p = s.players[id];
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  p.move = 'run';
  p.moveTicks = 0;
  p.onGround = true;
  if (yaw !== undefined) p.yaw = yaw;
}

/** Ballon libre posé (immobile) en (x, y, z). */
function looseBall(s: MatchState, x: number, y: number, z: number): void {
  s.ball.mode = 'loose';
  s.ball.carrierId = -1;
  s.ball.pos = { x, y, z };
  s.ball.vel = { x: 0, y: 0, z: 0 };
}

/** Entrée qui garde l'orientation courante du joueur (et applique `extra`). */
const keep = (s: MatchState, id: number, extra: Partial<PlayerInput> = {}): PlayerInput =>
  makeInput({ yaw: s.players[id].yaw, pitch: s.players[id].pitch, ...extra });

/** Simule jusqu'à `max` ticks ; renvoie tous les événements (avec le tick relatif). */
function simulate(
  s: MatchState,
  max: number,
  inputs: (t: number) => InputFrame,
  until?: (e: MatchEvent) => boolean,
): Array<{ t: number; e: MatchEvent }> {
  const log: Array<{ t: number; e: MatchEvent }> = [];
  for (let t = 0; t < max; t++) {
    step(s, inputs(t));
    let stop = false;
    for (const e of s.events) {
      log.push({ t, e });
      if (until?.(e)) stop = true;
    }
    if (stop) break;
  }
  return log;
}

const firstOf = <T extends MatchEvent['type']>(log: Array<{ t: number; e: MatchEvent }>, type: T) =>
  log.find((x) => x.e.type === type) as { t: number; e: Extract<MatchEvent, { type: T }> } | undefined;

/** Mode du ballon (lecture hors du rétrécissement de type de TypeScript après une affectation). */
const modeOf = (s: MatchState): BallMode => s.ball.mode;

const distV = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---------------------------------------------------------------------------
// Ramassage du ballon libre
// ---------------------------------------------------------------------------

describe('ramassage du ballon libre (cercle au sol)', () => {
  it('le joueur qui entre dans le cercle prend le ballon (mode, porteur, équipe, événement)', () => {
    const s = arena();
    looseBall(s, 0, 0.12, 0);
    place(s, 6, 0, -BALL_PICKUP_RADIUS - 2, 0); // équipe 1, approche par -Z en avançant vers +Z
    s.ball.looseTicks = 40;
    const log = simulate(s, 40, () => ({ 6: keep(s, 6, { moveY: 1 }) }), (e) => e.type === 'pickup');
    const ev = firstOf(log, 'pickup');
    expect(ev?.e.playerId).toBe(6);
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(6);
    expect(s.ball.lastTeam).toBe(1);
    expect(s.ball.looseTicks).toBe(0);
    // Pris au moment où il entre dans le cercle (pas avant).
    const p = s.players[6];
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeLessThanOrEqual(BALL_PICKUP_RADIUS);
    expect(Math.hypot(p.pos.x - p.vel.x * TICK_DT, p.pos.z - p.vel.z * TICK_DT)).toBeGreaterThan(BALL_PICKUP_RADIUS - 1e-6);
  });

  it('le premier entrant l’emporte, même si un autre arrive juste après', () => {
    const s = arena();
    looseBall(s, 0, 0.12, 0);
    place(s, 1, 0, -3, 0); // ailier, plus rapide
    place(s, 7, 0, 3.5, Math.PI); // plus loin
    const log = simulate(s, 60, () => ({ 1: keep(s, 1, { moveY: 1 }), 7: keep(s, 7, { moveY: 1 }) }), (e) => e.type === 'pickup');
    expect(firstOf(log, 'pickup')?.e.playerId).toBe(1);
  });

  it('plusieurs candidats au même tick : le plus proche, puis le plus petit id', () => {
    const s = arena();
    looseBall(s, 0, 0.12, 0);
    place(s, 2, 1.0, 0);
    place(s, 7, -0.8, 0);
    step(s, {});
    expect(s.ball.carrierId).toBe(7);

    const t = arena();
    looseBall(t, 0, 0.12, 0);
    place(t, 8, 0.9, 0);
    place(t, 3, -0.9, 0);
    step(t, {});
    expect(t.ball.carrierId).toBe(3);
  });

  it('un joueur bloqué (pickupBlockTicks), au sol ou en train de se relever ne ramasse pas', () => {
    const s = arena();
    looseBall(s, 0, 0.12, 0);
    place(s, 2, 0.5, 0);
    place(s, 6, -1.1, 0);
    s.players[2].pickupBlockTicks = 5;
    step(s, {});
    expect(s.ball.carrierId).toBe(6);

    for (const status of ['down', 'getting_up'] as const) {
      const t = arena();
      looseBall(t, 0, 0.12, 0);
      place(t, 2, 0.5, 0);
      t.players[2].status = status;
      t.players[2].statusTicks = 100;
      for (let i = 0; i < 5; i++) step(t, {});
      expect(t.ball.mode, status).toBe('loose');
    }
  });

  it('hauteur : un ballon trop haut ne se ramasse pas ; à portée de bras levés, si', () => {
    const top = PLAYER_HEIGHT + BALL_CATCH_REACH_ABOVE;
    const s = arena();
    looseBall(s, 0, top + 0.3, 0);
    s.ball.vel = { x: 0, y: 8, z: 0 }; // monte : reste hors de portée ce tick
    place(s, 2, 0.5, 0);
    step(s, {});
    expect(s.ball.mode).toBe('loose');

    const t = arena();
    looseBall(t, 0, top - 0.1, 0);
    t.ball.vel = { x: 0, y: 1.5, z: 0 };
    place(t, 2, 0.5, 0);
    step(t, {});
    expect(t.ball.carrierId).toBe(2);
  });

  it('un ballon sous les pieds (contrebas) est ramassé jusqu’à BALL_REACH_BELOW', () => {
    const s = arena();
    s.field.features = [{ kind: 'wall', x: 0, z: 0, length: 6, thickness: 6, height: 0.6, rotation: 0 }];
    looseBall(s, 3.6, 0.12, 0); // au pied de la plateforme
    place(s, 2, 2.6, 0);
    s.players[2].pos.y = 0.6; // debout sur la plateforme : ballon 0,48 m sous les pieds
    expect(0.6 - 0.12).toBeLessThanOrEqual(BALL_REACH_BELOW);
    step(s, {});
    expect(s.ball.carrierId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Réception / interception en vol (test balayé)
// ---------------------------------------------------------------------------

describe('réception en vol (test balayé)', () => {
  it('pas de « tunnel » à vitesse max : la trajectoire frôle le joueur entre deux ticks', () => {
    const speed = KICK_SPEED * LAST_MINUTE_BALL_SPEED_MULT * 1.05; // au-delà du ballon le plus rapide du jeu
    const launch = (s: MatchState): void => {
      s.ball.mode = 'kick';
      s.ball.throwerId = 5;
      s.ball.flightTicks = 100; // en vol depuis longtemps : hors de la fenêtre de contre
      s.ball.pos = { x: -12, y: 1.6, z: 0 };
      s.ball.vel = { x: speed, y: 3, z: 0 };
    };
    // Tir à vide pour connaître les positions du ballon à chaque tick.
    const dry = arena();
    launch(dry);
    const xs: Vec3[] = [];
    for (let i = 0; i < 20; i++) {
      step(dry, {});
      xs.push({ ...dry.ball.pos });
    }
    // Joueur placé au milieu de deux positions successives, latéralement juste sous le rayon de réception.
    const i = xs.findIndex((p) => p.x > 0);
    const mid = { x: (xs[i - 1].x + xs[i].x) / 2, z: 0 };
    const lateral = BALL_CATCH_RADIUS - 0.05;
    expect(Math.hypot(xs[i].x - mid.x, lateral)).toBeGreaterThan(BALL_CATCH_RADIUS); // un test ponctuel raterait
    expect(Math.hypot(xs[i - 1].x - mid.x, lateral)).toBeGreaterThan(BALL_CATCH_RADIUS);

    const s = arena();
    launch(s);
    place(s, 2, mid.x, lateral);
    const log = simulate(s, 20, () => ({}), (e) => e.type === 'catch');
    const c = firstOf(log, 'catch');
    expect(c?.e.playerId).toBe(2);
    expect(c?.e.intercepted).toBe(false); // coup de pied réceptionné par l'adversaire : jeu normal, pas une interception
    expect(s.ball.carrierId).toBe(2);
    expect(s.players[2].stats.interceptions).toBe(0);
  });

  it('le premier sur la trajectoire l’emporte (avant un joueur plus proche de la ligne mais plus loin)', () => {
    const s = arena();
    s.ball.mode = 'kick';
    s.ball.throwerId = 0;
    s.ball.flightTicks = 100;
    s.ball.pos = { x: -3, y: 1.2, z: 0 };
    s.ball.vel = { x: 24, y: 2, z: 0 }; // ~0,8 m par tick
    place(s, 6, -2.4, 1.0); // au bord du rayon (entrée en t ≈ 0,18), mais premier
    place(s, 7, -1.4, 0.0); // pile sur la ligne (entrée en t ≈ 0,63), un peu plus loin
    step(s, {});
    expect(s.ball.carrierId).toBe(6);
  });

  it('hors de portée en hauteur : le ballon passe au-dessus', () => {
    const s = arena();
    s.ball.mode = 'kick';
    s.ball.throwerId = 0;
    s.ball.pos = { x: -6, y: PLAYER_HEIGHT + BALL_CATCH_REACH_ABOVE + 1.5, z: 0 };
    s.ball.vel = { x: 20, y: 1, z: 0 };
    place(s, 6, 0, 0);
    for (let i = 0; i < 12; i++) step(s, {});
    expect(s.ball.mode).toBe('kick');
  });

  it('après le premier rebond, le ballon est libre et la règle du cercle s’applique', () => {
    const s = arena();
    s.ball.mode = 'kick';
    s.ball.throwerId = 0;
    s.ball.pos = { x: 0, y: 3, z: -10 };
    s.ball.vel = { x: 0, y: -2, z: 6 };
    let loose = false;
    for (let i = 0; i < 30 && !loose; i++) {
      step(s, {});
      loose = modeOf(s) === 'loose';
    }
    expect(loose).toBe(true);
    for (let i = 0; i < 150; i++) step(s, {}); // rebonds puis roulement
    place(s, 7, s.ball.pos.x + 0.8, s.ball.pos.z);
    step(s, {});
    expect(s.ball.carrierId).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Visée assistée de la passe
// ---------------------------------------------------------------------------

describe('visée assistée (selectPassTarget)', () => {
  it('cône arrière relatif au TERRAIN pour les deux équipes ; un coéquipier devant est exclu', () => {
    // Équipe 0 : son en-but est en −Z.
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 4, 6); // devant
    expect(selectPassTarget(s, 0, 0)).toBeNull();
    place(s, 2, 4, -6); // derrière
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(2);
    // Le regard ne change pas le cône : même en se retournant, le coéquipier devant reste exclu.
    expect(selectPassTarget(s, 0, Math.PI)?.targetId).toBe(2);
    place(s, 2, 5, 0); // à plat : permis (cône de 180°)
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(2);

    // Équipe 1 : son en-but est en +Z.
    const t = arena();
    place(t, 5, 0, 0, Math.PI);
    place(t, 6, 4, -6); // devant pour l'équipe 1
    expect(selectPassTarget(t, 5, Math.PI)).toBeNull();
    place(t, 7, -4, 6); // derrière
    expect(selectPassTarget(t, 5, Math.PI)?.targetId).toBe(7);
    expect(selectPassTarget(t, 5, 0)?.targetId).toBe(7);
  });

  it('portée : au-delà de PASS_MAX_RANGE, pas de cible ; un coéquipier au sol est ignoré', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 0, -PASS_MAX_RANGE - 0.5);
    expect(selectPassTarget(s, 0, 0)).toBeNull();
    place(s, 1, 0, -PASS_MAX_RANGE + 0.5);
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(1);
    s.players[1].status = 'down';
    expect(selectPassTarget(s, 0, 0)).toBeNull();
  });

  it('regard à gauche => passe à gauche, regard à droite => à droite (équipes 0 et 1)', () => {
    // Équipe 0 regarde +Z : sa gauche est +X (right(0) = −X).
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -7, -5); // à droite
    place(s, 2, 7, -5); // à gauche
    expect(selectPassTarget(s, 0, 0.35)?.targetId).toBe(2);
    expect(selectPassTarget(s, 0, -0.35)?.targetId).toBe(1);
    // Regard droit devant : symétrique => égalité => plus petit id.
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(1);

    // Équipe 1 regarde −Z : sa gauche est −X.
    const t = arena();
    place(t, 5, 0, 0, Math.PI);
    place(t, 6, 7, 5); // à droite de l'équipe 1
    place(t, 7, -7, 5); // à gauche
    expect(selectPassTarget(t, 5, Math.PI + 0.35)?.targetId).toBe(7);
    expect(selectPassTarget(t, 5, Math.PI - 0.35)?.targetId).toBe(6);
  });

  it('projection du regard dans le demi-plan arrière : composante latérale gardée (×gain), avant repliée vers son en-but', () => {
    for (const team of [0, 1] as const) {
      const bz = team === 0 ? -1 : 1;
      const straight = passAimDirection(team, team === 0 ? 0 : Math.PI);
      expect(straight.x).toBeCloseTo(0, 9);
      expect(straight.z).toBeCloseTo(bz, 9);
      // Regarder vers son propre en-but donne la même visée que regarder devant (miroir).
      const back = passAimDirection(team, team === 0 ? Math.PI : 0);
      expect(back.z).toBeCloseTo(bz, 9);
      // Regard de côté : passe à plat de ce côté.
      const side = passAimDirection(team, Math.PI / 2);
      expect(side.x).toBeCloseTo(1, 9);
      expect(Math.abs(side.z)).toBeLessThan(1e-9);
      // Toujours dans le demi-plan arrière.
      for (let yaw = -3; yaw <= 3; yaw += 0.25) expect(passAimDirection(team, yaw).z * bz).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('distance : préfère le coéquipier proche de PASS_IDEAL_RANGE à regard égal', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 0, -2.5);
    place(s, 2, 0, -PASS_IDEAL_RANGE);
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(2);
  });

  it('un adversaire proche du receveur ou de la ligne de passe pénalise ce receveur', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -7, -5);
    place(s, 2, 7, -5);
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(1); // égalité => plus petit id
    place(s, 6, -6.2, -4.4); // marque le receveur 1
    const r = selectPassTarget(s, 0, 0);
    expect(r?.targetId).toBe(2);
    expect(r?.openness).toBeCloseTo(1, 9);
    // Adversaire sur la ligne de passe vers 2 (pas près de 2 lui-même) : 1 redevient le choix.
    place(s, 6, 3.5, -2.5);
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(1);
  });

  it('un plaqueur au contact du porteur ne masque pas le marquage : la cible reste le receveur libre (et la passe arrive)', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -7, -7);
    place(s, 6, -7, -5.5); // marque le receveur 1
    place(s, 2, 7, -7); // libre
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(2);
    place(s, 5, 0, 0.95); // plaqueur collé DEVANT le porteur (derrière lui par rapport à la passe)
    const r = selectPassTarget(s, 0, 0);
    expect(r?.targetId).toBe(2);
    expect(r?.openness).toBeCloseTo(1, 9);
    debugGiveBall(s, 0);
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
    const log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
    expect(firstOf(log, 'catch')?.e).toEqual({ type: 'catch', playerId: 2, fromId: 0, intercepted: false });
  });

  it('menaces combinées (produit) : deux adversaires près d’un receveur pénalisent plus qu’un seul', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -7, -7);
    place(s, 6, -7, -4.5);
    const one = selectPassTarget(s, 0, 0)?.openness ?? 0;
    place(s, 7, -4.5, -7);
    const two = selectPassTarget(s, 0, 0)?.openness ?? 0;
    expect(two).toBeLessThan(one);
    expect(two).toBeGreaterThan(0);
  });

  it('hystérésis : la cible retenue au tick précédent ne bascule pas au moindre pixel de souris', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -5, -5);
    place(s, 2, 5.02, -5); // soutiens presque symétriques
    debugGiveBall(s, 0);
    // Sans mémoire (ballon pas encore porté au sens de la visée) : un pas de 0,002 rad fait basculer la cible.
    s.ball.aimTargetId = -1;
    const flips = (): number => {
      let n = 0;
      let prev = selectPassTarget(s, 0, -0.02)?.targetId;
      for (let yaw = -0.02; yaw <= 0.02 + 1e-9; yaw += 0.002) {
        const id = selectPassTarget(s, 0, yaw)?.targetId;
        if (id !== prev) n++;
        prev = id;
      }
      return n;
    };
    expect(flips()).toBe(1);
    // Le porteur regarde un peu à droite : la sim retient 1 (ball.aimTargetId)…
    step(s, { 0: makeInput({ yaw: -0.05 }) });
    expect(s.ball.aimTargetId).toBe(1);
    // … et des écarts de regard d'un pixel ne la font plus changer (le rendu lit le même état).
    expect(flips()).toBe(0);
    // Un vrai coup d'œil de l'autre côté change bien la cible.
    expect(selectPassTarget(s, 0, 0.3)?.targetId).toBe(2);
    step(s, { 0: makeInput({ yaw: 0.3 }) });
    expect(s.ball.aimTargetId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Passe : exécution, trajectoire, réception, interception
// ---------------------------------------------------------------------------

describe('passe', () => {
  it('aucun receveur valide => pass_denied, le porteur garde le ballon', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 3, 5); // devant
    debugGiveBall(s, 0);
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
    expect(s.events.map((e) => e.type)).toContain('pass_denied');
    expect(s.events.map((e) => e.type)).not.toContain('pass');
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(0);
  });

  it('front montant seulement : maintenir PASS ne relance pas de passe', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    debugGiveBall(s, 0);
    let denied = 0;
    for (let i = 0; i < 10; i++) {
      step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
      denied += s.events.filter((e) => e.type === 'pass_denied').length;
    }
    expect(denied).toBe(1);
  });

  it('la passe part : mode pass, lanceur et cible, passeur bloqué, événement ; le passeur ne rattrape pas sa passe', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 2, -8);
    debugGiveBall(s, 0);
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
    expect(s.events).toContainEqual({ type: 'pass', fromId: 0, toId: 1 });
    expect(s.ball.mode).toBe('pass');
    expect(s.ball.throwerId).toBe(0);
    expect(s.ball.passTargetId).toBe(1);
    expect(s.ball.carrierId).toBe(-1);
    expect(s.players[0].pickupBlockTicks).toBe(secToTicks(PASS_PICKUP_BLOCK_SEC));
    // Au départ, le ballon est dans le rayon de réception du passeur : seul le blocage l'empêche de le reprendre.
    const log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
    const c = firstOf(log, 'catch');
    expect(c?.e).toEqual({ type: 'catch', playerId: 1, fromId: 0, intercepted: false });
    expect(s.ball.carrierId).toBe(1);
    expect(s.players[0].stats.passes).toBe(1);
  });

  /**
   * Passe vers un receveur qui court en ligne droite : le ballon doit arriver dans ses mains.
   * `block` : le receveur ne peut pas attraper (on mesure l'écart entre le ballon et ses mains).
   */
  function runningPass(teamSize: TeamSize, dist: number, angleDeg: number, runYaw: number, runSpeedInput: number, block: boolean) {
    const s = arena(teamSize);
    const a = (angleDeg * Math.PI) / 180;
    place(s, 0, 0, -4, 0);
    place(s, 1, Math.sin(a) * dist, -4 - Math.cos(a) * dist, runYaw);
    debugGiveBall(s, 0);
    const recv = (): PlayerInput => keep(s, 1, { moveY: runSpeedInput });
    const carrier = (buttons = 0): PlayerInput => keep(s, 0, { moveY: 1, buttons });
    for (let i = 0; i < 10; i++) step(s, { 0: carrier(), 1: recv() });
    const r = s.players[1];
    const v0 = { ...r.vel };
    const plan = planPass(s, 0, 1);
    expect(selectPassTarget(s, 0, s.players[0].yaw)?.targetId).toBe(1);
    step(s, { 0: carrier(Buttons.PASS), 1: recv() });
    expect(s.ball.mode).toBe('pass');
    if (block) r.pickupBlockTicks = 1000;
    let minGap = Infinity;
    let caught: MatchEvent | null = null;
    let prevBall = { ...s.ball.pos };
    let prevHands = { x: r.pos.x, y: r.pos.y + PASS_TARGET_HEIGHT, z: r.pos.z };
    for (let i = 0; i < 60 && caught === null && s.ball.mode === 'pass'; i++) {
      step(s, { 0: carrier(), 1: recv() });
      const hands = { x: r.pos.x, y: r.pos.y + PASS_TARGET_HEIGHT, z: r.pos.z };
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const bp = { x: prevBall.x + (s.ball.pos.x - prevBall.x) * u, y: prevBall.y + (s.ball.pos.y - prevBall.y) * u, z: prevBall.z + (s.ball.pos.z - prevBall.z) * u };
        const hp = { x: prevHands.x + (hands.x - prevHands.x) * u, y: prevHands.y + (hands.y - prevHands.y) * u, z: prevHands.z + (hands.z - prevHands.z) * u };
        minGap = Math.min(minGap, distV(bp, hp));
      }
      prevBall = { ...s.ball.pos };
      prevHands = hands;
      caught = s.events.find((e) => e.type === 'catch') ?? null;
    }
    return { caught, minGap, plan, v0 };
  }

  const CASES: Array<{ size: TeamSize; dist: number; angle: number; runYaw: number; input: number; desc: string }> = [
    // distance (m), angle depuis « droit derrière » (°, > 0 = à gauche du passeur), cap de course, inclinaison du stick
    { size: 3, dist: 6, angle: 40, runYaw: 0, input: 0, desc: 'immobile, courte' },
    { size: 3, dist: 10, angle: 70, runYaw: 0, input: 1, desc: 'court vers l’avant, moyenne' },
    { size: 3, dist: 16, angle: -55, runYaw: Math.PI / 2, input: 1, desc: 'court vers sa gauche (vers l’axe), longue' },
    { size: 5, dist: 8, angle: -60, runYaw: 0, input: 1, desc: 'court vers l’avant, à droite' },
    { size: 5, dist: 14, angle: 30, runYaw: -Math.PI / 2, input: 1, desc: 'court vers sa droite (vers le passeur)' },
    { size: 5, dist: 21, angle: -80, runYaw: Math.PI * 0.75, input: 1, desc: 'court en arrière en biais, très longue' },
    { size: 5, dist: 4, angle: 85, runYaw: 0, input: 0.5, desc: 'trottine, très courte, presque à plat' },
  ];

  it.each(CASES)('$size contre $size : passe de $dist m à $angle° ($desc) — arrive dans les mains du receveur', ({ size, dist, angle, runYaw, input }) => {
    const measured = runningPass(size, dist, angle, runYaw, input, true);
    expect(measured.minGap).toBeLessThan(0.06);
    const real = runningPass(size, dist, angle, runYaw, input, false);
    expect(real.caught).toEqual({ type: 'catch', playerId: 1, fromId: 0, intercepted: false });
  });

  it('durée de vol bornée, vitesse horizontale PASS_SPEED entre les bornes', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    for (const d of [2, 9, 14, 23]) {
      place(s, 1, 0, -d);
      const plan = planPass(s, 0, 1);
      expect(plan).not.toBeNull();
      if (plan === null) continue;
      expect(plan.flightSec).toBeGreaterThanOrEqual(PASS_MIN_FLIGHT_SEC);
      expect(plan.flightSec).toBeLessThanOrEqual(PASS_MAX_FLIGHT_SEC);
      expect(plan.to.y).toBeCloseTo(PASS_TARGET_HEIGHT, 9);
    }
    place(s, 1, 0, -9);
    const plan = planPass(s, 0, 1);
    if (plan === null) throw new Error('plan');
    const h = Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z);
    expect(h / plan.flightSec).toBeCloseTo(17, 6); // PASS_SPEED : vitesse horizontale moyenne
  });

  it('predictPassCatch : point où la passe redescend à hauteur des mains = point visé, au bout de la durée de vol', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    for (const [x, z] of [[0, -2], [5, -9], [-8, -14], [3, -23]]) {
      place(s, 1, x, z);
      s.players[1].vel = { x: 4, y: 0, z: -2 }; // receveur qui court : point visé anticipé
      const plan = planPass(s, 0, 1);
      if (plan === null) throw new Error('plan');
      const c = predictPassCatch(s.field, plan.from, plan.vel);
      expect(Math.abs(c.t - plan.flightSec)).toBeLessThanOrEqual(1 / 60);
      expect(Math.hypot(c.x - plan.to.x, c.z - plan.to.z)).toBeLessThan(0.15);
      expect(c.y).toBeLessThanOrEqual(plan.to.y + 1e-9);
    }
  });

  it('interception : un adversaire placé sur la trajectoire attrape la passe', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 0, -12);
    place(s, 7, 0.3, -6); // au milieu de la trajectoire, mais pas trop près du receveur… ni du passeur
    debugGiveBall(s, 0);
    // L'adversaire est près de la ligne : la visée le voit, mais il n'y a qu'un receveur possible.
    expect(selectPassTarget(s, 0, 0)?.targetId).toBe(1);
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
    const log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
    expect(firstOf(log, 'catch')?.e).toEqual({ type: 'catch', playerId: 7, fromId: 0, intercepted: true });
    expect(s.ball.carrierId).toBe(7);
    expect(s.ball.lastTeam).toBe(1);
    expect(s.players[7].stats.interceptions).toBe(1);
    expect(s.players[0].stats.passes).toBe(0);
  });

  it('un défenseur qui fait face au porteur (devant lui) n’intercepte pas une passe qui part dans son dos', () => {
    for (const yaw of [0, 0.6, -0.6]) {
      const s = arena();
      place(s, 0, 0, 0, yaw);
      place(s, 1, 9, -6);
      place(s, 7, 0, 1.6, Math.PI); // collé devant le porteur, à portée du ballon porté
      debugGiveBall(s, 0);
      step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
      const log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
      expect(firstOf(log, 'catch')?.e.playerId, `yaw ${yaw}`).toBe(1);
    }
  });

  it('jamais en avant : un receveur derrière qui sprinte vers l’avant ne reçoit pas une passe qui avance (équipes 0 et 1)', () => {
    for (const team of [0, 1] as const) {
      const fz = team === 0 ? 1 : -1; // sens « vers l'en-but adverse »
      const s = arena();
      const c = team === 0 ? 0 : 5;
      const r = team === 0 ? 1 : 6; // ailiers (rapides)
      place(s, c, 0, -20 * fz, team === 0 ? 0 : Math.PI);
      place(s, r, 10, -24 * fz, team === 0 ? 0 : Math.PI);
      debugGiveBall(s, c);
      let passed = false;
      let caughtZ: number | null = null;
      for (let i = 0; i < 60 && caughtZ === null; i++) {
        const press = !passed && (s.players[r].pos.z - s.players[c].pos.z) * fz > -2.2; // ~2 m derrière, lancé
        step(s, { [c]: keep(s, c, { buttons: press ? Buttons.PASS : 0 }), [r]: keep(s, r, { moveY: 1, buttons: Buttons.SPRINT }) });
        if (press) {
          passed = true;
          expect(s.ball.mode).toBe('pass');
          expect(s.ball.vel.z * fz, `équipe ${team}`).toBeLessThanOrEqual(1e-9); // porteur arrêté : jamais vers l'avant
        }
        if (s.events.some((e) => e.type === 'catch')) caughtZ = s.ball.pos.z;
      }
      expect(passed).toBe(true);
      // S'il est attrapé, c'est à plat ou derrière le passeur (pas 4 m devant comme avant).
      if (caughtZ !== null) expect((caughtZ - s.players[c].pos.z) * fz).toBeLessThan(BALL_CARRY_SIDE + 0.5);
    }
  });

  it('passe à plat en course : le ballon n’avance pas plus vite que le porteur', () => {
    const s = arena();
    place(s, 0, 0, -20, 0);
    place(s, 1, 8, -21, 0); // soutien à peine derrière, lancé à la même allure
    debugGiveBall(s, 0);
    for (let i = 0; i < 20; i++) step(s, { 0: keep(s, 0, { moveY: 1, buttons: Buttons.SPRINT }), 1: keep(s, 1, { moveY: 1, buttons: Buttons.SPRINT }) });
    const carrierVz = s.players[0].vel.z;
    expect(carrierVz).toBeGreaterThan(5);
    step(s, { 0: keep(s, 0, { moveY: 1, buttons: Buttons.SPRINT | Buttons.PASS }), 1: keep(s, 1, { moveY: 1, buttons: Buttons.SPRINT }) });
    expect(s.ball.mode).toBe('pass');
    // Vitesse moyenne vers l'avant sur le vol (la traînée ralentit le ballon : on compare au départ, borne haute).
    expect(s.ball.vel.z).toBeLessThanOrEqual(carrierVz + 1e-6);
  });

  it('un coéquipier collé au porteur ne vole pas la passe destinée à un autre', () => {
    for (const [x, z] of [[1, -0.5], [1.2, 0], [-0.9, -0.6]]) {
      const s = arena();
      place(s, 0, 0, 0, 0.6);
      place(s, 1, x, z);
      place(s, 2, 8, -9);
      debugGiveBall(s, 0);
      expect(selectPassTarget(s, 0, 0.6)?.targetId).toBe(2);
      step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }) });
      const atRelease = [...s.events];
      const log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
      expect([...atRelease, ...log.map((l) => l.e)].filter((e) => e.type === 'catch')).toEqual([
        { type: 'catch', playerId: 2, fromId: 0, intercepted: false },
      ]);
    }
  });

  it('un adversaire sur le flanc du passeur (hors trajectoire) n’intercepte pas au lâcher ; sur la trajectoire, si', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -7, -7);
    place(s, 6, 1.1, -0.2); // à droite du porteur, côté opposé à la passe
    debugGiveBall(s, 0);
    expect(selectPassTarget(s, 0, -0.4)?.targetId).toBe(1);
    step(s, { 0: makeInput({ yaw: -0.4, buttons: Buttons.PASS }) });
    let log = simulate(s, 60, () => ({}), (e) => e.type === 'catch');
    expect(firstOf(log, 'catch')?.e.playerId).toBe(1);
    // Même passe avec l'adversaire à 0,5 m de la ligne de passe, à mi-chemin : interception.
    const t = arena();
    place(t, 0, 0, 0, 0);
    place(t, 1, -7, -7);
    place(t, 6, -3.5 + 0.35, -3.5 - 0.35);
    debugGiveBall(t, 0);
    step(t, { 0: makeInput({ yaw: -0.4, buttons: Buttons.PASS }) });
    log = simulate(t, 60, () => ({}), (e) => e.type === 'catch');
    expect(firstOf(log, 'catch')?.e).toEqual({ type: 'catch', playerId: 6, fromId: 0, intercepted: true });
  });

  it('receveur qui esquive juste avant la passe : l’anticipation est plafonnée (PASS_LEAD_MAX_SPEED), la passe arrive', () => {
    // Esquives latérales (vers le passeur, puis à l'opposé). Une esquive vers l'AVANT reste ratée : la passe ne
    // peut pas avancer (porteur arrêté) et le receveur dépasse la ligne du passeur.
    for (const dodgeYaw of [Math.PI / 2, -Math.PI / 2]) {
      const s = arena();
      place(s, 0, 0, 0, 0);
      place(s, 1, -6, -6, dodgeYaw);
      debugGiveBall(s, 0);
      for (let i = 0; i < 8; i++) step(s, { 0: keep(s, 0), 1: keep(s, 1, { moveY: 1 }) });
      step(s, { 0: keep(s, 0), 1: keep(s, 1, { moveY: 1, buttons: Buttons.DODGE }) });
      expect(s.players[1].move).toBe('dodge');
      expect(hSpeed(s.players[1].vel)).toBeGreaterThan(PASS_LEAD_MAX_SPEED);
      const plan = planPass(s, 0, 1);
      if (plan === null) throw new Error('plan');
      // Avant : vitesse d'esquive (21 m/s) > PASS_SPEED => vol maximal et point visé ~20 m plus loin.
      const r = s.players[1].pos;
      expect(Math.hypot(plan.to.x - r.x, plan.to.z - r.z)).toBeLessThanOrEqual(PASS_LEAD_MAX_SPEED * plan.flightSec + 1e-9);
      step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }), 1: keep(s, 1, { moveY: 1 }) });
      const log = simulate(s, 60, () => ({ 1: keep(s, 1, { moveY: 1 }) }), (e) => e.type === 'catch');
      expect(firstOf(log, 'catch')?.e.playerId, `esquive ${dodgeYaw}`).toBe(1);
    }
  });

  it('le receveur visé a un rayon de réception plus large (PASS_TARGET_CATCH_RADIUS) que les intercepteurs', () => {
    expect(PASS_TARGET_CATCH_RADIUS).toBeGreaterThan(BALL_CATCH_RADIUS);
    expect(PASS_INTERCEPT_RADIUS).toBeLessThan(BALL_CATCH_RADIUS);
    expect(PASS_INTERCEPT_RADIUS).toBeGreaterThan(PLAYER_RADIUS);
    // Receveur qui ralentit un peu (stick à moitié) au départ de la passe : il la reçoit quand même.
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, -6, -9, 0);
    debugGiveBall(s, 0);
    for (let i = 0; i < 10; i++) step(s, { 0: keep(s, 0), 1: keep(s, 1, { moveY: 1 }) });
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS }), 1: keep(s, 1, { moveY: 0.5 }) });
    const log = simulate(s, 60, () => ({ 1: keep(s, 1, { moveY: 0.5 }) }), (e) => e.type === 'catch');
    expect(firstOf(log, 'catch')?.e.playerId).toBe(1);
  });

  it('pas de passe ni de coup de pied pendant un plongeon', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 2, -8);
    debugGiveBall(s, 0);
    step(s, { 0: keep(s, 0, { moveY: 1 }) });
    step(s, { 0: keep(s, 0, { moveY: 1, buttons: Buttons.SLIDE }) });
    expect(s.players[0].move).toBe('dive');
    expect(canCarrierAct(s.players[0])).toBe(false); // le rendu masque alors l'indicateur de passe
    step(s, { 0: keep(s, 0, { moveY: 1, buttons: Buttons.PASS | Buttons.KICK }) });
    expect(s.ball.mode).toBe('carried');
    expect(s.events.filter((e) => e.type === 'pass' || e.type === 'kick' || e.type === 'pass_denied')).toEqual([]);
    expect(canCarrierAct(s.players[1])).toBe(true);
  });

  it('PASS prioritaire sur KICK au même tick ; passe refusée => le coup de pied part', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 2, -8);
    debugGiveBall(s, 0);
    step(s, { 0: keep(s, 0, { buttons: Buttons.PASS | Buttons.KICK }) });
    expect(s.ball.mode).toBe('pass');
    const t = arena();
    place(t, 0, 0, 0, 0);
    debugGiveBall(t, 0);
    step(t, { 0: keep(t, 0, { buttons: Buttons.PASS | Buttons.KICK }) });
    expect(t.events.map((e) => e.type)).toEqual(expect.arrayContaining(['pass_denied', 'kick']));
    expect(t.ball.mode).toBe('kick');
  });
});

// ---------------------------------------------------------------------------
// Coup de pied
// ---------------------------------------------------------------------------

describe('coup de pied', () => {
  /** Distance horizontale parcourue jusqu'au premier contact avec le sol, pour un tireur immobile. */
  function kickRange(pitch: number, lastMinute = false): { range: number; launchSpeed: number } {
    const s = arena();
    s.lastMinute = lastMinute;
    place(s, 0, 0, -30, 0);
    s.players[0].pitch = pitch;
    debugGiveBall(s, 0);
    step(s, { 0: makeInput({ yaw: 0, pitch, buttons: Buttons.KICK }) });
    expect(s.ball.mode).toBe('kick');
    const start = kickLaunch(s, 0, 0, pitch);
    // Vitesse du ballon juste après le lancement (un tick de vol : on remonte à la vitesse initiale par la norme).
    const launchSpeed = start === null ? 0 : Math.hypot(start.vel.x, start.vel.y, start.vel.z);
    const from = { x: 0, z: -30 };
    for (let i = 0; i < 200 && s.ball.mode === 'kick'; i++) step(s, {});
    return { range: Math.hypot(s.ball.pos.x - from.x, s.ball.pos.z - from.z), launchSpeed };
  }

  it('portée ≈ v²·sin(2θ)/g (traînée légère comprise), devant le tireur', () => {
    const { range } = kickRange(0);
    const th = (KICK_ELEVATION_DEG * Math.PI) / 180;
    const ideal = (KICK_SPEED * KICK_SPEED * Math.sin(2 * th)) / BALL_GRAVITY;
    expect(range).toBeGreaterThan(ideal * 0.9);
    expect(range).toBeLessThan(ideal * 1.05);
  });

  it('le pitch relève la cloche (élévation bornée) ; la prédiction du point de chute colle à la sim', () => {
    const s = arena();
    place(s, 0, 0, -30, 0);
    const flat = kickLaunch(s, 0, 0, 0);
    const up = kickLaunch(s, 0, 0, 0.6);
    const max = kickLaunch(s, 0, 0, 1.4);
    if (flat === null || up === null || max === null) throw new Error('kickLaunch');
    expect(up.vel.y).toBeGreaterThan(flat.vel.y);
    const elevMax = Math.atan2(max.vel.y, Math.hypot(max.vel.x, max.vel.z));
    expect(elevMax).toBeCloseTo((KICK_ELEVATION_MAX_DEG * Math.PI) / 180, 9);
    // Prédiction (rendu) vs simulation.
    const predicted = predictBallLanding(s.field, flat.pos, flat.vel);
    debugGiveBall(s, 0);
    step(s, { 0: makeInput({ yaw: 0, pitch: 0, buttons: Buttons.KICK }) });
    for (let i = 0; i < 200 && s.ball.mode === 'kick'; i++) step(s, {});
    expect(Math.hypot(s.ball.pos.x - predicted.x, s.ball.pos.z - predicted.z)).toBeLessThan(0.6);
  });

  it('tireur bloqué KICK_PICKUP_BLOCK_SEC : il ne rattrape pas son coup de pied au départ', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    debugGiveBall(s, 0);
    step(s, { 0: makeInput({ yaw: 0, pitch: 0, buttons: Buttons.KICK }) });
    expect(s.events).toContainEqual({ type: 'kick', playerId: 0 });
    expect(s.players[0].pickupBlockTicks).toBe(secToTicks(KICK_PICKUP_BLOCK_SEC));
    expect(s.ball.throwerId).toBe(0);
    const log = simulate(s, 10, () => ({}));
    expect(log.filter((x) => x.e.type === 'catch' || x.e.type === 'pickup')).toEqual([]);
  });

  it('personne ne le porte : un coéquipier ou un adversaire peut l’attraper en vol', () => {
    const s = arena();
    place(s, 0, 0, -20, 0);
    debugGiveBall(s, 0);
    const launch = kickLaunch(s, 0, 0, 0);
    if (launch === null) throw new Error('kickLaunch');
    const land = predictBallLanding(s.field, launch.pos, launch.vel);
    place(s, 1, land.x, land.z - 1.5); // coéquipier sous la chute
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.KICK }) });
    const log = simulate(s, 120, () => ({}), (e) => e.type === 'catch' || e.type === 'pickup');
    const c = firstOf(log, 'catch');
    expect(c?.e).toEqual({ type: 'catch', playerId: 1, fromId: 0, intercepted: false });
  });

  it('réceptionné par un adversaire : jeu normal, pas une interception (ni stat, ni vibration « interception »)', () => {
    const s = arena();
    place(s, 0, 0, -20, 0);
    debugGiveBall(s, 0);
    const launch = kickLaunch(s, 0, 0, 0);
    if (launch === null) throw new Error('kickLaunch');
    const land = predictBallLanding(s.field, launch.pos, launch.vel);
    place(s, 6, land.x, land.z - 1.5); // arrière adverse sous la chute
    step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.KICK }) });
    const log = simulate(s, 120, () => ({}), (e) => e.type === 'catch' || e.type === 'pickup');
    expect(firstOf(log, 'catch')?.e).toEqual({ type: 'catch', playerId: 6, fromId: 0, intercepted: false });
    expect(s.players[6].stats.interceptions).toBe(0);
  });

  it('contre : seul un adversaire au contact du tireur (KICK_CHARGE_DOWN_RADIUS) attrape le ballon au départ', () => {
    const caughtBy = (id: number, d: number, side = 0): number => {
      const s = arena();
      place(s, 0, 0, -10, 0);
      place(s, id, side, -10 + d, Math.PI);
      debugGiveBall(s, 0);
      step(s, { 0: makeInput({ yaw: 0, buttons: Buttons.KICK }) });
      const atKick = s.events.filter((e) => e.type === 'catch');
      const log = simulate(s, 12, () => ({}), (e) => e.type === 'catch');
      const c = [...atKick, ...log.map((l) => l.e)].find((e) => e.type === 'catch');
      return c !== undefined && c.type === 'catch' ? c.playerId : -1;
    };
    expect(KICK_CHARGE_DOWN_RADIUS).toBeLessThan(2);
    expect(caughtBy(6, 1.0)).toBe(6); // contre au contact
    for (const d of [2, 3, 4, 4.5, 5]) expect(caughtBy(6, d), `adversaire à ${d} m`).toBe(-1); // avant : contré jusqu'à 4,5 m
    // Un coéquipier qui court collé au tireur (côte à côte, un peu devant) ne le transforme pas en remise en main.
    expect(caughtBy(1, 0.58, 1)).toBe(-1);
    expect(caughtBy(1, 1.0)).toBe(-1);
  });

  it('portée adaptée au terrain : en 3v3, ≈ FIELD_SCALE_3V3 × la portée du 5v5 (vitesse × √scale)', () => {
    const range = (teamSize: TeamSize): number => {
      const s = arena(teamSize);
      place(s, 0, 0, -10, 0);
      const l = kickLaunch(s, 0, 0, 0);
      if (l === null) throw new Error('kickLaunch');
      const land = predictBallLanding(s.field, l.pos, l.vel);
      return Math.hypot(land.x - l.pos.x, land.z - l.pos.z);
    };
    const r5 = range(5);
    const r3 = range(3);
    expect(r3 / r5).toBeGreaterThan(FIELD_SCALE_3V3 - 0.05);
    expect(r3 / r5).toBeLessThan(FIELD_SCALE_3V3 + 0.05);
    const s3 = arena(3);
    expect(r3).toBeLessThan(s3.field.length / 2); // depuis la médiane, il ne finit pas au fond de l'en-but
  });
});

// ---------------------------------------------------------------------------
// Plongeon
// ---------------------------------------------------------------------------

describe('plongeon (porteur + SLIDE)', () => {
  function diver(): MatchState {
    const s = arena();
    place(s, 0, 0, -20, 0);
    debugGiveBall(s, 0);
    for (let i = 0; i < 15; i++) step(s, { 0: makeInput({ yaw: 0, moveY: 1 }) });
    return s;
  }

  it('porteur => plongeon ; non-porteur => glissade', () => {
    const s = diver();
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    expect(s.players[0].move).toBe('dive');
    expect(s.events).toContainEqual({ type: 'dive', playerId: 0 });
    expect(s.ball.carrierId).toBe(0);

    const t = arena();
    place(t, 1, 0, -20, 0);
    for (let i = 0; i < 15; i++) step(t, { 1: makeInput({ yaw: 0, moveY: 1 }) });
    step(t, { 1: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    expect(t.players[1].move).toBe('slide');
  });

  it('distance ≈ DIVE_SPEED × DIVE_DURATION_SEC, hitbox basse, le porteur garde le ballon', () => {
    const s = diver();
    const z0 = s.players[0].pos.z;
    const n = secToTicks(DIVE_DURATION_SEC);
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    for (let i = 1; i < n; i++) {
      expect(s.players[0].move).toBe('dive');
      step(s, { 0: makeInput({ yaw: 0, moveY: 1 }) });
    }
    expect(s.players[0].pos.z - z0).toBeCloseTo(n * TICK_DT * DIVE_SPEED, 6);
    expect(s.ball.carrierId).toBe(0);
    expect(PLAYER_LOW_HEIGHT).toBeLessThan(PLAYER_HEIGHT);
  });

  it('invulnérable exactement DIVE_INVULN_SEC (en ticks), dès le tick du plongeon', () => {
    const s = diver();
    let protectedTicks = 0;
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    if (s.players[0].invulnTicks > 0) protectedTicks++;
    for (let i = 0; i < 40; i++) {
      step(s, { 0: makeInput({ yaw: 0, moveY: 1 }) });
      if (s.players[0].invulnTicks > 0) protectedTicks++;
    }
    expect(protectedTicks).toBe(secToTicks(DIVE_INVULN_SEC));
  });

  it('récupération au sol : freinage DIVE_RECOVER_DECEL pendant DIVE_RECOVER_SEC, puis retour à la course', () => {
    const s = diver();
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    const go = makeInput({ yaw: 0, moveY: 1 });
    while (s.players[0].move === 'dive') step(s, { 0: go });
    expect(s.players[0].move).toBe('dive_recover');
    let recoverTicks = 1;
    const speeds: number[] = [hSpeed(s.players[0].vel)];
    while (s.players[0].move === 'dive_recover') {
      step(s, { 0: go });
      speeds.push(hSpeed(s.players[0].vel));
      recoverTicks++;
    }
    expect(recoverTicks).toBe(secToTicks(DIVE_RECOVER_SEC) + 1);
    // Pendant la récupération, même en poussant vers l'avant, la vitesse ne fait que baisser (freinage constant).
    for (let i = 1; i < speeds.length - 1; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-9);
    const braked = Math.max(0, DIVE_SPEED - DIVE_RECOVER_DECEL * TICK_DT * secToTicks(DIVE_RECOVER_SEC));
    expect(speeds[speeds.length - 2]).toBeCloseTo(braked, 6);
    expect(braked).toBeLessThan(ROLES.pilier.runSpeed); // on sort du plongeon plus lent qu'en course
    for (let i = 0; i < 10; i++) step(s, { 0: go });
    expect(hSpeed(s.players[0].vel)).toBeCloseTo(ROLES.pilier.runSpeed * CARRIER_SPEED_MULT, 6);
  });

  it('plonger contre un muret : la grimpe interrompt le dash mais la récupération au sol suit (pas de dash gratuit)', () => {
    const s = arena();
    s.field.features = [{ kind: 'wall', x: 0, z: -14, length: 10, thickness: 0.6, height: 0.7, rotation: Math.PI / 2 }];
    place(s, 0, 0, -20, 0);
    debugGiveBall(s, 0);
    const modes: string[] = [];
    for (let i = 0; i < 40; i++) {
      step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: i === 8 ? Buttons.SLIDE : 0 }) });
      modes.push(s.players[0].move);
    }
    const climbAt = modes.indexOf('climb');
    expect(modes.slice(8, climbAt).every((m) => m === 'dive')).toBe(true); // la grimpe survient pendant le dash
    const afterClimb = modes.findIndex((m, i) => i > climbAt && m !== 'climb');
    expect(modes[afterClimb]).toBe('dive_recover');
    // (on retombe de l'autre côté du muret : le minuteur attend l'atterrissage, puis DIVE_RECOVER_SEC au sol)
    expect(modes.filter((m) => m === 'dive_recover').length).toBeGreaterThanOrEqual(secToTicks(DIVE_RECOVER_SEC) + 1);
    expect(modes[modes.length - 1]).toBe('run');
    // Sans plongeon, la grimpe se termine en course.
    const t = arena();
    t.field.features = s.field.features;
    place(t, 0, 0, -20, 0);
    const tm: string[] = [];
    for (let i = 0; i < 30; i++) {
      step(t, { 0: makeInput({ yaw: 0, moveY: 1 }) });
      tm.push(t.players[0].move);
    }
    expect(tm).toContain('climb');
    expect(tm[tm.findIndex((m, i) => i > tm.indexOf('climb') && m !== 'climb')]).toBe('run');
  });

  it('cooldown DIVE_COOLDOWN_SEC (raccourci en dernière minute)', () => {
    for (const lastMinute of [false, true]) {
      const s = diver();
      s.lastMinute = lastMinute;
      step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
      const cd = secToTicks(lastMinute ? DIVE_COOLDOWN_SEC * LAST_MINUTE_COOLDOWN_MULT : DIVE_COOLDOWN_SEC);
      expect(s.players[0].diveCd).toBe(cd);
      // Nouvel appui avant la fin du cooldown : rien.
      let dives = 0;
      for (let i = 0; i < cd + 5; i++) {
        const press = i % 2 === 0 ? Buttons.SLIDE : 0;
        step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: press }) });
        dives += s.events.filter((e) => e.type === 'dive').length;
        if (dives > 0) {
          expect(i + 1).toBeGreaterThanOrEqual(cd);
          break;
        }
      }
      expect(dives).toBe(1);
    }
  });

  it('direction : l’entrée si elle pointe vers l’avant (diagonale), sinon le regard (pas chassé)', () => {
    const s = diver();
    step(s, { 0: makeInput({ yaw: 0, moveX: -1, moveY: 1, buttons: Buttons.SLIDE }) });
    const d = s.players[0].moveDir;
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 6); // moveX = −1 : vers la gauche = +X pour yaw 0
    expect(d.z).toBeCloseTo(Math.SQRT1_2, 6);
    const t = diver();
    step(t, { 0: makeInput({ yaw: 0, moveX: 1, buttons: Buttons.SLIDE }) });
    expect(t.players[0].moveDir.x).toBeCloseTo(0, 9);
    expect(t.players[0].moveDir.z).toBeCloseTo(1, 9);
  });

  it(`plongeon aérien ${DIVE_IN_AIR ? 'permis' : 'refusé'} (DIVE_IN_AIR) ; récupération à l'atterrissage`, () => {
    const s = diver();
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.JUMP }) });
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.JUMP }) });
    expect(s.players[0].onGround).toBe(false);
    step(s, { 0: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    expect(s.players[0].move).toBe(DIVE_IN_AIR ? 'dive' : 'run');
    if (!DIVE_IN_AIR) return;
    // En l'air : sans contrôle, direction gardée ; l'excès au-delà du plafond de course du porteur s'éteint à
    // AIR_OVERSPEED_DECEL (passe finale : avant, les 17 m/s du dash étaient gardés jusqu'au sol).
    const p = s.players[0];
    const ceiling = ROLES[p.role].runSpeed * SPRINT_SPEED_MULT * CARRIER_SPEED_MULT;
    let prev = hSpeed(p.vel);
    let airborneRecover = 0;
    for (let i = 0; i < 60 && p.move !== 'run'; i++) {
      step(s, { 0: makeInput({ yaw: 0, moveY: 1 }) });
      if (p.move === 'dive_recover' && !p.onGround) {
        airborneRecover++;
        expect(hSpeed(p.vel)).toBeCloseTo(Math.max(ceiling, prev - AIR_OVERSPEED_DECEL * TICK_DT), 6);
        expect(p.vel.x).toBeCloseTo(0, 9);
      }
      prev = hSpeed(p.vel);
    }
    expect(airborneRecover).toBeGreaterThan(0);
    expect(s.players[0].onGround).toBe(true);
    expect(s.players[0].move).toBe('run');
  });

  it('un joueur qui reçoit le ballon en glissant devient porteur en glissade et peut enchaîner un plongeon', () => {
    const s = arena();
    place(s, 1, 0, -20, 0);
    for (let i = 0; i < 15; i++) step(s, { 1: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SPRINT }) });
    step(s, { 1: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    expect(s.players[1].move).toBe('slide');
    debugGiveBall(s, 1); // équivalent d'une réception pendant la glissade
    step(s, { 1: makeInput({ yaw: 0, moveY: 1 }) });
    expect(s.players[1].move).toBe('slide'); // la glissade continue
    step(s, { 1: makeInput({ yaw: 0, moveY: 1, buttons: Buttons.SLIDE }) });
    expect(s.players[1].move).toBe('dive');
  });
});

// ---------------------------------------------------------------------------
// Dernière minute, tir, outils de test
// ---------------------------------------------------------------------------

describe('dernière minute', () => {
  it('passes et coups de pied plus rapides (LAST_MINUTE_BALL_SPEED_MULT)', () => {
    const s = arena();
    place(s, 0, 0, 0, 0);
    place(s, 1, 0, -12);
    const normal = planPass(s, 0, 1);
    const kickN = kickLaunch(s, 0, 0, 0);
    s.lastMinute = true;
    const fast = planPass(s, 0, 1);
    const kickF = kickLaunch(s, 0, 0, 0);
    if (normal === null || fast === null || kickN === null || kickF === null) throw new Error('plan');
    expect(fast.flightSec).toBeCloseTo(normal.flightSec / LAST_MINUTE_BALL_SPEED_MULT, 9);
    expect(Math.hypot(kickF.vel.x, kickF.vel.y, kickF.vel.z)).toBeCloseTo(KICK_SPEED * LAST_MINUTE_BALL_SPEED_MULT, 9);
    expect(Math.hypot(kickN.vel.x, kickN.vel.y, kickN.vel.z)).toBeCloseTo(KICK_SPEED, 9);
  });
});

describe('tir et porteur', () => {
  it('le porteur ne peut pas tirer (canShoot)', () => {
    const s = arena();
    expect(canShoot(s, s.players[0])).toBe(true);
    debugGiveBall(s, 0);
    expect(canShoot(s, s.players[0])).toBe(false);
    expect(canShoot(s, s.players[1])).toBe(true);
  });
});

describe('outils de test (debugGiveBall / debugResetBall)', () => {
  it('debugGiveBall donne le ballon (porté au prochain tick) ; refusé pour un joueur au sol', () => {
    const s = arena();
    place(s, 3, 1, 1, 0);
    expect(debugGiveBall(s, 3)).toBe(true);
    expect(s.ball.mode).toBe('carried');
    expect(s.ball.carrierId).toBe(3);
    expect(s.ball.lastTeam).toBe(0);
    step(s, {});
    expect(s.ball.carrierId).toBe(3);
    s.players[4].status = 'down';
    expect(debugGiveBall(s, 4)).toBe(false);
    expect(debugGiveBall(s, 99)).toBe(false);
    expect(s.ball.carrierId).toBe(3);
  });

  it('debugResetBall : ballon libre immobile au-dessus du centre, déterministe (aucun tirage)', () => {
    const s = arena();
    debugGiveBall(s, 2);
    s.players[0].pickupBlockTicks = 9;
    const rng = s.rng;
    debugResetBall(s);
    expect(s.ball.mode).toBe('loose');
    expect(s.ball.carrierId).toBe(-1);
    expect(s.ball.pos.x).toBe(0);
    expect(s.ball.pos.z).toBe(0);
    expect(s.ball.pos.y).toBeGreaterThan(1);
    expect(s.ball.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.rng).toBe(rng);
    expect(s.players[0].pickupBlockTicks).toBe(0);
    // Il tombe au centre et se ramasse.
    place(s, 1, 0.6, 0);
    for (let i = 0; i < 30 && s.ball.mode === 'loose'; i++) step(s, {});
    expect(s.ball.carrierId).toBe(1);
  });
});

describe('hauteur de réception', () => {
  it('portée des bras = hauteur de la capsule + BALL_CATCH_REACH_ABOVE (plus bas en glissade)', () => {
    // Un joueur en glissade (capsule basse) n'attrape pas un ballon qu'un joueur debout attraperait.
    const y = PLAYER_LOW_HEIGHT + BALL_CATCH_REACH_ABOVE + 0.5;
    for (const sliding of [false, true]) {
      const s = arena();
      s.ball.mode = 'kick';
      s.ball.throwerId = 5;
      s.ball.pos = { x: -3, y, z: 0 };
      s.ball.vel = { x: 18, y: 2, z: 0 }; // ~2,0 à 2,1 m de haut en passant au-dessus du joueur
      place(s, 1, 0, 0);
      if (sliding) {
        s.players[1].move = 'slide';
        s.players[1].moveTicks = 30;
        s.players[1].moveDir = { x: 0, y: 0, z: 1 };
      }
      for (let i = 0; i < 8; i++) step(s, {});
      expect(s.ball.carrierId === 1, sliding ? 'glissade' : 'debout').toBe(!sliding);
    }
  });
});
