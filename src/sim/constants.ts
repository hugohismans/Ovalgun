/**
 * ============================================================================
 *  OVALGUN — CONSTANTES DE GAMEPLAY (fichier unique de réglage)
 * ============================================================================
 *
 * Toutes les valeurs qui influencent le feeling sont ici. Unités : mètres,
 * secondes, m/s, m/s², degrés quand c'est indiqué (convertis en radians à
 * l'usage). Les durées sont converties en ticks par la simulation
 * (`secToTicks`), il suffit donc de raisonner en secondes.
 *
 * Légende des commentaires : « ↑ » = effet si on augmente la valeur.
 *
 * Ce fichier est de la DONNÉE PURE : aucune dépendance, aucun effet de bord.
 * Il est importé par la simulation, les bots et (pour la section CAMÉRA) le rendu.
 */

import type { Role, TeamId } from './types';

// ============================================================================
//  TEMPS
// ============================================================================

/** Fréquence de la simulation (Hz). Ne pas changer sans revoir les tests. */
export const TICK_RATE = 30;
/** Pas de temps fixe d'un tick (s). */
export const TICK_DT = 1 / TICK_RATE;

/** Durée d'un match (s). Cahier des charges : 6 minutes. */
export const MATCH_DURATION_SEC = 360;
/** Durée de la « dernière minute » (cooldowns raccourcis, ballon plus rapide). */
export const LAST_MINUTE_SEC = 60;
/** Multiplicateur des cooldowns (esquive, glissade, plongeon, capacité, rechargement) pendant la dernière minute. ↓ = plus frénétique. */
export const LAST_MINUTE_COOLDOWN_MULT = 0.7;
/** Multiplicateur de vitesse du ballon (passes, coups de pied) pendant la dernière minute. */
export const LAST_MINUTE_BALL_SPEED_MULT = 1.12;

/** Compte à rebours de remise en jeu, joueurs figés (s). */
export const KICKOFF_FREEZE_SEC = 2.0;
/** Pause de célébration après un essai avant la remise en jeu (s). */
export const TRY_PAUSE_SEC = 3.0;
/** Équipe qui reçoit le ballon au premier coup d'envoi (0 = équipe du joueur humain en solo). */
export const FIRST_KICKOFF_TEAM: TeamId = 0;
/** Points pour un essai. */
export const TRY_POINTS = 5;

// ============================================================================
//  TERRAIN
// ============================================================================

/** Largeur du terrain 5v5 (X, m). */
export const FIELD_WIDTH_5V5 = 52;
/** Longueur totale du terrain 5v5, ballon-mort à ballon-mort (Z, m). */
export const FIELD_LENGTH_5V5 = 96;
/** Profondeur de chaque en-but en 5v5 (m). */
export const IN_GOAL_DEPTH_5V5 = 8;
/** Échelle linéaire du terrain 3v3 par rapport au 5v5 (cahier des charges : ~70 %). S'applique aussi au relief. */
export const FIELD_SCALE_3V3 = 0.7;

/** Hauteur franchie sans ralentir (marche/pente). */
export const MAX_STEP_HEIGHT = 0.35;
/** Hauteur maximale grimpée automatiquement (murets). Au-delà : obstacle bloquant (aucun relief ne dépasse en pratique). */
export const MAX_CLIMB_HEIGHT = 1.3;
/** Vitesse verticale pendant la grimpe d'un muret (m/s). ↑ = vault plus sec. */
export const CLIMB_UP_SPEED = 7.5;
/** Fraction de la vitesse horizontale conservée pendant la grimpe. ↑ = le muret casse moins l'élan. */
export const CLIMB_HORIZONTAL_KEEP = 0.75;

// ============================================================================
//  CORPS DES JOUEURS
// ============================================================================

/** Rayon de la capsule joueur (m). */
export const PLAYER_RADIUS = 0.45;
/** Hauteur de la capsule debout (m). */
export const PLAYER_HEIGHT = 1.8;
/** Hauteur de la capsule en glissade / plongeon / au sol (m) : on passe sous les tirs hauts. */
export const PLAYER_LOW_HEIGHT = 0.9;
/** Hauteur de l'origine de visée au-dessus des pieds (m). */
export const AIM_ORIGIN_HEIGHT = 1.6;
/**
 * Décalage latéral (vers la droite) de l'origine de visée (m). La caméra épaule
 * est placée sur la droite du joueur, SUR LA MÊME DROITE que le tir : le tir part
 * donc exactement vers le réticule, quelle que soit la distance de la caméra.
 */
