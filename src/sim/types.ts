/**
 * Contrat de données de la simulation.
 *
 * Tout ce qui est ici doit rester sérialisable en JSON (pas de classes, pas de
 * Map/Set, pas de fonctions, pas de références circulaires, pas d'Infinity/NaN).
 * C'est ce qui permettra plus tard d'envoyer l'état depuis un serveur autoritaire
 * (Cloudflare Durable Object) et d'y appliquer les entrées des clients.
 *
 * Unités : mètres, secondes (converties en ticks), radians.
 * Les minuteries de l'état sont des ENTIERS en ticks (déterministes).
 */

import type { Vec3 } from './vec';

export type { Vec3, Vec2 } from './vec';

export type TeamId = 0 | 1;
export type Role = 'pilier' | 'ailier' | 'demi';
export type TeamSize = 3 | 5;

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

/**
 * Bits des boutons de `PlayerInput.buttons`. L'entrée transporte l'état
 * MAINTENU de chaque bouton ; la simulation détecte elle-même les fronts
 * montants grâce à `PlayerState.lastButtons`. (Le client « verrouille » un appui
 * bref pour qu'il soit vu pendant au moins un tick.)
 */
export const Buttons = {
  /** Tir (maintenu = tir automatique selon la cadence de l'arme). */
  FIRE: 1 << 0,
  /** Visée (clic droit) : précision accrue, déplacement ralenti, caméra rapprochée. */
  AIM: 1 << 1,
  /** Saut (double saut pour l'ailier). */
  JUMP: 1 << 2,
  /** Esquive : dash court sur front montant. */
  DODGE: 1 << 3,
  /** Sprint : maintenu. Côté client : appui bref sur Shift = esquive, Shift maintenu = sprint. */
  SPRINT: 1 << 4,
  /** Glissade en courant ; pour le porteur = plongeon. */
  SLIDE: 1 << 5,
  /** Passe arrière assistée (porteur uniquement). */
  PASS: 1 << 6,
  /** Coup de pied à suivre (porteur uniquement). */
  KICK: 1 << 7,
  /** Capacité de rôle. */
  ABILITY: 1 << 8,
  /** Rechargement manuel (le rechargement est aussi automatique chargeur vide). */
  RELOAD: 1 << 9,
} as const;

export type ButtonName = keyof typeof Buttons;

/** Une entrée de joueur pour UN tick. Produite à l'identique par un humain ou un bot. */
export interface PlayerInput {
  /** Déplacement local, -1..1 : +X = droite, relatif au yaw. Normalisé par la sim si |(moveX, moveY)| > 1. */
  moveX: number;
  /** Déplacement local, -1..1 : +Y = avant, relatif au yaw. */
  moveY: number;
  /** Orientation absolue de visée (radians, voir vec.ts pour la convention). */
  yaw: number;
  /** Inclinaison de visée (radians, > 0 vers le haut), bornée par la sim. */
  pitch: number;
  /** Masque de bits `Buttons`. */
  buttons: number;
}

/**
 * Entrées d'un tick, indexées par id de joueur. Un tableau convient aussi.
 * Un joueur absent reçoit une entrée neutre (il garde son orientation).
 */
export type InputFrame = Readonly<Record<number, PlayerInput | undefined>>;

// ---------------------------------------------------------------------------
// Configuration et terrain
// ---------------------------------------------------------------------------

export interface MatchConfig {
  /** 3 => 3v3, 5 => 5v5. */
  teamSize: TeamSize;
  /** Seed du PRNG du match. */
  seed: number;
  /** Rôles de chaque équipe (longueur = teamSize). Le joueur d'id k*teamSize+i a le rôle roles[k][i]. */
  roles: [Role[], Role[]];
  /** Durée du match en secondes (défaut : constante MATCH_DURATION_SEC). */
  durationSec?: number;
  /** Mode entraînement : chrono figé, pas de fin de match. */
  training?: boolean;
  /** Équipe qui reçoit le ballon au coup d'envoi (défaut : constante FIRST_KICKOFF_TEAM). */
  firstKickoffTeam?: TeamId;
  /**
   * Receveur du ballon à chaque coup d'envoi / remise en jeu, par équipe : index DANS l'équipe (0..teamSize-1), ou −1
   * pour le joueur le plus central de la formation (défaut [−1, −1]). En solo, le client désigne le joueur humain
   * (étape 6 : sinon il ne touchait jamais le ballon au coup d'envoi).
   */
  kickoffReceivers?: [number, number];
}

/** Butte : bosse lisse (cosinus) de rayon `radius` et de hauteur `height`. */
export interface MoundFeature {
  kind: 'mound';
  x: number;
  z: number;
  radius: number;
  height: number;
}

