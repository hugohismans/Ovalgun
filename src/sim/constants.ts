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

import type { Role, TeamId, TerrainFeature } from './types';

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
/**
 * Multiplicateur des cooldowns (esquive, glissade, plongeon, capacité, rechargement) pendant la dernière minute.
 * N'accélère PAS la cadence de tir (fireInterval) : on recharge et on relance ses capacités plus vite, mais
 * une arme ne tire pas plus vite. ↓ = plus frénétique.
 */
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
/**
 * Grimpe : on ne grimpe un muret que si l'on va VERS sa face : cos minimal entre la vitesse et
 * la normale entrante de la face (0,4 ≈ 66°). En deçà (on le frôle), il fait obstacle et l'on
 * glisse le long. ↑ = il faut viser le muret plus franchement pour le grimper.
 */
export const CLIMB_MIN_APPROACH = 0.4;

/**
 * Disposition FIXE du relief, pour la moitié z < 0 (camp de l'équipe 0) d'un terrain 5v5.
 * L'autre moitié est obtenue par rotation de 180° autour du centre ((x, z) -> (-x, -z),
 * rotation + PI) : les deux camps sont strictement équivalents.
 * En 3v3, positions et tailles horizontales sont multipliées par FIELD_SCALE_3V3 ;
 * les HAUTEURS ne le sont pas (les murets restent franchissables mais visibles).
 * Contraintes (vérifiées par tests/sim/field.test.ts) : rien dans les en-buts ni à moins de
 * FIELD_TRY_LINE_CLEARANCE des lignes d'essai, rien dans le couloir central
 * (|z| < FIELD_CENTER_CLEARANCE), hauteurs ≤ MAX_CLIMB_HEIGHT.
 * `rotation` = yaw de l'axe local +Z (axe de la longueur), voir src/sim/field.ts.
 */
export const FIELD_FEATURES_HALF_5V5: readonly Readonly<TerrainFeature>[] = Object.freeze(
  (
    [
      // Positions en axes ABSOLUS. Rappel : right(yaw = 0) = −X, donc x < 0 est à DROITE de
      // l'équipe 0 (qui regarde +Z) et à gauche de l'équipe 1.
      /** Butte côté x < 0. */
      { kind: 'mound', x: -13, z: -21, radius: 5, height: 1.2 },
      /** Rampe côté x > 0, qui monte vers la médiane puis retombe verticalement (on retombe du haut, pas d'effet tremplin). */
      { kind: 'ramp', x: 13, z: -23, width: 4, length: 6, height: 1.0, rotation: 0 },
      /** Muret en travers, devant l'en-but : on le saute ou on le contourne. */
      { kind: 'wall', x: 0, z: -30, length: 8, thickness: 0.6, height: 0.8, rotation: Math.PI / 2 },
      /** Muret bas en biais près du centre (côté x < 0). */
      { kind: 'wall', x: -4, z: -14, length: 5, thickness: 0.6, height: 0.6, rotation: Math.PI / 2 + 0.45 },
      /** Muret le long de la touche x > 0 : couloir étroit entre lui et le bord. */
      { kind: 'wall', x: 21, z: -13, length: 6, thickness: 0.6, height: 1.0, rotation: 0 },
    ] satisfies TerrainFeature[]
  ).map((f) => Object.freeze(f)),
);
/** Distance minimale (m, ×échelle) entre un relief et une ligne d'essai. ↑ = abords des en-buts plus dégagés (sprint final sans obstacle). */
export const FIELD_TRY_LINE_CLEARANCE = 3;
/**
 * Demi-profondeur (m, ×échelle) du couloir central sans relief (coup d'envoi, replacement derrière la médiane).
 * ↑ = milieu de terrain plus ouvert, reliefs repoussés vers les en-buts.
 */
export const FIELD_CENTER_CLEARANCE = 9;

/**
 * Pas maximal (m) d'un sous-pas de déplacement des joueurs. Un dash à 21 m/s fait 0,7 m par tick :
 * il est découpé en sous-pas pour ne jamais traverser un muret. ↓ = plus sûr, plus coûteux.
 */
export const PLAYER_SUBSTEP_MAX_DIST = 0.25;
/** Nombre maximal de sous-pas par tick pour un joueur (sécurité contre des vitesses aberrantes). ↑ = vitesse max sans traversée plus haute, coût pire cas plus élevé. */
export const PLAYER_MAX_SUBSTEPS = 16;

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
 * Doit dépasser nettement PLAYER_RADIUS : à 0,75, il reste 0,30 m entre la capsule et la droite
 * de tir (le réticule ne touche plus la tête et le corps ne masque plus les cibles juste à sa gauche).
 * ↑ = personnage plus décalé à gauche de l'écran (et tirs qui partent plus à droite du corps).
 */
export const SHOULDER_OFFSET = 0.75;
/** Distance minimale de séparation entre deux joueurs debout (collisions douces). */
export const PLAYER_SEPARATION = PLAYER_RADIUS * 2;
/** Fraction du chevauchement corrigée par tick entre deux joueurs (0..1). */
export const PLAYER_PUSH_STRENGTH = 0.6;
/** Bornes du pitch de visée (degrés). */
export const PITCH_MIN_DEG = -75;
export const PITCH_MAX_DEG = 80;

/**
 * Formation : fraction de la largeur du terrain sur laquelle une équipe est répartie
 * (placement initial et remises en jeu). ↑ = joueurs plus écartés.
 */
export const FORMATION_WIDTH_FRACTION = 0.8;

// ============================================================================
//  DÉPLACEMENT (tous les joueurs)
// ============================================================================

/** Gravité appliquée aux joueurs (m/s²). Plus forte que la réalité = sauts nerveux. */
export const PLAYER_GRAVITY = 26;
/** Accélération au sol (m/s²). ↑ = démarrages et changements de direction plus secs. */
export const GROUND_ACCEL = 75;
/**
 * Freinage au sol de l'EXCÈS de vitesse dans la direction voulue (m/s²) : après une esquive,
 * une glissade, une grimpe ou un relâchement du sprint, on garde l'élan au lieu de s'arrêter net
 * (le braquage latéral reste à GROUND_ACCEL). ↑ = l'excès de vitesse disparaît plus vite.
 */
