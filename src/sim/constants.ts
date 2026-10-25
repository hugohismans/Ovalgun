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

/** Durée d'un match (s). Cahier des charges : 6 minutes. ↑ = match plus long (plus d'essais au total). */
export const MATCH_DURATION_SEC = 360;
/** Durée de la « dernière minute » (cooldowns raccourcis, ballon plus rapide). ↑ = fin de match frénétique plus longue. */
export const LAST_MINUTE_SEC = 60;
/**
 * Multiplicateur des cooldowns (esquive, glissade, plongeon, capacité, rechargement) pendant la dernière minute.
 * N'accélère PAS la cadence de tir (fireInterval) : on recharge et on relance ses capacités plus vite, mais
 * une arme ne tire pas plus vite. ↓ = plus frénétique.
 */
export const LAST_MINUTE_COOLDOWN_MULT = 0.7;
/** Multiplicateur de vitesse du ballon (passes, coups de pied) pendant la dernière minute. ↑ = ballon plus rapide en fin de match. */
export const LAST_MINUTE_BALL_SPEED_MULT = 1.12;

/**
 * Compte à rebours du PREMIER coup d'envoi, joueurs figés (s) : seule la visée bouge, le HUD affiche « 3, 2, 1, JOUEZ ! »
 * (secondes entières restantes). ↑ = plus de temps pour lire le placement au début du match.
 */
export const FIRST_KICKOFF_FREEZE_SEC = 3.0;
/**
 * Compte à rebours d'une REMISE EN JEU après un essai, joueurs figés (s) : le HUD affiche « 2, 1, JOUEZ ! ».
 * Correction de l'étape 6 : 3 -> 2 s (avec TRY_PAUSE_SEC 3 -> 2, un essai coûte 4 s figées au lieu de 6 ; le placement
 * est toujours le même, on le lit vite). ↑ = plus de temps pour lire le placement, ↓ = jeu relancé plus vite.
 */
export const KICKOFF_FREEZE_SEC = 2.0;
/**
 * Pause de célébration après un essai avant la remise en jeu (s), joueurs figés. Correction de l'étape 6 : 3 -> 2 s.
 * ↑ = célébration plus longue (plus de temps figé par essai).
 */
export const TRY_PAUSE_SEC = 2.0;
/** Équipe qui reçoit le ballon au premier coup d'envoi (0 = équipe du joueur humain en solo). */
export const FIRST_KICKOFF_TEAM: TeamId = 0;
/** Points pour un essai (le porteur franchit la ligne d'essai adverse, plongeon compris). ↑ = chaque essai pèse plus au score. */
export const TRY_POINTS = 5;

// ============================================================================
//  TERRAIN
// ============================================================================

/** Largeur du terrain 5v5 (X, m). ↑ = plus d'espace sur les côtés (plus dur à défendre). */
export const FIELD_WIDTH_5V5 = 52;
/** Longueur totale du terrain 5v5, ballon-mort à ballon-mort (Z, m). ↑ = plus de course avant l'essai (moins d'essais). */
export const FIELD_LENGTH_5V5 = 96;
/** Profondeur de chaque en-but en 5v5 (m). ↑ = en-buts plus profonds (plus de place derrière la ligne). */
export const IN_GOAL_DEPTH_5V5 = 8;
/**
 * Échelle linéaire du terrain 3v3 par rapport au 5v5 (cahier des charges : « environ 70 % de la taille »). S'applique
 * aussi au relief. Décision de la correction de l'étape 7 : « 70 % » lu comme une SURFACE (√0,7 ≈ 0,84 en longueur et
 * en largeur) plutôt que 0,7 en linéaire (49 % de la surface) : à 0,7, un porteur qui avait passé la défense marquait
 * presque à coup sûr (≈ 28–30 essais par match de 6 min bots contre bots). ↑ = terrain 3v3 plus grand (moins d'essais,
 * plus de course).
 */
export const FIELD_SCALE_3V3 = 0.84;

/** Hauteur franchie sans ralentir (marche/pente). ↑ = plus de reliefs montés sans grimper. */
export const MAX_STEP_HEIGHT = 0.35;
/** Hauteur maximale grimpée automatiquement (murets). Au-delà : obstacle bloquant (aucun relief ne dépasse en pratique). ↑ = grimpe plus haut. */
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

/** Rayon de la capsule joueur (m). ↑ = joueurs plus larges (plus faciles à toucher, plus de contacts). */
export const PLAYER_RADIUS = 0.45;
/** Hauteur de la capsule debout (m). ↑ = cible plus haute. */
export const PLAYER_HEIGHT = 1.8;
/** Hauteur de la capsule en glissade / plongeon / au sol (m) : on passe sous les tirs hauts. ↑ = posture basse moins protectrice. */
export const PLAYER_LOW_HEIGHT = 0.9;
/** Hauteur de l'origine de visée au-dessus des pieds (m). ↑ = tir (et caméra) plus haut, on tire plus facilement par-dessus les murets. */
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
/** Fraction du chevauchement corrigée par tick entre deux joueurs (0..1). ↑ = joueurs qui se chevauchent écartés plus vite. */
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

/** Gravité appliquée aux joueurs (m/s²). Plus forte que la réalité = sauts nerveux. ↑ = sauts plus courts et plus secs. */
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
/**
 * Freinage en l'air de l'EXCÈS de vitesse horizontale au-delà du plafond de course du joueur (m/s²) — plafond = vitesse
 * de course du rôle × SPRINT_SPEED_MULT × CARRIER_SPEED_MULT (porteur) × capacités. Passe finale : avant, l'élan aérien
 * était conservé indéfiniment, et comme un saut tamponné repart au tick même de l'atterrissage, une esquive suivie de
 * sauts à répétition tenait 12,6 m/s (21 × 0,6) pour TOUS les rôles, plus vite que tout sprint (pilier porteur :
 * 14 m/s en esquive + sauts contre 8,7 au sprint). Le dash-saut reste plus long qu'un saut (l'excès s'éteint en
 * ≈ 0,25 s), mais l'avance ne se cumule plus ; un knockback (≈ 10 m/s) perd moins de 0,1 m. S'applique aussi au
 * plongeon aérien (récupération en l'air). ↑ = l'élan d'une esquive, d'une glissade ou d'un plongeon s'éteint plus
 * vite en l'air (0 = élan aérien conservé sans limite, comportement d'avant).
 */
export const AIR_OVERSPEED_DECEL = 8;
/** Multiplicateur de vitesse en marche arrière (relatif au regard). ↑ = on recule plus vite. */
export const BACKPEDAL_SPEED_MULT = 0.8;
/** Multiplicateur de vitesse en pas chassé. ↑ = pas chassé plus rapide. */
export const STRAFE_SPEED_MULT = 0.92;
/** Multiplicateur de vitesse en visée (clic droit ; ignoré pour le porteur). ↑ = on se déplace plus vite en visant. */
export const AIM_SPEED_MULT = 0.72;
/**
 * Multiplicateur de vitesse en sprint (Shift maintenu). Tirer coupe le sprint. Correction de l'étape 7 : 1,22 -> 1,12 —
 * un porteur qui avait dépassé la défense ne pouvait plus être rattrapé (porteur 11,3 m/s de moyenne, ailier boosté
 * 13,9 m/s). Le porteur reste le plus rapide (course × 1,08 × 1,12 = × 1,21, contre × 1,12 pour un défenseur qui sprinte).
 * ↑ = jeu plus rapide, mais porteurs plus durs à rattraper (plus d'essais).
 */
export const SPRINT_SPEED_MULT = 1.12;
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

/** Vitesse verticale du saut (m/s). Hauteur ≈ v² / (2·gravité) ≈ 1,3 m. ↑ = saut plus haut (et plus long). */
export const JUMP_VELOCITY = 8.2;
/** Vitesse verticale du double saut (ailier). ↑ = double saut plus haut. */
export const AIR_JUMP_VELOCITY = 7.6;
/** Tolérance après avoir quitté le sol pendant laquelle on peut encore sauter (s). ↑ = plus permissif. */
export const COYOTE_TIME_SEC = 0.1;
/** Un appui saut juste avant l'atterrissage est mémorisé pendant cette durée (s). ↑ = plus permissif. */
export const JUMP_BUFFER_SEC = 0.12;

/** Esquive : vitesse du dash (m/s). Distance ≈ vitesse × durée. ↑ = esquive plus longue et plus brusque. */
export const DODGE_SPEED = 21;
/**
 * Esquive VERS L'AVANT (dans le sens du regard) : multiplicateur de DODGE_SPEED (et donc de la vitesse de sortie) pour un
 * dash pile devant. Vitesse du dash = DODGE_SPEED × (1 − (1 − ce multiplicateur) × c²), c = max(0, cos(direction, regard))
 * au déclenchement : une esquive latérale ou arrière garde DODGE_SPEED, une esquive en diagonale avant perd un peu.
 * Passe finale : l'esquive est une FEINTE latérale, pas un moyen de locomotion — enchaîner les esquives vers l'avant
 * allait 21 % plus vite que le sprint (ailier porteur 12,9 m/s contre 10,6 ; pilier 11,9 contre 8,7) ; le plongeon reste
 * l'accélération vers l'avant. ↑ (jusqu'à 1) = esquive avant aussi rapide qu'une esquive latérale.
 */
export const DODGE_FORWARD_SPEED_MULT = 0.7;
/** Esquive : durée du dash (s). ↑ = esquive plus longue. */
export const DODGE_DURATION_SEC = 0.16;
/** Esquive : cooldown (s) pour un joueur sans ballon. ↑ = esquives plus rares. */
export const DODGE_COOLDOWN_SEC = 1.4;
/** Esquive : cooldown (s) pour le porteur (cahier des charges : plus court). ↑ = esquives du porteur plus rares. */
export const CARRIER_DODGE_COOLDOWN_SEC = 0.8;
/**
 * Tampon d'esquive (s) : un appui d'esquive pendant que l'esquive n'est pas encore disponible (fin du cooldown, grimpe,
 * plongeon) est honoré dès qu'elle le devient, s'il date de moins que cette durée (passe finale, sur le modèle du saut :
 * un appui 1 à 3 ticks trop tôt était perdu sans effet). ↑ = plus permissif (mais une esquive peut partir un peu après
 * l'appui) ; 0 = pas de tampon.
 */
