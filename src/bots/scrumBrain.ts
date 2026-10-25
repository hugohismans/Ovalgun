/**
 * Mêlée vue par les bots (étape 7) : approche d'une mêlée probable et zone de capture. PUR vis-à-vis de l'état (il n'est
 * que lu) ; seule la décision du bot (mémoire) est écrite. Voir docs/ARCHITECTURE.md §14 et src/sim/scrum.ts.
 *
 * Même principe que tactics.ts : chaque bot calcule la répartition de toute son équipe (bots seulement, id croissant pour
 * les égalités) et prend sa part.
 *
 *  - APPROCHE (`scrumApproaching`) : ballon libre depuis BOT_SCRUM_APPROACH_SEC avec un adversaire près du ballon
 *    (hystérésis BOT_ROLE_HYSTERESIS_M à la sortie). Le début et la fin de l'approche, ballon toujours libre,
 *    déclenchent une décision de toute l'équipe au même tick (bot.ts, `scrumAlert`) ; un ballon ramassé passe par la
 *    perception normale (temps de réaction).
 *      * Mêlée possible et pas défavorable (`shouldHoldZone` : au moins N joueurs de chaque camp peuvent être dans la
 *        zone au déclenchement, et au moins autant de joueurs que l'adversaire) : l'équipe TIENT la zone — ses entrants
 *        se placent autour du ballon hors du cercle de ramassage (BALL_PICKUP_RADIUS + BOT_SCRUM_HOLD_MARGIN) et tirent
 *        sur l'adversaire qui va ramasser le ballon ; personne ne court au ballon (le porteur serait la cible de tous :
 *        la mêlée se joue au décompte). Si la mêlée ne se déclenche pas (SCRUM_LOOSE_SEC + BOT_SCRUM_HOLD_GRACE_SEC),
 *        on ramasse.
 *      * Sinon : les chasseurs vont au ballon comme d'habitude et des entrants rejoignent la zone pour peser sur le
 *        décompte si la mêlée se déclenche.
 *  - CAPTURE (`decideScrum`) : l'équipe envoie dans la zone de quoi avoir une « majorité confortable » ; les entrants
 *    visent un point à BOT_SCRUM_INNER_FRACTION du rayon, de leur côté (répartis autour du ballon), et tirent sur
 *    l'adversaire de la zone le plus proche (un plaqué ne compte plus : c'est la façon de renverser le décompte). Les
 *    autres se placent pour la suite : en soutien derrière la zone (dans le cône de passe du futur porteur) si leur équipe
 *    mène, sinon en défense entre la zone et leur en-but (BOT_SCRUM_COVER_DEPTH) ; ils tirent aussi sur un adversaire de
 *    la zone à portée.
 *  - « Majorité confortable » (`zoneEntrants`) : décompte adverse = adversaires actifs à moins de rayon +
 *    BOT_SCRUM_THREAT_MARGIN du centre (dedans, ou sur le point d'y entrer) ; l'équipe envoie au plus (décompte adverse +
 *    BOT_SCRUM_LEAD_MARGIN) joueurs, joueurs déjà comptés (chasseurs du ballon pendant l'approche, coéquipiers humains
 *    dans la zone) déduits ; les plus rapides à y entrer d'abord (hystérésis BOT_ROLE_HYSTERESIS_M pour qui y était
 *    déjà), seulement ceux qui peuvent y entrer à temps (BOT_SCRUM_REACH_SLACK_SEC ; en approche, à moins de
 *    BOT_SCRUM_JOIN_DIST × échelle du ballon).
 *  - À la résolution, la situation perçue change (ballon porté) : décision normale (attaque / défense).
 */

import {
  attackDir,
  BALL_PICKUP_RADIUS,
  BOT_ROLE_HYSTERESIS_M,
  BOT_SCRUM_APPROACH_SEC,
  BOT_SCRUM_COVER_DEPTH,
  BOT_SCRUM_HOLD_GRACE_SEC,
  BOT_SCRUM_HOLD_MARGIN,
  BOT_SCRUM_INNER_FRACTION,
  BOT_SCRUM_JOIN_DIST,
  BOT_SCRUM_LEAD_MARGIN,
  BOT_SCRUM_REACH_SLACK_SEC,
  BOT_SCRUM_SUPPORTERS,
  BOT_SCRUM_THREAT_MARGIN,
  BOT_SPACE_AHEAD,
  BOT_SUPPORT_DEPTH,
  BOT_SUPPORT_LATERAL,
  opponentTeam,
  ROLES,
  SCRUM_CAPTURE_SEC,
  SCRUM_LOOSE_SEC,
  scrumMinPlayers,
  scrumRadius,
  scrumTicksLeft,
  secToTicks,
  shieldFacing,
  ticksToSec,
  type MatchState,
  type PlayerState,
  type ScrumState,
} from '../sim';
import type { BotMemory, Decision, TacticalRole } from './memory';
import { botsOf, clampToField, dist2, engageRange, minEngageRange, type Point } from './world';

