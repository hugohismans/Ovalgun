/**
 * Déplacement des joueurs : course, sprint, saut, esquive, glissade, terrain, murs, séparation.
 */
import { describe, expect, it } from 'vitest';
import {
  AIM_SPEED_MULT,
  BACKPEDAL_SPEED_MULT,
  Buttons,
  CARRIER_DODGE_COOLDOWN_SEC,
  CARRIER_SPEED_MULT,
  CLIMB_HORIZONTAL_KEEP,
  DODGE_COOLDOWN_SEC,
  DODGE_DURATION_SEC,
  DODGE_EXIT_SPEED_KEEP,
  DODGE_JUMP_CANCEL_SEC,
  DODGE_SPEED,
  GROUND_OVERSPEED_DECEL,
  JUMP_VELOCITY,
  MAX_CLIMB_HEIGHT,
  MAX_STEP_HEIGHT,
  MOVE_INPUT_FULL_SPEED,
  PITCH_MAX_DEG,
  PLAYER_GRAVITY,
  PLAYER_LOW_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SEPARATION,
  ROLES,
  SLIDE_BOOST,
  SLIDE_DECEL,
  SLIDE_DURATION_SEC,
  SLIDE_MAX_SPEED,
  SLIDE_MIN_SPEED,
  SPRINT_MIN_TILT,
  SPRINT_SPEED_MULT,
  STRAFE_SPEED_MULT,
  TICK_DT,
  playerHeight,
  secToTicks,
  step,
  type MatchState,
  type PlayerInput,
  type Role,
  type TerrainFeature,
} from '../../src/sim';
import { hSpeed, only0, run, soloMatch } from './helpers';

/** Vitesse horizontale du joueur 0 après `ticks` ticks d'une entrée constante. */
function steadySpeed(role: Role, inp: Partial<PlayerInput>, ticks = 30, setup?: (s: MatchState) => void): number {
  const s = soloMatch(role);
  setup?.(s);
  run(s, ticks, () => only0(inp));
  return hSpeed(s.players[0].vel);
}

/** Muret en travers du chemin (+Z), centré en z. */
const wallAcross = (z: number, height: number, thickness = 0.6, length = 12): TerrainFeature => ({
  kind: 'wall',
  x: 0,
  z,
  length,
  thickness,
  height,
  rotation: Math.PI / 2,
});

/** Grande plateforme carrée (muret très épais) de côté `size`, centrée en (0, 0). */
const platform = (height: number, size = 20): TerrainFeature => ({
  kind: 'wall',
  x: 0,
  z: 0,
  length: size,
  thickness: size,
  height,
  rotation: 0,
});

const countEvents = (log: string[], type: string): number => log.filter((e) => e === type).length;

