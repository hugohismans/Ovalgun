/**
 * Outils communs aux tests de simulation (pas un fichier de test : non collecté par vitest).
 */
import {
  ALL_BUTTONS,
  Buttons,
  createMatch,
  makeInput,
  rand,
  seedToInt,
  type RngHolder,
  step,
  type InputFrame,
  type MatchState,
  type PlayerInput,
  type Role,
  type TeamSize,
  type TerrainFeature,
} from '../../src/sim';

export const ROLES_5: [Role[], Role[]] = [
  ['pilier', 'ailier', 'demi', 'ailier', 'pilier'],
  ['demi', 'pilier', 'ailier', 'demi', 'ailier'],
];
export const ROLES_3: [Role[], Role[]] = [
  ['pilier', 'ailier', 'demi'],
  ['ailier', 'demi', 'pilier'],
];

export function newMatch(teamSize: TeamSize = 5, seed = 1): MatchState {
  return createMatch({ teamSize, seed, roles: teamSize === 3 ? ROLES_3 : ROLES_5 });
}

/**
 * Match 5v5 pour tester UN joueur : le joueur 0 a le rôle demandé, est placé en (x, z) au sol
 * (terrain remplacé par `features`, plat par défaut) ; les autres sont rangés au fond du terrain,
 * espacés, et le ballon est posé dans un coin. Rien ne gêne donc le joueur 0.
 */
export function soloMatch(role: Role, features: TerrainFeature[] = [], x = 0, z = 0, yaw = 0): MatchState {
  const roles: [Role[], Role[]] = [
    [role, 'demi', 'demi', 'demi', 'demi'],
    ['demi', 'demi', 'demi', 'demi', 'demi'],
  ];
  const s = createMatch({ teamSize: 5, seed: 7, roles });
  s.field.features = features;
  const backZ = s.field.length / 2 - 1.5;
  for (const p of s.players) {
    if (p.id === 0) continue;
    p.pos = { x: -20 + p.id * 3, y: 0, z: backZ };
    p.vel = { x: 0, y: 0, z: 0 };
  }
  const p0 = s.players[0];
  p0.pos = { x, y: 0, z };
  p0.yaw = yaw;
  s.ball.pos = { x: s.field.width / 2 - 1, y: 0.12, z: -s.field.length / 2 + 1 };
  s.ball.vel = { x: 0, y: 0, z: 0 };
  return s;
}

/** Entrées du joueur 0 seulement (les autres reçoivent l'entrée neutre implicite). */
export const only0 = (inp: Partial<PlayerInput>): InputFrame => ({ 0: makeInput(inp) });

/** Simule `ticks` ticks avec une fonction d'entrées (tick relatif 0..ticks-1) ; `onTick` après chaque step. */
export function run(
  s: MatchState,
  ticks: number,
  inputs: (t: number) => InputFrame,
  onTick?: (s: MatchState, t: number) => void,
): MatchState {
  for (let t = 0; t < ticks; t++) {
    step(s, inputs(t));
    onTick?.(s, t);
  }
  return s;
}

export const hSpeed = (v: { x: number; z: number }): number => Math.sqrt(v.x * v.x + v.z * v.z);

/**
 * Parcourt récursivement une valeur et renvoie les chemins des valeurs interdites (undefined, NaN,
 * ±Infinity, non-JSON). `rejectNegZero` : signale aussi les -0 (qui deviennent 0 après un aller-retour
 * JSON) — utile pour l'état statique créé par createMatch.
 */
export function findBadValues(value: unknown, path = 'state', out: string[] = [], rejectNegZero = false): string[] {
  if (value === undefined) out.push(`${path} = undefined`);
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} = ${value}`);
    else if (rejectNegZero && Object.is(value, -0)) out.push(`${path} = -0`);
  } else if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    out.push(`${path} : type ${typeof value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findBadValues(v, `${path}[${i}]`, out, rejectNegZero));
  } else if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) out.push(`${path} : instance non JSON`);
    for (const [k, v] of Object.entries(value)) findBadValues(v, `${path}.${k}`, out, rejectNegZero);
  }
  return out;
}


/**
 * Entrées scriptées pseudo-aléatoires (PRNG de test seedé, indépendant de la sim) pour `nPlayers`
 * joueurs sur `ticks` ticks : déplacements (y compris analogiques et hors bornes), rotations, tous les
 * boutons (bascule aléatoire de chaque bit), entrées manquantes et quelques entrées corrompues (NaN).
 */
export function scriptedInputs(seed: number, nPlayers: number, ticks: number): InputFrame[] {
  const h: RngHolder = { rng: seedToInt(seed ^ 0x5eed) };
  const frames: InputFrame[] = [];
  const st = Array.from({ length: nPlayers }, (_, i) => ({ yaw: i < nPlayers / 2 ? 0 : Math.PI, mx: 0, my: 1, buttons: 0 }));
  const bits = Object.values(Buttons);
  for (let t = 0; t < ticks; t++) {
    const frame: Record<number, PlayerInput | undefined> = {};
    for (let id = 0; id < nPlayers; id++) {
      const p = st[id];
      if (rand(h) < 0.06) {
        p.mx = rand(h) * 2.4 - 1.2;
        p.my = rand(h) * 2.4 - 1.2;
      }
      p.yaw += (rand(h) - 0.5) * 0.3;
      for (const b of bits) {
        const prob = b === Buttons.SPRINT || b === Buttons.AIM || b === Buttons.FIRE ? 0.04 : 0.12;
        if (rand(h) < prob) p.buttons ^= b;
      }
      p.buttons &= ALL_BUTTONS;
      const r = rand(h);
      if (r < 0.02) continue; // entrée manquante
      frame[id] =
        r < 0.025
          ? { moveX: Number.NaN, moveY: Infinity, yaw: Number.NaN, pitch: -Infinity, buttons: 0.5 } // entrée corrompue
          : { moveX: p.mx, moveY: p.my, yaw: p.yaw, pitch: (rand(h) - 0.5) * 4, buttons: p.buttons };
    }
    frames.push(frame);
  }
  return frames;
}

/** Interventions scriptées identiques dans toutes les exécutions : un porteur forcé puis un lâcher. */
export function scriptedEvents(s: MatchState, t: number): void {
  if (t === 600) {
    s.ball.mode = 'carried';
    s.ball.carrierId = 1;
  } else if (t === 900) {
    s.ball.mode = 'loose';
    s.ball.carrierId = -1;
    s.ball.vel = { x: 3, y: 6, z: -5 };
  } else if (t === 1200) {
    s.ball.mode = 'kick';
    s.ball.vel = { x: -4, y: 12, z: 18 };
  }
}