export const DODGE_BUFFER_SEC = 0.12;
/** Fraction de la vitesse du dash conservée en sortie (élan). ↑ = enchaînement plus fluide. */
export const DODGE_EXIT_SPEED_KEEP = 0.6;
/** Invulnérabilité pendant l'esquive (s). 0 = l'esquive ne protège que par le déplacement (le plongeon reste le seul « intouchable »). ↑ = esquive qui traverse les tirs. */
export const DODGE_INVULN_SEC = 0;
/** L'esquive est-elle possible en l'air ? */
export const DODGE_IN_AIR = true;
/**
 * Saut pendant une esquive au sol (« dash-saut ») : autorisé après ce délai depuis le début de
 * l'esquive (s), en gardant l'élan de sortie. Un appui plus tôt est mémorisé (tampon de saut).
 * ↑ = le dash doit être plus avancé avant de pouvoir sauter.
 */
export const DODGE_JUMP_CANCEL_SEC = 0.07;

/** Glissade : vitesse horizontale minimale pour pouvoir glisser (m/s). ↑ = il faut courir plus vite pour glisser. */
export const SLIDE_MIN_SPEED = 5.5;
/** Glissade : boost de vitesse à l'entrée (multiplicateur de la vitesse courante). ↑ = glissade plus explosive. */
export const SLIDE_BOOST = 1.35;
/** Glissade : vitesse max atteinte grâce au boost (m/s). ↑ = plafond du boost plus haut. */
export const SLIDE_MAX_SPEED = 14;
/** Glissade : durée (s). ↑ = glissade plus longue (hitbox basse plus longtemps, mais fin plus lente). */
export const SLIDE_DURATION_SEC = 0.6;
/** Glissade : décélération pendant la glissade (m/s²). ↓ = glisse plus loin. */
export const SLIDE_DECEL = 6;
/** Glissade : capacité de braquage pendant la glissade (rad/s). ↑ = glissade plus dirigeable. */
export const SLIDE_STEER_RATE = 1.5;
/** Glissade : cooldown (s). ↑ = glissades plus rares. */
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
 * Multiplicateur des dégâts subis par le porteur (cahier des charges : « un peu plus fort »). Correction de l'étape 7 :
 * 1,1 -> 1,3 (réglage du rythme, docs/ARCHITECTURE.md §15) : l'ailier plaque un porteur immobile en ≈ 1,0 s au lieu de
 * 1,2 s. 1,5 (proposé en relecture) ne donnait pas moins d'essais une fois le reste réglé, mais moins de ballon porté et
 * plus de joueurs au sol. ↑ = le porteur tombe plus vite (défense plus forte).
 */
export const CARRIER_DAMAGE_MULT = 1.3;
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
 * relève ne ramasse jamais). Ne compte que si l'on raccourcit beaucoup la durée au sol. ↑ = blocage plus long.
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
/** Rayon de collision du ballon (approximation sphérique, m). ↑ = ballon qui touche le relief plus tôt. */
export const BALL_RADIUS = 0.12;
/** Gravité appliquée au ballon (m/s²). ↑ = trajectoires plus tendues, rebonds plus courts. */
export const BALL_GRAVITY = 16;
/** Traînée de l'air (fraction de vitesse perdue par seconde). ↑ = passes et coups de pied freinés plus vite. */
export const BALL_AIR_DRAG = 0.05;
/** Coefficient de rebond vertical de base. ↑ = rebonds plus hauts. */
export const BALL_RESTITUTION = 0.5;
/** Variation aléatoire (±) du coefficient de rebond : rebonds plats ou hauts. ↑ = hauteur des rebonds plus imprévisible. */
export const BALL_RESTITUTION_JITTER = 0.3;
/** Déviation horizontale aléatoire maximale à chaque rebond (degrés). ↑ = rebonds plus imprévisibles. */
export const BALL_BOUNCE_DEVIATION_DEG = 40;
/** Fraction de vitesse horizontale conservée à chaque rebond. ↑ = le ballon file plus loin après un rebond. */
export const BALL_BOUNCE_FRICTION = 0.8;
/**
 * Décélération quand le ballon roule au sol (m/s²). ↑ = il s'arrête plus vite.
 * Sert aussi de seuil d'adhérence : sur une pente dont la composante de gravité (BALL_GRAVITY·sin θ)
 * est inférieure, un ballon arrêté y reste (rampes) ; au-delà, il dévale (flancs des buttes).
 */
export const BALL_GROUND_FRICTION = 4;
/** Vitesse verticale d'impact sous laquelle le ballon arrête de rebondir et roule. ↑ = il se met à rouler plus tôt. */
export const BALL_MIN_BOUNCE_SPEED = 1.2;
/** Coefficient de rebond sur les murs invisibles et les faces de murets. ↑ = le ballon repart plus vite des murs. */
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

/**
 * Hauteur du lâcher du ballon au centre (m) : outil de test « ballon au centre » (debugResetBall) et match « en jeu »
 * des tests (tests/sim/helpers.ts). Depuis l'étape 6, un vrai match commence par un coup d'envoi. ↑ = premiers rebonds plus hauts.
 */
export const BALL_DROP_HEIGHT = 3;
/**
 * Vitesse horizontale initiale du ballon lâché au centre, direction tirée au sort (m/s) : match « en jeu » des tests
 * (tests/sim/helpers.ts, départ des étapes 2 à 5). Plus utilisée par un vrai match (coup d'envoi). ↑ = le ballon s'éloigne plus du centre.
 */
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
 * Le cône est relatif au TERRAIN (règle du rugby : vers son propre en-but), pas au regard. ↑ = cône plus large
 * (au-delà de 90 : passes en avant).
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
 * proportionnelle à la taille du terrain : ≈ 25 m/s × 0,92 en 3v3, échelle 0,84). Portée ≈ v²·sin(2θ)/g ≈ 37 m en 5v5,
 * ≈ 31 m en 3v3 (tireur immobile). ↑ = coups de pied plus longs.
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
   * Type de projectile tiré : balles (ailier), plombs (pilier : `pellets` par tir), grenades (demi : trajectoire
   * balistique de gravité `gravity`, explosion à l'impact, voir src/sim/explosion.ts).
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
  /**
   * Portée maximale (m, distance parcourue le long de la trajectoire) : le projectile disparaît au-delà (une grenade
   * explose alors en l'air, comme au bout de PROJECTILE_MAX_LIFE_SEC). ↑ = on touche de plus loin.
   */
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
  /**
   * Gravité appliquée au projectile (grenades), m/s² : parabole EXACTE (balayée en PROJECTILE_ARC_SUBSTEPS cordes par
   * tick). Portée sur le plat ≈ v²/g à 45°. ↑ = trajectoire plus en cloche, portée utile plus courte.
   */
  gravity: number;
  /**
   * Explosion (grenades) : rayon (m, mesuré jusqu'à la SURFACE de la capsule du joueur), dégâts au centre / au bord
   * (dégressifs linéairement entre les deux), bonus de l'impact direct (le joueur que la grenade touche).
   * ↑ blastRadius = zone plus large ; ↑ dégâts = plaquage plus rapide.
   */
  blastRadius: number;
  blastDamageCenter: number;
  blastDamageEdge: number;
  directHitBonus: number;
  /**
   * Explosion : knockback horizontal et vertical (m/s) donné au centre. L'horizontal est une vitesse MINIMALE imposée
   * dans la direction du souffle (un joueur qui fonce sur l'explosion est renvoyé ; un joueur qui fuit déjà plus vite
   * ne gagne rien), le vertical s'ajoute (il décolle, garde son élan en l'air, atterrit). ↑ = joueurs projetés plus
   * loin / plus haut.
   */
  knockback: number;
  knockbackUp: number;
  /** Knockback au bord de l'explosion = knockback × cette fraction (linéaire entre le centre et le bord). ↑ = le bord repousse plus. */
  knockbackEdgeMult: number;
  /** Fraction du knockback subie par le tireur s'il est dans son explosion (pas de dégâts) : « grenade jump ». ↑ = saut plus fort. */
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
  /** Capacité : nom complet (menu, contrôles) et, au besoin, nom court du HUD (pastille étroite, passe finale). */
  ability: AbilityStats & { label: string; hudLabel?: string };
}

const NO_BLAST = {
  gravity: 0,
  blastRadius: 0,
  blastDamageCenter: 0,
  blastDamageEdge: 0,
  directHitBonus: 0,
  knockback: 0,
  knockbackUp: 0,
  knockbackEdgeMult: 0,
  selfKnockbackMult: 0,
} as const;