export const SHOULDER_OFFSET = 0.55;
/** Distance minimale de séparation entre deux joueurs debout (collisions douces). */
export const PLAYER_SEPARATION = PLAYER_RADIUS * 2;
/** Fraction du chevauchement corrigée par tick entre deux joueurs (0..1). */
export const PLAYER_PUSH_STRENGTH = 0.6;
/** Bornes du pitch de visée (degrés). */
export const PITCH_MIN_DEG = -75;
export const PITCH_MAX_DEG = 80;

// ============================================================================
//  DÉPLACEMENT (tous les joueurs)
// ============================================================================

/** Gravité appliquée aux joueurs (m/s²). Plus forte que la réalité = sauts nerveux. */
export const PLAYER_GRAVITY = 26;
/** Accélération au sol (m/s²). ↑ = démarrages et changements de direction plus secs. */
export const GROUND_ACCEL = 75;
/** Décélération au sol sans entrée (m/s²). ↑ = arrêts plus nets. */
export const GROUND_DECEL = 60;
/** Accélération en l'air (m/s²). ↑ = plus de contrôle aérien. */
export const AIR_ACCEL = 20;
/** Multiplicateur de vitesse en marche arrière (relatif au regard). */
export const BACKPEDAL_SPEED_MULT = 0.8;
/** Multiplicateur de vitesse en pas chassé. */
export const STRAFE_SPEED_MULT = 0.92;
/** Multiplicateur de vitesse en visée (clic droit). */
export const AIM_SPEED_MULT = 0.72;
/** Multiplicateur de vitesse en sprint (Shift maintenu). Le sprint empêche de tirer. */
export const SPRINT_SPEED_MULT = 1.22;
/** Le sprint ne s'applique qu'en avançant : composante avant minimale de l'entrée. */
export const SPRINT_MIN_FORWARD = 0.3;

/** Vitesse verticale du saut (m/s). Hauteur ≈ v² / (2·gravité) ≈ 1,3 m. */
export const JUMP_VELOCITY = 8.2;
/** Vitesse verticale du double saut (ailier). */
export const AIR_JUMP_VELOCITY = 7.6;
/** Tolérance après avoir quitté le sol pendant laquelle on peut encore sauter (s). ↑ = plus permissif. */
export const COYOTE_TIME_SEC = 0.1;
/** Un appui saut juste avant l'atterrissage est mémorisé pendant cette durée (s). */
export const JUMP_BUFFER_SEC = 0.12;

/** Esquive : vitesse du dash (m/s). Distance ≈ vitesse × durée. */
export const DODGE_SPEED = 21;
/** Esquive : durée du dash (s). */
export const DODGE_DURATION_SEC = 0.16;
/** Esquive : cooldown (s) pour un joueur sans ballon. */
export const DODGE_COOLDOWN_SEC = 1.4;
/** Esquive : cooldown (s) pour le porteur (cahier des charges : plus court). */
export const CARRIER_DODGE_COOLDOWN_SEC = 0.8;
/** Fraction de la vitesse du dash conservée en sortie (élan). ↑ = enchaînement plus fluide. */
export const DODGE_EXIT_SPEED_KEEP = 0.6;
/** Invulnérabilité pendant l'esquive (s). 0 = l'esquive ne protège que par le déplacement (le plongeon reste le seul « intouchable »). */
export const DODGE_INVULN_SEC = 0;
/** L'esquive est-elle possible en l'air ? */
export const DODGE_IN_AIR = true;