/** Distance horizontale d'un joueur au point (x, z). */
const distTo = (p: PlayerState, x: number, z: number): number => Math.sqrt(dist2(p.pos.x, p.pos.z, x, z));

/** Écrit rôle, point visé, sprint et cible (le reste remis à son état « course »). */
function setScrumRole(d: Decision, role: TacticalRole, goal: Point, sprint: boolean, shootId: number): void {
  d.role = role;
  d.goalX = goal.x;
  d.goalZ = goal.z;
  d.dirX = 0;
  d.dirZ = 0;
  d.sprint = sprint;
  d.shootId = shootId;
  d.markId = -1;
  d.plan = 'run';
  d.planTargetId = -1;
  d.planTicks = 0;
  d.pathClear = false;
}

/**
 * Cible de tir dans la zone (PURE) : un adversaire actif dans le disque (cx, cz, r), à portée (et au-delà de la distance
 * minimale du lance-grenades), dont le bouclier ne fait pas face à `me` — le plus proche de `me` (capture : le plus
 * facile à plaquer), ou le plus proche du centre si `nearCenter` (approche : celui qui va ramasser le ballon) ; −1 sinon.
 */
export function scrumTarget(
  state: Readonly<MatchState>,
  mem: BotMemory,
  me: PlayerState,
  cx: number,
  cz: number,
  r: number,
  nearCenter = false,
): number {
  const range = engageRange(me, mem.difficulty);
  const minR = minEngageRange(me);
  let best = -1;
  let bestD = Infinity;
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active') continue;
    const dc2 = dist2(o.pos.x, o.pos.z, cx, cz);
    if (dc2 > r * r) continue;
    const d = distTo(me, o.pos.x, o.pos.z);
    if (d > range || d < minR || shieldFacing(o, me.pos.x, me.pos.z)) continue;
    const key = nearCenter ? dc2 : d;
    if (key < bestD) {
      bestD = key;
      best = o.id;
    }
  }
  return best;
}

/**
 * Approche d'une mêlée probable (PURE) : ballon libre depuis BOT_SCRUM_APPROACH_SEC et au moins un adversaire de `me`
 * à moins de rayon + BOT_SCRUM_THREAT_MARGIN du point (x, z) du ballon. `wasApproaching` (approche vue au tick
 * précédent) : hystérésis — l'adversaire doit s'éloigner de BOT_ROLE_HYSTERESIS_M de plus pour que l'approche cesse
 * (un adversaire qui rôde sur le bord ne fait plus basculer l'alerte, et donc re-décider toute l'équipe, à chaque tick).
 */
export function scrumApproaching(state: Readonly<MatchState>, me: PlayerState, x: number, z: number, wasApproaching = false): boolean {
  const b = state.ball;
  if (b.mode !== 'loose' || b.looseTicks < secToTicks(BOT_SCRUM_APPROACH_SEC)) return false;
  const reach = scrumRadius(state) + BOT_SCRUM_THREAT_MARGIN + (wasApproaching ? BOT_ROLE_HYSTERESIS_M : 0);
  const opp = opponentTeam(me.team);
  return state.players.some((o) => o.team === opp && o.status === 'active' && dist2(o.pos.x, o.pos.z, x, z) <= reach * reach);
}

/** Paramètres de la répartition autour d'une zone. */
interface ZoneContext {
  cx: number;
  cz: number;
  r: number;
  /** Temps restant (s) pour entrer dans la zone utilement. */
  secLeft: number;
  /** Bots de l'équipe déjà comptés dans la zone sans être répartis ici (chasseurs du ballon pendant l'approche). */
  preassigned: readonly number[];
  /** Distance max (m) au centre pour être candidat (approche), Infinity sinon. */
  joinDist: number;
  /** Approche d'une mêlée probable (ballon encore libre), sinon mêlée en cours. */
  approach: boolean;
  /** Distance minimale (m) du point visé au centre : hors du cercle de ramassage quand on « tient » la zone (approche), 0 sinon. */
  holdRadius: number;
}

/**
 * Bots de l'équipe de `me` envoyés dans la zone (ids), selon la règle de la majorité confortable (voir l'en-tête). PURE.
 */
