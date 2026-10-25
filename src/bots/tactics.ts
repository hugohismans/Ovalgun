/**
 * Décision tactique d'un bot (étape 6) : rôle, point visé, cible de tir, recalculés à chaque décision à partir de la
 * situation PERÇUE (memory.seen, temps de réaction compris) et des positions lues en direct.
 *
 * Chaque bot calcule la répartition de TOUTE son équipe avec les mêmes règles déterministes (id croissant pour les
 * égalités) puis prend sa propre part : pas de communication entre bots, et pourtant pas de doublon (à la perception
 * près : deux bots qui ne perçoivent pas encore la même situation peuvent brièvement se contredire, comme des humains ;
 * et à l'hystérésis près : chacun ne connaît que son propre rôle précédent, un rôle peut être brièvement doublé).
 * La répartition se fait entre BOTS seulement (botsOf) : les joueurs externes (humains, memory.externalIds) ne suivent
 * pas ces règles, aucun rôle ne compte sur eux.
 *
 *  - ATTAQUE (son équipe a le ballon, ou une passe de son équipe est en vol) :
 *      porteur -> carrierBrain ; receveur d'une passe en vol -> va au point de réception (predictPassCatch), juste à temps ;
 *      les BOT_SUPPORTERS_* plus en retrait -> soutien derrière le porteur, couloirs latéraux décalés, dans son cône de
 *      passe ; les autres -> espace devant (ouvrent la défense, tirent sur les défenseurs qui menacent le porteur).
 *  - DÉFENSE : un dernier défenseur (cover) reste entre le porteur et notre en-but (dès BOT_COVER_MIN_DEFENDERS bots ;
 *      sinon seulement si personne n'est devant le porteur) ; les BOT_PRESSERS_* plus proches du porteur convergent et lui
 *      tirent dessus ; les autres marquent les receveurs les plus dangereux (dans le cône de passe, démarqués, proches de
 *      notre en-but) en se plaçant entre eux et notre en-but.
 *  - BALLON LIBRE / COUP DE PIED : les BOT_BALL_CHASERS_* plus proches (en temps de course) de chaque équipe vont au
 *      point de chute prédit (ballLandingPoint) ; les autres gardent une forme d'équipe (rideau entre le ballon et leur
 *      en-but, ou en soutien devant s'ils viennent de taper) ; on tire sur les adversaires qui vont au ballon.
 *  - MÊLÉE (étape 7, scrumBrain.ts) : en approche (ballon libre depuis BOT_SCRUM_APPROACH_SEC, adversaires autour), les
 *      non-chasseurs rejoignent la zone autour du ballon ; pendant la capture, l'équipe envoie dans la zone de quoi avoir
 *      une majorité confortable et tire sur les adversaires qui y sont, les autres se placent pour la suite.
 *  - Phase figée (coup d'envoi, essai, fin) : idle.
 */