/**
 * Rampe : coin qui monte linéairement de 0 à `height` sur sa longueur (axe local +Z),
 * puis retombe verticalement. `rotation` = yaw de l'axe local +Z.
 */
export interface RampFeature {
  kind: 'ramp';
  x: number;
  z: number;
  /** Largeur (axe local X). */
  width: number;
  /** Longueur (axe local Z). */
  length: number;
  height: number;
  rotation: number;
}

/** Muret bas : boîte franchie automatiquement (grimpe/vault). `rotation` = yaw de l'axe local +Z (axe de la longueur). */
export interface WallFeature {
  kind: 'wall';
  x: number;
  z: number;
  /** Longueur (axe local Z). */
  length: number;
  /** Épaisseur (axe local X). */
  thickness: number;
  height: number;
  rotation: number;
}

export type TerrainFeature = MoundFeature | RampFeature | WallFeature;

/** Terrain : statique, dérivé de la config, inclus dans l'état pour que le rendu et un serveur le lisent tel quel. */
export interface FieldLayout {
  /** Largeur totale (X), murs invisibles en ±width/2. */
  width: number;
  /** Longueur totale ballon-mort à ballon-mort (Z), murs invisibles en ±length/2. */
  length: number;
  /** Profondeur de chaque en-but. */
  inGoalDepth: number;
  /** Ligne d'essai : l'équipe 0 marque en z >= +tryLineZ, l'équipe 1 en z <= -tryLineZ. */
  tryLineZ: number;
  /** Facteur d'échelle par rapport au terrain 5v5 (1 ou FIELD_SCALE_3V3). */
  scale: number;
  features: TerrainFeature[];
}

// ---------------------------------------------------------------------------
// Joueurs
// ---------------------------------------------------------------------------

/** État corporel. `down` = plaqué au sol ; `getting_up` = se relève (brève invulnérabilité). */
export type PlayerStatus = 'active' | 'down' | 'getting_up';

/** Mouvement spécial en cours (exclusifs). */
export type MoveMode = 'run' | 'dodge' | 'slide' | 'dive' | 'dive_recover' | 'climb';

export interface PlayerStats {
  tries: number;
  tackles: number;
  passes: number;
  interceptions: number;
  shotsFired: number;
  shotsHit: number;
}

export interface PlayerState {
  id: number;
  team: TeamId;
  role: Role;

  /** Position des pieds (bas de la capsule). */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;

  onGround: boolean;
  /** Ticks depuis que le joueur a quitté le sol (coyote time). */
  airTicks: number;
  /** Sauts aériens déjà utilisés depuis le dernier contact au sol. */
  airJumpsUsed: number;
  /** Tampon de saut : ticks restants pendant lesquels un appui saut récent sera honoré à l'atterrissage. */
  jumpBufferTicks: number;
  /** Tampon d'esquive (passe finale) : ticks restants pendant lesquels un appui d'esquive récent sera honoré dès que possible. */
  dodgeBufferTicks: number;

  move: MoveMode;
  /** Ticks restants du mouvement spécial courant (0 en `run`). */
  moveTicks: number;
  /** Direction horizontale unitaire du mouvement spécial (dash, plongeon, glissade). */
  moveDir: Vec3;
  /**
   * Vitesse du dash d'esquive (m/s), fixée au déclenchement (DODGE_SPEED, réduite vers l'avant par
   * DODGE_FORWARD_SPEED_MULT) ; lue seulement pendant 'dodge' (passe finale). Remise à 0 à la sortie normale de
   * l'esquive et à la remise en jeu ; sans effet hors esquive (une esquive interrompue peut la laisser telle quelle).
   */
  moveSpeed: number;
  /** Hauteur cible pendant une grimpe de muret. */
  climbTargetY: number;

  /** Cooldowns en ticks (0 = disponible). */
  dodgeCd: number;
  slideCd: number;
  diveCd: number;
  /** Ticks d'invulnérabilité restants (plongeon, relevé). */
  invulnTicks: number;

  /** Jauge de stabilité (0 => plaqué). */
  stability: number;
  /** Ticks restants avant que la stabilité remonte (remis à REGEN_DELAY à chaque tir reçu). */
  regenDelayTicks: number;
  status: PlayerStatus;
  /** Ticks restants dans le statut courant (down / getting_up). */
  statusTicks: number;
  /** Dernier joueur à l'avoir touché (crédit du plaquage), -1 sinon. */
  lastHitBy: number;

  /** Arme : ticks avant le prochain tir possible, munitions dans le chargeur, ticks de rechargement restants (0 = pas en rechargement). */
  fireCd: number;
  ammo: number;
  reloadTicks: number;