describe('course', () => {
  it('atteint la vitesse du rôle, ordonnée pilier < demi < ailier', () => {
    const v = (r: Role) => steadySpeed(r, { moveY: 1 });
    for (const r of ['pilier', 'demi', 'ailier'] as const) expect(v(r)).toBeCloseTo(ROLES[r].runSpeed, 6);
    expect(v('pilier')).toBeLessThan(v('demi'));
    expect(v('demi')).toBeLessThan(v('ailier'));
  });

  it('réactive : vitesse max atteinte en moins de 0,2 s, arrêt en moins de 0,2 s', () => {
    const s = soloMatch('ailier');
    run(s, secToTicks(0.2), () => only0({ moveY: 1 }));
    expect(hSpeed(s.players[0].vel)).toBeCloseTo(ROLES.ailier.runSpeed, 6);
    run(s, secToTicks(0.2), () => only0({}));
    expect(hSpeed(s.players[0].vel)).toBe(0);
  });

  it('sprint plus rapide, seulement en avançant et hors visée', () => {
    const base = ROLES.demi.runSpeed;
    expect(steadySpeed('demi', { moveY: 1, buttons: Buttons.SPRINT })).toBeCloseTo(base * SPRINT_SPEED_MULT, 6);
    expect(steadySpeed('demi', { moveY: 1, buttons: Buttons.SPRINT | Buttons.AIM })).toBeCloseTo(base * AIM_SPEED_MULT, 6);
    expect(steadySpeed('demi', { moveY: -1, buttons: Buttons.SPRINT })).toBeCloseTo(base * BACKPEDAL_SPEED_MULT, 6);
    expect(steadySpeed('demi', { moveX: 1, buttons: Buttons.SPRINT })).toBeCloseTo(base * STRAFE_SPEED_MULT, 6);
  });

  it('marche arrière et pas chassé plus lents, visée ralentit', () => {
    const base = ROLES.pilier.runSpeed;
    expect(steadySpeed('pilier', { moveY: -1 })).toBeCloseTo(base * BACKPEDAL_SPEED_MULT, 6);
    expect(steadySpeed('pilier', { moveX: -1 })).toBeCloseTo(base * STRAFE_SPEED_MULT, 6);
    expect(steadySpeed('pilier', { moveY: 1, buttons: Buttons.AIM })).toBeCloseTo(base * AIM_SPEED_MULT, 6);
    expect(BACKPEDAL_SPEED_MULT).toBeLessThan(1);
  });

  it('direction : avancer avec yaw = PI/2 déplace vers +X ; moveX = 1 déplace vers right(yaw)', () => {
    const s = soloMatch('demi', [], 0, 0, Math.PI / 2);
    run(s, 10, () => only0({ moveY: 1, yaw: Math.PI / 2 }));
    expect(s.players[0].pos.x).toBeGreaterThan(1);
    expect(Math.abs(s.players[0].pos.z)).toBeLessThan(1e-9);
    const r = soloMatch('demi');
    run(r, 10, () => only0({ moveX: 1 }));
    expect(r.players[0].pos.x).toBeLessThan(-1); // right(0) = (-1, 0, 0)
  });

  it('entrée analogique (manette) : vitesse proportionnelle à l’inclinaison, pleine vitesse au-delà du seuil', () => {
    const base = ROLES.ailier.runSpeed;
    expect(steadySpeed('ailier', { moveY: MOVE_INPUT_FULL_SPEED / 2 })).toBeCloseTo(base / 2, 6);
    expect(steadySpeed('ailier', { moveY: MOVE_INPUT_FULL_SPEED })).toBeCloseTo(base, 6);
    // Diagonale clavier (norme √2) ramenée à 1 : pas plus rapide qu'en ligne droite.
    expect(steadySpeed('ailier', { moveX: 1, moveY: 1 })).toBeLessThanOrEqual(base + 1e-9);
    const s = soloMatch('ailier');
    step(s, only0({ moveX: 1, moveY: 1 }));
    expect(Math.hypot(s.players[0].lastMoveX, s.players[0].lastMoveY)).toBeCloseTo(1, 9);
  });

  it('manette : le sprint sépare direction (cône avant) et inclinaison du stick', () => {
    const base = ROLES.ailier.runSpeed;
    const S = Buttons.SPRINT;
    // Stick avant à fond : sprint.
    expect(steadySpeed('ailier', { moveY: 1, buttons: S })).toBeCloseTo(base * SPRINT_SPEED_MULT, 6);
    // Stick avant à peine poussé : même vitesse que sans sprint.
    expect(0.2).toBeLessThan(SPRINT_MIN_TILT);
    expect(steadySpeed('ailier', { moveY: 0.2, buttons: S })).toBeCloseTo(steadySpeed('ailier', { moveY: 0.2 }), 9);
    // Stick à fond à ~70° de l'avant (pas chassé) : pas de sprint, plus lent que la course avant.
    const side = { moveX: 0.94, moveY: 0.34 };
    expect(steadySpeed('ailier', { ...side, buttons: S })).toBeCloseTo(steadySpeed('ailier', side), 9);
    expect(steadySpeed('ailier', { ...side, buttons: S })).toBeLessThan(base);
    // Diagonale clavier (45°) : sprint.
    expect(steadySpeed('ailier', { moveX: 1, moveY: 1, buttons: S })).toBeGreaterThan(base * 1.1);
  });

  it('le porteur est plus rapide (CARRIER_SPEED_MULT)', () => {
    const v = steadySpeed('demi', { moveY: 1 }, 30, (s) => {
      s.ball.mode = 'carried';
      s.ball.carrierId = 0;
    });
    expect(v).toBeCloseTo(ROLES.demi.runSpeed * CARRIER_SPEED_MULT, 6);
  });

  it('le porteur ne vise pas : AIM ne le ralentit pas et n’annule pas son sprint', () => {
    const carry = (s: MatchState): void => {
      s.ball.mode = 'carried';
      s.ball.carrierId = 0;
    };
    const base = ROLES.demi.runSpeed * CARRIER_SPEED_MULT;
    expect(steadySpeed('demi', { moveY: 1, buttons: Buttons.AIM }, 30, carry)).toBeCloseTo(base, 6);
    expect(steadySpeed('demi', { moveY: 1, buttons: Buttons.AIM | Buttons.SPRINT }, 30, carry)).toBeCloseTo(
      base * SPRINT_SPEED_MULT,
      6,
    );
  });
});