export const ROLES: Record<Role, RoleStats> = {
  pilier: {
    label: 'Pilier',
    description: 'Fusil à pompe courte portée, gros dégâts. Bouclier frontal. Le plus lent.',
    runSpeed: 7.2,
    stabilityMax: 100,
    airJumps: 0,
    // Fusil à pompe (étape 7) : 8 plombs × 6,5 = 52 à bout portant => PLAQUAGE EN 2 TIRS (0,83 s) jusqu'à ~6 m (tous
    // les plombs touchent jusqu'à ~5 m : rayon de dispersion à la hanche 5 × tan 6° ≈ 0,53 m < 0,6 m de capsule).
    // Mesuré (docs/TESTING.md, étape 7, moyenne de 40 tirs à la hanche / en visée sur une cible immobile) : 52 à 3–5 m,
    // ≈ 38 / 46 à 8 m, ≈ 22 / 35 à 10 m, ≈ 6 / 10 à 15 m : inefficace au-delà de ~12 m, rien au-delà de `range`.
    weapon: {
      projectile: 'pellet',
      // 25 ticks (0,83 s) : multiple exact du tick (voir WeaponStats.fireInterval).
      fireInterval: 25 / TICK_RATE,
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
    // Bouclier frontal (étape 7) : actif `duration`, puis `cooldown` (annulable : voir SHIELD_CANCEL_MIN_COOLDOWN_FRACTION).
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
    // Lance-grenades à impact (étape 7) : 30 m/s, gravité 18 => portée ≈ 50 m à 45° sur le plat, 1 m par tick (visible,
    // esquivable). Impact direct 32 + 10 = 42 (46 sur le porteur) : 3 grenades pour plaquer ; c'est surtout une arme de
    // contrôle (knockback : ≈ 4,5 m de vol plané au centre, porteur compris, qui garde le ballon).
    weapon: {
      projectile: 'grenade',
      // 21 ticks (0,7 s), multiple exact du tick.
      fireInterval: 21 / TICK_RATE,
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
      knockback: 10,
      knockbackUp: 6,
      knockbackEdgeMult: 0.35,
      selfKnockbackMult: 0.75,
    },
    // Zone de ralentissement (étape 7) : capacité INSTANTANÉE (le cooldown part à la pose), la zone vit `duration`.
    ability: { label: 'Zone de ralentissement', hudLabel: 'Zone lente', duration: 5.0, cooldown: 12 },
  },
};

/**
 * Durée de vie max d'un projectile (s), sécurité (la portée `range` arrête normalement les balles bien avant). Une
 * grenade qui l'atteint (tir très en cloche) explose en l'air (« mèche »). ↑ = projectiles lents vivent plus longtemps.
 */
export const PROJECTILE_MAX_LIFE_SEC = 3;
/**
 * Projectiles soumis à la gravité (grenades) : nombre de cordes par tick pour balayer la parabole (extrémités exactement
 * sur la parabole ; écart corde / arc ≤ g·(dt/n)²/8 ≈ 0,2 mm). ↑ = contact plus précis, plus coûteux.
 */
export const PROJECTILE_ARC_SUBSTEPS = 4;
/**
 * Pas d'échantillonnage (m) du test projectile / butte (le relief lisse des buttes est échantillonné puis affiné
 * par dichotomie ; murets, rampes et sol sont exacts). ↓ = contact plus précis sur les buttes, plus coûteux.
 */
export const PROJECTILE_MOUND_SAMPLE_STEP = 0.1;
/**
 * Rayon des projectiles (balles, plombs, grenades ; m), ajouté à PLAYER_RADIUS dans le test projectile / joueur (pas
 * contre le relief ni le bouclier) : absorbe le demi-tick d'interpolation entre l'image affichée et la simulation. Une
 * glissade (capsule de PLAYER_LOW_HEIGHT) passe toujours sous un tir à hauteur de torse. ↑ = projectiles plus tolérants.
 */
export const PROJECTILE_HIT_RADIUS = 0.15;

/*
 * Pilier — bouclier frontal (étape 7, src/sim/shield.ts). Géométrie (sim ET rendu) : un ARC de cylindre vertical de
 * rayon SHIELD_DISTANCE autour de l'axe du pilier, sur ±SHIELD_HALF_ANGLE_DEG autour de son regard (yaw), des pieds à
 * SHIELD_HEIGHT. Un projectile adverse qui ENTRE dans cette surface (de l'extérieur) est détruit : il protège aussi
 * ceux qui sont derrière. Le pilier lui-même ne subit aucun projectile ni explosion venant de son arc frontal.
 * (Étape 7 : SHIELD_RADIUS, « demi-largeur » d'un disque plat, est remplacé par SHIELD_HEIGHT : un disque plat de
 * 1,1 m à 0,8 m ne couvrait que ±54° ; l'arc couvre exactement SHIELD_HALF_ANGLE_DEG.)
 */
/** Pilier — bouclier : demi-angle de l'arc protégé devant le joueur (degrés). ↑ = protège plus sur les côtés. */
export const SHIELD_HALF_ANGLE_DEG = 65;
/** Pilier — bouclier : multiplicateur de vitesse bouclier levé (porteur compris). ↑ = charge derrière le bouclier plus rapide. */
export const SHIELD_SPEED_MULT = 0.75;
/**
 * Pilier — bouclier : rayon de l'arc, donc distance du bouclier devant l'axe du joueur (m, collision et rendu). Doit
 * rester > PLAYER_RADIUS + PROJECTILE_HIT_RADIUS (0,6) pour qu'un tir de face rencontre le bouclier avant la capsule.
 * ↑ = bouclier plus loin devant (couvre plus large derrière lui).
 */
export const SHIELD_DISTANCE = 0.8;
/** Pilier — bouclier : hauteur du bouclier au-dessus des pieds (m). Garder > PLAYER_HEIGHT + PROJECTILE_HIT_RADIUS. ↑ = couvre plus haut (lobs). */
export const SHIELD_HEIGHT = 2.1;
/**
 * Pilier — bouclier baissé avant la fin (second appui) : le cooldown est PROPORTIONNEL à la durée utilisée
 * (cooldown × utilisé / durée), mais au moins cette fraction du cooldown (pas de bouclier « clignotant » gratuit).
 * Plaqué bouclier levé : cooldown complet. ↑ = annuler coûte plus cher.
 */
export const SHIELD_CANCEL_MIN_COOLDOWN_FRACTION = 0.3;
/**
 * Pilier — explosion arrêtée par un bouclier (de face pour le pilier, ou derrière un bouclier pour les autres) : aucun
 * dégât, knockback × cette fraction (le pilier encaisse le souffle mais tient sa ligne). ↑ = le bouclier repousse plus.
 */
export const SHIELD_BLAST_KNOCKBACK_MULT = 0.35;

/*
 * Demi — explosions et knockback (étape 7, src/sim/explosion.ts).
 */
/**
 * Vitesse horizontale max (m/s) qu'un knockback peut donner (plusieurs explosions au même tick ne se cumulent pas sans
 * limite ; une vitesse déjà plus haute n'est pas réduite). Reste bien sous la limite des sous-pas (pas de traversée de
 * muret). ↑ = projections plus violentes.
 */
export const KNOCKBACK_MAX_HORIZONTAL_SPEED = 16;
/** Vitesse verticale max (m/s) après un knockback (« grenade jump » compris). ↑ = projections plus hautes. */
export const KNOCKBACK_MAX_VERTICAL_SPEED = 13;
/**
 * Ligne de vue d'une explosion : son origine est reculée de cette distance (m) le long de la trajectoire de la grenade
 * (côté libre du point d'impact) ; un joueur est touché si le segment origine -> point de son axe le plus proche, ou
 * origine -> haut de son axe, ne coupe aucun relief (une butte ou un muret protège). ↑ = plus tolérant au ras du sol.
 */
export const BLAST_LOS_BACKOFF = 0.2;

/**
 * Ailier — sprint boosté : multiplicateur de la vitesse de course pendant la capacité (cumulé avec le sprint et
 * le bonus du porteur ; utilisable en portant le ballon). ↑ = boost plus grisant (mais porteur plus dur à rattraper).
 */
export const BOOST_SPEED_MULT = 1.1; // correction de l'étape 7 : 1,2 -> 1,1 (ailier porteur boosté ≈ 11,7 m/s au lieu de 13,9)
/** Ailier — sprint boosté : multiplicateur d'accélération au sol pendant la capacité. ↑ = démarrages plus secs. */
export const BOOST_ACCEL_MULT = 1.4;

/*
 * Demi — zone de ralentissement (étape 7, src/sim/abilities.ts) : posée au point visé (rayon du regard contre le
 * relief, sinon au sol à portée max), une seule par demi (la nouvelle remplace l'ancienne), durée ROLES.demi.ability.duration.
 * Elle ralentit la COURSE des adversaires dont les pieds sont dedans (sprint, visée, porteur compris) ; l'accélération,
 * l'esquive, le plongeon et le saut ne changent pas (s'en échapper coûte une esquive). Pas d'effet sur les alliés.
 */
/** Demi — zone de ralentissement : rayon (m). ↑ = zone plus large (plus dure à contourner). */
export const SLOW_ZONE_RADIUS = 4.5;
/** Demi — zone de ralentissement : multiplicateur de vitesse de course des adversaires dedans. ↓ = ralentit plus. */
export const SLOW_ZONE_SPEED_MULT = 0.55;
/** Demi — zone de ralentissement : portée de pose (m, le long de la visée ; sans relief touché, au sol à cette distance horizontale). ↑ = posée plus loin. */
export const SLOW_ZONE_PLACE_RANGE = 16;
/** Demi — zone de ralentissement : hauteur (m) au-dessus / au-dessous du centre de la zone où les pieds comptent comme « dedans ». ↑ = on la survole moins facilement. */
export const SLOW_ZONE_HEIGHT = 1.5;

// ============================================================================
//  COMPOSITION DES ÉQUIPES (étape 7, lue par src/game/roles.ts)
// ============================================================================

/**
 * Composition par défaut en 3v3 (cahier des charges : un de chaque rôle). Le joueur humain prend le rôle choisi, ses
 * coéquipiers les autres ; l'équipe adverse a la même composition.
 */
export const TEAM_ROLES_3V3: readonly Role[] = Object.freeze(['pilier', 'ailier', 'demi']);
/**
 * Composition par défaut en 5v5 (doublons autorisés) : 1 pilier, 2 ailiers, 2 demis. Le pilier (le plus lent, portée
 * courte) est un spécialiste du contact : deux piliers ralentiraient tout le jeu et laisseraient peu de tireurs à
 * moyenne portée ; deux ailiers donnent des coureurs et du feu précis, deux demis le contrôle de zone (knockback, zones)
 * qui manque le plus en 5v5 où les défenses sont nombreuses. Ordre = position dans la formation (de gauche à droite).
 */
export const TEAM_ROLES_5V5: readonly Role[] = Object.freeze(['pilier', 'ailier', 'demi', 'ailier', 'demi']);

// ============================================================================
//  MÊLÉE
// ============================================================================

// Étape 7 (src/sim/scrum.ts, docs/ARCHITECTURE.md §14). Cahier des charges : « si le ballon reste libre plus de 3 s avec
// au moins N joueurs de chaque camp dans un rayon donné (N = 2 en 3v3, 3 en 5v5), la zone devient une zone de capture :
// l'équipe qui a le plus de joueurs dedans après 3 s récupère le ballon ». Seuls les joueurs ACTIFS comptent (un joueur
// plaqué ou qui se relève sort du décompte : tirer dans la zone est une façon de la gagner). Distances horizontales.
// Aucune de ces durées n'est raccourcie en dernière minute.

/**
 * Temps pendant lequel le ballon doit rester libre (`ball.looseTicks`, mode 'loose' seulement : une passe ou un coup de
 * pied en vol ne compte pas) avant de pouvoir déclencher une mêlée (s). ↑ = mêlées plus rares (plus de temps pour
 * ramasser le ballon).
 */
export const SCRUM_LOOSE_SEC = 3;
/**
 * Rayon de la zone de mêlée en 5v5 (m) ; multiplié par l'échelle du terrain en 3v3 (≈ 5 m). Sert au déclenchement
 * (joueurs autour du ballon) ET au décompte de la capture. ↑ = mêlées plus fréquentes et zone plus facile à tenir.
 */
export const SCRUM_RADIUS = 6;
/** Joueurs ACTIFS minimum de CHAQUE équipe dans le rayon pour déclencher la mêlée, en 3v3. ↑ = mêlées plus rares. */
export const SCRUM_MIN_PLAYERS_3V3 = 2;
/** Idem en 5v5. ↑ = mêlées plus rares. */
export const SCRUM_MIN_PLAYERS_5V5 = 3;
/**
 * Durée de la capture (s). À la fin, l'équipe qui a le plus de joueurs actifs dans la zone gagne le ballon (porté par
 * son joueur actif le plus proche du centre). ↑ = mêlée plus longue (plus de temps pour renverser le décompte).
 */
export const SCRUM_CAPTURE_SEC = 3;
/**
 * Égalité à la fin de la capture : prolongation (s) en « premier qui mène » — la première équipe qui compte plus de
 * joueurs que l'autre à la fin d'un tick de prolongation gagne aussitôt. Encore à égalité à la fin : tirage au sort
 * seedé (state.rng) ; à 0 contre 0, pas de tirage : ballon rendu libre au centre. ↑ = plus de temps pour se départager.
 */
export const SCRUM_TIE_EXTRA_SEC = 2;

// ============================================================================
//  REMISE EN JEU
// ============================================================================

/**
 * Distance devant sa propre ligne d'essai où l'équipe qui reçoit est alignée (m, ×échelle), ballon au joueur le plus
 * central. Doit rester > FIELD_TRY_LINE_CLEARANCE (sur du plat). ↑ = départ moins acculé (moins de terrain à remonter).
 */
export const KICKOFF_RECEIVE_OFFSET = 4;
/**
 * Distance derrière la médiane où l'autre équipe est alignée (m, ×échelle). Doit rester < FIELD_CENTER_CLEARANCE
 * (sur du plat). ↑ = défense plus reculée (plus d'espace pour la première course du porteur).
 */
export const KICKOFF_DEFEND_OFFSET = 6;

// ============================================================================
//  BOTS (lu uniquement par src/bots)
// ============================================================================
//
// Les bots (étape 6, src/bots) sont des producteurs de PlayerInput : ils LISENT le MatchState et renvoient une
// entrée, comme un humain. Leur aléatoire passe par leur PROPRE PRNG (mémoire du bot, jamais MatchState).
// Distances en mètres « joueur » (non mises à l'échelle) sauf mention « ×échelle » (× field.scale : 0,84 en 3v3).

export type BotDifficulty = 'facile' | 'normal' | 'difficile';

/** Difficulté par défaut des bots (client : ?difficulty=facile|normal|difficile, menu à l'étape 8). */
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal';

export interface BotDifficultyStats {
  label: string;
  /**
   * Temps de réaction (s) : un changement de situation (possession, porteur, mode du ballon, cible de passe, phase)
   * n'est pris en compte qu'après ce délai (± BOT_REACTION_JITTER) ; idem pour l'acquisition d'une nouvelle cible de
   * tir et le premier réflexe d'esquive après un tir reçu. ↑ = bots plus lents à réagir (plus faciles).
   */
  reactionSec: number;
  /**
   * Erreur de visée (écart-type approx., degrés) : un décalage tiré au PRNG du bot qui varie LENTEMENT (nouvelle valeur
   * visée toutes les BOT_AIM_ERROR_PERIOD_SEC, rejointe en douceur), pas un bruit blanc par tick. ↑ = moins précis.
   */
  aimErrorDeg: number;
  /** Vitesse maximale de rotation de la visée / du regard (degrés/s). ↑ = suit mieux une cible rapide, se retourne plus vite. */
  turnRateDeg: number;
  /** Intervalle entre deux décisions tactiques (rôle, point visé, cible, passe / coup de pied) (s). ↑ = bots plus lents à s'adapter. */
  decisionSec: number;
  /** Distance d'engagement max (fraction de la portée de l'arme). ↑ = tirent de plus loin. */
  engageRangeMult: number;
  /**
   * Réflexe d'esquive : probabilité PAR SECONDE d'esquiver tant qu'il est sous le feu (après le temps de réaction).
   * Au contact d'un défenseur, le porteur l'applique × BOT_CONTACT_REFLEX_MULT. ↑ = esquive plus souvent.
   */
  dodgeReflex: number;
  /**
   * Erreur de visée exprimée en DÉCALAGE LATÉRAL au point visé (écart-type approx., m), convertie en angle par
   * atan(aimErrorM / distance) ; l'erreur appliquée est le plus grand de cet angle et de aimErrorDeg. Correction de
   * l'étape 6 : avec une erreur en degrés seule, presque tout touchait à 4–8 m (60–77 % de précision même en facile).
   * ↑ = rate plus souvent de près.
   */
  aimErrorM: number;
  /**
   * Part de l'avance prise sur une cible qui court (0 = vise sa position actuelle, 1 = position prévue à l'arrivée de
   * la balle, aim.ts). ↑ = touche mieux les cibles qui courent.
   */
  leadFraction: number;
  /** Multiplicateur des pauses entre deux rafales (BOT_BURST_PAUSE_SEC + jitter). ↑ = tire moins souvent (moins de pression). */
  burstPauseMult: number;
}

export const BOT_DIFFICULTY: Record<BotDifficulty, BotDifficultyStats> = {
  facile: {
    label: 'Facile',
    reactionSec: 0.5,
    aimErrorDeg: 5,
    aimErrorM: 1.0,
    turnRateDeg: 300,
    decisionSec: 0.5,
    engageRangeMult: 0.75,
    dodgeReflex: 0.4,
    leadFraction: 0.4,
    burstPauseMult: 1.3,
  },
  normal: {
    label: 'Normal',
    reactionSec: 0.32,
    aimErrorDeg: 3.5,
    aimErrorM: 0.7,
    turnRateDeg: 420,
    decisionSec: 0.4,
    engageRangeMult: 0.85,
    dodgeReflex: 0.8,
    leadFraction: 0.8,
    burstPauseMult: 1,
  },
  difficile: {
    label: 'Difficile',
    reactionSec: 0.22,
    aimErrorDeg: 2.5,
    aimErrorM: 0.5,
    turnRateDeg: 600,
    decisionSec: 0.3,
    engageRangeMult: 0.95,
    dodgeReflex: 1.2,
    leadFraction: 1,
    burstPauseMult: 0.9,
  },
};

/** Variation aléatoire (± fraction) du temps de réaction, tirée à chaque changement perçu. ↑ = réactions moins régulières. */
export const BOT_REACTION_JITTER = 0.25;
/** Variation aléatoire (± fraction) de l'intervalle de décision (les bots ne décident pas tous au même tick). ↑ = plus désynchronisés. */
export const BOT_DECISION_JITTER = 0.2;

// --- Visée et tir -------------------------------------------------------------

/** Période moyenne (s) entre deux tirages de l'erreur de visée visée par le bot. ↓ = erreur qui change plus souvent. */
export const BOT_AIM_ERROR_PERIOD_SEC = 0.7;
/** Supplément aléatoire (s, entre 0 et cette valeur) ajouté à chaque période d'erreur. ↑ = rythme moins régulier. */
export const BOT_AIM_ERROR_PERIOD_JITTER_SEC = 0.5;
/** Constante de temps (s) avec laquelle l'erreur courante rejoint l'erreur tirée (lissage). ↑ = erreur plus « molle », plus lente à changer. */
export const BOT_AIM_ERROR_SMOOTH_SEC = 0.3;
/** Part de l'erreur de visée appliquée au pitch (vertical), relative au yaw. ↑ = tirs plus souvent trop hauts / trop bas. */
export const BOT_AIM_PITCH_ERROR_MULT = 0.5;
/**
 * Le bot ne tire que si son regard est à moins de cet angle (degrés) de la direction qu'il VEUT viser (erreur de
 * visée comprise : il ne connaît pas son erreur). ↑ = tire plus tôt en tournant (plus de balles perdues).
 */
export const BOT_FIRE_CONE_DEG = 3;
/** Durée d'une rafale (s) ; le pilier tire un coup par fireInterval tant qu'elle dure. ↑ = rafales plus longues (plus de pression). */
export const BOT_BURST_SEC = 0.7;
/**
 * Pause entre deux rafales (s), plus un supplément aléatoire (BOT_BURST_PAUSE_JITTER_SEC), × burstPauseMult de la
 * difficulté, × BOT_RESTRAINED_PAUSE_MULT hors pression / repli. ↑ = moins de pression.
 */
export const BOT_BURST_PAUSE_SEC = 0.25;
/** Supplément de pause tiré au sort entre 0 et cette valeur (s). ↑ = rythme de tir moins prévisible. */
export const BOT_BURST_PAUSE_JITTER_SEC = 0.35;
/**
 * Discipline de tir (correction de l'étape 6 : tout le monde tirait sur tout le monde, 85–90 % des plaquages tombaient
 * sur des NON-porteurs) : seuls les rôles « press » et « cover » tirent en continu (sur le porteur) ; les autres ne
 * tirent que sur une menace directe, avec des pauses multipliées par cette valeur. ↑ = feu plus rare hors pression.
 */
export const BOT_RESTRAINED_PAUSE_MULT = 2.5;
/**
 * Menace directe (m) : en attaque sans ballon (soutien, espace), on ne tire que sur un défenseur à moins de cette
 * distance de NOTRE porteur (protection du porteur) ; en défense, un marqueur ne tire sur son receveur que si celui-ci
 * est à moins de cette distance du porteur (passe imminente). ↑ = feu plus fréquent hors pression (plus de plaquages
 * de non-porteurs, plus de joueurs au sol).
 */
export const BOT_ESCORT_THREAT_DIST = 8;
/** Au-delà de cette distance (m), le bot vise (AIM : dispersion réduite, déplacement ralenti). ↓ = vise plus souvent. */
export const BOT_ADS_DISTANCE = 20;
/** Rechargement opportuniste : après ce temps sans cible (s)… ↓ = recharge plus vite hors combat. */
export const BOT_RELOAD_IDLE_SEC = 0.8;
/** …si le chargeur est sous cette fraction. ↑ = recharge plus souvent (chargeur plus souvent plein en entrant au combat). */
export const BOT_RELOAD_AMMO_FRACTION = 0.6;

// --- Déplacement --------------------------------------------------------------

/** Rayon (m) autour du point visé où le bot s'arrête. ↑ = positionnement moins précis, moins de piétinement. */
export const BOT_ARRIVE_RADIUS = 1.2;
/** Rayon (m) en deçà duquel il ralentit en approchant du point visé. ↑ = approches plus douces. */
export const BOT_SLOW_RADIUS = 3.5;
/** Inclinaison minimale de l'entrée de déplacement en approche (0..1). ↑ = approches plus rapides. */
export const BOT_MIN_MOVE_INPUT = 0.35;
/** Le bot sprinte vers un point visé s'il en est à plus de cette distance (m). ↓ = sprinte plus souvent. */
export const BOT_SPRINT_MIN_DIST = 5;
/** Distance (m) en deçà de laquelle un coéquipier le repousse (pas d'agglutinement). ↑ = équipe plus étalée. */
export const BOT_TEAMMATE_SPACING = 3.5;
/** Poids de la répulsion entre coéquipiers (relatif à la direction voulue). ↑ = s'écartent plus franchement. */
export const BOT_TEAMMATE_REPULSION = 1.2;
/** Marge (m) aux murs invisibles : les points visés sont ramenés à l'intérieur. ↑ = jouent plus loin des bords. */
export const BOT_WALL_MARGIN = 1.5;
/** Blocage : vitesse horizontale (m/s) sous laquelle un bot qui veut avancer est « bloqué ». ↑ = détecte plus tôt. */
export const BOT_STUCK_SPEED = 1.0;
/** Blocage : durée (s) avant de réagir (saut + détour). ↓ = réagit plus vite (mais plus de faux blocages). */
export const BOT_STUCK_SEC = 0.5;
/** Détour après un blocage : durée (s) pendant laquelle la direction est tournée. ↑ = détours plus longs. */
export const BOT_DETOUR_SEC = 0.8;
/** Détour après un blocage : angle de rotation de la direction (degrés, côté tiré au sort). ↑ = contourne plus large. */
export const BOT_DETOUR_ANGLE_DEG = 70;
/** Inclinaison (0..1) au-delà de laquelle le bot « veut avancer » (suivi du blocage). ↑ = moins de faux blocages en approche lente. */
export const BOT_STUCK_MIN_MOVE_MAG = 0.5;
/** Répulsion des coéquipiers (0..1) sous laquelle un bot arrivé ne bouge pas (évite de piétiner). ↑ = reste plus volontiers sur place. */
export const BOT_IDLE_PUSH_MIN = 0.25;

// --- Réflexes -----------------------------------------------------------------

/** Durée (s) pendant laquelle un bot touché se considère « sous le feu » (réflexe d'esquive possible). ↑ = esquives plus tardives possibles. */
export const BOT_UNDER_FIRE_SEC = 0.6;
/** Esquive : part de la composante « vers l'avant » (vers son but / son point visé) mêlée à l'esquive latérale. ↑ = esquive plus en avant. */
export const BOT_DODGE_FORWARD_MIX = 0.5;
/** Porteur : distance (m) d'un défenseur devant lui en deçà de laquelle il tente une esquive de contact. ↑ = esquive plus tôt. */
export const BOT_CONTACT_DISTANCE = 3;
/** Porteur au contact : multiplicateur du réflexe d'esquive (dodgeReflex). ↑ = esquive plus souvent au contact. */
export const BOT_CONTACT_REFLEX_MULT = 3;

// --- Porteur ------------------------------------------------------------------

/** Porteur : nombre de directions de course évaluées à chaque décision (en éventail vers l'en-but adverse). ↑ = choix plus fin, plus coûteux. */
export const BOT_CARRIER_DIRECTIONS = 9;
/** Porteur : demi-ouverture (degrés) de l'éventail des directions évaluées. ↑ = n'hésite pas à courir en travers. */
export const BOT_CARRIER_DIR_SPREAD_DEG = 75;
/** Porteur : horizon (s) sur lequel il projette sa course et celle des adversaires. ↑ = anticipe de plus loin. */
export const BOT_CARRIER_LOOKAHEAD_SEC = 1.0;
/** Porteur : rayon (m) dans lequel un adversaire (projeté) pénalise une direction. ↑ = contourne la défense de plus loin. */
export const BOT_CARRIER_AVOID_RADIUS = 6;
/** Porteur : poids de l'évitement des adversaires face à la progression (poids 1). ↑ = préfère contourner qu'avancer droit. */
export const BOT_CARRIER_AVOID_WEIGHT = 1.6;
/** Porteur : bonus de la direction choisie à la décision précédente (hystérésis). ↑ = change moins souvent de direction. */
export const BOT_CARRIER_DIR_STICKY = 0.1;
/** Porteur : chemin « libre » (sprint) si aucun adversaire à moins de cette distance (m) dans le cône devant lui. ↑ = sprinte moins souvent. */
export const BOT_PATH_CLEAR_DIST = 10;
/** Porteur : demi-angle (degrés) du cône dans lequel le chemin doit être libre. ↑ = sprinte moins souvent. */
export const BOT_PATH_CLEAR_HALF_ANGLE_DEG = 35;
/** Porteur : « pressé » si un adversaire est à moins de cette distance (m), devant ou à côté de lui (7 -> 9 à la correction de l'étape 7 : plus de passes). ↑ = passe plus tôt. */
export const BOT_PRESSURE_RADIUS = 9;
/**
 * Porteur : un adversaire jusqu'à cette distance (m) DERRIÈRE lui (le long du terrain) compte encore comme « à côté »
 * (pression, esquive de contact). ↑ = se sent pressé par des poursuivants plus en retrait.
 */
export const BOT_PRESSURE_BESIDE_TOLERANCE = 2;
/** Porteur : « pressé » aussi s'il est sous le feu avec une stabilité sous cette fraction. ↑ = passe plus tôt quand on lui tire dessus. */
export const BOT_PASS_STABILITY_FRACTION = 0.65;
/** Passe : démarquage minimal du receveur (openness de selectPassTarget, 0..1). ↓ = passes plus risquées. */
export const BOT_PASS_MIN_OPENNESS = 0.45;
/** Passe : distance minimale (m) au receveur. ↑ = évite les passes « dans les mains » à un coéquipier collé. */
export const BOT_PASS_MIN_RANGE = 3;
/** Passe : nombre de regards (yaws) essayés pour trouver le receveur voulu avec la visée assistée. ↑ = plus fin, plus coûteux. */
export const BOT_PASS_YAW_SAMPLES = 13;
/** Passe / coup de pied : abandon si le geste n'est pas parti après ce délai (s) de préparation (rotation du regard). ↑ = insiste plus longtemps sur un geste préparé. */
export const BOT_ACTION_MAX_PREP_SEC = 0.5;
/** Pas de passe à moins de cette distance (m) de la ligne d'essai adverse : il fonce (et plonge). ↑ = fonce de plus loin. */
export const BOT_NO_PASS_LINE_DIST = 8;
/**
 * Porteur : « encerclé » si au moins BOT_ENCIRCLED_COUNT(_5V5) adversaires sont à moins de cette distance (m).
 * Correction de l'étape 6 : 5 -> 3,5 (les deux défenseurs qui pressent étaient presque toujours à moins de 5 m :
 * 31–49 % des possessions finissaient au pied). ↑ = tape plus tôt.
 */
export const BOT_ENCIRCLED_RADIUS = 3.5;
/** Porteur : nombre d'adversaires proches pour être « encerclé » en 3v3 (coup de pied s'il n'a pas de passe). ↓ = tape plus souvent. */
export const BOT_ENCIRCLED_COUNT = 2;
/** Idem en 5v5 (plus de défenseurs, donc plus souvent deux au contact). ↓ = tape plus souvent. */
export const BOT_ENCIRCLED_COUNT_5V5 = 3;
/** Coup de pied aussi (sans passe) si le porteur est sous le feu avec une stabilité sous cette fraction. ↑ = tape plus tôt quand on le plaque. */
export const BOT_KICK_STABILITY_FRACTION = 0.25;
/** Pas de coup de pied à moins de cette distance (m, ×échelle) de la ligne adverse (il fonce). ↑ = tape moins près de la ligne. */
export const BOT_KICK_MIN_LINE_DIST = 14;
/** Coup de pied : nombre de directions évaluées (point de chute prédit). ↑ = choix plus fin. */
export const BOT_KICK_DIRECTIONS = 7;
/** Coup de pied : demi-ouverture (degrés) de l'éventail des directions évaluées. ↑ = tape plus en travers vers l'espace libre. */
export const BOT_KICK_SPREAD_DEG = 45;
/**
 * Coup de pied : le point de chute est noté par l'AVANCE de la première arrivée de l'équipe du botteur (s) : min des temps
 * de course des adversaires − min de ceux de son équipe (botteur compris). Poids de ce terme face à la progression.
 * ↑ = tape vers là où son équipe arrive la première plutôt que loin.
 */
export const BOT_KICK_ADVANTAGE_WEIGHT = 1.0;
/** Coup de pied : avance (s) au-delà de laquelle un point de chute est totalement favorable (terme d'avance borné à ±1). ↑ = exige plus d'avance pour la note maximale. */
export const BOT_KICK_ADVANTAGE_SEC = 1.0;
/**
 * Coup de pied : on ne tape que si l'avance du meilleur point de chute dépasse cette valeur (s) : son équipe y arrive la
 * première. ↓ = tape plus souvent (ballon rendu plus souvent à l'adversaire).
 */
export const BOT_KICK_MIN_ADVANTAGE_SEC = 0.4;
/**
 * Coup de pied : point de chute au moins à cette distance (m, ×échelle) devant la ligne adverse (directions plus longues
 * écartées). Correction de l'étape 6 : un coup de pied dans l'en-but, récupéré par l'équipe du botteur, était un essai
 * quasi gratuit (7 à 9 essais par match). ↓ = coups de pied plus profonds (plus d'essais sur coup de pied).
 */
export const BOT_KICK_LAND_MIN_LINE_DIST = 8;
/** Coup de pied : pénalité de sortie du terrain du point de chute, par mètre dehors / cette distance (m). ↓ = évite plus les bords. */
export const BOT_KICK_OUT_DIST = 10;
/**
 * Coup de pied : direction écartée si un adversaire (projeté selon sa vitesse) passe à moins de KICK_CHARGE_DOWN_RADIUS
 * + cette marge (m) de la trajectoire de départ (risque de contre). ↑ = tape moins souvent au contact.
 */
export const BOT_KICK_CHARGE_MARGIN = 1.0;
/** Coup de pied : la trajectoire de départ est vérifiée pendant KICK_CHARGE_DOWN_SEC + ce supplément (s). ↑ = plus prudent. */
export const BOT_KICK_CHARGE_EXTRA_SEC = 0.15;
/**
 * Coup de pied : pas de nouveau coup de pied pendant ce délai (s) après avoir vu un coup de pied en vol (pas de
 * « ping-pong » : le receveur d'un coup de pied relance à la main). ↑ = moins de coups de pied enchaînés.
 */
export const BOT_KICK_AFTER_KICK_SEC = 1.5;
/** Coup de pied : pitch du regard au moment de taper (degrés ; l'élévation = KICK_ELEVATION_DEG + pitch × KICK_PITCH_INFLUENCE). ↑ = chandelle plus haute. */
export const BOT_KICK_PITCH_DEG = 0;
/** Coup de pied / passe : tolérance (degrés) sur le regard voulu au moment de déclencher. ↑ = geste plus rapide, moins précis. */
export const BOT_ACTION_YAW_TOLERANCE_DEG = 4;
/** Plongeon d'essai : le porteur plonge à moins de cette distance (m) de la ligne d'essai adverse (dash ≈ 6 m). ↑ = plonge de plus loin. */
export const BOT_DIVE_TRY_DISTANCE = 4.5;
/** Plongeon d'évasion : sous le feu, esquive en recharge, stabilité sous cette fraction => plongeon (invulnérable). ↑ = plonge plus tôt. */
export const BOT_DIVE_ESCAPE_STABILITY_FRACTION = 0.3;
/** Fonce droit vers la ligne (évitement réduit) à moins de cette distance (m) de la ligne d'essai adverse. ↑ = fonce de plus loin. */
export const BOT_LINE_RUSH_DIST = 8;
/** Près de la ligne (BOT_LINE_RUSH_DIST) : multiplicateur du poids de l'évitement. ↓ = fonce plus droit. */
export const BOT_LINE_RUSH_AVOID_MULT = 1 / 3;
/**
 * Porteur dans son propre tiers (distance à la ligne adverse > BOT_OWN_THIRD_FRACTION × distance entre les lignes) :
 * avant de taper, il accepte une passe moins démarquée (openness ≥ cette valeur). ↓ = relance à la main plus souvent.
 */
export const BOT_PASS_MIN_OPENNESS_OWN_THIRD = 0.3;
/** Sprint boosté (ailier porteur) seulement à plus de cette distance (m) de la ligne adverse, chemin libre. ↑ = boost gardé pour les longues courses. */
export const BOT_BOOST_MIN_LINE_DIST = 12;

// --- Attaque sans ballon -----------------------------------------------------

/**
 * Soutiens par équipe en 3v3 (les autres coéquipiers cherchent l'espace devant). Correction de l'étape 7 : 1 -> 2 — les
 * passes ne vont qu'en arrière, le coureur « espace » placé devant ne pouvait ni recevoir ni défendre au changement de
 * possession (il alimentait les contres). ↑ = plus de solutions de passe, moins de course devant.
 */
export const BOT_SUPPORTERS_3V3 = 2;
/** Soutiens par équipe en 5v5 (2 -> 3 à la correction de l'étape 7, même raison). ↑ = plus de solutions de passe, moins de course devant. */
export const BOT_SUPPORTERS_5V5 = 3;
/** Soutien : marge minimale (m) entre son point visé et la touche (sinon il passe de l'autre côté du porteur). ↑ = soutiens moins collés aux bords. */
export const BOT_SUPPORT_TOUCH_MARGIN = 2;
/** Soutien : décalage latéral (m, ×échelle) par rapport au porteur. ↑ = soutiens plus écartés (passes plus longues). */
export const BOT_SUPPORT_LATERAL = 7;
/** Soutien : retrait (m) derrière le porteur (cône de passe arrière). ↑ = soutiens plus en retrait (passes plus sûres, terrain perdu). */
export const BOT_SUPPORT_DEPTH = 3.5;
/** Soutien : anticipation (s) de la course du porteur pour placer le soutien. ↑ = soutiens qui « suivent » mieux un porteur rapide. */
export const BOT_SUPPORT_LEAD_SEC = 0.5;
/** Espace : avance (m, ×échelle) devant le porteur du joueur qui ouvre la défense. ↑ = plus loin devant. */
export const BOT_SPACE_AHEAD = 10;
/** Espace : décalage latéral (m, ×échelle) du joueur qui ouvre la défense. ↑ = plus près de la touche. */
export const BOT_SPACE_LATERAL = 9;
/**
 * Receveur d'une passe en vol (passe finale) : il court au point de réception réel (predictPassCatch : là où le ballon
 * redescend à hauteur des mains) à l'allure qui l'y amène juste à temps, avec cette avance (s) sur l'arrivée du ballon
 * (le temps d'accélérer / de tourner). Avant, il « gardait sa ligne » à pleine vitesse (direction de sa dernière entrée,
 * pas de sa vitesse) et dépassait le ballon : 10 à 15 % des passes au sol, celles de l'humain comprises.
 * ↑ = arrive plus tôt (plus sûr, mais il attend, plus lent au moment de la réception).
 */
export const BOT_RECEIVE_TIME_MARGIN_SEC = 0.15;
/** Receveur : à moins de cette distance (m) du point de réception, il s'arrête et attend le ballon. ↑ = s'arrête plus tôt. */
export const BOT_RECEIVE_ARRIVE_RADIUS = 0.4;

// --- Défense ------------------------------------------------------------------

/** Défenseurs qui convergent vers le porteur en 3v3 (les autres marquent). ↑ = pression plus forte, receveurs plus libres. */
export const BOT_PRESSERS_3V3 = 2;
/** Défenseurs qui convergent vers le porteur en 5v5. ↑ = pression plus forte, receveurs plus libres. */
export const BOT_PRESSERS_5V5 = 2;
/**
 * Porteur adverse dans SON propre tiers (distance à notre ligne > BOT_OWN_THIRD_FRACTION × distance entre les lignes,
 * typiquement juste après une remise en jeu) : un seul défenseur presse, les autres tiennent leur ligne (marquage,
 * repli). Correction de l'étape 6 : l'équipe qui recevait, prise en tenaille près de sa ligne, encaissait l'essai
 * suivant 50–60 % du temps. ↑ = défense plus haute après la remise en jeu.
 */
export const BOT_PRESSERS_OWN_THIRD = 1;
/** Fraction de la distance entre les lignes d'essai au-delà de laquelle le porteur est « dans son propre tiers ». ↓ = zone plus grande. */
export const BOT_OWN_THIRD_FRACTION = 2 / 3;
/** Convergence : anticipation (s) de la course du porteur. ↑ = coupe plus la trajectoire. */
export const BOT_PRESS_LEAD_SEC = 0.4;
/**
 * Anticipation (pression, soutien) : vitesse du porteur plafonnée à runSpeed du rôle × cette valeur (sinon une esquive
 * à 21 m/s faisait sauter le point visé de 8 m sur le côté : demi-tours en série). ↑ = suit mieux les esquives.
 */
export const BOT_LEAD_SPEED_CAP_MULT = 1.2;
/**
 * Hystérésis des rôles par distance (pression, course au ballon) : le bot qui tenait déjà le rôle se compte plus proche
 * de cette distance (m) ; deux défenseurs presque à égale distance n'échangent plus pression et marquage à chaque
 * décision. ↑ = rôles plus stables (réaffectations plus tardives).
 */
export const BOT_ROLE_HYSTERESIS_M = 1.5;
/** Marquage : placement (m) entre le receveur et son propre en-but. ↑ = marquage plus lâche (moins d'interceptions, moins de percées). */
export const BOT_MARK_GOALSIDE = 3;
/**
 * Hystérésis du marquage (passe finale) : le marqueur qui suivait déjà ce receveur se compte plus proche de lui de cette
 * distance (m). Avant, le marquage était réaffecté à chaque décision (≈ 46–52 changements de receveur par minute de
 * marquage, ping-pong A -> B -> A) : un marqueur qui approche de A fait baisser le danger de A, B passe devant, etc.
 * ↑ = marquage plus stable (réaffectations plus tardives).
 */
export const BOT_MARK_HYSTERESIS_M = 3;
/**
 * Hystérésis du marquage : bonus de danger (même échelle que BOT_DANGER_*) du receveur que ce bot marquait déjà, pour
 * l'ordre de traitement des receveurs. ↑ = le receveur déjà marqué reste prioritaire plus longtemps.
 */
export const BOT_MARK_DANGER_STICKY = 0.3;
/**
 * Marquage : un marqueur tire sur le PORTEUR plutôt que sur son receveur quand le porteur est à moins de cette
 * distance (m) de lui (menace immédiate). ↑ = défense plus concentrée sur le porteur (receveurs plus libres).
 */
export const BOT_MARK_SHOOT_CARRIER_DIST = 14;
/**
 * Dernier défenseur : dès que l'équipe compte au moins ce nombre de bots actifs, l'un d'eux (le mieux placé devant le
 * porteur) reste TOUJOURS en repli entre le porteur et l'en-but ; en deçà, repli seulement si personne n'est devant le
 * porteur. Correction de l'étape 6 : sans lui, un porteur qui avait passé les presseurs filait à l'essai (43–52 % du
 * temps porté sans aucun défenseur devant). Correction de l'étape 7 : 3 -> 2 (en 3v3, après un plaquage, deux défenseurs
 * restent : l'un se replie toujours). ↓ = repli plus systématique (moins de presseurs / marqueurs).
 */
export const BOT_COVER_MIN_DEFENDERS = 2;
/** Repli : profondeur (m, ×échelle) devant le porteur (18 -> 26 à la correction de l'étape 7). ↑ = repli plus profond. */
export const BOT_COVER_DEPTH = 26;
/** Repli : profondeur au plus égale à cette fraction de la distance du porteur à notre ligne (0,7 -> 0,9 à la correction de l'étape 7). ↑ = repli plus près de la ligne. */
export const BOT_COVER_LINE_FRACTION = 0.9;
/** Repli : x du point de repli = x du porteur × cette fraction (ramené vers le centre). ↑ = repli plus en face du porteur. */
export const BOT_COVER_X_FRACTION = 0.7;
/** Marquage : décalage du point de marquage vers le porteur (fraction de l'écart receveur–porteur). ↑ = marqueur plus près de la ligne de passe. */
export const BOT_MARK_CARRIER_SHIFT = 0.15;
/** Danger d'un receveur : poids « dans le cône de passe du porteur ». ↑ = marque d'abord les receveurs possibles. */
export const BOT_DANGER_CONE_WEIGHT = 1.0;
/** Danger : poids du démarquage (distance au défenseur le plus proche / BOT_DANGER_OPEN_DIST). ↑ = marque d'abord les joueurs libres. */
export const BOT_DANGER_OPEN_WEIGHT = 0.6;
/** Danger : distance (m) à partir de laquelle un receveur est considéré totalement libre. ↑ = un receveur doit être plus loin pour compter comme libre. */
export const BOT_DANGER_OPEN_DIST = 8;
/** Danger : poids de la proximité de notre en-but. ↑ = marque d'abord les joueurs avancés. */
export const BOT_DANGER_LINE_WEIGHT = 0.5;

// --- Ballon libre / en vol ---------------------------------------------------

/**
 * Bots de chaque équipe qui vont au ballon libre (ou au point de chute) en 3v3 ; les autres gardent une forme.
 * Correction de l'étape 6 : 1 -> 2 (un ballon au sol ne dépend plus d'un seul coureur ; les chasseurs ne tirent plus,
 * voir BOT_CHASE_SHOOT_MARGIN_SEC). ↑ = plus de monde au ballon.
 */
export const BOT_BALL_CHASERS_3V3 = 2;
/** Idem en 5v5. ↑ = plus de monde au ballon. */
export const BOT_BALL_CHASERS_5V5 = 2;
/**
 * Course au ballon : le chasseur ne tire (sur l'adversaire qui va arriver le premier) que si celui-ci arrive au moins
 * cette avance (s) avant lui ; sinon il sprinte en regardant sa course (le tir coupe le sprint). ↑ = chasseurs qui tirent moins.
 */
export const BOT_CHASE_SHOOT_MARGIN_SEC = 0.3;
/** Course au ballon qui roule : anticipation (s) de son roulement. ↑ = vise plus loin devant le ballon. */
export const BOT_CHASE_ROLL_LEAD_SEC = 0.5;
/** Course au ballon : on vise un point au-delà du ballon (m) pour le traverser sans ralentir. ↑ = traverse plus franchement. */
export const BOT_CHASE_OVERSHOOT = 2;
/** Forme d'équipe pendant un ballon libre : profondeur (m, ×échelle) du rideau entre le ballon et son en-but. ↑ = repli plus profond. */
export const BOT_SHAPE_DEPTH = 8;
/** Forme d'équipe : fraction de la largeur du terrain occupée. ↑ = plus étalée. */
export const BOT_SHAPE_WIDTH_FRACTION = 0.6;
/** Forme d'équipe d'un seul joueur : x = x du point de chute × cette fraction. ↑ = plus en face du ballon. */
export const BOT_SHAPE_SINGLE_X_FRACTION = 0.5;
/** Forme d'équipe après notre coup de pied / lâcher : profondeur × cette fraction (on monte en soutien). ↑ = reste plus en retrait. */
export const BOT_SHAPE_OWN_KICK_DEPTH_FRACTION = 0.5;

// --- Rôles : pilier et demi (étape 7) ----------------------------------------

/**
 * Pilier : distance d'engagement max du fusil à pompe (m, plafond de range × engageRangeMult) : au-delà, les plombs se
 * perdent et l'atténuation tue les dégâts (≈ 30 à 8 m, ≈ 4 à 15 m) ; le pilier se rapproche au lieu de tirer.
 * ↑ = tire de plus loin (moins efficace, plus de feu « gaspillé »).
 */
export const BOT_SHOTGUN_ENGAGE_DIST = 10;
/** Demi : distance d'engagement max du lance-grenades (m, × engageRangeMult de la difficulté). ↑ = lobe de plus loin (moins précis sur cible mobile). */
export const BOT_GRENADE_ENGAGE_DIST = 28;
/** Demi : pas de grenade sur une cible plus proche que ça (m) : il s'exploserait au visage (knockback sur lui-même). ↓ = tire plus près. */
export const BOT_GRENADE_MIN_DIST = 6;
/**
 * Demi : la grenade ne part que si son point d'impact prévu (predictGrenadeImpact, relief compris) tombe à moins de cette
 * distance (m) du point visé (pas de grenade dans une butte ou un muret entre lui et la cible). ↑ = tire même à travers le relief.
 */
export const BOT_GRENADE_IMPACT_TOLERANCE = 1.5;
/** Demi : marge (m) au-delà du rayon d'explosion entre lui et l'impact prévu (pas d'auto-knockback involontaire). ↑ = plus prudent. */
export const BOT_GRENADE_SELF_MARGIN = 1.0;
/**
 * Demi : marge (m) ajoutée au rayon de collision d'un adversaire (PLAYER_RADIUS + PROJECTILE_HIT_RADIUS) quand le bot
 * vérifie que les premiers mètres de la parabole (jusqu'à blastRadius + BOT_GRENADE_SELF_MARGIN de lui) ne traversent
 * personne : sinon la grenade exploserait sur un adversaire collé à lui, en plein dans son propre souffle (correction de
 * la relecture de l'étape 7). Couvre le déplacement de l'adversaire pendant ces ≈ 0,15 s de vol. ↑ = plus prudent (tire moins
 * au contact).
 */
export const BOT_GRENADE_PATH_MARGIN = 0.5;
/**
 * Demi : hauteur du point visé au-dessus du sol, aux pieds de la cible anticipée (m) : la grenade touche le bas de la
 * capsule (impact direct) ou le sol juste à côté (souffle). ↑ = vise plus haut (plus d'impacts directs, plus de ratés longs).
 */
export const BOT_GRENADE_AIM_HEIGHT = 0.3;
/**
 * Demi en pression / repli : il garde cette distance (m) au porteur au lieu de lui courir dessus (portée utile du
 * lance-grenades, hors de son propre souffle). ↑ = harcèle de plus loin.
 */
export const BOT_GRENADE_STANDOFF = 12;
/** Pilier : lève le bouclier sous le feu quand sa stabilité passe sous cette fraction (tireur hors de portée de son fusil). ↑ = bouclier plus tôt. */
export const BOT_SHIELD_RAISE_STABILITY_FRACTION = 0.8;
/** Pilier : sous le feu et sous cette fraction de stabilité, bouclier même si le tireur est à portée de fusil. ↑ = plus prudent. */
export const BOT_SHIELD_PANIC_STABILITY_FRACTION = 0.45;
/** Pilier porteur : lève le bouclier si un défenseur armé est devant lui à moins de cette distance (m). ↑ = charge bouclier levé plus tôt. */
export const BOT_SHIELD_CARRIER_DIST = 14;
/** Pilier : baisse le bouclier (second appui) après ce temps sans menace (s) quand il peut tirer / courir plus vite. ↑ = garde le bouclier plus longtemps. */
export const BOT_SHIELD_CALM_SEC = 0.6;
/** Demi : zone posée sur la course anticipée du porteur adverse, à cette avance (s). ↑ = posée plus loin devant lui. */
export const BOT_ZONE_LEAD_SEC = 0.6;
/** Demi : décalage (m) supplémentaire de la zone vers notre en-but, devant le porteur adverse (il court dedans). ↑ = plus loin devant. */
export const BOT_ZONE_AHEAD = 3;
/** Demi : distance horizontale max (m) du point de pose (le rayon de visée doit toucher le sol là : < SLOW_ZONE_PLACE_RANGE). ↑ = pose de plus loin. */
export const BOT_ZONE_MAX_DIST = 14;
/** Demi en attaque : zone sur un poursuivant à moins de cette distance (m) de notre porteur (derrière ou à côté de lui). ↑ = plus souvent. */
export const BOT_ZONE_PURSUER_DIST = 8;
/** Demi : il appuie sur ABILITY quand la pose prévue (slowZonePlacement avec le regard envoyé) est à moins de cette distance (m) du point voulu. ↑ = pose plus vite, moins précise. */
export const BOT_ZONE_PLACE_TOLERANCE = 1.5;
/** Contournement des zones adverses : marge (m) ajoutée au rayon de la zone. ↑ = contourne plus large. */
export const BOT_ZONE_AVOID_MARGIN = 0.8;
/** Contournement : on ne contourne qu'une zone à moins de cette distance (m) de son bord sur la route. ↑ = anticipe plus tôt. */
export const BOT_ZONE_AVOID_LOOKAHEAD = 5;
/** Porteur : pénalité d'une direction de course qui traverse une zone adverse (même échelle que la progression, 1). ↑ = contourne davantage. */
export const BOT_CARRIER_ZONE_PENALTY = 0.6;

// --- Mêlée (étape 7, src/bots/scrumBrain.ts) -----------------------------------

/**
 * Approche d'une mêlée : quand le ballon est libre depuis ce temps (s, < SCRUM_LOOSE_SEC) avec un adversaire près du
 * ballon, les bots jouent la mêlée : l'équipe qui peut la jouer sans être en infériorité « tient » la zone sans ramasser
 * le ballon (BOT_SCRUM_HOLD_MARGIN), sinon les non-chasseurs rejoignent la zone pour peser sur le décompte. Correction
 * de l'étape 7 : 1,2 -> 1,6 s — on ne tient la zone qu'autour d'un ballon déjà disputé (à 1,2 s, les bots tournaient
 * autour de presque tous les ballons libres sans les prendre : moins de ballon porté, plus de ballons libres > 3 s).
 * Mesuré (24 matchs bots normal, 6 min, réglage de l'étape 7) : ≈ 2,5 mêlées par match en 3v3, ≈ 1,2 en 5v5 (≈ 4 / 2 à
 * 1,2 s) ; plus tôt (0,5–0,8 s), presque plus aucune (les chasseurs ramassent avant que tout le monde soit là).
 * ↑ = ils jouent la mêlée plus tard (moins de mêlées).
 */
export const BOT_SCRUM_APPROACH_SEC = 1.6;
/**
 * Adversaires « dans la zone » pour le décompte des bots : à moins de rayon + cette marge (m) du centre (ils peuvent y
 * entrer avant la fin). ↑ = plus prudent (plus de bots envoyés dans la zone).
 */
export const BOT_SCRUM_THREAT_MARGIN = 3;
/**
 * Majorité confortable : un bot entre dans la zone tant que son équipe y compte moins de (adversaires dans la zone +
 * cette marge) joueurs ; au-delà, les autres se placent pour la suite (soutien si on gagne, défense sinon) au lieu de
 * s'entasser. ↑ = plus de monde dans la zone (moins de placement pour la suite).
 */
export const BOT_SCRUM_LEAD_MARGIN = 2;
/**
 * Point visé dans la zone : à cette fraction du rayon depuis le centre, du côté d'où vient le bot (ils se répartissent
 * autour du ballon au lieu de s'empiler au centre). ↑ = plus près du bord (sortis plus facilement par un knockback).
 */
export const BOT_SCRUM_INNER_FRACTION = 0.45;
/**
 * Un bot ne rejoint une mêlée en cours que s'il peut entrer dans la zone avant sa fin (temps de course jusqu'au bord ≤
 * temps restant + cette marge, s ; la prolongation peut l'allonger). ↑ = rejoint même de loin.
 */
export const BOT_SCRUM_REACH_SLACK_SEC = 0.5;
/**
 * Approche, mêlée possible (au moins N joueurs de chaque camp près du ballon) et équipe en majorité : ses bots « tiennent »
 * la zone sans ramasser le ballon (mêlée gagnée au décompte plutôt qu'un porteur au milieu des tireurs adverses) : point
 * visé à au moins BALL_PICKUP_RADIUS + cette marge (m) du ballon. ↑ = se tiennent plus loin du ballon (moins de ramassages involontaires).
 */
export const BOT_SCRUM_HOLD_MARGIN = 1.2;
/**
 * Approche : on ne tient plus la zone si le ballon est libre depuis plus de SCRUM_LOOSE_SEC + cette marge (s) sans que la
 * mêlée se soit déclenchée (décompte insuffisant dans le rayon) : on ramasse. ↑ = attend plus longtemps la mêlée.
 */
export const BOT_SCRUM_HOLD_GRACE_SEC = 0.3;
/** Approche : seuls les bots à moins de cette distance (m, ×échelle) du ballon rejoignent la zone. ↑ = rappelle de plus loin. */
export const BOT_SCRUM_JOIN_DIST = 28;
/**
 * Bots en surplus pendant la mêlée, équipe qui perd ou à égalité : défense à cette profondeur (m, ×échelle) entre le
 * centre de la zone et notre en-but (prêts à presser le futur porteur adverse). ↑ = défense plus reculée.
 */
export const BOT_SCRUM_COVER_DEPTH = 10;
/**
 * Bots en surplus pendant la mêlée, équipe qui mène : les BOT_SCRUM_SUPPORTERS premiers (rangés par x) se placent en
 * soutien derrière la zone (cône de passe du futur porteur), les autres dans l'espace devant (passe finale : valeur
 * sortie de scrumBrain.ts, inchangée). ↑ = plus de soutiens, moins de coureurs devant.
 */
export const BOT_SCRUM_SUPPORTERS = 2;

/*
 * Cible d'entraînement « tourelle » (src/bots/turret.ts, étape 5) : un adversaire immobile qui se tourne vers l'ennemi
 * actif le plus proche à portée et tire par rafales. Remplacée dans le jeu par les bots de l'étape 6 ; gardée pour les
 * tests (et comme exemple minimal d'InputProvider).
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

// ============================================================================
//  EN LIGNE (lu par la sim, le serveur et le client réseau)
// ============================================================================

/**
 * Compensation de latence (lagcomp.ts) : retard maximal (ticks) de la vue d'un joueur que le serveur rembobine pour juger
 * ses tirs. 12 ticks = 400 ms : interpolation du client (≈ 170 ms) + un aller-retour jusqu'à ≈ 230 ms. Au-delà, le
 * joueur doit viser un peu devant. ↑ = joueurs très lointains avantagés, tirs « derrière un muret » plus fréquents
 * pour la cible.
 */
export const LAG_COMP_MAX_TICKS = 12;

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
/**
 * Bonus de FOV proportionnel à la vitesse au-delà de la vitesse de course du rôle (degrés par m/s). Passe finale : 1,2 -> 3 :
 * le champ « s'ouvre » au sprint (ailier porteur +5,5°, pilier porteur +4,5°) et reste presque stable pendant une esquive
 * (plafond atteint : +0,5° seulement au-dessus du sprint) ; avant, +2° au sprint et un coup de zoom 3 fois plus fort à
 * chaque esquive. ↑ = sensation de vitesse plus forte.
 */
export const CAMERA_FOV_SPEED_GAIN = 3;
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
/**
 * Porteur local (passe finale) : la caméra MONTE de cette hauteur (m) sans changer de direction, lissée comme la distance
 * (CAMERA_BLEND_RATE). Sans elle, le corps du porteur (caméra à 1,6 m, regard horizontal) masquait toute la bande sous
 * l'horizon droit devant lui, là où se tient le défenseur qui lui barre la route ; avec 1 m, sa tête passe à ≈ 9,5° sous
 * l'horizon. Le porteur ne tire pas : le réticule n'a pas à rester sur la droite de tir (§3 ; il la rejoint en ≈ 0,3 s
 * après une passe). ↑ = le porteur descend à l'écran et dégage la vue devant lui (vue plus plongeante).
 */
export const CAMERA_CARRY_RAISE = 1.0;
/**
 * Inclinaison du regard du joueur local à chaque coup d'envoi / remise en jeu (degrés, négatif = vers le bas). La caméra
 * étant sur la droite de tir, un regard horizontal plaçait l'horizon au milieu de l'écran (moitié ciel et tribunes).
 * ↓ (plus négatif) = plus de terrain et de coéquipiers à l'écran au départ, moins de profondeur.
 */
export const KICKOFF_PITCH_DEG = -8;
/**
 * Hauteur de caméra choisie dans les réglages (≠ 0) : la caméra regarde le point de la droite de tir situé à cette
 * distance (m) devant l'origine de visée. Le réticule y est EXACT (convergence) ; plus près ou plus loin, l'écart reste
 * faible (≈ 0,2 m à 8 m pour +0,5 m de hauteur). Hauteur 0 (défaut) : caméra exactement sur la droite de tir (§3).
 * ↑ = réticule exact plus loin (tirs longs), un peu moins juste au contact.
 */
export const CAMERA_CONVERGE_DISTANCE = 20;
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
/**
 * Porteur local (passe finale) : il ne vise ni ne tire, donc maintenir Maj / basculer L3 ne lui servait qu'à sprinter.
 * Vrai : le client émet SPRINT en permanence quand le joueur local porte le ballon (la sim n'applique le sprint que dans
 * le cône avant et stick assez incliné : SPRINT_MIN_FORWARD_COS, SPRINT_MIN_TILT), et Maj esquive à l'ENFONCEMENT
 * (latence ≤ 1 tick au lieu de 77 à 157 ms, plus d'esquive perdue sur un appui de 150 ms, plus de « trou » de sprint).
 * Faux : comportement de KEYBOARD_DODGE_ON_RELEASE et de L3, comme les autres joueurs.
 */
export const CARRIER_AUTO_SPRINT = true;

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
  | 'matchEnd'
  | 'hardLanding'
  | 'shieldBlock'
  | 'explosionNear'
  | 'scrumStart'
  | 'scrumWon'
  | 'scrumLost'
  | 'dodge'
  | 'dive'
  | 'passThrown'
  | 'passCompleted'
  | 'kick';

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
  /** Fin du match (coup de sifflet final) : longue, la plus prioritaire. */
  matchEnd: { durationSec: 0.8, strong: 0.6, weak: 0.6, priority: 6 },
  /** Réception d'un saut à grande vitesse verticale. */
  hardLanding: { durationSec: 0.06, strong: 0.25, weak: 0.0, priority: 1 },
  /** Étape 7 : son bouclier (pilier local) bloque un tir ou une explosion : léger, sec. */
  shieldBlock: { durationSec: 0.05, strong: 0.0, weak: 0.4, priority: 1 },
  /** Étape 7 : explosion de grenade proche (souffle) : moyen et sourd. */
  explosionNear: { durationSec: 0.18, strong: 0.55, weak: 0.25, priority: 2 },
  /** Étape 7 : une mêlée se déclenche (n'importe où : c'est un temps fort du match) : double grondement moyen. */
  scrumStart: { durationSec: 0.3, strong: 0.5, weak: 0.3, priority: 3 },
  /** Étape 7 : mêlée gagnée par son équipe : net et vif. */
  scrumWon: { durationSec: 0.25, strong: 0.55, weak: 0.7, priority: 3 },
  /** Étape 7 : mêlée perdue : sourd et bref. */
  scrumLost: { durationSec: 0.2, strong: 0.4, weak: 0.0, priority: 3 },
  /** Passe finale (gestes du joueur local) : esquive — un grésillement très bref. */
  dodge: { durationSec: 0.05, strong: 0.0, weak: 0.3, priority: 1 },
  /** Plongeon : petit choc. */
  dive: { durationSec: 0.12, strong: 0.45, weak: 0.3, priority: 2 },
  /** Passe lancée : à peine perceptible (le retour fort vient à la réception). */
  passThrown: { durationSec: 0.04, strong: 0.0, weak: 0.25, priority: 1 },
  /** Sa passe attrapée par un coéquipier : confirmation nette (le receveur est souvent hors champ). */
  passCompleted: { durationSec: 0.08, strong: 0.2, weak: 0.4, priority: 2 },
  /** Coup de pied : frappe sourde. */
  kick: { durationSec: 0.08, strong: 0.5, weak: 0.1, priority: 2 },
};
/** Vitesse verticale d'atterrissage (m/s) au-delà de laquelle « hardLanding » vibre. ↑ = seulement les grosses chutes. */
export const RUMBLE_HARD_LANDING_SPEED = 9;
/** « explosionNear » : explosion à moins de (rayon d'explosion × cette valeur) des pieds du joueur local. ↑ = vibre pour des explosions plus lointaines. */
export const RUMBLE_EXPLOSION_NEAR_MULT = 1.5;