  /** Capacité : cooldown (démarre à la fin de la durée active) et durée active restante, en ticks. */
  abilityCd: number;
  abilityTicks: number;

  /** Ticks pendant lesquels ce joueur ne peut pas attraper le ballon (après passe / coup de pied / lâcher). */
  pickupBlockTicks: number;

  /** Boutons maintenus au tick précédent (détection des fronts montants). */
  lastButtons: number;
  /** Dernière entrée de déplacement appliquée (lecture par le rendu/bots ; normalisée). */
  lastMoveX: number;
  lastMoveY: number;

  stats: PlayerStats;
}

// ---------------------------------------------------------------------------
// Ballon, projectiles, zones, mêlée
// ---------------------------------------------------------------------------

/**
 * - carried : tenu par `carrierId`
 * - loose   : libre (au sol ou rebondissant), ramassable par n'importe qui
 * - pass    : en vol suite à une passe (attrapable / interceptable)
 * - kick    : en vol suite à un coup de pied (attrapable par tous)
 * - scrum   : bloqué au centre d'une mêlée en cours
 * - dead    : hors jeu (pause après essai, avant remise en jeu)
 */
export type BallMode = 'carried' | 'loose' | 'pass' | 'kick' | 'scrum' | 'dead';

export interface BallState {
  /** Centre du ballon. */
  pos: Vec3;
  vel: Vec3;
  mode: BallMode;
  /** Porteur, -1 sinon. */
  carrierId: number;
  /** Dernier joueur à avoir passé / tapé / lâché le ballon, -1 sinon. */
  throwerId: number;
  /** Destinataire visé par la passe en cours, -1 sinon. */
  passTargetId: number;
  /**
   * Ballon porté : receveur retenu par la visée assistée du porteur au dernier tick (hystérésis de la cible,
   * PASS_TARGET_STICKY_BONUS), -1 sinon. Ignoré quand le ballon n'est pas porté.
   */
  aimTargetId: number;
  /** Ticks écoulés depuis la passe / le coup de pied en cours (0 sinon) : fenêtre de contre du coup de pied. */
  flightTicks: number;
  /** Dernière équipe à avoir eu la possession, -1 si aucune. */
  lastTeam: TeamId | -1;
  /** Ticks consécutifs passés libre (loose) — sert à déclencher la mêlée. */
  looseTicks: number;
  /** Orientation visuelle intégrée par la sim (déterministe) : rotation autour de l'axe long et culbute. */
  spin: number;
  tumble: number;
  spinRate: number;
  tumbleRate: number;
}

export type ProjectileKind = 'bullet' | 'pellet' | 'grenade';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  ownerId: number;
  team: TeamId;
  pos: Vec3;
  vel: Vec3;
  /** Ticks de vie restants. */
  ttl: number;
  /** Distance parcourue (pour l'atténuation des plombs). */
  traveled: number;
  /** Dégâts de stabilité de base. */
  damage: number;
  /**
   * En ligne seulement (lagcomp.ts) : retard (ticks) de la vue du tireur ; collisions testées contre la géométrie des
   * joueurs de ce nombre de ticks plus tôt. Absent = aucune compensation.
   */
  lag?: number;
}

export type ZoneKind = 'slow';

export interface Zone {
  id: number;
  kind: ZoneKind;
  ownerId: number;
  team: TeamId;
  /** Centre au sol. */
  pos: Vec3;
  radius: number;
  /** Ticks de vie restants. */
  ttl: number;
}

/**
 * Mêlée en cours (étape 7, scrum.ts) : zone de capture autour du ballon 'scrum'. Capture de
 * secToTicks(SCRUM_CAPTURE_SEC) ticks, puis prolongation (« premier qui mène ») tant que `ticks` reste sous
 * capture + secToTicks(SCRUM_TIE_EXTRA_SEC) : `scrumInOvertime`, `scrumTicksLeft`.
 */
export interface ScrumState {
  /** Centre de la zone de capture (au sol, sous le ballon). */
  center: Vec3;
  /** Rayon de la zone (m) : SCRUM_RADIUS × échelle du terrain. */
  radius: number;
  /** Ticks écoulés depuis le début de la capture (0 au tick du déclenchement). */
  ticks: number;
  /** Joueurs ACTIFS de chaque équipe dans la zone au dernier tick. */
  counts: [number, number];
}

// ---------------------------------------------------------------------------
// Événements (consommés par le rendu / HUD / sons, effacés à chaque tick)
// ---------------------------------------------------------------------------

/** Fin de vie d'un projectile : joueur touché, bouclier, relief / mur invisible, portée ou durée de vie atteinte. */
export type ProjectileEndReason = 'player' | 'blocked' | 'terrain' | 'expired';