import {
  attackDir,
  ballLandingPoint,
  BOT_BALL_CHASERS_3V3,
  BOT_BALL_CHASERS_5V5,
  BOT_CHASE_OVERSHOOT,
  BOT_CHASE_ROLL_LEAD_SEC,
  BOT_CHASE_SHOOT_MARGIN_SEC,
  BOT_COVER_DEPTH,
  BOT_COVER_LINE_FRACTION,
  BOT_COVER_MIN_DEFENDERS,
  BOT_COVER_X_FRACTION,
  BOT_DANGER_CONE_WEIGHT,
  BOT_DANGER_LINE_WEIGHT,
  BOT_DANGER_OPEN_DIST,
  BOT_DANGER_OPEN_WEIGHT,
  BOT_ESCORT_THREAT_DIST,
  BOT_GRENADE_STANDOFF,
  BOT_LEAD_SPEED_CAP_MULT,
  BOT_MARK_CARRIER_SHIFT,
  BOT_MARK_DANGER_STICKY,
  BOT_MARK_GOALSIDE,
  BOT_MARK_HYSTERESIS_M,
  BOT_MARK_SHOOT_CARRIER_DIST,
  BOT_OWN_THIRD_FRACTION,
  BOT_PRESS_LEAD_SEC,
  BOT_PRESSERS_3V3,
  BOT_PRESSERS_5V5,
  BOT_PRESSERS_OWN_THIRD,
  BOT_ROLE_HYSTERESIS_M,
  BOT_SHAPE_DEPTH,
  BOT_SHAPE_OWN_KICK_DEPTH_FRACTION,
  BOT_SHAPE_SINGLE_X_FRACTION,
  BOT_SHAPE_WIDTH_FRACTION,
  BOT_SPACE_AHEAD,
  BOT_SPACE_LATERAL,
  BOT_SUPPORT_DEPTH,
  BOT_SUPPORT_LATERAL,
  BOT_SUPPORT_LEAD_SEC,
  BOT_SUPPORT_TOUCH_MARGIN,
  BOT_SUPPORTERS_3V3,
  BOT_SUPPORTERS_5V5,
  distanceToTryLine,
  opponentTeam,
  predictPassCatch,
  ROLES,
  type MatchState,
  type PlayerState,
  type TeamId,
} from '../sim';
import { planCarrier } from './carrierBrain';
import { decideScrum, decideScrumApproach, scrumApproaching, shouldHoldZone } from './scrumBrain';
import type { BotMemory, Decision, Situation, TacticalRole } from './memory';
import {
  activeOf,
  botsOf,
  cappedVelocity,
  CHASE_WALL_MARGIN,
  clampToField,
  dist2,
  engageRange,
  perceivedFocus,
  playerDist,
  timeTo,
  type Point,
} from './world';

/** Nombre de soutiens / défenseurs qui pressent / chasseurs de ballon selon la taille d'équipe. */
const supportersFor = (state: Readonly<MatchState>): number => (state.config.teamSize === 3 ? BOT_SUPPORTERS_3V3 : BOT_SUPPORTERS_5V5);
const pressersFor = (state: Readonly<MatchState>): number => (state.config.teamSize === 3 ? BOT_PRESSERS_3V3 : BOT_PRESSERS_5V5);
const chasersFor = (state: Readonly<MatchState>): number => (state.config.teamSize === 3 ? BOT_BALL_CHASERS_3V3 : BOT_BALL_CHASERS_5V5);

/** Écrit rôle, point visé, sprint et cible dans la décision (le reste remis à son état « course »). */
function setRole(d: Decision, role: TacticalRole, goal: Point, sprint: boolean, shootId: number, markId = -1): void {
  d.role = role;
  d.goalX = goal.x;
  d.goalZ = goal.z;
  d.dirX = 0;
  d.dirZ = 0;
  d.sprint = sprint;
  d.shootId = shootId;
  d.markId = markId;
  d.plan = 'run';
  d.planTargetId = -1;
  d.planTicks = 0;
  d.pathClear = false;
}

/**
 * Hystérésis de rôle : distance (m) retranchée au classement du bot `p` s'il tenait déjà `role` (BOT_ROLE_HYSTERESIS_M).
 * Le bot ne connaît que SON rôle précédent : les autres sont classés sans bonus (au pire, un rôle brièvement doublé).
 */
const roleBonus = (mem: BotMemory, p: PlayerState, role: TacticalRole): number =>
  p.id === mem.playerId && mem.decision.role === role ? BOT_ROLE_HYSTERESIS_M : 0;

/** Position anticipée de `f` dans `sec` s, vitesse plafonnée (BOT_LEAD_SPEED_CAP_MULT × runSpeed : pas d'esquive suivie). */
function leadPoint(f: PlayerState, sec: number): Point {
  const v = cappedVelocity(f, ROLES[f.role].runSpeed * BOT_LEAD_SPEED_CAP_MULT);
  return { x: f.pos.x + v.x * sec, z: f.pos.z + v.z * sec };
}