export const GROUND_OVERSPEED_DECEL = 15;
/** Décélération au sol sans entrée (m/s²). ↑ = arrêts plus nets. */
export const GROUND_DECEL = 60;
/**
 * Accélération en l'air (m/s²). ↑ = plus de contrôle aérien.
 * Au-delà de la vitesse de course (élan d'esquive, de glissade…), maintenir la direction ne freine
 * pas : l'entrée ne fait que réorienter la vitesse.
 */
export const AIR_ACCEL = 20;
/** Multiplicateur de vitesse en marche arrière (relatif au regard). */
export const BACKPEDAL_SPEED_MULT = 0.8;
/** Multiplicateur de vitesse en pas chassé. */
export const STRAFE_SPEED_MULT = 0.92;
/** Multiplicateur de vitesse en visée (clic droit). */
export const AIM_SPEED_MULT = 0.72;
/** Multiplicateur de vitesse en sprint (Shift maintenu). Le sprint empêche de tirer. */
export const SPRINT_SPEED_MULT = 1.22;
/**
 * Le sprint ne s'applique qu'en avançant : cosinus minimal de l'angle entre la direction d'entrée
 * et « devant » (0,64 ≈ 50° : la diagonale clavier à 45° sprinte, le pas chassé non).
 * ↑ = cône de sprint plus étroit.
 */
export const SPRINT_MIN_FORWARD_COS = 0.64;
/**
 * Manette : inclinaison minimale du stick pour sprinter (le clavier donne toujours 1).
 * ↑ = il faut pousser le stick plus loin pour sprinter.
 */
export const SPRINT_MIN_TILT = 0.7;
/**
 * Entrée analogique (stick de manette) : inclinaison à partir de laquelle on court à pleine
 * vitesse. En dessous, la vitesse cible est proportionnelle à l'inclinaison (marche lente).
 * Le clavier produit toujours une inclinaison de 1. ↓ = pleine vitesse atteinte plus tôt.
 */
export const MOVE_INPUT_FULL_SPEED = 0.9;

/** Vitesse verticale du saut (m/s). Hauteur ≈ v² / (2·gravité) ≈ 1,3 m. */
export const JUMP_VELOCITY = 8.2;
/** Vitesse verticale du double saut (ailier). */
export const AIR_JUMP_VELOCITY = 7.6;
/** Tolérance après avoir quitté le sol pendant laquelle on peut encore sauter (s). ↑ = plus permissif. */
export const COYOTE_TIME_SEC = 0.1;
/** Un appui saut juste avant l'atterrissage est mémorisé pendant cette durée (s). ↑ = plus permissif. */
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
/**
 * Saut pendant une esquive au sol (« dash-saut ») : autorisé après ce délai depuis le début de
 * l'esquive (s), en gardant l'élan de sortie. Un appui plus tôt est mémorisé (tampon de saut).
 * ↑ = le dash doit être plus avancé avant de pouvoir sauter.
 */
export const DODGE_JUMP_CANCEL_SEC = 0.07;

/** Glissade : vitesse horizontale minimale pour pouvoir glisser (m/s). */
export const SLIDE_MIN_SPEED = 5.5;
/** Glissade : boost de vitesse à l'entrée (multiplicateur de la vitesse courante). */
export const SLIDE_BOOST = 1.35;
/** Glissade : vitesse max atteinte grâce au boost (m/s). */
export const SLIDE_MAX_SPEED = 14;
/** Glissade : durée (s). ↑ = glissade plus longue (hitbox basse plus longtemps, mais fin plus lente). */
export const SLIDE_DURATION_SEC = 0.6;
/** Glissade : décélération pendant la glissade (m/s²). ↓ = glisse plus loin. */
export const SLIDE_DECEL = 6;
/** Glissade : capacité de braquage pendant la glissade (rad/s). */
export const SLIDE_STEER_RATE = 1.5;
/** Glissade : cooldown (s). */
export const SLIDE_COOLDOWN_SEC = 1.0;

// ============================================================================
//  STABILITÉ ET PLAQUAGE
// ============================================================================

/**
 * Délai sans être touché avant que la stabilité remonte (s). Cahier des charges : 2 s.
 * ↑ = les dégâts « collent » plus longtemps (se mettre à couvert compte moins).
 */
export const REGEN_DELAY_SEC = 2.0;
/** Vitesse de régénération de la stabilité (points/s) une fois le délai écoulé. ↑ = la jauge remonte plus vite. */
export const REGEN_RATE = 45;
/**
 * Multiplicateur des dégâts subis par le porteur (cahier des charges : « un peu plus fort »).
 * ↑ = le porteur tombe plus vite (défense plus forte).
 */
export const CARRIER_DAMAGE_MULT = 1.1;
/** Durée au sol après un plaquage (s). Cahier des charges : 2,5 s. ↑ = un plaquage pèse plus lourd (supériorité numérique plus longue). */
export const DOWN_DURATION_SEC = 2.5;
/** Durée de relevé, invulnérable et immobile (s). ↑ = relevé plus lent (le plaqué revient plus tard dans le jeu). */
export const GETUP_DURATION_SEC = 0.5;
/** Invulnérabilité supplémentaire après le relevé (s) pour éviter le « re-plaquage » instantané. ↑ = moins de re-plaquages au relevé. */
export const GETUP_INVULN_SEC = 0.6;
/** Vitesse verticale donnée au ballon lâché lors d'un plaquage (m/s). ↑ = rebond plus haut, ballon en l'air plus longtemps. */
export const TACKLE_DROP_POP_UP = 4;
/**
 * Vitesse horizontale ajoutée au ballon lâché, dans le sens de course du porteur (m/s), en plus de la part de sa
 * vitesse qu'il garde (TACKLE_DROP_CARRY_KEEP). ↑ = le ballon tombe plus loin devant (plus de « courses au ballon »).
 */