/** Glissade : vitesse horizontale minimale pour pouvoir glisser (m/s). */
export const SLIDE_MIN_SPEED = 5.5;
/** Glissade : boost de vitesse à l'entrée (multiplicateur de la vitesse courante). */
export const SLIDE_BOOST = 1.25;
/** Glissade : vitesse max atteinte grâce au boost (m/s). */
export const SLIDE_MAX_SPEED = 13;
/** Glissade : durée (s). */
export const SLIDE_DURATION_SEC = 0.75;
/** Glissade : décélération pendant la glissade (m/s²). ↓ = glisse plus loin. */
export const SLIDE_DECEL = 7;
/** Glissade : capacité de braquage pendant la glissade (rad/s). */
export const SLIDE_STEER_RATE = 1.5;
/** Glissade : cooldown (s). */
export const SLIDE_COOLDOWN_SEC = 1.0;

// ============================================================================
//  STABILITÉ ET PLAQUAGE
// ============================================================================

/** Délai sans être touché avant que la stabilité remonte (s). Cahier des charges : 2 s. */
export const REGEN_DELAY_SEC = 2.0;
/** Vitesse de régénération de la stabilité (points/s). */
export const REGEN_RATE = 45;
/** Multiplicateur des dégâts subis par le porteur. ↑ = le porteur tombe plus vite. */
export const CARRIER_DAMAGE_MULT = 1.25;
/** Durée au sol après un plaquage (s). Cahier des charges : 2,5 s. */
export const DOWN_DURATION_SEC = 2.5;
/** Durée de relevé, invulnérable et immobile (s). */
export const GETUP_DURATION_SEC = 0.5;
/** Invulnérabilité supplémentaire après le relevé (s) pour éviter le « re-plaquage » instantané. */
export const GETUP_INVULN_SEC = 0.6;
/** Vitesse verticale donnée au ballon lâché lors d'un plaquage (m/s). */
export const TACKLE_DROP_POP_UP = 4;
/** Vitesse horizontale donnée au ballon lâché (dans le sens de course du porteur, m/s). */
export const TACKLE_DROP_POP_FORWARD = 2.5;
/** Durée pendant laquelle le joueur plaqué ne peut pas reprendre le ballon (s). */
export const TACKLE_PICKUP_BLOCK_SEC = 0.5;

// ============================================================================
//  BALLON
// ============================================================================

/** Dimensions visuelles et de collision du ballon ovale (m). */
export const BALL_LENGTH = 0.3;
export const BALL_WIDTH = 0.19;
/** Rayon de collision du ballon (approximation sphérique, m). */
export const BALL_RADIUS = 0.12;
/** Gravité appliquée au ballon (m/s²). */
export const BALL_GRAVITY = 16;
/** Traînée de l'air (fraction de vitesse perdue par seconde). */
export const BALL_AIR_DRAG = 0.05;
/** Coefficient de rebond vertical de base. */
export const BALL_RESTITUTION = 0.5;
/** Variation aléatoire (±) du coefficient de rebond : rebonds plats ou hauts. */
export const BALL_RESTITUTION_JITTER = 0.3;
/** Déviation horizontale aléatoire maximale à chaque rebond (degrés). ↑ = rebonds plus imprévisibles. */
export const BALL_BOUNCE_DEVIATION_DEG = 40;
/** Fraction de vitesse horizontale conservée à chaque rebond. */
export const BALL_BOUNCE_FRICTION = 0.8;
/** Décélération quand le ballon roule au sol (m/s²). */
export const BALL_GROUND_FRICTION = 4;
/** Vitesse verticale d'impact sous laquelle le ballon arrête de rebondir et roule. */
export const BALL_MIN_BOUNCE_SPEED = 1.2;
/** Coefficient de rebond sur les murs invisibles et les faces de murets. */
export const BALL_WALL_RESTITUTION = 0.6;

/** Rayon du cercle de ramassage au sol du ballon libre (m). Premier joueur dedans = porteur. */
export const BALL_PICKUP_RADIUS = 1.3;
/** Rayon horizontal pour attraper un ballon en vol (passe / coup de pied / rebond haut). */
export const BALL_CATCH_RADIUS = 1.1;
/** Hauteur au-dessus de la tête jusqu'à laquelle on attrape un ballon en vol (m). */
export const BALL_CATCH_REACH_ABOVE = 0.6;

// ============================================================================
//  LE PORTEUR
// ============================================================================

/** Multiplicateur de vitesse du porteur. ↑ = course plus grisante, défense plus dure. */
export const CARRIER_SPEED_MULT = 1.08;