// ============================================================================
//  MENUS ET RÉGLAGES DU JOUEUR (étape 8 : lu uniquement par src/input, src/game et src/ui)
// ============================================================================

/**
 * Navigation à la manette dans les menus : inclinaison du stick gauche (0..1, après la zone morte de déplacement) qui
 * compte comme une direction (croix directionnelle : appui simple). ↑ = il faut un geste plus franc pour bouger le focus.
 */
export const MENU_NAV_STICK_THRESHOLD = 0.55;
/**
 * Répétition d'une direction maintenue dans les menus (croix ou stick) : délai avant la première répétition, puis
 * intervalle entre deux répétitions (s). ↓ = défilement plus rapide d'une liste ou d'un curseur.
 */
export const MENU_NAV_REPEAT_DELAY_SEC = 0.38;
export const MENU_NAV_REPEAT_SEC = 0.11;
/**
 * Curseurs de sensibilité des réglages (souris : multiplicateur de MOUSE_SENSITIVITY ; caméra manette : multiplicateur
 * de GAMEPAD_LOOK_YAW_SPEED_DEG / GAMEPAD_LOOK_PITCH_SPEED_DEG) : bornes et pas. 1 = valeurs de ce fichier.
 * ↑ MAX = le joueur peut accélérer davantage sa caméra.
 */