describe('saut', () => {
  function jumpApex(role: Role, pressTicks: number[]): { apex: number; log: string[] } {
    const s = soloMatch(role);
    const log: string[] = [];
    let apex = 0;
    run(
      s,
      60,
      (t) => only0({ buttons: pressTicks.includes(t) ? Buttons.JUMP : 0 }),
      (st) => {
        apex = Math.max(apex, st.players[0].pos.y);
        for (const e of st.events) if (e.type === 'jump') log.push(e.air ? 'air' : 'ground');
      },
    );
    return { apex, log };
  }

  it('hauteur ≈ v² / 2g', () => {
    const { apex, log } = jumpApex('pilier', [0]);
    expect(log).toEqual(['ground']);
    expect(apex).toBeCloseTo((JUMP_VELOCITY * JUMP_VELOCITY) / (2 * PLAYER_GRAVITY), 1);
    expect(Math.abs(apex - (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * PLAYER_GRAVITY))).toBeLessThan(0.03);
  });

  it('double saut : ailier seulement', () => {
    const single = jumpApex('ailier', [0]).apex;
    const ail = jumpApex('ailier', [0, 10]);
    expect(ail.log).toEqual(['ground', 'air']);
    expect(ail.apex).toBeGreaterThan(single + 0.5);
    const pil = jumpApex('pilier', [0, 10]);
    expect(pil.log).toEqual(['ground']);
    // Triple saut impossible pour l'ailier.
    expect(jumpApex('ailier', [0, 10, 16]).log).toEqual(['ground', 'air']);
  });

  /** Joueur sur une haute plateforme qui court vers le bord (+Z) ; renvoie le tick où il quitte le sol. */
  function ledgeRun(pressAt: number | null): { leaveTick: number; jumps: number; s: MatchState } {
    const s = soloMatch('pilier', [platform(3)], 0, 8);
    s.players[0].pos.y = 3;
    let leaveTick = -1;
    let jumps = 0;
    run(
      s,
      60,
      (t) => only0({ moveY: 1, buttons: t === pressAt ? Buttons.JUMP : 0 }),
      (st, t) => {
        if (leaveTick < 0 && !st.players[0].onGround) leaveTick = t;
        jumps += st.events.filter((e) => e.type === 'jump').length;
      },
    );
    return { leaveTick, jumps, s };
  }

  it('coyote time : on peut encore sauter juste après avoir quitté le bord', () => {
    const ref = ledgeRun(null);
    expect(ref.leaveTick).toBeGreaterThan(0);
    expect(ref.jumps).toBe(0);
    expect(ledgeRun(ref.leaveTick + 2).jumps).toBe(1);
    expect(ledgeRun(ref.leaveTick + 6).jumps).toBe(0); // trop tard (et le tampon expire avant l'atterrissage)
  });

  it('tampon de saut : un appui juste avant l’atterrissage est honoré', () => {
    const landTick = (() => {
      const s = soloMatch('pilier');
      let land = -1;
      run(s, 40, (t) => only0({ buttons: t === 0 ? Buttons.JUMP : 0 }), (st, t) => {
        if (land < 0 && st.events.some((e) => e.type === 'land')) land = t;
      });
      return land;
    })();
    expect(landTick).toBeGreaterThan(10);
    const jumpsWith = (pressAt: number) => {
      const s = soloMatch('pilier');
      let n = 0;
      run(s, 60, (t) => only0({ buttons: t === 0 || t === pressAt ? Buttons.JUMP : 0 }), (st) => {
        n += st.events.filter((e) => e.type === 'jump').length;
      });
      return n;
    };
    expect(jumpsWith(landTick - 2)).toBe(2);
    expect(jumpsWith(landTick - 8)).toBe(1);
  });
});