/** Passe : vitesse horizontale du ballon (m/s). ↑ = passes plus tendues, moins interceptables. */
export const PASS_SPEED = 17;
/** Passe : durée de vol minimale (s) — garantit la cloche sur les passes courtes. */
export const PASS_MIN_FLIGHT_SEC = 0.35;
/** Passe : durée de vol maximale (s). */
export const PASS_MAX_FLIGHT_SEC = 1.1;
/** Passe : portée maximale de la visée assistée (m). */
export const PASS_MAX_RANGE = 24;
/** Passe : distance idéale pour la visée assistée (m). */
export const PASS_IDEAL_RANGE = 9;
/** Passe : anticipation de la course du receveur (0 = vise sa position actuelle, 1 = position prédite). */
export const PASS_LEAD = 1.0;
/** Passe : hauteur de réception visée au-dessus des pieds du receveur (m). */
export const PASS_TARGET_HEIGHT = 1.2;
/**
 * Passe : demi-angle du cône arrière (degrés). 90 = cône de 180° (cahier des charges).
 * Le cône est relatif au TERRAIN (règle du rugby : vers son propre en-but), pas au regard.
 */
export const PASS_CONE_HALF_ANGLE_DEG = 90;
/** Passe : poids de l'alignement avec le regard du porteur dans le choix du receveur (on « regarde » à gauche pour passer à gauche). */
export const PASS_WEIGHT_AIM = 1.0;
/** Passe : poids de la distance (préférence pour PASS_IDEAL_RANGE). */
export const PASS_WEIGHT_DISTANCE = 0.6;
/** Passe : poids du démarquage (adversaires proches du receveur ou de la trajectoire). */
export const PASS_WEIGHT_OPENNESS = 0.8;
/** Passe : le passeur ne peut pas rattraper sa propre passe pendant (s). */
export const PASS_PICKUP_BLOCK_SEC = 0.4;

/** Coup de pied : vitesse initiale (m/s). Portée ≈ v²·sin(2θ)/g ≈ 40 m. */
export const KICK_SPEED = 25;
/** Coup de pied : angle d'élévation de base (degrés). */
export const KICK_ELEVATION_DEG = 38;
/** Coup de pied : influence du pitch de visée sur l'élévation (0 = aucune). */
export const KICK_PITCH_INFLUENCE = 0.5;
/** Coup de pied : bornes de l'élévation (degrés). */
export const KICK_ELEVATION_MIN_DEG = 15;
export const KICK_ELEVATION_MAX_DEG = 65;
/** Coup de pied : le tireur ne peut pas reprendre le ballon pendant (s). */
export const KICK_PICKUP_BLOCK_SEC = 0.7;

/** Plongeon : vitesse du dash avant (m/s). */
export const DIVE_SPEED = 14;
/** Plongeon : durée du dash (s). */
export const DIVE_DURATION_SEC = 0.35;
/** Plongeon : invulnérabilité (s). Cahier des charges : 0,3 s. */
export const DIVE_INVULN_SEC = 0.3;
/** Plongeon : temps passé au sol après le dash, quasi immobile (s). ↑ = plongeon plus risqué. */
export const DIVE_RECOVER_SEC = 0.35;
/** Plongeon : cooldown (s). */
export const DIVE_COOLDOWN_SEC = 2.0;

// ============================================================================
//  ARMES ET CAPACITÉS PAR RÔLE
// ============================================================================

export interface WeaponStats {
  /** Type de projectile tiré. */
  projectile: 'bullet' | 'pellet' | 'grenade';
  /** Intervalle entre deux tirs (s). */
  fireInterval: number;
  /** Projectiles par tir (plombs du fusil à pompe). */
  pellets: number;
  /** Dégâts de stabilité par projectile. */
  damage: number;
  /** Dispersion (demi-angle, degrés) sans visée / en visée. */
  spreadHipDeg: number;
  spreadAimDeg: number;
  /** Vitesse initiale du projectile (m/s). */
  speed: number;
  /** Portée maximale (m) : le projectile disparaît au-delà. */
  range: number;
  /** Distance à partir de laquelle les dégâts diminuent, et fraction restante à portée max. */
  falloffStart: number;
  falloffMinMult: number;
  /** Taille du chargeur et durée de rechargement (s). Munitions infinies. */
  magazine: number;
  reloadSec: number;
  /** Gravité appliquée au projectile (grenades), m/s². */
  gravity: number;
  /** Explosion (grenades) : rayon, dégâts au centre / au bord, bonus impact direct. */
  blastRadius: number;
  blastDamageCenter: number;
  blastDamageEdge: number;
  directHitBonus: number;
  /** Explosion : knockback horizontal et vertical (m/s) au centre. */
  knockback: number;
  knockbackUp: number;
  /** Fraction du knockback subie par le tireur s'il est dans son explosion (pas de dégâts). */
  selfKnockbackMult: number;
}

