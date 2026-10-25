/**
 * Mêlée — étape 7 (étape 10 de `step`, après les zones de ralentissement). Voir docs/ARCHITECTURE.md §4 et §14.
 *
 * Cahier des charges : « si le ballon reste libre plus de 3 s avec au moins N joueurs de chaque camp dans un rayon donné
 * (N = 2 en 3v3, 3 en 5v5), la zone devient une zone de capture : l'équipe qui a le plus de joueurs dedans après 3 s
 * récupère le ballon ».
 *
 *  - DÉCLENCHEMENT (phase 'play' seulement) : ballon 'loose' depuis au moins secToTicks(SCRUM_LOOSE_SEC) ticks
 *    (`ball.looseTicks`, déjà compté pour ce tick par ball.ts) ET au moins `scrumMinPlayers` joueurs ACTIFS de chaque
 *    équipe à au plus `scrumRadius` (distance horizontale pieds -> ballon). Le ballon a pu être ramassé à l'étape 9 du même
 *    tick : il n'est alors plus 'loose', pas de mêlée. Effets : `state.scrum` = { centre au sol sous le ballon, rayon,
 *    ticks = 0, décompte }, ballon 'scrum' posé au centre, immobile, non ramassable (carrier.ts ne ramasse qu'un ballon
 *    'loose'), événement 'scrum_start'.
 *  - CAPTURE : à chaque tick suivant, `ticks++` et décompte des joueurs actifs de chaque équipe dans la zone (les plaqués
 *    et ceux qui se relèvent ne comptent pas : on peut tirer pour vider la zone adverse — voulu). Le ballon ne bouge pas
 *    (ball.ts l'immobilise ; aucun joueur ne le pousse) ; projectiles, explosions, knockback continuent normalement ; le
 *    chrono tourne (la mêlée fait partie du jeu, rules.ts).
 *  - RÉSOLUTION :
 *      * à `ticks` = secToTicks(SCRUM_CAPTURE_SEC) : l'équipe la plus nombreuse gagne ;
 *      * égalité : prolongation en « premier qui mène » jusqu'à capture + secToTicks(SCRUM_TIE_EXTRA_SEC) : la première
 *        équipe qui compte plus de joueurs que l'autre à la fin d'un tick gagne aussitôt ;
 *      * encore à égalité à la fin de la prolongation : tirage au sort seedé (UN tirage `state.rng`) — sauf à 0 contre 0 :
 *        personne dans la zone, personne à qui donner le ballon : il est rendu libre au centre (événement
 *        'scrum_released', aucun tirage).
 *    Le gagnant reçoit le ballon PORTÉ (giveBall : `looseTicks` = 0, pas de nouvelle mêlée immédiate) par son joueur
 *    actif dans la zone le plus proche du centre (égalité : plus petit id) — il y en a toujours au moins un : une
 *    équipe qui gagne au décompte a au moins un joueur dedans, et le tirage n'a lieu qu'à égalité non nulle. Événement
 *    'scrum_won'. `state.scrum` = null.
 *  - NETTOYAGE : remise en jeu (setupKickoff), fin du match (rules.ts) et outils de test (carrier.ts) remettent
 *    `state.scrum` à null ; par sécurité, une mêlée dont le ballon n'est plus en mode 'scrum' est oubliée ici.
 *
 * Joueurs itérés par id croissant ; aucun aléatoire hors du tirage d'égalité. Les durées ne sont pas raccourcies en
 * dernière minute (« dernière minute inchangée »).
 */

import { BALL_RADIUS, SCRUM_CAPTURE_SEC, SCRUM_LOOSE_SEC, SCRUM_MIN_PLAYERS_3V3, SCRUM_MIN_PLAYERS_5V5, SCRUM_RADIUS, SCRUM_TIE_EXTRA_SEC } from './constants';
import { giveBall } from './carrier';
import { groundHeight } from './field';
import { rand } from './prng';
import { secToTicks } from './time';
import type { MatchState, PlayerState, ScrumState, TeamId } from './types';

/** Joueurs actifs minimum de chaque équipe autour du ballon pour déclencher une mêlée (2 en 3v3, 3 en 5v5). PURE. */
export const scrumMinPlayers = (state: Readonly<MatchState>): number =>
  state.config.teamSize === 3 ? SCRUM_MIN_PLAYERS_3V3 : SCRUM_MIN_PLAYERS_5V5;

/** Rayon de la zone de mêlée (m) : SCRUM_RADIUS × échelle du terrain. PURE. */
export const scrumRadius = (state: Readonly<MatchState>): number => SCRUM_RADIUS * state.field.scale;

/** Durée de la capture en ticks (secToTicks(SCRUM_CAPTURE_SEC)). */
export const scrumCaptureTicks = (): number => secToTicks(SCRUM_CAPTURE_SEC);

/** Durée totale au plus d'une mêlée en ticks (capture + prolongation). */
export const scrumMaxTicks = (): number => secToTicks(SCRUM_CAPTURE_SEC) + secToTicks(SCRUM_TIE_EXTRA_SEC);

/** Vrai si la mêlée est en prolongation (capture écoulée, égalité). PURE (rendu, HUD, bots). */
export const scrumInOvertime = (scrum: Readonly<ScrumState>): boolean => scrum.ticks >= scrumCaptureTicks();

/**
 * Ticks restants avant la résolution « normale » de la mêlée : fin de la capture, ou fin de la prolongation (la
 * prolongation peut s'arrêter plus tôt dès qu'une équipe mène). PURE.
 */