/** Adversaire actif de `me` le plus proche du point (x, z), à moins de `maxDist` de ce point et à portée de `me` (−1 : aucun). */
function threatNear(state: Readonly<MatchState>, me: PlayerState, range: number, x: number, z: number, maxDist: number): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  const r2 = range * range;
  for (const o of state.players) {
    if (o.team === me.team || o.status !== 'active') continue;
    if (dist2(o.pos.x, o.pos.z, me.pos.x, me.pos.z) > r2) continue;
    const d = dist2(o.pos.x, o.pos.z, x, z);
    if (d <= bestD) {
      bestD = d;
      best = o.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Attaque sans ballon
// ---------------------------------------------------------------------------

/**
 * Soutien ou espace pour `me`, coéquipier du porteur (ou du receveur) `focus`. Les BOT_SUPPORTERS_* BOTS les plus en
 * retrait (par rapport au porteur) soutiennent, de part et d'autre (rangés par x) ; s'il n'y en a qu'un, il se met du
 * côté le plus large (vers le centre du terrain). Les autres cherchent l'espace devant, côté opposé. Discipline de tir :
 * seulement sur un défenseur à moins de BOT_ESCORT_THREAT_DIST du porteur (protection), sinon on court sans tirer.
 */
function decideAttack(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, focus: PlayerState): void {
  const d = mem.decision;
  const dir = attackDir(me.team);
  const scale = state.field.scale;
  const mates = botsOf(state, mem.externalIds, me.team, focus.id);
  // Plus en retrait d'abord (égalité : id).
  const behind = mates.slice();
  behind.sort((a, b) => {
    const da = (a.pos.z - focus.pos.z) * dir;
    const db = (b.pos.z - focus.pos.z) * dir;
    return da - db || a.id - b.id;
  });
  const nSup = Math.min(supportersFor(state), behind.length);
  const supporters = behind.slice(0, nSup).sort((a, b) => a.pos.x - b.pos.x || a.id - b.id);
  const space = behind.slice(nSup).sort((a, b) => a.pos.x - b.pos.x || a.id - b.id);
  const range = engageRange(me, mem.difficulty);
  const shootId = threatNear(state, me, range, focus.pos.x, focus.pos.z, BOT_ESCORT_THREAT_DIST);
  const fl = leadPoint(focus, BOT_SUPPORT_LEAD_SEC);
  // Côté « large » : vers le centre du terrain (là où il y a de la place pour un soutien seul).
  const wide = focus.pos.x > 0 ? -1 : 1;
  const si = supporters.indexOf(me);
  if (si >= 0) {
    const side = supporters.length === 1 ? wide : si === 0 ? -1 : 1;
    let gx = fl.x + side * BOT_SUPPORT_LATERAL * scale;
    const halfW = state.field.width / 2;
    if (Math.abs(gx) > halfW - BOT_SUPPORT_TOUCH_MARGIN) gx = fl.x - side * BOT_SUPPORT_LATERAL * scale; // pas de place : l'autre côté
    const goal = clampToField(state, gx, fl.z - dir * BOT_SUPPORT_DEPTH);
    setRole(d, 'support', goal, playerDistTo(me, goal) > BOT_SUPPORT_DEPTH, shootId);
    return;
  }
  const k = space.indexOf(me);
  const n = space.length;
  // Un seul coureur d'espace : côté opposé au soutien seul ; plusieurs : répartis de gauche à droite.
  const side = n <= 1 ? -wide : k < n / 2 ? -1 : 1;
  const goal = clampToField(state, fl.x + side * BOT_SPACE_LATERAL * scale, fl.z + dir * BOT_SPACE_AHEAD * scale);
  setRole(d, 'space', goal, true, shootId);
}

/**
 * Point visé pour presser le porteur au point anticipé `lp` : le point lui-même, sauf pour le demi (lance-grenades) qui
 * s'arrête à BOT_GRENADE_STANDOFF du porteur, de son côté (portée utile, hors de son propre souffle).
 */
function standoff(state: Readonly<MatchState>, me: PlayerState, lp: Point): Point {
  if (ROLES[me.role].weapon.projectile !== 'grenade') return clampToField(state, lp.x, lp.z);
  const vx = me.pos.x - lp.x;
  const vz = me.pos.z - lp.z;
  const l = Math.sqrt(vx * vx + vz * vz);
  if (l <= BOT_GRENADE_STANDOFF || l < 1e-6) return clampToField(state, me.pos.x, me.pos.z);
  return clampToField(state, lp.x + (vx / l) * BOT_GRENADE_STANDOFF, lp.z + (vz / l) * BOT_GRENADE_STANDOFF);
}

/** Distance horizontale d'un joueur à un point. */
const playerDistTo = (p: PlayerState, g: Point): number => Math.sqrt(dist2(p.pos.x, p.pos.z, g.x, g.z));

/**
 * Receveur d'une passe en vol : il va au point de réception RÉEL (predictPassCatch : là où le ballon redescend à
 * hauteur des mains), que le pilotage rejoint juste à temps à chaque tick (steering.ts, steerReceive). Passe finale :
 * avant, il « gardait sa ligne » (direction de sa dernière entrée, à pleine vitesse) alors que la passe vise sa course
 * anticipée d'après sa VITESSE ; un soutien qui ralentissait pour arriver à son poste repartait à fond et dépassait le
 * ballon (10 à 15 % des passes au sol, celles de l'humain vers un bot comprises).
 */
function decideReceive(mem: BotMemory, state: Readonly<MatchState>): void {
  const b = state.ball;
  const c = b.mode === 'pass' ? predictPassCatch(state.field, b.pos, b.vel) : ballLandingPoint(state);
  setRole(mem.decision, 'receive', clampToField(state, c.x, c.z), false, -1);
}

// ---------------------------------------------------------------------------
// Défense
// ---------------------------------------------------------------------------

/**
 * Danger d'un receveur potentiel `r` (coéquipier du porteur `f`), pour l'équipe `defTeam` :
 * BOT_DANGER_CONE_WEIGHT si r est dans le cône de passe arrière du porteur, + BOT_DANGER_OPEN_WEIGHT × démarquage
 * (distance au défenseur actif le plus proche / BOT_DANGER_OPEN_DIST), + BOT_DANGER_LINE_WEIGHT × proximité de notre en-but.
 */
function receiverDanger(state: Readonly<MatchState>, f: PlayerState, r: PlayerState, defTeam: TeamId): number {
  const inCone = (r.pos.z - f.pos.z) * attackDir(r.team) <= 0 ? 1 : 0;
  let nearest = Infinity;
  for (const p of state.players) if (p.team === defTeam && p.status === 'active') nearest = Math.min(nearest, playerDist(p, r));
  const open = Math.min(1, nearest / BOT_DANGER_OPEN_DIST);
  const line = 1 - Math.min(1, Math.max(0, distanceToTryLine(state, r.team, r.pos.z)) / (2 * state.field.tryLineZ));
  return BOT_DANGER_CONE_WEIGHT * inCone + BOT_DANGER_OPEN_WEIGHT * open + BOT_DANGER_LINE_WEIGHT * line;
}

/**
 * Défense contre le porteur (ou le receveur d'une passe en vol) `f` : pressers, marqueurs, repli. Répartition
 * calculée entre les BOTS de l'équipe (mêmes règles pour chacun ; un humain ne tient aucun rôle), puis le rôle de `me`.
 * Porteur adverse dans son propre tiers (remise en jeu) : BOT_PRESSERS_OWN_THIRD seulement, les autres tiennent leur ligne.
 */
function decideDefense(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, f: PlayerState): void {
  const d = mem.decision;
  const defenders = botsOf(state, mem.externalIds, me.team);
  const range = engageRange(me, mem.difficulty);
  const fDir = attackDir(f.team); // sens d'attaque du porteur = vers NOTRE en-but
  const fLine = distanceToTryLine(state, f.team, f.pos.z);
  const ownThird = fLine > BOT_OWN_THIRD_FRACTION * 2 * state.field.tryLineZ;
  // Repli (dernier défenseur) : point entre le porteur et notre en-but.
  const coverDepth = Math.min(BOT_COVER_DEPTH * state.field.scale, Math.max(0, fLine) * BOT_COVER_LINE_FRACTION);
  const coverPt = clampToField(state, f.pos.x * BOT_COVER_X_FRACTION, f.pos.z + fDir * coverDepth);
  const goalSideOf = (p: PlayerState): boolean => (p.pos.z - f.pos.z) * fDir > 0;
  const coverKey = (p: PlayerState): number =>
    Math.sqrt(dist2(p.pos.x, p.pos.z, coverPt.x, coverPt.z)) - roleBonus(mem, p, 'cover');
  /** Le mieux placé pour le repli parmi `cands` : le plus proche du point de repli, de préférence déjà devant le porteur. */
  const pickCover = (cands: readonly PlayerState[]): number => {
    let best = -1;
    let bestKey = Infinity;
    const ahead = cands.filter(goalSideOf);
    for (const p of ahead.length > 0 ? ahead : cands) {
      const k = coverKey(p);
      if (k < bestKey - 1e-9 || (Math.abs(k - bestKey) <= 1e-9 && p.id < best)) {
        bestKey = k;
        best = p.id;
      }
    }
    return best;
  };
  // Avec assez de bots (BOT_COVER_MIN_DEFENDERS), un dernier défenseur est TOUJOURS gardé devant le porteur (sinon, un
  // porteur qui avait passé les presseurs filait à l'essai : personne ne rattrape un porteur qui sprinte).
  // Personne devant le porteur : le repli passe avant la pression (courir derrière un porteur qui sprinte ne sert à rien).
  const nobodyAhead = !defenders.some(goalSideOf);
  let coverId = defenders.length >= BOT_COVER_MIN_DEFENDERS || (nobodyAhead && defenders.length > 0) ? pickCover(defenders) : -1;
  // Pressers : les plus proches du porteur (égalité : id ; hystérésis pour celui qui pressait déjà).
  const pressKey = (p: PlayerState): number => playerDist(p, f) - roleBonus(mem, p, 'press');
  const byDist = defenders.filter((p) => p.id !== coverId).sort((a, b) => pressKey(a) - pressKey(b) || a.id - b.id);
  const nPress = Math.min(ownThird ? BOT_PRESSERS_OWN_THIRD : pressersFor(state), byDist.length);
  const pressers = byDist.slice(0, nPress);
  if (pressers.includes(me)) {
    const lp = leadPoint(f, BOT_PRESS_LEAD_SEC);
    setRole(d, 'press', standoff(state, me, lp), true, f.id);
    return;
  }
  const others = byDist.slice(nPress);
  if (coverId === me.id) {
    setRole(d, 'cover', coverPt, true, f.id);
    return;
  }
  // Marquage : receveurs par danger décroissant, chacun au marqueur libre le plus proche. Hystérésis (passe finale) :
  // le receveur que CE bot marquait déjà garde un bonus de danger (BOT_MARK_DANGER_STICKY) et ce bot s'en compte plus
  // proche (BOT_MARK_HYSTERESIS_M) — sans elle, s'approcher de A faisait baisser son danger, B passait devant et le
  // marqueur de A partait sur B (ping-pong).
  const markedByMe = (r: PlayerState): boolean => mem.decision.role === 'mark' && mem.decision.markId === r.id;
  const markers = others.filter((p) => p.id !== coverId);
  const receivers = activeOf(state, f.team, f.id)
    .map((r) => ({ r, danger: receiverDanger(state, f, r, me.team) + (markedByMe(r) ? BOT_MARK_DANGER_STICKY : 0) }))
    .sort((a, b) => b.danger - a.danger || a.r.id - b.r.id);
  const free = markers.slice();
  for (const { r } of receivers) {
    if (free.length === 0) break;
    const markKey = (m: PlayerState): number => playerDist(m, r) - (m.id === mem.playerId && markedByMe(r) ? BOT_MARK_HYSTERESIS_M : 0);
    let bi = 0;
    for (let i = 1; i < free.length; i++) if (markKey(free[i]) < markKey(free[bi]) - 1e-9) bi = i;
    const m = free[bi];
    free.splice(bi, 1);
    if (m !== me) continue;
    const goal = clampToField(state, r.pos.x + (f.pos.x - r.pos.x) * BOT_MARK_CARRIER_SHIFT, r.pos.z + fDir * BOT_MARK_GOALSIDE);
    // Il tire sur le porteur s'il est tout près (menace immédiate) ; sinon sur son receveur seulement si celui-ci est
    // une menace directe (à moins de BOT_ESCORT_THREAT_DIST du porteur : passe imminente) et à portée.
    const shootCarrier = playerDist(me, f) <= BOT_MARK_SHOOT_CARRIER_DIST;
    const shootReceiver = !shootCarrier && playerDist(me, r) <= range && playerDist(r, f) <= BOT_ESCORT_THREAT_DIST;
    setRole(d, 'mark', goal, playerDistTo(me, goal) > BOT_MARK_GOALSIDE, shootCarrier ? f.id : shootReceiver ? r.id : -1, r.id);
    return;
  }
  // Marqueur sans receveur (plus de défenseurs que de receveurs) : repli devant le porteur.
  setRole(d, 'cover', coverPt, true, f.id);
}

// ---------------------------------------------------------------------------
// Ballon libre / coup de pied
// ---------------------------------------------------------------------------

/**
 * Ballon libre / coup de pied en vol : les BOT_BALL_CHASERS_* BOTS les plus proches en temps de course vont au point de
 * chute (hystérésis pour qui chassait déjà), les autres gardent une forme. Pas de fusillade : le chasseur SPRINTE en
 * regardant sa course (le tir couperait le sprint) et ne tire que si un adversaire arrive au ballon au moins
 * BOT_CHASE_SHOOT_MARGIN_SEC avant lui ; la forme ne tire que sur l'adversaire qui va arriver le premier au ballon.
 */
function decideLoose(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState, sit: Situation): void {
  const d = mem.decision;
  const land = ballLandingPoint(state);
  const b = state.ball;
  // Ballon qui roule : on vise un peu devant lui ; on le traverse (BOT_CHASE_OVERSHOOT) pour ne pas ralentir dessus.
  const tx = land.x + (b.mode === 'loose' ? b.vel.x * BOT_CHASE_ROLL_LEAD_SEC : 0);
  const tz = land.z + (b.mode === 'loose' ? b.vel.z * BOT_CHASE_ROLL_LEAD_SEC : 0);
  const mates = botsOf(state, mem.externalIds, me.team);
  const chaseKey = (p: PlayerState): number => timeTo(p, tx, tz) - roleBonus(mem, p, 'chase') / ROLES[p.role].runSpeed;
  const ranked = mates.slice().sort((a, c) => chaseKey(a) - chaseKey(c) || a.id - c.id);
  const nChase = Math.min(chasersFor(state), ranked.length);
  const range = engageRange(me, mem.difficulty);
  // Premier adversaire au ballon (celui qui va le prendre).
  let firstOpp: PlayerState | null = null;
  let firstOppT = Infinity;
  for (const o of activeOf(state, opponentTeam(me.team))) {
    const t = timeTo(o, tx, tz);
    if (t < firstOppT) {
      firstOppT = t;
      firstOpp = o;
    }
  }
  const inRange = firstOpp !== null && playerDist(me, firstOpp) <= range;
  // Mêlée possible et pas défavorable (au moins autant de joueurs que l'adversaire autour du ballon) : on « tient » la zone hors du cercle de ramassage en tirant
  // sur qui s'approche du ballon, plutôt que de le ramasser au milieu des tireurs adverses ; ceux qui n'y entrent pas
  // gardent la forme (personne ne court au ballon) — scrumBrain.ts.
  // Même alerte que bot.ts (calculée ce tick, hystérésis comprise) : décision et déclenchement restent d'accord.
  const approaching = scrumApproaching(state, me, land.x, land.z, mem.scrumAlert);
  const hold = approaching && shouldHoldZone(state, me, land.x, land.z);
  if (hold && decideScrumApproach(mem, state, me, land.x, land.z, [], true)) return;
  const ci = ranked.indexOf(me);
  if (!hold && ci >= 0 && ci < nChase) {
    const vx = tx - me.pos.x;
    const vz = tz - me.pos.z;
    const l = Math.sqrt(vx * vx + vz * vz);
    const over = l > 1e-6 ? BOT_CHASE_OVERSHOOT / l : 0;
    const beaten = firstOpp !== null && firstOppT + BOT_CHASE_SHOOT_MARGIN_SEC < timeTo(me, tx, tz);
    const shootId = beaten && inRange && firstOpp !== null ? firstOpp.id : -1;
    setRole(d, 'chase', clampToField(state, tx + vx * over, tz + vz * over, CHASE_WALL_MARGIN), true, shootId);
    return;
  }
  // Mêlée probable (ballon libre depuis longtemps, adversaires autour) : on rejoint la zone pour peser sur le décompte
  // (scrumBrain.ts), les chasseurs étant déjà comptés.
  if (approaching && !hold) {
    const chasers = ranked.slice(0, nChase).map((p) => p.id);
    if (decideScrumApproach(mem, state, me, land.x, land.z, chasers, false)) return;
  }
  // Forme : répartis en largeur (rangés par x), en rideau entre le ballon et notre en-but ; si notre équipe vient de
  // taper / lâcher le ballon, on monte plutôt en soutien juste derrière le point de chute.
  const dir = attackDir(me.team);
  const shapers = (hold ? ranked : ranked.slice(nChase)).sort((a, c) => a.pos.x - c.pos.x || a.id - c.id);
  const k = shapers.indexOf(me);
  const n = shapers.length;
  const halfSpan = (state.field.width * BOT_SHAPE_WIDTH_FRACTION) / 2;
  const x = n <= 1 ? land.x * BOT_SHAPE_SINGLE_X_FRACTION : -halfSpan + (2 * halfSpan * k) / (n - 1);
  const ours = sit.lastTeam === me.team;
  const depth = (ours ? BOT_SHAPE_OWN_KICK_DEPTH_FRACTION : 1) * BOT_SHAPE_DEPTH * state.field.scale;
  setRole(d, 'shape', clampToField(state, x, land.z - dir * depth), !ours, inRange && firstOpp !== null ? firstOpp.id : -1);
}

/**
 * Décision du bot (appelée tous les decisionSec, ou dès qu'un changement de situation est perçu). `me` est actif et la
 * phase est 'play' (sinon le bot est idle).
 */
export function decide(mem: BotMemory, state: Readonly<MatchState>, me: PlayerState): void {
  const sit = mem.seen;
  const focus = perceivedFocus(state, sit);
  if (focus !== null && focus.team === me.team) {
    if (sit.ballMode === 'carried' && focus.id === me.id) {
      planCarrier(mem, state, me);
      return;
    }
    if (sit.ballMode === 'pass' && focus.id === me.id) {
      decideReceive(mem, state);
      return;
    }
    decideAttack(mem, state, me, focus);
    return;
  }
  if (focus !== null && focus.team === opponentTeam(me.team)) {
    decideDefense(mem, state, me, focus);
    return;
  }
  if (sit.ballMode === 'scrum' && state.scrum !== null) {
    decideScrum(mem, state, me, state.scrum);
    return;
  }
  decideLoose(mem, state, me, sit);
}