export interface AbilityStats {
  /** Durée active (s), 0 si instantanée. */
  duration: number;
  /** Cooldown (s), compté à la fin de la durée active. */
  cooldown: number;
}

export interface RoleStats {
  label: string;
  /** Description courte affichée dans le menu. */
  description: string;
  /** Vitesse de course de base (m/s). */
  runSpeed: number;
  /** Stabilité maximale. */
  stabilityMax: number;
  /** Nombre de sauts aériens (1 = double saut). */
  airJumps: number;
  weapon: WeaponStats;
  ability: AbilityStats & { label: string };
}

const NO_BLAST = {
  gravity: 0,
  blastRadius: 0,
  blastDamageCenter: 0,
  blastDamageEdge: 0,
  directHitBonus: 0,
  knockback: 0,
  knockbackUp: 0,
  selfKnockbackMult: 0,
} as const;

export const ROLES: Record<Role, RoleStats> = {
  pilier: {
    label: 'Pilier',
    description: 'Fusil à pompe courte portée, gros dégâts. Bouclier frontal. Le plus lent.',
    runSpeed: 7.2,
    stabilityMax: 100,
    airJumps: 0,
    weapon: {
      projectile: 'pellet',
      fireInterval: 0.85,
      pellets: 8,
      damage: 6.5,
      spreadHipDeg: 6,
      spreadAimDeg: 4.5,
      speed: 110,
      range: 15,
      falloffStart: 6,
      falloffMinMult: 0.4,
      magazine: 5,
      reloadSec: 2.0,
      ...NO_BLAST,
    },
    ability: { label: 'Bouclier', duration: 3.0, cooldown: 10 },
  },
  ailier: {
    label: 'Ailier',
    description: 'Pistolet-mitrailleur faible mais précis. Le plus rapide, double saut. Sprint boosté.',
    runSpeed: 8.8,
    stabilityMax: 100,
    airJumps: 1,
    weapon: {
      projectile: 'bullet',
      fireInterval: 0.075,
      pellets: 1,
      damage: 6,
      spreadHipDeg: 1.2,
      spreadAimDeg: 0.35,
      speed: 150,
      range: 45,
      falloffStart: 25,
      falloffMinMult: 0.6,
      magazine: 30,
      reloadSec: 1.4,
      ...NO_BLAST,
    },
    ability: { label: 'Sprint boosté', duration: 3.0, cooldown: 9 },
  },
  demi: {
    label: 'Demi',
    description: 'Lance-grenades à impact qui repousse. Pose une zone de ralentissement.',
    runSpeed: 8.0,
    stabilityMax: 100,
    airJumps: 0,
    weapon: {
      projectile: 'grenade',
      fireInterval: 0.7,
      pellets: 1,
      damage: 0,
      spreadHipDeg: 1.0,
      spreadAimDeg: 0.3,
      speed: 30,
      range: 60,
      falloffStart: 0,
      falloffMinMult: 1,
      magazine: 4,
      reloadSec: 2.0,
      gravity: 18,
      blastRadius: 3.5,
      blastDamageCenter: 32,
      blastDamageEdge: 10,
      directHitBonus: 10,
      knockback: 11,
      knockbackUp: 4,
      selfKnockbackMult: 0.6,
    },
    ability: { label: 'Zone de ralentissement', duration: 5.0, cooldown: 12 },
  },
};

/** Durée de vie max d'un projectile (s), sécurité. */
export const PROJECTILE_MAX_LIFE_SEC = 3;