describe('esquive', () => {
  it('distance ≈ DODGE_SPEED × durée, dans la direction de l’entrée (ou devant)', () => {
    const n = secToTicks(DODGE_DURATION_SEC);
    const expected = DODGE_SPEED * n * TICK_DT;
    const s = soloMatch('pilier');
    run(s, n, (t) => only0({ moveX: 1, buttons: t === 0 ? Buttons.DODGE : 0 }));
    expect(s.players[0].pos.x).toBeCloseTo(-expected, 6);
    const f = soloMatch('pilier');
    run(f, n, (t) => only0({ buttons: t === 0 ? Buttons.DODGE : 0 }));
    expect(f.players[0].pos.z).toBeCloseTo(expected, 6);
    expect(f.players[0].move).toBe('dodge');
    step(f, only0({}));
    expect(f.players[0].move).toBe('run');
    expect(hSpeed(f.players[0].vel)).toBeLessThan(DODGE_SPEED);
  });

  it('sortie d’esquive : l’élan porte (DODGE_EXIT_SPEED_KEEP) puis décroît en douceur', () => {
    const s = soloMatch('ailier');
    const speeds: number[] = [];
    run(s, 50, (t) => only0({ moveY: 1, buttons: t === 30 ? Buttons.DODGE : 0 }), (st, t) => {
      if (t >= 30) speeds.push(hSpeed(st.players[0].vel));
    });
    const n = secToTicks(DODGE_DURATION_SEC);
    const exit = DODGE_SPEED * DODGE_EXIT_SPEED_KEEP;
    for (let k = 0; k < n; k++) expect(speeds[k]).toBeCloseTo(DODGE_SPEED, 9);
    expect(speeds[n]).toBeCloseTo(exit, 9); // tick de sortie : vitesse de sortie intacte
    expect(speeds[n + 1]).toBeCloseTo(exit - GROUND_OVERSPEED_DECEL * TICK_DT, 9);
    expect(speeds[n + 3]).toBeGreaterThan(ROLES.ailier.runSpeed + 1);
    for (let k = n + 1; k < speeds.length; k++) expect(speeds[k]).toBeLessThanOrEqual(speeds[k - 1] + 1e-9);
    expect(speeds[speeds.length - 1]).toBeCloseTo(ROLES.ailier.runSpeed, 9);
  });

  it('dash-saut : un saut pressé pendant l’esquive part après DODGE_JUMP_CANCEL_SEC, élan conservé', () => {
    const cancel = secToTicks(DODGE_JUMP_CANCEL_SEC);
    for (const jt of [0, 1, 2, 3]) {
      const s = soloMatch('demi');
      const jumps: number[] = [];
      let speedAtJump = 0;
      run(
        s,
        50,
        (t) => only0({ moveY: 1, buttons: (t === 30 ? Buttons.DODGE : 0) | (t === 30 + jt ? Buttons.JUMP : 0) }),
        (st, t) => {
          if (st.events.some((e) => e.type === 'jump')) {
            jumps.push(t - 30);
            speedAtJump = hSpeed(st.players[0].vel);
          }
        },
      );
      expect(jumps, `saut pressé à +${jt}`).toEqual([Math.max(jt, cancel)]);
      expect(speedAtJump).toBeCloseTo(DODGE_SPEED * DODGE_EXIT_SPEED_KEEP, 9);
    }
  });

  it('en l’air, maintenir la direction ne freine pas l’élan d’une esquive aérienne', () => {
    const s = soloMatch('ailier');
    run(s, 30, () => only0({ moveY: 1 }));
    run(s, 12, (t) => only0({ moveY: 1, buttons: t === 0 ? Buttons.JUMP : t === 2 ? Buttons.DODGE : 0 }));
    expect(s.players[0].onGround).toBe(false);
    expect(hSpeed(s.players[0].vel)).toBeCloseTo(DODGE_SPEED * DODGE_EXIT_SPEED_KEEP, 9);
  });

  function dodgeInterval(carrier: boolean): number {
    const s = soloMatch('ailier');
    if (carrier) {
      s.ball.mode = 'carried';
      s.ball.carrierId = 0;
    }
    const ticks: number[] = [];
    run(s, 120, (t) => only0({ buttons: t % 2 === 0 ? Buttons.DODGE : 0 }), (st, t) => {
      if (st.events.some((e) => e.type === 'dodge')) ticks.push(t);
    });
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    return ticks[1] - ticks[0];
  }

  it('cooldown respecté, plus court pour le porteur', () => {
    const normal = dodgeInterval(false);
    const carrier = dodgeInterval(true);
    expect(Math.abs(normal - secToTicks(DODGE_COOLDOWN_SEC))).toBeLessThanOrEqual(1);
    expect(Math.abs(carrier - secToTicks(CARRIER_DODGE_COOLDOWN_SEC))).toBeLessThanOrEqual(1);
    expect(carrier).toBeLessThan(normal);
  });
});