export const scrumTicksLeft = (scrum: Readonly<ScrumState>): number =>
  Math.max(0, (scrumInOvertime(scrum) ? scrumMaxTicks() : scrumCaptureTicks()) - scrum.ticks);

/** Le joueur compte-t-il dans une zone de centre (cx, cz) et de rayon r ? Actif, pieds à au plus r (horizontal). */
function inZone(p: Readonly<PlayerState>, cx: number, cz: number, r: number): boolean {
  if (p.status !== 'active') return false;
  const dx = p.pos.x - cx;
  const dz = p.pos.z - cz;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Le joueur compte-t-il dans le décompte de la mêlée `scrum` ? EXACTEMENT la règle de la sim (countInZone, gagnant le
 * plus proche du centre) : actif, pieds à au plus `scrum.radius` du centre (horizontal). PURE (HUD « tu comptes »).
 */
export const inScrumZone = (p: Readonly<PlayerState>, scrum: Readonly<ScrumState>): boolean =>
  inZone(p, scrum.center.x, scrum.center.z, scrum.radius);

/** Joueurs actifs de chaque équipe dans le disque (cx, cz, r). PURE (bots, tests). */
export function countInZone(state: Readonly<MatchState>, cx: number, cz: number, r: number): [number, number] {
  const counts: [number, number] = [0, 0];
  for (const p of state.players) if (inZone(p, cx, cz, r)) counts[p.team]++;
  return counts;
}

/** Ballon libre depuis assez longtemps pour une mêlée (le décompte des joueurs n'est pas vérifié). PURE. */
export const scrumLooseReady = (state: Readonly<MatchState>): boolean =>
  state.ball.mode === 'loose' && state.ball.looseTicks >= secToTicks(SCRUM_LOOSE_SEC);

/** Déclenche la mêlée autour du ballon libre (conditions déjà vérifiées). */
function startScrum(state: MatchState, counts: [number, number]): void {
  const b = state.ball;
  const cx = b.pos.x;
  const cz = b.pos.z;
  const gy = groundHeight(state.field, cx, cz);
  state.scrum = { center: { x: cx, y: gy, z: cz }, radius: scrumRadius(state), ticks: 0, counts };
  b.mode = 'scrum';
  b.carrierId = -1;
  b.passTargetId = -1;
  b.aimTargetId = -1;
  b.flightTicks = 0;
  b.looseTicks = 0;
  b.pos = { x: cx, y: gy + BALL_RADIUS, z: cz };
  b.vel = { x: 0, y: 0, z: 0 };
  b.spinRate = 0;
  b.tumbleRate = 0;
  state.events.push({ type: 'scrum_start', pos: { x: cx, y: gy, z: cz } });
}

/** Joueur actif de `team` dans la zone le plus proche du centre (égalité : plus petit id), ou null. */
function closestInZone(state: MatchState, scrum: ScrumState, team: TeamId): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD2 = Infinity;
  const { x: cx, z: cz } = scrum.center;
  for (const p of state.players) {
    if (p.team !== team || !inZone(p, cx, cz, scrum.radius)) continue;
    const d2 = (p.pos.x - cx) ** 2 + (p.pos.z - cz) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/** Fin de la mêlée gagnée par `team` : ballon porté par son joueur le plus proche du centre (sinon rendu libre). */
function resolveScrum(state: MatchState, scrum: ScrumState, team: TeamId): void {
  const winner = closestInZone(state, scrum, team);
  state.scrum = null;
  if (winner === null) {
    releaseScrum(state, scrum);
    return;
  }
  giveBall(state, winner);
  state.events.push({ type: 'scrum_won', team, playerId: winner.id });
}

/** Mêlée sans vainqueur possible (0 contre 0 à la fin de la prolongation) : ballon libre, immobile, au centre. */
function releaseScrum(state: MatchState, scrum: ScrumState): void {
  const b = state.ball;
  state.scrum = null;
  b.mode = 'loose';
  b.looseTicks = 0;
  b.vel = { x: 0, y: 0, z: 0 };
  b.pos = { x: scrum.center.x, y: scrum.center.y + BALL_RADIUS, z: scrum.center.z };
  state.events.push({ type: 'scrum_released', pos: { x: scrum.center.x, y: scrum.center.y, z: scrum.center.z } });
}

/** Étape 10 de `step` : déclenchement, décompte et résolution de la mêlée (voir l'en-tête du fichier). */
export function updateScrum(state: MatchState): void {
  if (state.phase !== 'play') return;
  const scrum = state.scrum;
  if (scrum === null) {
    if (!scrumLooseReady(state)) return;
    const counts = countInZone(state, state.ball.pos.x, state.ball.pos.z, scrumRadius(state));
    const n = scrumMinPlayers(state);
    if (counts[0] >= n && counts[1] >= n) startScrum(state, counts);
    return;
  }
  if (state.ball.mode !== 'scrum') {
    // Sécurité (outil de test, état forgé) : le ballon a quitté la mêlée par un autre chemin.
    state.scrum = null;
    return;
  }
  scrum.ticks++;
  scrum.counts = countInZone(state, scrum.center.x, scrum.center.z, scrum.radius);
  if (scrum.ticks < scrumCaptureTicks()) return;
  const [a, b] = scrum.counts;
  if (a !== b) {
    resolveScrum(state, scrum, a > b ? 0 : 1);
    return;
  }
  if (scrum.ticks < scrumMaxTicks()) return; // prolongation : « premier qui mène »
  if (a === 0) {
    releaseScrum(state, scrum);
    return;
  }
  resolveScrum(state, scrum, rand(state) < 0.5 ? 0 : 1);
}