/** Pilier — bouclier : demi-angle de l'arc protégé devant le joueur (degrés). */
export const SHIELD_HALF_ANGLE_DEG = 65;
/** Pilier — bouclier : multiplicateur de vitesse bouclier levé. */
export const SHIELD_SPEED_MULT = 0.75;
/** Pilier — bouclier : distance du bouclier devant le joueur (rendu et collision des projectiles, m). */
export const SHIELD_DISTANCE = 0.8;
/** Pilier — bouclier : rayon (demi-largeur) du bouclier (m). */
export const SHIELD_RADIUS = 1.1;

/** Ailier — sprint boosté : multiplicateur de vitesse (cumulé avec le sprint). */
export const BOOST_SPEED_MULT = 1.3;
/** Ailier — sprint boosté : multiplicateur d'accélération. */
export const BOOST_ACCEL_MULT = 1.4;

/** Demi — zone de ralentissement : rayon (m). */
export const SLOW_ZONE_RADIUS = 4.5;
/** Demi — zone de ralentissement : multiplicateur de vitesse des adversaires dedans. */
export const SLOW_ZONE_SPEED_MULT = 0.55;
/** Demi — zone de ralentissement : portée de pose (m, le long de la visée, projetée au sol). */
export const SLOW_ZONE_PLACE_RANGE = 16;

// ============================================================================
//  MÊLÉE
// ============================================================================

/** Temps pendant lequel le ballon doit rester libre avant de pouvoir déclencher une mêlée (s). */
export const SCRUM_LOOSE_SEC = 3;
/** Rayon de la zone de mêlée en 5v5 (m) ; multiplié par l'échelle du terrain en 3v3. */
export const SCRUM_RADIUS = 6;
/** Joueurs minimum de CHAQUE équipe dans le rayon pour déclencher la mêlée. */
export const SCRUM_MIN_PLAYERS_3V3 = 2;
export const SCRUM_MIN_PLAYERS_5V5 = 3;
/** Durée de la capture (s). L'équipe la plus nombreuse dans la zone à la fin gagne le ballon. */
export const SCRUM_CAPTURE_SEC = 3;
/** En cas d'égalité : prolongation (s) ; si toujours égalité, tirage au sort seedé. */
export const SCRUM_TIE_EXTRA_SEC = 2;

// ============================================================================
//  REMISE EN JEU
// ============================================================================

/** Distance devant sa propre ligne d'essai où l'équipe qui reçoit est placée (m, ×échelle). */
export const KICKOFF_RECEIVE_OFFSET = 4;
/** Distance derrière la médiane où l'autre équipe est placée (m, ×échelle). */
export const KICKOFF_DEFEND_OFFSET = 6;

// ============================================================================
//  BOTS (lu uniquement par src/bots)
// ============================================================================

export type BotDifficulty = 'facile' | 'normal' | 'difficile';

export interface BotDifficultyStats {
  label: string;
  /** Temps de réaction (s) : délai avant de prendre en compte un changement de situation. */
  reactionSec: number;
  /** Erreur de visée (écart-type approx., degrés). */
  aimErrorDeg: number;
  /** Vitesse maximale de rotation de la visée (degrés/s). */
  turnRateDeg: number;
  /** Intervalle entre deux décisions tactiques (s). */
  decisionSec: number;
  /** Distance d'engagement max (fraction de la portée de l'arme). */
  engageRangeMult: number;
  /** Probabilité de réagir (esquive) quand il est touché, par seconde. */
  dodgeReflex: number;
}

export const BOT_DIFFICULTY: Record<BotDifficulty, BotDifficultyStats> = {
  facile: {
    label: 'Facile',
    reactionSec: 0.55,
    aimErrorDeg: 7,
    turnRateDeg: 240,
    decisionSec: 0.6,
    engageRangeMult: 0.6,
    dodgeReflex: 0.3,
  },
  normal: {
    label: 'Normal',
    reactionSec: 0.32,
    aimErrorDeg: 3.5,
    turnRateDeg: 420,
    decisionSec: 0.4,
    engageRangeMult: 0.8,
    dodgeReflex: 0.8,
  },
  difficile: {
    label: 'Difficile',
    reactionSec: 0.18,
    aimErrorDeg: 1.6,
    turnRateDeg: 720,
    decisionSec: 0.25,
    engageRangeMult: 1.0,
    dodgeReflex: 1.6,
  },
};