export const TACKLE_DROP_POP_FORWARD = 2.5;
/**
 * Part de la vitesse horizontale du porteur transmise au ballon lâché (0..1), plafonnée à TACKLE_DROP_MAX_CARRY :
 * plaqué en pleine esquive (21 m/s) ou en plongeon, le ballon ne part pas comme un coup de pied.
 * ↑ = le ballon lâché suit davantage l'élan du porteur.
 */
export const TACKLE_DROP_CARRY_KEEP = 0.3;
/** Plafond (m/s) de la part de vitesse du porteur transmise au ballon lâché. ↑ = lâchers plus longs à grande vitesse. */
export const TACKLE_DROP_MAX_CARRY = 4;
/**
 * Durée pendant laquelle le joueur plaqué ne peut pas reprendre le ballon qu'il vient de lâcher (s).
 * Sécurité : sans effet tant que DOWN_DURATION_SEC + GETUP_DURATION_SEC est plus long (un joueur au sol ou qui se
 * relève ne ramasse jamais). Ne compte que si l'on raccourcit beaucoup la durée au sol.
 */
export const TACKLE_PICKUP_BLOCK_SEC = 0.5;
/**
 * Freinage horizontal du corps d'un joueur plaqué (m/s²) : il glisse au sol puis s'arrête (≈ v²/2a : 7 m/s
 * => ≈ 1,2 m). ↑ = le plaqué s'arrête plus net (moins de glissade).
 */
export const TACKLE_SLIDE_DECEL = 20;
/**
 * Vitesse horizontale max (m/s) du corps d'un joueur au moment du plaquage : plaqué en esquive (21 m/s) ou en
 * plongeon, il ne glisse pas sur 15 m (glissade ≤ v²/2·TACKLE_SLIDE_DECEL ≈ 1,2 m). ↑ = glissades plus longues.
 */
export const TACKLE_SLIDE_MAX_SPEED = 7;
/** Rotation visuelle du ballon lâché sur un plaquage : culbute (rad/s). ↑ = lâcher plus désordonné. */
export const TACKLE_DROP_TUMBLE_RATE = 9;

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
/**
 * Décélération quand le ballon roule au sol (m/s²). ↑ = il s'arrête plus vite.
 * Sert aussi de seuil d'adhérence : sur une pente dont la composante de gravité (BALL_GRAVITY·sin θ)
 * est inférieure, un ballon arrêté y reste (rampes) ; au-delà, il dévale (flancs des buttes).
 */
export const BALL_GROUND_FRICTION = 4;
/** Vitesse verticale d'impact sous laquelle le ballon arrête de rebondir et roule. */
export const BALL_MIN_BOUNCE_SPEED = 1.2;
/** Coefficient de rebond sur les murs invisibles et les faces de murets. */
export const BALL_WALL_RESTITUTION = 0.6;
/** Vitesse (m/s) sous laquelle un ballon qui roule s'immobilise. ↑ = il s'arrête plus tôt. */
export const BALL_REST_SPEED = 0.08;
/** Pas maximal (m) d'un sous-pas du ballon (anti-traversée des murets). Doit rester < BALL_RADIUS. ↓ = collisions plus précises, plus coûteux. */
export const BALL_SUBSTEP_MAX_DIST = 0.1;
/** Nombre maximal de sous-pas par tick pour le ballon (sécurité). ↑ = vitesse max sans traversée plus haute, coût pire cas plus élevé. */
export const BALL_MAX_SUBSTEPS = 32;
/** Rotation visuelle : culbute (rad/s) donnée par m/s de vitesse d'impact à chaque rebond. ↑ = rebonds plus « fous ». */
export const BALL_TUMBLE_PER_IMPACT = 1.6;
/** Rotation visuelle : vrille autour de l'axe long (rad/s) par m/s de vitesse d'impact. ↑ = ballon qui vrille plus après un rebond. */
export const BALL_SPIN_PER_IMPACT = 2.2;

/** Ballon porté : décalage vers l'avant du porteur (m). ↑ = ballon tenu plus en avant. */
export const BALL_CARRY_FORWARD = 0.35;
/**
 * Ballon porté : décalage vers la droite du porteur (m, côté caméra épaule pour rester visible).
 * Doit dépasser PLAYER_RADIUS pour que le ballon sorte de la capsule. ↑ = ballon plus écarté du corps.
 */
export const BALL_CARRY_SIDE = 0.5;
/** Ballon porté : hauteur du centre du ballon au-dessus des pieds (m). ↑ = ballon tenu plus haut. */
export const BALL_CARRY_HEIGHT = 1.05;

/** Prototype (étape 2) : hauteur du lâcher du ballon au centre au début du match (m). ↑ = premiers rebonds plus hauts. */
export const BALL_DROP_HEIGHT = 3;
/** Prototype (étape 2) : vitesse horizontale initiale du ballon lâché, direction tirée au sort (m/s). ↑ = le ballon s'éloigne plus du centre. */
export const BALL_DROP_HORIZONTAL_SPEED = 1.2;

/**
 * Rayon du cercle de ramassage au sol du ballon libre (m), mesuré de l'AXE du joueur au centre du ballon.
 * Premier joueur dedans = porteur (plusieurs au même tick : le plus proche, puis le plus petit id).
 * ↑ = ballon libre plus facile à récupérer (moins de « courses après le ballon »).
 */
export const BALL_PICKUP_RADIUS = 1.3;
/**
 * Rayon horizontal pour attraper un COUP DE PIED en vol, mesuré de l'axe du joueur à la TRAJECTOIRE du ballon
 * pendant le tick (test balayé). Les passes ont leurs propres rayons (PASS_TARGET_CATCH_RADIUS,
 * PASS_INTERCEPT_RADIUS). ↑ = « chandelles » plus faciles à réceptionner.
 */