function zoneEntrants(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, z: ZoneContext): PlayerState[] {
  const opp = opponentTeam(me.team);
  const threat = z.r + BOT_SCRUM_THREAT_MARGIN;
  let oppNear = 0;
  let externIn = 0;
  for (const p of state.players) {
    if (p.status !== 'active') continue;
    const d2 = dist2(p.pos.x, p.pos.z, z.cx, z.cz);
    if (p.team === opp && d2 <= threat * threat) oppNear++;
    if (p.team === me.team && mem.externalIds.includes(p.id) && d2 <= z.r * z.r) externIn++;
  }
  const needed = Math.max(0, oppNear + BOT_SCRUM_LEAD_MARGIN - externIn - z.preassigned.length);
  if (needed === 0) return [];
  const key = (p: PlayerState): number => {
    const bonus = p.id === mem.playerId && mem.decision.role === 'scrum' ? BOT_ROLE_HYSTERESIS_M : 0;
    return Math.max(0, distTo(p, z.cx, z.cz) - z.r - bonus) / ROLES[p.role].runSpeed;
  };
  const cands = botsOf(state, mem.externalIds, me.team).filter(
    (p) => !z.preassigned.includes(p.id) && distTo(p, z.cx, z.cz) <= z.joinDist && key(p) <= z.secLeft + BOT_SCRUM_REACH_SLACK_SEC,
  );
  cands.sort((a, b) => key(a) - key(b) || a.id - b.id);
  return cands.slice(0, needed);
}

/** Point visé dans la zone pour `me` : à BOT_SCRUM_INNER_FRACTION du rayon depuis le centre, de son côté. */
function innerPoint(state: Readonly<MatchState>, me: PlayerState, z: ZoneContext): Point {
  let ux = me.pos.x - z.cx;
  let uz = me.pos.z - z.cz;
  const l = Math.sqrt(ux * ux + uz * uz);
  if (l > 1e-6) {
    ux /= l;
    uz /= l;
  } else {
    ux = 0;
    uz = -attackDir(me.team); // pile au centre : côté de notre en-but
  }
  const k = Math.max(z.r * BOT_SCRUM_INNER_FRACTION, z.holdRadius);
  return clampToField(state, z.cx + ux * k, z.cz + uz * k);
}

/** Entre dans la zone si `me` fait partie des entrants ; renvoie vrai si la décision est prise. */
function tryEnter(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, z: ZoneContext): boolean {
  const entrants = zoneEntrants(mem, state, me, z);
  if (!entrants.includes(me)) return false;
  const goal = innerPoint(state, me, z);
  const far = distTo(me, goal.x, goal.z) > z.r;
  // Approche : on vise celui qui va ramasser le ballon (dans la zone ou sur le point d'y entrer) ; capture : l'adversaire
  // de la zone le plus proche.
  const shootId = z.approach
    ? scrumTarget(state, mem, me, z.cx, z.cz, z.r + BOT_SCRUM_THREAT_MARGIN, true)
    : scrumTarget(state, mem, me, z.cx, z.cz, z.r);
  setScrumRole(mem.decision, 'scrum', goal, far, shootId);
  return true;
}

/**
 * Approche d'une mêlée (ballon libre depuis longtemps, adversaires autour) : `me` rejoint la zone autour du ballon (x, z)
 * s'il fait partie des entrants. `chasers` : bots de son équipe qui vont au ballon (déjà comptés ; vide quand l'équipe
 * tient la zone). `hold` : l'équipe tient la zone (point visé hors du cercle de ramassage). Renvoie faux si `me` n'entre
 * pas (il chasse ou garde la forme d'équipe, tactics.ts).
 */
export function decideScrumApproach(
  mem: BotMemory,
  state: Readonly<MatchState>,
  me: PlayerState,
  x: number,
  z: number,
  chasers: readonly number[],
  hold: boolean,
): boolean {
  const left = Math.max(0, secToTicks(SCRUM_LOOSE_SEC) - state.ball.looseTicks);
  const ctx: ZoneContext = {
    cx: x,
    cz: z,
    r: scrumRadius(state),
    secLeft: ticksToSec(left) + SCRUM_CAPTURE_SEC,
    preassigned: chasers,
    joinDist: BOT_SCRUM_JOIN_DIST * state.field.scale,
    approach: true,
    holdRadius: hold ? BALL_PICKUP_RADIUS + BOT_SCRUM_HOLD_MARGIN : 0,
  };
  return tryEnter(mem, state, me, ctx);
}