export const SETTINGS_SENSITIVITY_MIN = 0.25;
export const SETTINGS_SENSITIVITY_MAX = 3;
export const SETTINGS_SENSITIVITY_STEP = 0.05;
/**
 * Sensibilité en visée (réglages) : multiplicateur appliqué EN PLUS pendant la visée (souris : par-dessus
 * MOUSE_AIM_SENSITIVITY_MULT ; manette : par-dessus GAMEPAD_AIM_LOOK_MULT). 1 = valeurs de ce fichier. Bornes et pas.
 */
export const SETTINGS_AIM_SENSITIVITY_MIN = 0.25;
export const SETTINGS_AIM_SENSITIVITY_MAX = 2;
/**
 * Champ de vision vertical de base choisi dans les réglages (degrés) : CAMERA_FOV remplacé, porteur et visée décalés
 * d'autant (CAMERA_FOV_CARRY, CAMERA_FOV_AIM). Bornes et pas. ↑ MAX = vue plus large possible (bords plus déformés).
 */
export const SETTINGS_FOV_MIN = 60;
export const SETTINGS_FOV_MAX = 100;
export const SETTINGS_FOV_STEP = 1;
/** Distance de caméra (réglages) : multiplicateur des trois distances CAMERA_DISTANCE*. Bornes et pas. */
export const SETTINGS_CAMERA_DISTANCE_MIN = 0.6;
export const SETTINGS_CAMERA_DISTANCE_MAX = 1.8;
/**
 * Hauteur de caméra (réglages, m) ajoutée au pivot de la caméra (origine de visée), avec convergence du regard
 * (CAMERA_CONVERGE_DISTANCE). Bornes et pas. Négatif = caméra plus basse que l'épaule.
 */
export const SETTINGS_CAMERA_HEIGHT_MIN = -0.4;
export const SETTINGS_CAMERA_HEIGHT_MAX = 1.2;
export const SETTINGS_CAMERA_STEP = 0.05;