export const BALL_CATCH_RADIUS = 1.1;
/** Hauteur au-dessus de la tête jusqu'à laquelle on attrape un ballon (m). ↑ = on attrape plus haut (sauter pour intercepter). */
export const BALL_CATCH_REACH_ABOVE = 0.6;
/** Profondeur sous les pieds jusqu'à laquelle on attrape / ramasse le ballon (m) : ballon en contrebas d'un muret. ↑ = plus permissif. */
export const BALL_REACH_BELOW = 0.5;
/** Rotation visuelle d'une passe : vrille autour de l'axe long (rad/s, « spirale »). ↑ = vrille plus rapide. */
export const BALL_PASS_SPIN_RATE = 14;
/** Rotation visuelle d'un coup de pied : culbute bout par-dessus bout (rad/s). ↑ = culbute plus rapide. */
export const BALL_KICK_TUMBLE_RATE = 11;

// ============================================================================
//  LE PORTEUR
// ============================================================================

/** Multiplicateur de vitesse du porteur. ↑ = course plus grisante, défense plus dure. */
export const CARRIER_SPEED_MULT = 1.08;

/**
 * Passe : vitesse horizontale moyenne du ballon (m/s) ; la durée de vol en découle (bornée ci-dessous) et la
 * vitesse verticale est calculée pour arriver à PASS_TARGET_HEIGHT pile à cette durée. ↑ = passes plus tendues, moins interceptables.
 */
export const PASS_SPEED = 17;
/** Passe : durée de vol minimale (s) — garantit la cloche sur les passes courtes. ↑ = passes courtes plus lobées (plus lentes). */
export const PASS_MIN_FLIGHT_SEC = 0.35;
/** Passe : durée de vol maximale (s). ↑ = passes longues plus hautes et plus lentes (plus interceptables). */
export const PASS_MAX_FLIGHT_SEC = 1.1;
/** Passe : portée maximale de la visée assistée (m). ↑ = on peut viser des coéquipiers plus lointains. */
export const PASS_MAX_RANGE = 24;
/** Passe : distance idéale pour la visée assistée (m). ↑ = la visée préfère les coéquipiers plus éloignés. */
export const PASS_IDEAL_RANGE = 9;
/** Passe : anticipation de la course du receveur (0 = vise sa position actuelle, 1 = position prédite). ↑ = vise plus loin devant le receveur. */
export const PASS_LEAD = 1.0;
/**
 * Passe : vitesse (m/s) du receveur prise en compte au plus par l'anticipation. Sa vitesse INSTANTANÉE peut être
 * bien plus haute pendant une esquive (21 m/s), une sortie d'esquive ou une glissade, qui ne durent qu'un
 * instant : sans plafond, la passe partait 20 m trop loin. ≈ sprint de l'ailier (8,8 × 1,22 ≈ 10,7 m/s).
 * ↑ = mieux pour un receveur qui sprinte vraiment plus vite (capacité), pire pour celui qui esquive au départ.
 */
export const PASS_LEAD_MAX_SPEED = 11;
/**
 * Passe : rayon de réception (m) du receveur VISÉ (ball.passTargetId), de son axe à la trajectoire du ballon
 * (test balayé). Plus large que celui des intercepteurs : la passe assistée pardonne un receveur qui ralentit
 * ou coupe un peu au départ. ↑ = passes plus faciles à recevoir.
 */
export const PASS_TARGET_CATCH_RADIUS = 1.6;
/**
 * Passe : rayon (m) dans lequel un ADVERSAIRE intercepte une passe (de son axe à la trajectoire du ballon).
 * Les coéquipiers du passeur autres que le receveur visé n'attrapent jamais une passe en vol (un soutien collé
 * au porteur ne « vole » pas la passe destinée à un autre). Garder > PLAYER_RADIUS. ↑ = interceptions plus fréquentes.
 */
export const PASS_INTERCEPT_RADIUS = 0.8;
/** Passe : hauteur de réception visée au-dessus des pieds du receveur (m). ↑ = ballon reçu plus haut. */
export const PASS_TARGET_HEIGHT = 1.2;
/**
 * Passe : demi-angle du cône arrière (degrés). 90 = cône de 180° (cahier des charges).
 * Le cône est relatif au TERRAIN (règle du rugby : vers son propre en-but), pas au regard.
 */
export const PASS_CONE_HALF_ANGLE_DEG = 90;
/**
 * Passe : poids de l'alignement avec le regard du porteur dans le choix du receveur (on « regarde » à gauche
 * pour passer à gauche, voir PASS_AIM_LATERAL_GAIN). ↑ = le regard décide davantage du receveur.
 */
export const PASS_WEIGHT_AIM = 1.0;
/** Passe : poids de la distance (préférence pour PASS_IDEAL_RANGE). ↑ = préfère davantage le coéquipier à bonne distance. */
export const PASS_WEIGHT_DISTANCE = 0.6;
/** Passe : poids du démarquage (adversaires proches du receveur ou de la trajectoire). ↑ = évite davantage les passes risquées. */
export const PASS_WEIGHT_OPENNESS = 0.8;
/**
 * Passe : le regard est « replié » dans le demi-plan arrière (composante latérale gardée, composante avant
 * retournée vers son en-but), et sa composante latérale est multipliée par ce gain : on n'a pas besoin de
 * tourner beaucoup la caméra (donc sa course) pour choisir le côté. 1 = miroir exact du regard.
 * ↑ = un petit coup d'œil sur le côté suffit à changer de receveur.
 */
export const PASS_AIM_LATERAL_GAIN = 2.5;
/**
 * Passe : distance (m) en deçà de laquelle un adversaire menace la passe (proche du receveur ou du segment
 * de passe) ; la menace croît linéairement jusqu'à 1 au contact. ↑ = la visée assistée évite les adversaires de plus loin.
 */
export const PASS_OPENNESS_RADIUS = 4;
/**
 * Passe : bonus de note du receveur retenu par la visée assistée au tick précédent (hystérésis) : la cible ne
 * clignote pas entre deux soutiens symétriques au moindre pixel de souris. ↑ = cible plus « collante »
 * (il faut tourner davantage le regard pour en changer).
 */