/**
 * Tenir la zone plutôt que ramasser le ballon (PURE) ? Vrai quand une mêlée est possible ET pas défavorable : au moins
 * `scrumMinPlayers` joueurs actifs de chaque équipe peuvent être dans la zone autour du ballon (x, z) au déclenchement
 * (temps de course jusqu'au bord ≤ temps restant + BOT_SCRUM_REACH_SLACK_SEC), l'équipe de `me` au moins aussi nombreuse
 * que l'adversaire (à égalité, les deux équipes tiennent) et le ballon libre depuis au plus SCRUM_LOOSE_SEC +
 * BOT_SCRUM_HOLD_GRACE_SEC (si la mêlée ne s'est pas déclenchée, on ramasse). Humains compris dans les décomptes.
 */
export function shouldHoldZone(state: Readonly<MatchState>, me: PlayerState, x: number, z: number): boolean {
  const looseTicks = state.ball.looseTicks;
  if (looseTicks > secToTicks(SCRUM_LOOSE_SEC + BOT_SCRUM_HOLD_GRACE_SEC)) return false;
  // Joueurs actifs qui peuvent être dans la zone au moment du déclenchement (temps de course jusqu'au bord).
  const r = scrumRadius(state);
  const sec = ticksToSec(Math.max(0, secToTicks(SCRUM_LOOSE_SEC) - looseTicks)) + BOT_SCRUM_REACH_SLACK_SEC;
  const c: [number, number] = [0, 0];
  for (const p of state.players) {
    if (p.status !== 'active') continue;
    if (Math.max(0, distTo(p, x, z) - r) <= ROLES[p.role].runSpeed * sec) c[p.team]++;
  }
  const ours = c[me.team];
  const theirs = c[opponentTeam(me.team)];
  const n = scrumMinPlayers(state);
  return ours >= n && theirs >= n && ours >= theirs;
}

/**
 * Mêlée en cours : `me` entre dans la zone (majorité confortable) ou se place pour la suite (soutien si son équipe
 * mène, défense sinon), en tirant sur les adversaires de la zone à portée.
 */
export function decideScrum(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, scrum: Readonly<ScrumState>): void {
  const ctx: ZoneContext = {
    cx: scrum.center.x,
    cz: scrum.center.z,
    r: scrum.radius,
    secLeft: ticksToSec(scrumTicksLeft(scrum)),
    preassigned: [],
    joinDist: Infinity,
    approach: false,
    holdRadius: 0,
  };
  if (tryEnter(mem, state, me, ctx)) return;
  // Placement pour la suite, réparti de gauche à droite parmi les bots qui n'entrent pas.
  const entrants = zoneEntrants(mem, state, me, ctx);
  const others = botsOf(state, mem.externalIds, me.team)
    .filter((p) => !entrants.includes(p))
    .sort((a, b) => a.pos.x - b.pos.x || a.id - b.id);
  const k = others.indexOf(me);
  const n = others.length;
  const dir = attackDir(me.team);
  const scale = state.field.scale;
  const shootId = scrumTarget(state, mem, me, ctx.cx, ctx.cz, ctx.r);
  const leading = scrum.counts[me.team] > scrum.counts[opponentTeam(me.team)];
  let goal: Point;
  let role: TacticalRole;
  if (leading) {
    // Soutien derrière la zone (cône de passe du futur porteur), de part et d'autre ; au-delà de BOT_SCRUM_SUPPORTERS,
    // l'espace devant.
    if (k < BOT_SCRUM_SUPPORTERS) {
      const side = n === 1 ? (ctx.cx > 0 ? -1 : 1) : k === 0 ? -1 : 1;
      goal = clampToField(state, ctx.cx + side * BOT_SUPPORT_LATERAL * scale, ctx.cz - dir * (ctx.r + BOT_SUPPORT_DEPTH));
      role = 'support';
    } else {
      const side = k % 2 === 0 ? -1 : 1;
      goal = clampToField(state, ctx.cx + side * BOT_SUPPORT_LATERAL * scale, ctx.cz + dir * BOT_SPACE_AHEAD * scale);
      role = 'space';
    }
  } else {
    // Défense entre la zone et notre en-but, étalée en largeur.
    const off = (k - (n - 1) / 2) * BOT_SUPPORT_LATERAL * scale;
    goal = clampToField(state, ctx.cx + off, ctx.cz - dir * BOT_SCRUM_COVER_DEPTH * scale);
    role = 'cover';
  }
  setScrumRole(mem.decision, role, goal, distTo(me, goal.x, goal.z) > BOT_SUPPORT_DEPTH, shootId);
}