describe('glissade', () => {
  it('impossible à l’arrêt ou sous SLIDE_MIN_SPEED', () => {
    const s = soloMatch('pilier');
    step(s, only0({ buttons: Buttons.SLIDE }));
    expect(s.players[0].move).toBe('run');
    // Pilier en visée : 7,2 × 0,72 < SLIDE_MIN_SPEED.
    expect(ROLES.pilier.runSpeed * AIM_SPEED_MULT).toBeLessThan(SLIDE_MIN_SPEED);
    const a = soloMatch('pilier');
    run(a, 30, (t) => only0({ moveY: 1, buttons: Buttons.AIM | (t === 29 ? Buttons.SLIDE : 0) }));
    expect(a.players[0].move).toBe('run');
  });

  it('en courant : boost plafonné, hitbox basse, puis décélération', () => {
    const s = soloMatch('pilier');
    const slides: number[] = [];
    run(s, 30, (t) => only0({ moveY: 1, buttons: t === 29 ? Buttons.SLIDE : 0 }), (st, t) => {
      if (st.events.some((e) => e.type === 'slide')) slides.push(t);
    });
    expect(slides).toEqual([29]);
    const p = s.players[0];
    expect(p.move).toBe('slide');
    expect(playerHeight(p)).toBe(PLAYER_LOW_HEIGHT);
    const boosted = Math.min(ROLES.pilier.runSpeed * SLIDE_BOOST, SLIDE_MAX_SPEED);
    expect(hSpeed(p.vel)).toBeCloseTo(boosted - SLIDE_DECEL * TICK_DT, 6);
    expect(hSpeed(p.vel)).toBeGreaterThan(ROLES.pilier.runSpeed);
    run(s, 40, () => only0({ moveY: 1 }));
    expect(s.players[0].move).toBe('run');
  });

  it('va plus loin que la course sur sa durée (ailier, avec et sans sprint)', () => {
    for (const sprint of [0, Buttons.SPRINT]) {
      const dist = (slide: boolean): number => {
        const s = soloMatch('ailier');
        run(s, 30, () => only0({ moveY: 1, buttons: sprint }));
        const z0 = s.players[0].pos.z;
        run(s, secToTicks(SLIDE_DURATION_SEC), (t) => only0({ moveY: 1, buttons: sprint | (slide && t === 0 ? Buttons.SLIDE : 0) }));
        return s.players[0].pos.z - z0;
      };
      expect(dist(true), `sprint=${sprint}`).toBeGreaterThan(dist(false));
    }
  });

  it('le porteur ne glisse pas : SLIDE = plongeon (étape 4)', () => {
    const s = soloMatch('ailier');
    s.ball.mode = 'carried';
    s.ball.carrierId = 0;
    run(s, 30, (t) => only0({ moveY: 1, buttons: t === 29 ? Buttons.SLIDE : 0 }));
    expect(s.players[0].move).toBe('dive');
    expect(s.events.map((e) => e.type)).toContain('dive');
    expect(s.events.map((e) => e.type)).not.toContain('slide');
  });
});