// ============================================================================
//  CAMÉRA (lu uniquement par le rendu — regroupé ici pour régler le feeling au même endroit)
// ============================================================================

/** Distance caméra–épaule en course normale (m). */
export const CAMERA_DISTANCE = 4.2;
/** Distance quand on porte le ballon (plus reculée : on ne vise pas, on lit le jeu). */
export const CAMERA_DISTANCE_CARRY = 5.4;
/** Distance en visée (clic droit). */
export const CAMERA_DISTANCE_AIM = 2.4;
/** Champ de vision vertical (degrés) : normal / porteur / visée. */
export const CAMERA_FOV = 72;
export const CAMERA_FOV_CARRY = 78;
export const CAMERA_FOV_AIM = 58;
/** Bonus de FOV proportionnel à la vitesse au-delà de la vitesse de course (degrés par m/s) : sensation de vitesse. */
export const CAMERA_FOV_SPEED_GAIN = 1.2;
/** Raideur du lissage des transitions de distance / FOV (1/s). ↑ = transitions plus vives. */
export const CAMERA_BLEND_RATE = 10;
/** Sensibilité souris (radians par pixel) et multiplicateur en visée. */
export const MOUSE_SENSITIVITY = 0.0022;
export const MOUSE_AIM_SENSITIVITY_MULT = 0.6;

// ============================================================================
//  CLAVIER (lu uniquement par src/input)
// ============================================================================

/** Shift : durée de maintien au-delà de laquelle l'appui devient un sprint (s). Un appui plus bref = esquive seule. */
export const SPRINT_HOLD_DELAY_SEC = 0.15;

// ============================================================================
//  MANETTE (lu uniquement par src/input — Gamepad API, disposition « standard »)
// ============================================================================

/** Zone morte radiale du stick gauche (déplacement), 0..1. */
export const GAMEPAD_MOVE_DEADZONE = 0.15;
/** Zone morte radiale du stick droit (caméra), 0..1. */
export const GAMEPAD_LOOK_DEADZONE = 0.12;
/** Exposant de la courbe de réponse du stick droit. ↑ = plus de précision au centre, plus de vitesse en bout de course. */
export const GAMEPAD_LOOK_CURVE = 1.8;
/** Vitesse de rotation horizontale à fond de stick (degrés/s). */
export const GAMEPAD_LOOK_YAW_SPEED_DEG = 230;
/** Vitesse de rotation verticale à fond de stick (degrés/s). */
export const GAMEPAD_LOOK_PITCH_SPEED_DEG = 150;
/** Accélération de rotation quand le stick reste à fond : multiplicateur atteint, délai avant le boost et durée de montée (s). */
export const GAMEPAD_LOOK_BOOST_MULT = 1.6;
export const GAMEPAD_LOOK_BOOST_DELAY_SEC = 0.2;
export const GAMEPAD_LOOK_BOOST_RAMP_SEC = 0.35;
/** Multiplicateur de vitesse de caméra en visée (gâchette gauche). */
export const GAMEPAD_AIM_LOOK_MULT = 0.55;
/** Seuil d'enfoncement des gâchettes analogiques (0..1). */
export const GAMEPAD_TRIGGER_THRESHOLD = 0.35;
/** Inverser l'axe vertical de la caméra. */
export const GAMEPAD_INVERT_Y = false;
/** Aide à la visée (manette uniquement) : activée ? */
export const AIM_ASSIST_ENABLED = true;
/** Aide à la visée : demi-angle autour d'un adversaire dans lequel elle agit (degrés). */
export const AIM_ASSIST_ANGLE_DEG = 4;
/** Aide à la visée : ralentissement de la caméra près d'une cible (multiplicateur). ↓ = cible plus « collante ». */
export const AIM_ASSIST_SLOWDOWN = 0.55;
/** Aide à la visée : fraction du déplacement angulaire de la cible suivie automatiquement (0 = aucune). */
export const AIM_ASSIST_TRACKING = 0.3;
/** Vibrations (plaquage subi, tir reçu, essai, réception…). */
export const GAMEPAD_RUMBLE = true;
