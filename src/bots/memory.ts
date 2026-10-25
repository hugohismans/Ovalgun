/**
 * Mémoire interne d'un bot (étape 6) : tout ce que le bot retient d'un tick à l'autre, HORS du MatchState.
 *
 * Sérialisable (objets simples, nombres finis) : un serveur pourrait la sauvegarder avec la partie. Contient le PRNG
 * PROPRE au bot (deriveSeed(seed, id)), sa perception retardée, sa décision courante, sa visée lissée, ses réflexes
 * et son suivi de blocage. Le MatchState n'est jamais modifié par un bot : seule cette mémoire évolue.
 */

import {
  deriveSeed,
  type BallMode,
  type BotDifficulty,
  type MatchPhase,
  type MatchState,
  type TeamId,
} from '../sim';

/**
 * Situation « discrète » du match telle que le bot la perçoit : ce qui, en changeant, demande une réaction
 * (le temps de réaction de la difficulté s'applique à ces changements). Les positions, elles, sont lues en direct.
 */
export interface Situation {
  phase: MatchPhase;
  ballMode: BallMode;
  carrierId: number;
  passTargetId: number;
  /** Dernière équipe en possession (lanceur d'une passe / d'un coup de pied compris), −1 si aucune. */
  lastTeam: TeamId | -1;
}

/** Lit la situation discrète courante de l'état (PURE). */
export function readSituation(state: Readonly<MatchState>): Situation {
  const b = state.ball;
  return { phase: state.phase, ballMode: b.mode, carrierId: b.carrierId, passTargetId: b.passTargetId, lastTeam: b.lastTeam };
}

export const sameSituation = (a: Situation, b: Situation): boolean =>
  a.phase === b.phase &&
  a.ballMode === b.ballMode &&
  a.carrierId === b.carrierId &&
  a.passTargetId === b.passTargetId &&
  a.lastTeam === b.lastTeam;

/**
 * Rôle tactique, recalculé à chaque décision :
 *  - idle    : phase figée (coup d'envoi, essai, fin) ou joueur au sol : pas de déplacement, visée vers le jeu ;
 *  - carrier : porteur (avancer, esquiver, passer, taper, plonger) ;
 *  - support : soutien derrière le porteur, dans son cône de passe ;
 *  - space   : cherche l'espace devant le porteur (ouvre la défense, tire sur les défenseurs) ;
 *  - receive : receveur d'une passe en vol (garde sa ligne) ;
 *  - press   : défenseur qui converge vers le porteur et lui tire dessus ;
 *  - mark    : défenseur qui marque le receveur le plus dangereux (entre lui et son en-but) ;
 *  - cover   : repli entre le porteur et son en-but quand personne ne le couvre ;
 *  - chase   : va au ballon libre / au point de chute ;
 *  - shape   : garde une forme d'équipe pendant un ballon libre.
 */
export type TacticalRole = 'idle' | 'carrier' | 'support' | 'space' | 'receive' | 'press' | 'mark' | 'cover' | 'chase' | 'shape';

/** Plan du porteur : courir, préparer une passe (regard vers le receveur), préparer un coup de pied. */
export type CarrierPlan = 'run' | 'pass' | 'kick';

/** Décision courante (recalculée tous les decisionSec, ou aussitôt qu'un changement de situation est perçu). */
export interface Decision {
  role: TacticalRole;
  /** Point visé au sol (déplacement). */
  goalX: number;
  goalZ: number;
  /** Direction de course imposée (porteur, receveur qui garde sa ligne) ; (0, 0) = aller vers le point visé. */
  dirX: number;
  dirZ: number;
  /** Veut sprinter (la sim coupe le sprint s'il tire). */
  sprint: boolean;
  /** Cible de tir prioritaire du rôle (−1 : la plus proche à portée). */
  shootId: number;
  /** Receveur marqué (défense), −1 sinon. */
  markId: number;
  /** Porteur : plan en cours, receveur et regard voulus, ticks restants avant abandon du geste. */
  plan: CarrierPlan;
  planTargetId: number;
  planYaw: number;
  planTicks: number;
  /** Porteur : chemin libre devant lui (sprint, sprint boosté). */
  pathClear: boolean;
}

export interface BotMemory {
  playerId: number;
  difficulty: BotDifficulty;
  /** Seed du match (réinitialisation si le match recommence). */
  seed: number;
  /**
   * Joueurs que ce bot sait NE PAS être des bots (humains, id croissant) : ils ne suivent pas les règles de répartition
   * des bots (presser, chasser, couvrir…) ; la répartition se fait entre bots seulement (tactics.ts).
   */
  externalIds: number[];
  /** État du PRNG propre au bot (prng.ts). */
  rng: number;
  /** Dernier tick vu (−1 : jamais appelé). Un tick qui recule = nouveau match : la mémoire repart de zéro. */
  lastTick: number;
  /** Dernier tick où un coup de pied était en vol (−1 : jamais) : pas de coup de pied en retour juste après (BOT_KICK_AFTER_KICK_SEC). */
  lastKickSeenTick: number;