describe('terrain', () => {
  /** Course en +Z vers un relief ; renvoie les événements et la vitesse horizontale minimale après la mise en vitesse. */
  function runInto(role: Role, features: TerrainFeature[], ticks: number, inp: Partial<PlayerInput> = { moveY: 1 }) {
    const s = soloMatch(role, features, 0, 0);
    const log: string[] = [];
    let minSpeed = Infinity;
    let maxY = 0;
    run(s, ticks, () => only0(inp), (st, t) => {
      for (const e of st.events) log.push(e.type);
      if (t > 8) minSpeed = Math.min(minSpeed, hSpeed(st.players[0].vel));
      maxY = Math.max(maxY, st.players[0].pos.y);
    });
    return { s, log, minSpeed, maxY };
  }

  it('monte une marche ≤ MAX_STEP_HEIGHT sans grimper ni ralentir', () => {
    const h = MAX_STEP_HEIGHT - 0.05;
    const r = runInto('demi', [wallAcross(5, h, 2)], 45);
    expect(countEvents(r.log, 'climb')).toBe(0);
    expect(r.maxY).toBeCloseTo(h, 9);
    expect(r.minSpeed).toBeCloseTo(ROLES.demi.runSpeed, 6);
    expect(r.s.players[0].pos.z).toBeGreaterThan(9);
  });

  it('grimpe un muret bas sans blocage et le franchit', () => {
    for (const h of [0.6, 0.9, MAX_CLIMB_HEIGHT - 0.05]) {
      const r = runInto('pilier', [wallAcross(5, h)], 60);
      expect(countEvents(r.log, 'climb'), `h=${h}`).toBe(1);
      expect(r.maxY).toBeCloseTo(h, 6);
      expect(r.minSpeed, `h=${h}`).toBeGreaterThanOrEqual(ROLES.pilier.runSpeed * CLIMB_HORIZONTAL_KEEP - 1e-6);
      expect(r.s.players[0].pos.z, `h=${h}`).toBeGreaterThan(10);
      expect(r.s.players[0].onGround).toBe(true);
      expect(r.s.players[0].pos.y).toBe(0);
    }
  });

  it('frôler un muret en le longeant ne le fait pas grimper : on passe à côté sans ralentir', () => {
    const wall: TerrainFeature = { kind: 'wall', x: 0, z: 10, length: 12, thickness: 0.6, height: 0.8, rotation: 0 };
    const s = soloMatch('ailier', [wall], 0.3 + PLAYER_RADIUS - 0.01, 0);
    const log: string[] = [];
    let minSpeed = Infinity;
    let maxY = 0;
    run(s, 60, () => only0({ moveY: 1 }), (st, t) => {
      for (const e of st.events) log.push(e.type);
      if (t > 8) minSpeed = Math.min(minSpeed, hSpeed(st.players[0].vel));
      maxY = Math.max(maxY, st.players[0].pos.y);
    });
    expect(countEvents(log, 'climb')).toBe(0);
    expect(maxY).toBe(0);
    expect(minSpeed).toBeGreaterThan(ROLES.ailier.runSpeed - 0.5);
    expect(s.players[0].pos.z).toBeGreaterThan(wall.z + wall.length / 2 + 1);
  });

  it('aborder un muret en biais (45°) le fait toujours grimper', () => {
    const s = soloMatch('ailier', [wallAcross(5, 0.8, 0.6, 30)], 0, 0, Math.PI / 4);
    const log: string[] = [];
    run(s, 40, () => only0({ moveY: 1, yaw: Math.PI / 4 }), (st) => st.events.forEach((e) => log.push(e.type)));
    expect(countEvents(log, 'climb')).toBe(1);
    expect(s.players[0].pos.z).toBeGreaterThan(6);
  });

  it('un obstacle > MAX_CLIMB_HEIGHT bloque, et on glisse le long', () => {
    // Muret haut en biais : en avançant tout droit on doit glisser vers +X le long de la face.
    const tall: TerrainFeature = { kind: 'wall', x: 0, z: 5, length: 30, thickness: 0.6, height: 2.5, rotation: Math.PI / 2 - 0.4 };
    const r = runInto('demi', [tall], 60);
    expect(countEvents(r.log, 'climb')).toBe(0);
    const p = r.s.players[0];
    expect(p.pos.y).toBe(0);
    expect(Math.abs(p.pos.x)).toBeGreaterThan(2); // a glissé le long de la face
  });

  it('pas de tunneling : ni en esquive répétée, ni à très grande vitesse', () => {
    const z0 = 2;
    const thin = wallAcross(z0, 2.5, 0.1, 30);
    const limit = z0 - 0.05 - PLAYER_RADIUS + 1e-6;
    const s = soloMatch('ailier', [thin]);
    let maxZ = -Infinity;
    run(s, 120, (t) => only0({ moveY: 1, buttons: (t % 2 === 0 ? Buttons.DODGE : 0) | Buttons.SPRINT }), (st) => {
      maxZ = Math.max(maxZ, st.players[0].pos.z);
    });
    expect(maxZ).toBeLessThanOrEqual(limit);
    expect(maxZ).toBeGreaterThan(limit - 0.3); // il est bien allé contre le muret
    // Vitesse aberrante (90 m/s ≈ 3 m par tick) : toujours bloqué.
    const f = soloMatch('ailier', [thin]);
    f.players[0].vel = { x: 0, y: 0, z: 90 };
    step(f, {});
    expect(f.players[0].pos.z).toBeLessThanOrEqual(limit);
  });

  it('suit le relief d’une butte (monte puis redescend, reste au sol)', () => {
    const mound: TerrainFeature = { kind: 'mound', x: 0, z: 8, radius: 5, height: 1.2 };
    const r = runInto('demi', [mound], 60);
    expect(r.maxY).toBeGreaterThan(1.1);
    expect(countEvents(r.log, 'climb')).toBe(0);
    expect(r.s.players[0].pos.y).toBe(0);
  });

  it('tombe d’un rebord et atterrit (événement land)', () => {
    const s = soloMatch('demi', [platform(1)], 0, 8);
    s.players[0].pos.y = 1;
    const log: string[] = [];
    run(s, 30, () => only0({ moveY: 1 }), (st) => st.events.forEach((e) => log.push(e.type)));
    expect(countEvents(log, 'land')).toBe(1);
    expect(s.players[0].pos.y).toBe(0);
    expect(s.players[0].onGround).toBe(true);
  });
});