export type MatchEvent =
  /** Un tir (une gâchette, tous les plombs) : `pos` = origine de visée, `dir` = direction visée (avant dispersion). */
  | { type: 'shot'; playerId: number; kind: ProjectileKind; pos: Vec3; dir: Vec3 }
  /**
   * Projectile reçu : `amount` = dégâts BRUTS (atténuation et multiplicateur porteur compris), non bornés à ce qui
   * restait de jauge ; `pos` = point d'impact.
   */
  | { type: 'hit'; targetId: number; sourceId: number; amount: number; pos: Vec3 }
  | { type: 'blocked'; targetId: number; sourceId: number; pos: Vec3 }
  /** Un projectile disparaît (traceurs, étincelles) : `pos` = point final (impact, ou bout de portée). */
  | { type: 'projectile_end'; projectileId: number; ownerId: number; kind: ProjectileKind; pos: Vec3; reason: ProjectileEndReason }
  | { type: 'explosion'; ownerId: number; pos: Vec3; radius: number }
  | { type: 'tackled'; targetId: number; byId: number }
  | { type: 'getup'; playerId: number }
  | { type: 'jump'; playerId: number; air: boolean }
  | { type: 'land'; playerId: number; speed: number }
  | { type: 'dodge'; playerId: number }
  | { type: 'slide'; playerId: number }
  | { type: 'dive'; playerId: number }
  | { type: 'climb'; playerId: number }
  | { type: 'reload'; playerId: number }
  | { type: 'ability'; playerId: number; role: Role }
  /** Ballon libre ramassé (cercle au sol). */
  | { type: 'pickup'; playerId: number }
  | { type: 'pass'; fromId: number; toId: number }
  | { type: 'pass_denied'; playerId: number }
  /** Ballon attrapé en vol. `fromId` = passeur / tireur (-1 si inconnu) ; `intercepted` = équipe du receveur ≠ équipe du lanceur. */
  | { type: 'catch'; playerId: number; fromId: number; intercepted: boolean }
  | { type: 'kick'; playerId: number }
  | { type: 'drop'; playerId: number }
  | { type: 'bounce'; pos: Vec3; speed: number }
  | { type: 'try'; team: TeamId; scorerId: number }
  | { type: 'kickoff'; team: TeamId }
  | { type: 'play' }
  /** Mêlée déclenchée (étape 7) : `pos` = centre de la zone, au sol. */
  | { type: 'scrum_start'; pos: Vec3 }
  /** Mêlée gagnée : `playerId` (de l'équipe `team`) porte désormais le ballon. */
  | { type: 'scrum_won'; team: TeamId; playerId: number }
  /** Mêlée sans vainqueur (0 contre 0 à la fin de la prolongation) : ballon rendu libre au centre `pos`. */
  | { type: 'scrum_released'; pos: Vec3 }
  | { type: 'last_minute' }
  | { type: 'match_end'; score: [number, number] };

export type MatchEventType = MatchEvent['type'];

// ---------------------------------------------------------------------------
// État du match
// ---------------------------------------------------------------------------

/**
 * - kickoff : remise en jeu, joueurs figés (seule la visée bouge) pendant `phaseTicks`
 * - play    : jeu en cours, le chrono tourne
 * - try     : pause après un essai pendant `phaseTicks`, puis remise en jeu
 * - ended   : fin du match
 */
export type MatchPhase = 'kickoff' | 'play' | 'try' | 'ended';

export interface MatchState {
  /** Version du format (incrémenter si le format change). */
  version: 1;
  /** Configuration NORMALISÉE par createMatch : tous les champs sont renseignés (aucun undefined). */
  config: Required<MatchConfig>;
  /** Terrain (statique). */
  field: FieldLayout;

  tick: number;
  phase: MatchPhase;
  /** Ticks restants dans la phase courante (kickoff / try), 0 sinon. */
  phaseTicks: number;
  /** Ticks restants au chrono. */
  clockTicks: number;
  /** Vrai pendant la dernière minute. */
  lastMinute: boolean;
  score: [number, number];
  /** Équipe qui reçoit le ballon à la prochaine remise en jeu. */
  kickoffTeam: TeamId;

  players: PlayerState[];
  ball: BallState;
  projectiles: Projectile[];
  zones: Zone[];
  scrum: ScrumState | null;

  /** Compteur d'identifiants d'entités (projectiles, zones). */
  nextEntityId: number;
  /** État du PRNG du match. */
  rng: number;
  /** Événements produits pendant le DERNIER tick simulé. */
  events: MatchEvent[];
}