  // Perception retardée.
  /** Situation prise en compte par les décisions. */
  seen: Situation;
  /** Situation observée en attente d'être prise en compte (pendingTicks ≥ 0). */
  pending: Situation;
  /** Ticks avant d'adopter `pending` (−1 : rien en attente). */
  pendingTicks: number;

  // Décision.
  decisionTicks: number;
  decision: Decision;

  // Visée.
  aimTargetId: number;
  /** Ticks avant de pouvoir tirer sur la cible courante (acquisition = temps de réaction). */
  acquireTicks: number;
  /** Erreur de visée courante et erreur visée (en écarts-types, sans unité : × aimErrorScale), ticks avant le prochain tirage. */
  errYaw: number;
  errPitch: number;
  errTargetYaw: number;
  errTargetPitch: number;
  errTicks: number;
  burstTicks: number;
  pauseTicks: number;
  /** Ticks consécutifs sans cible (rechargement opportuniste). */
  idleTicks: number;

  // Réflexes.
  lastStability: number;
  /** Ticks restants « sous le feu » (réflexe d'esquive possible). */
  underFireTicks: number;
  /** Ticks avant que le réflexe d'esquive soit armé (temps de réaction après le premier tir reçu). */
  hitReactTicks: number;
  /** Tireur du dernier tir reçu (−1 : inconnu). */
  lastShooterId: number;

  // Déplacement.
  stuckTicks: number;
  /** Ticks consécutifs où le bot veut avancer sans y parvenir (mesure, lue par les tests). */
  blockedTicks: number;
  /** Plus long blocage observé (ticks), pour les tests. */
  maxBlockedTicks: number;
  detourTicks: number;
  detourSign: number;
  /** Direction monde (unitaire) et boutons de l'entrée précédente : le receveur d'une passe garde sa ligne. */
  lastDirX: number;
  lastDirZ: number;
  lastMoveMag: number;
  lastButtons: number;
}

/** Décision neutre (rien à faire). */
export function idleDecision(): Decision {
  return {
    role: 'idle',
    goalX: 0,
    goalZ: 0,
    dirX: 0,
    dirZ: 0,
    sprint: false,
    shootId: -1,
    markId: -1,
    plan: 'run',
    planTargetId: -1,
    planYaw: 0,
    planTicks: 0,
    pathClear: false,
  };
}

const NO_SITUATION: Situation = { phase: 'kickoff', ballMode: 'dead', carrierId: -1, passTargetId: -1, lastTeam: -1 };

/**
 * Mémoire neuve du bot pilotant `playerId` (PRNG dérivé de la seed du match et de l'id). `externalIds` : joueurs qui ne
 * sont pas des bots (le joueur humain en solo ; un serveur y mettrait tous les joueurs humains).
 */
export function createBotMemory(
  playerId: number,
  difficulty: BotDifficulty,
  seed: number,
  externalIds: readonly number[] = [],
): BotMemory {
  return {
    playerId,
    difficulty,
    seed,
    externalIds: [...externalIds].filter((id) => id !== playerId).sort((a, b) => a - b),
    rng: deriveSeed(seed, playerId + 0x5b07),
    lastTick: -1,
    lastKickSeenTick: -1,
    seen: { ...NO_SITUATION },
    pending: { ...NO_SITUATION },
    pendingTicks: -1,
    decisionTicks: 0,
    decision: idleDecision(),
    aimTargetId: -1,
    acquireTicks: 0,
    errYaw: 0,
    errPitch: 0,
    errTargetYaw: 0,
    errTargetPitch: 0,
    errTicks: 0,
    burstTicks: 0,
    pauseTicks: 0,
    idleTicks: 0,
    lastStability: 0,
    underFireTicks: 0,
    hitReactTicks: 0,
    lastShooterId: -1,
    stuckTicks: 0,
    blockedTicks: 0,
    maxBlockedTicks: 0,
    detourTicks: 0,
    detourSign: 1,
    lastDirX: 0,
    lastDirZ: 0,
    lastMoveMag: 0,
    lastButtons: 0,
  };
}

/** Remet la mémoire à zéro (nouveau match lu par le même bot), en gardant identité, difficulté, seed et joueurs externes. */
export function resetBotMemory(mem: BotMemory): void {
  Object.assign(mem, createBotMemory(mem.playerId, mem.difficulty, mem.seed, mem.externalIds));
}