describe('arène et contacts', () => {
  it('murs invisibles : on reste dans le terrain, vitesse normale annulée', () => {
    const s = soloMatch('ailier');
    const hw = s.field.width / 2 - PLAYER_RADIUS;
    const hl = s.field.length / 2 - PLAYER_RADIUS;
    let ok = true;
    // moveX = -1 => +X (right(0) = -X) ; puis reculer vers -Z.
    run(s, 150, (t) => only0({ moveX: -1, buttons: (t % 3 === 0 ? Buttons.DODGE : 0) }), (st) => {
      ok &&= Math.abs(st.players[0].pos.x) <= hw + 1e-9;
    });
    expect(ok).toBe(true);
    expect(s.players[0].pos.x).toBeCloseTo(hw, 9);
    expect(s.players[0].vel.x).toBe(0);
    run(s, 400, () => only0({ moveY: -1, buttons: Buttons.SPRINT }));
    expect(s.players[0].pos.z).toBeCloseTo(-hl, 9);
    expect(s.players[0].vel.z).toBe(0);
  });

  it('séparation douce entre joueurs superposés, symétrique', () => {
    const s = soloMatch('demi');
    s.players[1].pos = { x: 0, y: 0, z: 0 };
    run(s, 30, () => ({}));
    const a = s.players[0].pos;
    const b = s.players[1].pos;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(PLAYER_SEPARATION - 1e-3);
    expect(a.x + b.x).toBeCloseTo(0, 9);
  });

  it('les joueurs plaqués (down / getting_up) ne bougent pas', () => {
    for (const status of ['down', 'getting_up'] as const) {
      const s = soloMatch('ailier');
      s.players[0].status = status;
      run(s, 20, () => only0({ moveY: 1, buttons: Buttons.JUMP | Buttons.DODGE }));
      expect(s.players[0].pos).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('phase figée : seule la visée s’applique ; fin du décompte => play', () => {
    const s = soloMatch('ailier');
    s.phase = 'kickoff';
    s.phaseTicks = 10;
    const log: string[] = [];
    run(s, 5, () => only0({ moveY: 1, yaw: 1, pitch: 5, buttons: Buttons.JUMP }), (st) => st.events.forEach((e) => log.push(e.type)));
    expect(s.players[0].pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.players[0].yaw).toBe(1);
    expect(s.players[0].pitch).toBeCloseTo((PITCH_MAX_DEG * Math.PI) / 180, 12);
    expect(log).not.toContain('jump');
    run(s, 5, () => only0({ yaw: 1 }), (st) => st.events.forEach((e) => log.push(e.type)));
    expect(s.phase).toBe('play');
    expect(log).toContain('play');
  });

  it('entrée manquante pendant un appui maintenu : pas de faux front montant (pas de double saut)', () => {
    const s = soloMatch('ailier');
    const jumps: boolean[] = [];
    run(
      s,
      15,
      (t) => (t === 6 ? {} : only0({ moveY: 1, buttons: t >= 3 ? Buttons.JUMP : 0 })),
      (st) => st.events.forEach((e) => {
        if (e.type === 'jump') jumps.push(e.air);
      }),
    );
    expect(jumps).toEqual([false]);
  });

  it('entrée manquante : entrée neutre qui conserve l’orientation', () => {
    const s = soloMatch('ailier');
    run(s, 10, () => only0({ moveY: 1, yaw: 1.2, pitch: 0.3 }));
    run(s, 20, () => ({}));
    expect(s.players[0].yaw).toBe(1.2);
    expect(s.players[0].pitch).toBe(0.3);
    expect(hSpeed(s.players[0].vel)).toBe(0);
  });
});