export const PASS_TARGET_STICKY_BONUS = 0.15;
/**
 * Passe : le ballon part de la poitrine du porteur (BALL_CARRY_HEIGHT), décalé de cette distance (m) VERS le
 * receveur — pas de la position du ballon porté (devant-droite) : un défenseur qui fait face au porteur
 * n'intercepte pas une passe qui part dans son dos ; seul un adversaire sur la trajectoire le peut.
 * Garder > PLAYER_RADIUS. ↑ = le ballon sort plus loin du corps.
 */
export const PASS_RELEASE_OFFSET = 0.6;
/** Passe : le passeur ne peut pas rattraper sa propre passe pendant (s). ↑ = plus longtemps sans pouvoir reprendre le ballon. */
export const PASS_PICKUP_BLOCK_SEC = 0.4;

/**
 * Coup de pied : vitesse initiale (m/s) sur le terrain 5v5, multipliée par √(field.scale) (portée ∝ v², donc
 * proportionnelle à la taille du terrain : ≈ 25 m/s ×0,84 en 3v3). Portée ≈ v²·sin(2θ)/g ≈ 37 m en 5v5, ≈ 26 m
 * en 3v3 (tireur immobile). ↑ = coups de pied plus longs.
 */
export const KICK_SPEED = 25;
/**
 * Coup de pied : angle d'élévation de base (degrés). Haut (« chandelle ») : le ballon passe vite au-dessus des
 * bras des défenseurs proches et reste longtemps en l'air (tout le monde court). ↓ = coup de pied plus tendu,
 * plus facile à contrer.
 */
export const KICK_ELEVATION_DEG = 48;
/** Coup de pied : influence du pitch de visée sur l'élévation (0 = aucune). ↑ = regarder en l'air relève davantage la cloche. */
export const KICK_PITCH_INFLUENCE = 0.5;
/** Coup de pied : bornes de l'élévation (degrés). ↑ (min) = coup de pied rasant impossible ; ↑ (max) = chandelles plus verticales. */
export const KICK_ELEVATION_MIN_DEG = 15;
export const KICK_ELEVATION_MAX_DEG = 65;
/** Coup de pied : le tireur ne peut pas reprendre le ballon pendant (s). ↑ = « chip and chase » plus difficile. */
export const KICK_PICKUP_BLOCK_SEC = 0.7;
/** Coup de pied : départ du ballon devant les pieds (m). ↑ = le ballon part plus loin du corps (contre plus facile pour un défenseur collé). */
export const KICK_START_FORWARD = 0.6;
/** Coup de pied : hauteur de départ du ballon au-dessus du sol (m). ↑ = le ballon part plus haut (plus vite hors de portée des bras). */
export const KICK_START_HEIGHT = 0.35;
/**
 * Coup de pied : fraction de la vitesse horizontale du tireur ajoutée au ballon (0 = aucune). Taper en
 * pleine course envoie plus loin. ↑ = la course compte davantage.
 */
export const KICK_INHERIT_VELOCITY = 0.3;
/**
 * Coup de pied : pendant cette durée après le coup de pied (s), seul un ADVERSAIRE à moins de
 * KICK_CHARGE_DOWN_RADIUS du tireur peut attraper le ballon (un « contre » au contact) ; personne d'autre,
 * coéquipiers compris (un soutien collé ne transforme pas le coup de pied en remise en main).
 * ↑ = fenêtre de contre plus longue (et réception au départ impossible plus longtemps).
 */
export const KICK_CHARGE_DOWN_SEC = 0.15;
/** Coup de pied : distance (m) au tireur en deçà de laquelle un adversaire peut contrer. ↑ = contre possible de plus loin. */
export const KICK_CHARGE_DOWN_RADIUS = 1.5;

/** Plongeon : vitesse du dash avant (m/s). Distance ≈ vitesse × durée (≈ 6 m). ↑ = plongeon plus long. */
export const DIVE_SPEED = 17;
/** Plongeon : durée du dash (s). ↑ = plongeon plus long. */
export const DIVE_DURATION_SEC = 0.35;
/** Plongeon : invulnérabilité (s), depuis le tick du plongeon. Cahier des charges : 0,3 s. ↑ = plus longtemps intouchable. */
export const DIVE_INVULN_SEC = 0.3;
/**
 * Plongeon : temps passé au sol après le dash, en freinant (s). Compté seulement au sol ; une grimpe de muret
 * pendant le plongeon y mène aussi. ↑ = plongeon plus risqué.
 */
export const DIVE_RECOVER_SEC = 0.35;
/** Plongeon : freinage pendant la récupération au sol (m/s²). ↑ = arrêt plus sec après le plongeon. */
export const DIVE_RECOVER_DECEL = 40;
/** Plongeon : cooldown (s). ↑ = plongeon plus rare (moins utilisable comme simple accélération). */
export const DIVE_COOLDOWN_SEC = 2.0;
/**
 * Plongeon : on plonge dans le sens de l'entrée de déplacement si elle pointe vers l'avant (cos de l'angle
 * entre l'entrée et le regard ≥ cette valeur, 0,3 ≈ 72°), sinon droit devant (le regard).
 * ↑ = il faut pousser plus franchement vers l'avant pour plonger en biais.
 */
export const DIVE_INPUT_MIN_FORWARD_COS = 0.3;
/**
 * Plongeon possible en l'air (saut puis plongeon : « essai en vol »). En l'air, la récupération attend
 * l'atterrissage, sans contrôle (l'élan est gardé). false = plongeon seulement au sol.
 */
export const DIVE_IN_AIR = true;

// ============================================================================
//  ARMES ET CAPACITÉS PAR RÔLE
// ============================================================================

export interface WeaponStats {
  /**
   * Type de projectile tiré. Étape 5 : balles et plombs ; les grenades (explosion, knockback) arrivent à
   * l'étape 7 (d'ici là, le lance-grenades ne tire pas).
   */
  projectile: 'bullet' | 'pellet' | 'grenade';
  /**
   * Intervalle entre deux tirs (s), ARRONDI AU TICK le plus proche (au moins 1 tick) : la cadence réelle est
   * TICK_RATE / secToTicks(fireInterval) coups/s. Choisir de préférence un multiple de 1/30 s.
   * Non raccourci en dernière minute. ↓ = cadence plus élevée.
   */
  fireInterval: number;
  /** Projectiles par tir (plombs du fusil à pompe) ; un tir consomme UNE munition. */
  pellets: number;
  /** Dégâts de stabilité par projectile (avant atténuation et multiplicateur porteur). ↑ = plaquage plus rapide. */
  damage: number;
  /**
   * Dispersion : demi-angle (degrés) du cône dans lequel chaque projectile part, tirage uniforme seedé.
   * Sans visée / en visée (AIM). ↑ = moins précis.
   */
  spreadHipDeg: number;
  spreadAimDeg: number;
  /**
   * Vitesse initiale du projectile (m/s). Le déplacement est balayé (aucun « tunnel », quelle que soit la vitesse).
   * ↑ = moins d'avance à prendre sur une cible qui court ; ↓ = balles plus visibles et esquivables de loin.
   */
  speed: number;
  /** Portée maximale (m) : le projectile disparaît au-delà. ↑ = on touche de plus loin. */
  range: number;
  /**
   * Atténuation : dégâts pleins jusqu'à `falloffStart` (m), puis baisse linéaire jusqu'à `falloffMinMult` × dégâts
   * à `range`. ↑ falloffStart = dégâts pleins plus loin ; ↑ falloffMinMult = l'arme reste efficace de loin.
   */
  falloffStart: number;
  falloffMinMult: number;
  /**
   * Taille du chargeur et durée de rechargement (s, raccourcie en dernière minute). Munitions infinies :
   * rechargement automatique chargeur vide, ou manuel (RELOAD) chargeur incomplet.
   * ↑ magazine = moins de rechargements ; ↑ reloadSec = rechargement plus pénalisant.
   */
  magazine: number;
  reloadSec: number;
  /** Gravité appliquée au projectile (grenades), m/s². ↑ = trajectoire plus en cloche, portée utile plus courte. */
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
      // 2 ticks = 15 coups/s (cadence arrondie au tick, voir WeaponStats.fireInterval).
      fireInterval: 2 / TICK_RATE,
      pellets: 1,
      damage: 5,
      spreadHipDeg: 1.2,
      spreadAimDeg: 0.35,
      // 300 m/s = 10 m par tick : peu d'avance à prendre jusqu'à ~15 m, le traceur reste lisible.
      speed: 300,
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

/** Durée de vie max d'un projectile (s), sécurité (la portée `range` arrête normalement les balles bien avant). ↑ = projectiles lents vivent plus longtemps. */
export const PROJECTILE_MAX_LIFE_SEC = 3;
/**
 * Pas d'échantillonnage (m) du test projectile / butte (le relief lisse des buttes est échantillonné puis affiné
 * par dichotomie ; murets, rampes et sol sont exacts). ↓ = contact plus précis sur les buttes, plus coûteux.
 */
export const PROJECTILE_MOUND_SAMPLE_STEP = 0.1;
/**
 * Rayon des balles et plombs (m), ajouté à PLAYER_RADIUS dans le test projectile / joueur (pas contre le relief) :
 * absorbe le demi-tick d'interpolation entre l'image affichée et la simulation. Une glissade (capsule de
 * PLAYER_LOW_HEIGHT) passe toujours sous un tir à hauteur de torse. ↑ = balles plus tolérantes.
 */
export const PROJECTILE_HIT_RADIUS = 0.15;

/** Pilier — bouclier : demi-angle de l'arc protégé devant le joueur (degrés). */
export const SHIELD_HALF_ANGLE_DEG = 65;
/** Pilier — bouclier : multiplicateur de vitesse bouclier levé. */
export const SHIELD_SPEED_MULT = 0.75;
/** Pilier — bouclier : distance du bouclier devant le joueur (rendu et collision des projectiles, m). */
export const SHIELD_DISTANCE = 0.8;
/** Pilier — bouclier : rayon (demi-largeur) du bouclier (m). */
export const SHIELD_RADIUS = 1.1;

/**
 * Ailier — sprint boosté : multiplicateur de la vitesse de course pendant la capacité (cumulé avec le sprint et
 * le bonus du porteur ; utilisable en portant le ballon). ↑ = boost plus grisant (mais porteur plus dur à rattraper).
 */
export const BOOST_SPEED_MULT = 1.2;
/** Ailier — sprint boosté : multiplicateur d'accélération au sol pendant la capacité. ↑ = démarrages plus secs. */
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

/*
 * Cible d'entraînement « tourelle » (src/bots/turret.ts, étape 5, remplacée par de vrais bots à l'étape 6) :
 * un adversaire immobile qui se tourne vers l'ennemi actif le plus proche à portée et tire par rafales.
 */
/** Tourelle : portée d'engagement (fraction de la portée de l'arme). ↑ = elle tire de plus loin. */
export const TURRET_ENGAGE_RANGE_MULT = 0.85;
/** Tourelle : vitesse de rotation max (degrés/s). ↑ = elle suit mieux une cible qui court. */
export const TURRET_TURN_RATE_DEG = 200;
/** Tourelle : délai avant la première rafale sur une nouvelle cible (s). ↑ = plus de temps pour réagir. */
export const TURRET_REACTION_SEC = 0.5;
/** Tourelle : durée d'une rafale (s). ↑ = rafales plus longues (plus de dégâts). */
export const TURRET_BURST_SEC = 0.5;
/** Tourelle : pause entre deux rafales (s), plus un supplément tiré au sort (TURRET_PAUSE_JITTER_SEC). ↑ = moins de pression. */
export const TURRET_PAUSE_SEC = 0.9;
/** Tourelle : supplément de pause tiré au sort entre 0 et cette valeur (s) à chaque rafale. ↑ = rythme moins prévisible. */
export const TURRET_PAUSE_JITTER_SEC = 0.6;
/** Tourelle : erreur de visée tirée à chaque rafale (demi-amplitude, degrés). ↑ = moins précise. */
export const TURRET_AIM_ERROR_DEG = 1.6;
/** Tourelle : tremblement de visée tiré à chaque tick (demi-amplitude, degrés). ↑ = rafales plus dispersées. */
export const TURRET_AIM_JITTER_DEG = 0.5;
/** Tourelle : elle ne tire que si sa visée est à moins de cet angle de la cible voulue (degrés). ↑ = tire plus tôt en tournant. */
export const TURRET_FIRE_CONE_DEG = 5;
/**
 * Tourelle : part de l'avance prise sur une cible qui court (0 = vise sa position actuelle, 1 = vise sa position
 * prévue à l'arrivée de la balle). ↓ = plus facile à esquiver en courant.
 */
export const TURRET_LEAD_FRACTION = 1;

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

/** Distance caméra–épaule en course normale (m). ↑ = caméra plus reculée (plus de jeu visible, joueur plus petit). */
export const CAMERA_DISTANCE = 4.2;
/**
 * Distance quand on porte le ballon (plus reculée : on ne vise pas, on lit le jeu). Le port du ballon
 * PRIME sur la visée (le porteur ne vise pas). ↑ = caméra plus reculée quand on porte.
 */
export const CAMERA_DISTANCE_CARRY = 5.4;
/** Distance en visée (clic droit / gâchette gauche). ↑ = caméra moins rapprochée en visée (moins de précision). */
export const CAMERA_DISTANCE_AIM = 2.8;
/** Champ de vision vertical (degrés) : normal / porteur / visée. ↑ = champ plus large (vitesse ressentie, lisibilité au loin ↓). */
export const CAMERA_FOV = 72;
export const CAMERA_FOV_CARRY = 78;
export const CAMERA_FOV_AIM = 58;
/** Bonus de FOV proportionnel à la vitesse au-delà de la vitesse de course (degrés par m/s). ↑ = sensation de vitesse plus forte. */
export const CAMERA_FOV_SPEED_GAIN = 1.2;
/**
 * Plafond du bonus de FOV lié à la vitesse (degrés) : évite une « pulsation » de +14° à chaque esquive
 * (21 m/s). ↑ = effet « warp » plus fort au sprint / à l'esquive.
 */
export const CAMERA_FOV_SPEED_MAX_BONUS = 6;
/** Raideur du lissage des transitions de distance / FOV (1/s). ↑ = transitions plus vives. */
export const CAMERA_BLEND_RATE = 10;
/**
 * Collision caméra / sol : marge minimale (m) entre la caméra et le sol (relief compris). Si la caméra
 * passerait dessous, elle est rapprochée le long de la droite de visée. ↑ = caméra qui « décolle » plus tôt du sol.
 */
export const CAMERA_GROUND_MARGIN = 0.3;
/** Distance minimale (m) caméra–épaule quand une collision la rapproche. ↓ = la caméra peut venir plus près de la tête. */
export const CAMERA_MIN_DISTANCE = 0.9;
/** Sensibilité souris (radians par pixel) et multiplicateur en visée. ↑ = caméra plus rapide pour un même geste. */
export const MOUSE_SENSITIVITY = 0.0022;
export const MOUSE_AIM_SENSITIVITY_MULT = 0.6;

// ============================================================================
//  CLAVIER (lu uniquement par src/input)
// ============================================================================

/** Shift : durée de maintien au-delà de laquelle l'appui devient un sprint (s). Un appui plus bref = esquive seule. ↑ = sprint plus tardif, tape plus tolérant. */
export const SPRINT_HOLD_DELAY_SEC = 0.15;
/**
 * Shift : moment où part l'esquive.
 * - true : au RELÂCHEMENT d'un appui bref (< SPRINT_HOLD_DELAY_SEC). Maintenir Shift sprinte SANS consommer
 *   l'esquive (comme L3 / B séparés à la manette) ; latence de l'esquive = durée du tape (souvent 50 à 100 ms).
 * - false : à l'ENFONCEMENT (latence nulle), mais chaque sprint commence par une esquive (cooldown consommé).
 */
export const KEYBOARD_DODGE_ON_RELEASE = true;

// ============================================================================
//  MANETTE (lu uniquement par src/input — Gamepad API, disposition « standard »)
// ============================================================================

/** Zone morte radiale du stick gauche (déplacement), 0..1. ↑ = plus de tolérance à la dérive, moins de finesse. */
export const GAMEPAD_MOVE_DEADZONE = 0.15;
/** Zone morte radiale du stick droit (caméra), 0..1. ↑ = plus de tolérance à la dérive, moins de finesse. */
export const GAMEPAD_LOOK_DEADZONE = 0.12;
/**
 * Zones mortes EXTÉRIEURES (0..1) : la norme brute est considérée « à fond » dès 1 − valeur. Un stick usé
 * qui plafonne à 0,92–0,96 atteint quand même la vitesse max et le boost. ↑ = « à fond » atteint plus tôt.
 */
export const GAMEPAD_MOVE_OUTER_DEADZONE = 0.05;
export const GAMEPAD_LOOK_OUTER_DEADZONE = 0.08;
/**
 * Inclinaison d'un stick (après zone morte, 0..1) nécessaire pour que la manette devienne le périphérique
 * actif. Distincte de la zone morte : une manette posée dont le stick dérive juste au-delà ne « vole » pas la
 * main au clavier (glyphes, pause à Échap). ↑ = il faut un geste plus franc pour que la manette prenne la main.
 */
export const GAMEPAD_ACTIVITY_THRESHOLD = 0.35;
/** Exposant de la courbe de réponse du stick droit. ↑ = plus de précision au centre, plus de vitesse en bout de course. */
export const GAMEPAD_LOOK_CURVE = 1.8;
/** Vitesse de rotation horizontale à fond de stick (degrés/s). ↑ = demi-tours plus rapides, visée moins fine. */
export const GAMEPAD_LOOK_YAW_SPEED_DEG = 230;
/** Vitesse de rotation verticale à fond de stick (degrés/s). ↑ = caméra verticale plus vive. */
export const GAMEPAD_LOOK_PITCH_SPEED_DEG = 150;
/**
 * Accélération de rotation quand le stick reste à fond : multiplicateur atteint (↑ = demi-tour plus rapide),
 * délai avant le boost (↓ = boost plus tôt) et durée de montée (s, ↓ = boost plus brutal).
 */
export const GAMEPAD_LOOK_BOOST_MULT = 1.6;
export const GAMEPAD_LOOK_BOOST_DELAY_SEC = 0.2;
export const GAMEPAD_LOOK_BOOST_RAMP_SEC = 0.35;
/**
 * Seuil d'inclinaison du stick droit (après zone morte, 0..1) au-delà duquel on est « en bout de course »
 * et le boost de rotation horizontale démarre (après GAMEPAD_LOOK_BOOST_DELAY_SEC). ↓ = boost plus facile à déclencher.
 */
export const GAMEPAD_LOOK_BOOST_THRESHOLD = 0.95;
/**
 * Le boost ne se charge que si le stick est surtout HORIZONTAL : |x| ≥ valeur × norme (le boost ne
 * s'applique qu'au lacet ; regarder en l'air à fond ne doit pas préparer un demi-tour instantané).
 * ↑ = il faut pousser plus franchement à l'horizontale.
 */
export const GAMEPAD_LOOK_BOOST_MIN_HORIZONTAL = 0.7;
/** Multiplicateur de vitesse de caméra en visée (gâchette gauche). ↓ = visée plus lente et plus précise. */
export const GAMEPAD_AIM_LOOK_MULT = 0.55;
/** Seuil d'enfoncement des gâchettes analogiques (0..1). ↓ = tir / visée déclenchés plus tôt. */
export const GAMEPAD_TRIGGER_THRESHOLD = 0.35;
/** Inverser l'axe vertical de la caméra. */
export const GAMEPAD_INVERT_Y = false;
/** Aide à la visée (manette uniquement) : activée ? */
export const AIM_ASSIST_ENABLED = true;
/** Aide à la visée : demi-angle autour d'un adversaire dans lequel elle agit (degrés). ↑ = aide plus large. */
export const AIM_ASSIST_ANGLE_DEG = 4;
/** Aide à la visée : ralentissement de la caméra près d'une cible (multiplicateur). ↓ = cible plus « collante ». */
export const AIM_ASSIST_SLOWDOWN = 0.55;
/** Aide à la visée : fraction du déplacement angulaire de la cible suivie automatiquement (0 = aucune). ↑ = suivi plus fort. */
export const AIM_ASSIST_TRACKING = 0.3;
/**
 * Aide à la visée : correction de suivi maximale (degrés/s). Garantit qu'elle ne fait jamais « sauter »
 * la visée (pas d'accrochage brutal). ↑ = suivi plus efficace sur les cibles rapides.
 */
export const AIM_ASSIST_MAX_TRACK_DEG_PER_SEC = 25;
/**
 * Aide à la visée : inclinaison minimale d'un stick (après zone morte) pour que le suivi agisse.
 * Sans action du joueur, la visée ne bouge jamais toute seule. ↓ = suivi actif même stick presque lâché.
 */
export const AIM_ASSIST_MIN_INPUT = 0.05;
/** Vibrations (plaquage subi, tir reçu, essai, réception…). */
export const GAMEPAD_RUMBLE = true;

/** Signaux de vibration déclenchés par les événements du joueur local (voir src/input/haptics.ts). */
export type RumbleCue =
  | 'hitTaken'
  | 'tackled'
  | 'tackleDealt'
  | 'catch'
  | 'interceptionMade'
  | 'interceptionSuffered'
  | 'try'
  | 'tryConceded'
  | 'hardLanding';

export interface RumbleEffect {
  /** Durée (s). ↑ = vibration plus longue. */
  durationSec: number;
  /** Moteur basse fréquence (lourd), 0..1. ↑ = choc plus sourd. */
  strong: number;
  /** Moteur haute fréquence (léger), 0..1. ↑ = grésillement plus vif. */
  weak: number;
  /** Priorité : un effet en cours n'est interrompu que par un effet de priorité ≥. */
  priority: number;
}

/** Table événement -> vibration. Mettre `strong` et `weak` à 0 pour désactiver un signal. */
export const GAMEPAD_RUMBLE_EFFECTS: Readonly<Record<RumbleCue, Readonly<RumbleEffect>>> = {
  /** Tir reçu : léger et bref. */
  hitTaken: { durationSec: 0.07, strong: 0.1, weak: 0.35, priority: 1 },
  /** Plaquage subi : fort. */
  tackled: { durationSec: 0.45, strong: 1.0, weak: 0.6, priority: 4 },
  /** Plaquage réussi sur un adversaire : petit retour satisfaisant. */
  tackleDealt: { durationSec: 0.12, strong: 0.35, weak: 0.25, priority: 2 },
  /** Réception / ramassage du ballon : court et net. */
  catch: { durationSec: 0.09, strong: 0.45, weak: 0.2, priority: 2 },
  /** Interception réussie (on attrape une passe adverse) : plus marqué qu'une réception. */
  interceptionMade: { durationSec: 0.16, strong: 0.6, weak: 0.5, priority: 3 },
  /** Sa propre passe interceptée par un adversaire : choc sourd. */
  interceptionSuffered: { durationSec: 0.22, strong: 0.55, weak: 0.0, priority: 3 },
  /** Essai marqué par son équipe : long et festif. */
  try: { durationSec: 0.6, strong: 0.7, weak: 0.9, priority: 5 },
  /** Essai encaissé : sourd. */
  tryConceded: { durationSec: 0.3, strong: 0.4, weak: 0.0, priority: 3 },
  /** Réception d'un saut à grande vitesse verticale. */
  hardLanding: { durationSec: 0.06, strong: 0.25, weak: 0.0, priority: 1 },
};
/** Vitesse verticale d'atterrissage (m/s) au-delà de laquelle « hardLanding » vibre. ↑ = seulement les grosses chutes. */
export const RUMBLE_HARD_LANDING_SPEED = 9;
