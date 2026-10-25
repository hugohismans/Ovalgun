/**
 * Palette et dimensions VISUELLES du rendu (aucune valeur de gameplay ici : celles-ci sont dans
 * src/sim/constants.ts). Style flat coloré type Splatoon / Rocket League : couleurs saturées,
 * contours sombres, ciel vif.
 */

export interface TeamColors {
  /** Couleur principale (capsule, en-but teinté). */
  main: string;
  /** Variante sombre (détails, ombrage). */
  dark: string;
  /** Variante claire (liserés, signes de rôle). */
  light: string;
}

export const PALETTE = {
  /** Équipe 0 orange vif, équipe 1 bleu vif. */
  teams: [
    { main: '#ff7417', dark: '#c94a00', light: '#ffb36b' },
    { main: '#1f8cff', dark: '#0a55c2', light: '#86c6ff' },
  ] as const satisfies readonly [TeamColors, TeamColors],

  /** Brouillard : même teinte que l'horizon du ciel (ENVIRONMENT.skyHorizon) pour fondre la ville au loin. */
  fog: '#c9ecff',
  hemiSky: '#e8f7ff',
  hemiGround: '#4f8a3c',
  sun: '#fff1d6',

  grassA: '#4fcf5c',
  grassB: '#43bb51',
  /** Pelouse hors de l'arène (au-delà des murs invisibles). */
  outside: '#2b9c74',
  line: '#ffffff',
  /** Bordure basse qui matérialise les murs invisibles. */
  border: '#f2fbff',

  /** Corps des reliefs (murets, rampes). */
  feature: '#fbf5ea',
  featureEdge: '#2a2643',

  outline: '#17142a',
  visor: '#141833',
  visorGlint: '#7fe7ff',
  weapon: '#2b2d44',
  roleSign: '#ffffff',

  ball: '#ffe12e',
  ballBand: '#ffffff',
  ballTrail: '#fff6b0',
  pickupRing: '#fff38a',
  carrierMarker: '#ffe12e',
  humanRing: '#ffffff',
  shadow: '#0b1a12',

  /** Passe assistée : cible (flèche au-dessus du receveur, ligne, éventail au sol) / aucune cible. */
  passTarget: '#3dffa0',
  passNone: '#ff4d6d',
  /**
   * Passe finale : risque de la passe assistée (démarquage du receveur, `openness` de selectPassTarget) — ambre sous
   * BOT_PASS_MIN_OPENNESS (passe que les bots refusent hors de leurs 22 m), rouge-orangé « marqué » sous
   * BOT_PASS_MIN_OPENNESS_OWN_THIRD (passe que les bots ne tentent jamais).
   */
  passRisky: '#ffc23d',
  passMarked: '#ff5a2e',
  /** Point de chute prévu du coup de pied. */
  kickLanding: '#ffffff',
  /** Effets (FX) des événements du porteur. */
  fxPickup: '#ffe12e',
  fxCatch: '#ffffff',
  fxIntercept: '#ff3d5a',
  fxKick: '#fff6b0',
  fxDive: '#7fe7ff',
  fxPass: '#ffffff',

  /** Combat (étape 5) : traceurs par équipe (cœur vif), flash de bouche, étincelles (joueur touché / relief). */
  tracers: ['#fff0a0', '#c8f4ff'] as const,
  muzzleFlash: '#fff6c2',
  sparkHit: '#ffffff',
  sparkTerrain: '#fff3c4',
  /** Joueur touché : teinte émissive du clignotement. */
  hitFlash: '#ffffff',
  /** Barre de stabilité au-dessus des autres joueurs : fond, jauge pleine, jauge basse. */
  stabilityBarBack: '#17142a',
  stabilityBarHigh: '#ffffff',
  stabilityBarLow: '#ff3d5a',
  /** Plaquage : éclat en étoile, onde au sol, étoiles qui tournent au-dessus du joueur au sol. */
  tackleBurst: '#ffe12e',
  tackleRing: '#ffffff',
  dizzyStar: '#ffe12e',
  /** Relevé, capacité (sprint boosté). */
  fxGetup: '#ffffff',
  fxAbility: '#3dffa0',

  /** Étape 7 : liseré et flash du bouclier (le panneau prend la couleur claire de l'équipe). */
  shieldRim: '#ffffff',
  shieldFlash: '#ffffff',
  /** Grenades : sphère, traînée ; explosions : boule (couleur de l'équipe du tireur, éclaircie) et onde au sol. */
  grenade: '#2b2d44',
  grenadeBand: ['#ffb36b', '#86c6ff'] as const,
  grenadeTrail: ['#ffe0b8', '#d4ecff'] as const,
  explosionCore: '#fff6c2',
  explosionRing: '#ffffff',
  /** Zones de ralentissement : disque, bord animé (couleurs de l'équipe), aperçu de pose (joueur local). */
  zonePreview: '#ffffff',
  grenadePreview: '#ffffff',
  /**
   * Mêlée (étape 7) : remplissage neutre (égalité), bord exact de la zone, prolongation (doré), effets au déclenchement /
   * à la résolution. Les arcs de répartition et le remplissage de l'équipe qui mène prennent les couleurs des équipes.
   */
  scrumNeutral: '#ffffff',
  scrumRim: '#ffffff',
  scrumOvertime: '#ffd23e',
  fxScrum: '#ffffff',
} as const;

/** Dimensions et réglages purement visuels. */
export const STYLE = {
  /** Largeur des bandes de tonte (m). */
  stripeWidth: 6,
  /** Largeur des lignes blanches (m). */
  lineWidth: 0.2,
  /** En-but : couleur de l'équipe qui le défend, éclaircie vers le blanc de cette fraction (0..1). */
  inGoalTint: 0.22,
  /** Bordure basse des murs invisibles : hauteur et épaisseur (m). */
  borderHeight: 0.22,
  borderThickness: 0.35,
  /** Voile translucide au-dessus de la bordure (m) et son opacité au pied. */
  fenceHeight: 1.6,
  fenceOpacity: 0.16,

  /** Contour cartoon (inverted hull) : échelle de la coque. */
  outlineScale: 1.08,
  /** Lissage des postures (accroupi / debout), 1/s. */
  poseRate: 16,
  /**
   * Posture basse (glissade, plongeon, au sol) : la capsule est ÉCRASÉE à la hauteur de la hitbox de la sim
   * (PLAYER_LOW_HEIGHT, capsule verticale) et seulement un peu inclinée pour la lisibilité (rad).
   */
  lowPostureLean: 0.35,
  /** Losange du porteur : hauteur au-dessus de la tête (m), taille (m). */
  markerAboveHead: 0.75,
  markerSize: 0.32,
  /** Losange du porteur : amplitude (m) et vitesse (rad/s) du flottement, vitesse de rotation (rad/s). */
  markerBobAmp: 0.08,
  markerBobRate: 4,
  markerSpinRate: 2.4,
  /** Losange au-dessus de sa propre tête : échelle réduite (plus discret). */
  markerHumanScale: 0.6,
  /** Anneau du joueur humain : rayons intérieur / extérieur (m). */
  humanRingInner: 0.62,
  humanRingOuter: 0.8,
  /** Ombre portée : opacité au sol, et hauteur à laquelle elle disparaît (m). */
  shadowOpacity: 0.32,
  shadowFadeHeight: 6,
  /** Échelle minimale de l'ombre (très haut en l'air) : joueur / ballon. */
  playerShadowMinScale: 0.55,
  ballShadowMinScale: 0.5,

  /**
   * Brouillard : début et fin (m). Le terrain et les tribunes (< 90 m) restent nets ; la ville se fond dans l'horizon
   * (≈ 50 % de brume à 300 m, fondue dans l'horizon au bord de la ville vers 480 m).
   */
  fogNear: 110,
  fogFar: 480,
  /** Intensités des lumières hémisphérique et directionnelle (soleil). */
  hemiIntensity: 1.5,
  sunIntensity: 1.9,

  /** Ballon porté : inclinaison (rad, pointe vers le haut). */
  carriedBallTilt: -0.35,
  /** Cercle de ramassage : opacité moyenne, amplitude et vitesse (rad/s) de la pulsation. */
  pickupRingOpacity: 0.55,
  pickupRingPulse: 0.35,
  pickupRingPulseRate: 5,

  /** Ballon : exagération de taille pour la lisibilité (1 = taille de la sim). */
  ballVisualScale: 1.45,
  /** Traînée : durée (s), largeur (m), opacité max, nombre max de points. */
  trailSec: 0.5,
  trailWidth: 0.14,
  trailOpacity: 0.85,
  trailMaxPoints: 48,
  /**
   * Traînée : vitesse apparente (m/s) au-delà de laquelle un saut de plus de `teleportDist` depuis son dernier point est une
   * téléportation (outil « ballon au centre ») et la coupe — le double du ballon le plus rapide (coup de pied ≈ 27 m/s).
   */
  trailTeleportSpeed: 55,
  /** Passe assistée : flèche au-dessus du receveur — taille (m), hauteur au-dessus de la tête (m), flottement (m, rad/s), rotation (rad/s). */
  passArrowSize: 0.34,
  passArrowAboveHead: 0.95,
  passArrowBobAmp: 0.12,
  passArrowBobRate: 7,
  passArrowSpinRate: 3,
  /** Passe assistée : éventail au sol derrière le porteur (cône de passe, relatif au terrain) — rayon (m), opacité. */
  passFanRadius: 2.6,
  passFanOpacity: 0.2,
  /** Passe assistée : trait au sol du porteur vers la cible — largeur (m), opacité ; repère du regard replié (longueur relative au rayon). */
  passLineWidth: 0.09,
  passLineOpacity: 0.45,
  passAimTickWidth: 0.06,
  passAimTickOpacity: 0.55,
  /**
   * Passe assistée : chevron au sol pointé vers le receveur, au bord de l'éventail (le receveur est presque
   * toujours DERRIÈRE le porteur, donc hors champ : l'éventail, lui, est entre la caméra et le porteur).
   * Taille (m), distance au porteur (m), amplitude (m) et vitesse (rad/s) du va-et-vient.
   */
  passChevronSize: 0.75,
  passChevronDist: 1.75,
  passChevronBobAmp: 0.15,
  passChevronBobRate: 9,
  /** Point de chute prévu du coup de pied : rayon (m) et opacité (discret). */
  kickMarkerRadius: 1.3,
  kickMarkerOpacity: 0.45,
  kickMarkerSpinRate: 1.5,
  /** Point de chute : balise verticale fine (lisible de loin, au ras du sol l'anneau s'écrase) — hauteur, rayon (m), opacité. */
  kickBeaconHeight: 3.5,
  kickBeaconRadius: 0.1,
  kickBeaconOpacity: 0.55,
  /** Effets : nombre max d'effets simultanés, épaisseur relative des anneaux (0..1). */
  fxPoolSize: 32,
  fxRingThickness: 0.16,
  /**
   * Halo d'invulnérabilité (plongeon, relevé) : coque à la couleur CLAIRE de l'équipe, faces arrière seulement (un liseré
   * autour du corps, qui garde sa couleur d'équipe) — échelle, opacité moyenne, amplitude et vitesse (rad/s) de la
   * pulsation. Passe finale : avant, coque blanche par-dessus le corps (couleur d'équipe perdue) qui clignotait à 6,4 Hz ;
   * 9 rad/s ≈ 1,4 Hz, sous le seuil de 3 flashs/s ; pulsation coupée sous `prefers-reduced-motion: reduce`.
   */
  invulnScale: 1.22,
  invulnOpacity: 0.75,
  invulnPulse: 0.15,
  invulnPulseRate: 9,
  /** Distance (m) au-delà de laquelle un saut entre deux ticks est une téléportation (pas d'interpolation). */
  teleportDist: 4,
  /** Rapport pixels physiques / CSS maximal du rendu (écrans HiDPI, zoom du navigateur). ↑ = plus net, plus coûteux. */
  maxPixelRatio: 2,
  /**
   * Passe finale : joueurs estompés près de la caméra (fadeMath.ts, tramage « alpha hash »). Autres joueurs : opaques au-delà
   * de `cameraFadeFar` (m, de la caméra à la surface de leur capsule), presque invisibles à `cameraFadeNear` ; entre la
   * caméra et le joueur local (à moins de `lineFadeRadius` m du segment caméra -> dos du joueur local, qui s'arrête
   * `lineFadeBehind` m derrière l'origine de visée) : opacité ramenée jusqu'à `lineFadeMin`. Joueur local : estompé
   * entre `localFadeFar` et `localFadeNear` (caméra plaquée contre lui en regardant en l'air ; en visée ≈ 2,4 m : opaque).
   * Sous `fadeDetailsBelow`, barre de stabilité et étoiles masquées ; sous `fadeHideBelow`, joueur masqué.
   */
  cameraFadeNear: 0.4,
  cameraFadeFar: 1.8,
  lineFadeRadius: 0.6,
  lineFadeMin: 0.35,
  lineFadeBehind: 0.6,
  localFadeNear: 0.5,
  localFadeFar: 1.6,
  fadeDetailsBelow: 0.5,
  fadeHideBelow: 0.05,

  // --- Combat (étape 5) ---
  /** Traceurs : nombre max simultanés, longueur (m) et épaisseur (m) — balles / plombs ; opacité. */
  tracerPoolSize: 96,
  tracerLength: 3.2,
  tracerWidth: 0.07,
  pelletTracerLength: 1.2,
  pelletTracerWidth: 0.05,
  tracerOpacity: 0.95,
  /**
   * Traceurs : départ visuel au canon de l'arme affichée, rejoint la vraie trajectoire (partie de l'origine de visée,
   * sur la droite de la caméra) sur cette distance (m) : on voit les balles partir de l'arme vers le réticule.
   */
  tracerConvergeDist: 7,
  /** Position du canon de l'arme affichée par rapport à l'origine de visée (m) : vers la droite, vers le haut, vers l'avant. */
  muzzleRight: -0.2,
  muzzleUp: -0.48,
  muzzleForward: 0.7,
  /** Flash de bouche : durée (s), taille (m), nombre max simultanés. */
  muzzleFlashSec: 0.06,
  muzzleFlashSize: 0.32,
  muzzlePoolSize: 24,
  /** Flash de bouche : avance devant le canon (m), rotation ajoutée à chaque tir (rad), rétrécissement en fin de vie (fraction). */
  muzzleFlashAhead: 0.15,
  muzzleFlashSpinStep: 0.9,
  muzzleFlashShrink: 0.4,
  /**
   * Étincelles d'impact : nombre max, par balle qui touche un joueur / par décharge de plombs sur un joueur / sur le
   * relief ou un bouclier, vitesse (m/s), durée (s), taille (m), gravité (m/s²). Passe finale : une seule gerbe par joueur
   * touché et par tick, et une seule gerbe de relief par tireur et par tick (une décharge de 8 plombs en faisait 48 et le
   * pool de 120 saturait dans les mêlées) ; 6 -> 3 par balle, pool 120 -> 64.
   */
  sparkPoolSize: 64,
  sparksPerHit: 3,
  sparksPerPelletHit: 4,
  sparksPerTerrain: 4,
  sparkSpeed: 5,
  sparkSec: 0.28,
  sparkSize: 0.09,
  sparkGravity: 14,
  /**
   * Étincelles : dispersion (rendu seulement) — part verticale de la vitesse (min + tirage × plage), facteur de vitesse
   * (min + tirage × plage) et facteur de durée de vie (min + tirage × plage).
   */
  sparkUpMin: 0.3,
  sparkUpRange: 0.9,
  sparkSpeedMin: 0.5,
  sparkSpeedRange: 0.7,
  sparkLifeMin: 0.7,
  sparkLifeRange: 0.6,
  /** Joueur touché : durée du clignotement (s) et intensité émissive max. */
  hitFlashSec: 0.12,
  hitFlashIntensity: 0.85,
  /** Barre de stabilité : largeur, hauteur (m), hauteur au-dessus de la tête (m), seuil « basse » (fraction). */
  stabilityBarWidth: 1.05,
  stabilityBarHeight: 0.14,
  stabilityBarAboveHead: 0.32,
  stabilityBarLowFraction: 0.35,
  /** Barre de stabilité : opacité du fond, marge du fond autour de la jauge (m). */
  stabilityBarBackOpacity: 0.75,
  stabilityBarBackMargin: 0.06,
  /**
   * Plaquage : éclat en étoile (durée s, taille max m), nombre max simultanés ; échelle de l'éclat quand le plaqué est le
   * joueur local (la caméra est juste derrière : à pleine taille il couvrait les deux tiers de l'écran).
   */
  tackleBurstSec: 0.4,
  tackleBurstSize: 2.2,
  tackleBurstLocalScale: 0.5,
  tackleBurstPoolSize: 8,
  /** Éclat de plaquage : hauteur au-dessus des pieds (m), rotation sur sa durée (rad), échelle de départ (fraction). */
  tackleBurstHeight: 0.9,
  tackleBurstSpin: 1.2,
  tackleBurstStartScale: 0.3,
  /** Joueur au sol : étoiles qui tournent (nombre, rayon m, hauteur m, vitesse rad/s, taille m) ; vitesse de chute / relevé visuels (1/s). */
  dizzyStars: 3,
  dizzyRadius: 0.45,
  dizzyHeight: 1.15,
  dizzySpinRate: 5,
  dizzyStarSize: 0.16,
  /** Étoiles : amplitude de l'oscillation verticale (m), position vers l'avant du corps couché (fraction de PLAYER_HEIGHT). */
  dizzyBob: 0.08,
  dizzyForwardFraction: 0.55,
  fallRate: 14,

  // --- Pilier et demi (étape 7) ---
  /** Bouclier : segments de l'arc, opacité du panneau, scintillement (amplitude, rad/s), opacité du liseré. */
  shieldSegments: 18,
  shieldOpacity: 0.32,
  shieldShimmer: 0.05,
  shieldShimmerRate: 6,
  shieldRimOpacity: 0.85,
  /** Bouclier : constante de temps du déploiement / repli (s), durée et opacité ajoutée du flash quand il bloque. */
  shieldDeploySec: 0.06,
  shieldFlashSec: 0.18,
  shieldFlashOpacity: 0.55,
  /** Grenade : rayon de la sphère affichée (m), nombre max simultanées, traînée (durée s, épaisseur m). */
  grenadeRadius: 0.16,
  grenadePoolSize: 24,
  grenadeTrailSec: 0.12,
  grenadeTrailWidth: 0.09,
  grenadeTrailOpacity: 0.7,
  /** Grenade : rotation visuelle (rad par mètre parcouru). */
  grenadeSpinPerMeter: 0.8,
  /** Explosion : durée (s), rayon de départ de la boule (fraction du rayon d'explosion), opacité de départ, onde au sol (durée s, épaisseur relative). */
  explosionSec: 0.42,
  explosionStartFraction: 0.25,
  explosionOpacity: 0.85,
  explosionRingSec: 0.5,
  explosionRingThickness: 0.12,
  explosionPoolSize: 12,
  /** Zone de ralentissement : nombre max, opacité du disque, du bord, du rideau bas (hauteur m), vitesse de rotation du bord (rad/s), pulsation. */
  zonePoolSize: 12,
  zoneDiscOpacity: 0.22,
  zoneRimOpacity: 0.85,
  zoneRimWidth: 0.35,
  zoneWallHeight: 0.7,
  zoneWallOpacity: 0.18,
  zoneSpinRate: 0.8,
  zonePulse: 0.12,
  zonePulseRate: 4,
  /** Zone : durée (s) du fondu de fin de vie et de l'apparition. */
  zoneFadeSec: 0.6,
  zoneAppearSec: 0.2,
  /** Aperçus du joueur local : zone de ralentissement (capacité prête), point d'impact de la grenade (en visée) — opacité. */
  zonePreviewOpacity: 0.35,
  grenadePreviewRadius: 0.8,
  grenadePreviewOpacity: 0.6,
  /** Aperçu de grenade : balise verticale (rayon, hauteur m). */
  grenadePreviewBeaconRadius: 0.06,
  grenadePreviewBeaconHeight: 2.5,

  // --- Mêlée (étape 7, ScrumView et HUD) ---
  /**
   * Zone de capture : largeur (m) de la bande extérieure de répartition (arcs aux couleurs des équipes, chacun grandit
   * depuis le côté de son en-but), du liseré blanc au rayon exact, opacités (bande, liseré, fond, remplissage de la
   * progression), rideau bas (hauteur m, opacité), pulsation de la prolongation (rad/s, amplitude).
   */
  scrumBandWidth: 0.5,
  scrumRimWidth: 0.1,
  scrumBandOpacity: 0.85,
  scrumRimOpacity: 0.95,
  scrumBaseOpacity: 0.12,
  scrumFillOpacity: 0.42,
  scrumWallHeight: 0.9,
  scrumWallOpacity: 0.3,
  scrumPulseRate: 9,
  scrumPulse: 0.35,
  /** Mêlée : apparition (s), fondu après la résolution (s). */
  scrumAppearSec: 0.25,
  scrumFadeSec: 0.7,
  /** HUD : « MÊLÉE ! » affiché au déclenchement (s), « Mêlée gagnée par … » à la résolution (s). */
  scrumCallSec: 1.3,
  scrumResultSec: 2.2,

  // --- Retours de visée (HUD, lus par la session) ---
  /** Hitmarker sur le réticule : durée (s), normal / plaquage. */
  hitMarkerSec: 0.16,
  hitMarkerStrongSec: 0.42,
  /** Indicateur de direction des tirs reçus : durée (s) ; nombre max affichés. */
  damageIndicatorSec: 0.9,
  damageIndicatorMax: 4,
  /** Vignette rouge : commence sous cette fraction de stabilité ; flash à chaque tir reçu (opacité, durée s). */
  vignetteFromFraction: 0.5,
  vignetteHitFlash: 0.25,
  vignetteHitSec: 0.18,

  // --- Boucle de match (étape 6, HUD lu par la session et l'UI) ---
  /** « JOUEZ ! » affiché après le coup de sifflet (s). */
  playCallSec: 0.9,
  /** Bannière « DERNIÈRE MINUTE » au déclenchement (s) ; l'indicateur reste ensuite près du chrono. */
  lastMinuteBannerSec: 2.6,
  /**
   * Écran de fin : délai avant d'accepter A / Entrée / Start (s), pour qu'un saut en cours ou des A répétés au coup de
   * sifflet ne relancent pas le match sans laisser voir les statistiques (1 s avant la correction de l'étape 8).
   */
  endScreenInputDelaySec: 1.5,

  // --- HUD et menus (étape 8, lus par la session / src/game ; l'UI n'importe pas le rendu) ---
  /** Flux d'événements (plaquages, interceptions, essais, mêlées) : durée d'une ligne (s), fondu final (s), lignes max. */
  feedSec: 4.5,
  feedFadeSec: 0.6,
  feedMax: 5,
  /** Chrono affiché au dixième de seconde sous cette valeur (s) ; 0 = jamais. */
  clockTenthsBelowSec: 10,
  /** Jauge de stabilité jaune sous cette fraction du maximum (rouge sous `stabilityBarLowFraction`). */
  stabilityBarMidFraction: 0.65,
  /** Pastille d'arme « munitions basses » (rouge) à cette fraction du chargeur ou moins (au moins 1 cartouche). */
  ammoLowFraction: 0.25,
  /**
   * « Joueur du match » de l'écran de fin (présentation, aucune règle de jeu) : score = somme des statistiques × poids ;
   * le premier dans l'ordre de l'écran de fin (ton équipe d'abord, puis par id) l'emporte en cas d'égalité ; personne si
   * tous les scores sont nuls. ↑ un poids = cette statistique compte davantage.
   */
  mvpWeights: { tries: 3, tackles: 1, interceptions: 2, passes: 1 },

  // --- Caméra « spectateur » du menu (étape 8 : match bots contre bots en fond du menu de lancement) ---
  /** Hauteur (m), recul sur le côté du terrain (m au-delà de la touche), avance le long du terrain (fraction de z du ballon). */
  spectatorHeight: 10,
  spectatorSideOffset: 3,
  spectatorFollowZ: 0.8,
  /** Recul de la caméra derrière le ballon le long du terrain (m) : on voit le jeu en biais. */
  spectatorBackZ: -8,
  /**
   * Décalage du point visé le long du terrain (m) : le ballon apparaît à droite de l'écran (la colonne du menu occupe la
   * gauche).
   */
  spectatorLookOffsetZ: -9,
  /** Lissage de la position et du point visé (1/s) ; balancement lent (m, rad/s). */
  spectatorBlendRate: 1.6,
  spectatorSwayAmp: 4,
  spectatorSwayRate: 0.12,
  /** Champ de vision vertical (degrés). */
  spectatorFov: 50,
} as const;

/** Un anneau d'effet : au sol ou face caméra, rayon de départ / d'arrivée (m), durée (s), délai (s). */
export interface RingFx {
  color: string;
  billboard: boolean;
  r0: number;
  r1: number;
  duration: number;
  delay: number;
  /** Hauteur au-dessus du point d'ancrage (m). */
  lift: number;
}

/**
 * Effets flat des événements du porteur (FxView) : liste d'anneaux par événement.
 * Ancrage : pieds du joueur concerné (au sol) ou ballon (face caméra).
 */
export const FX = {
  pickup: [
    { color: PALETTE.fxPickup, billboard: false, r0: 0.4, r1: 1.9, duration: 0.35, delay: 0, lift: 0.04 },
    { color: PALETTE.fxPickup, billboard: true, r0: 0.15, r1: 0.8, duration: 0.25, delay: 0, lift: 0 },
  ],
  catch: [
    { color: PALETTE.fxCatch, billboard: true, r0: 0.2, r1: 1.0, duration: 0.3, delay: 0, lift: 0 },
    { color: PALETTE.fxCatch, billboard: false, r0: 0.5, r1: 1.6, duration: 0.3, delay: 0, lift: 0.04 },
  ],
  intercept: [
    { color: PALETTE.fxIntercept, billboard: true, r0: 0.3, r1: 1.8, duration: 0.45, delay: 0, lift: 0 },
    { color: PALETTE.fxIntercept, billboard: true, r0: 0.2, r1: 1.2, duration: 0.35, delay: 0.1, lift: 0 },
    { color: PALETTE.fxIntercept, billboard: false, r0: 0.6, r1: 2.6, duration: 0.45, delay: 0, lift: 0.04 },
  ],
  kick: [
    { color: PALETTE.fxKick, billboard: false, r0: 0.3, r1: 2.8, duration: 0.4, delay: 0, lift: 0.04 },
    { color: PALETTE.fxKick, billboard: true, r0: 0.1, r1: 0.9, duration: 0.22, delay: 0, lift: 0 },
  ],
  dive: [
    { color: PALETTE.fxDive, billboard: false, r0: 0.3, r1: 1.2, duration: 0.28, delay: 0, lift: 0.04 },
    { color: PALETTE.fxDive, billboard: true, r0: 0.2, r1: 0.9, duration: 0.25, delay: 0, lift: 0 },
  ],
  pass: [{ color: PALETTE.fxPass, billboard: true, r0: 0.1, r1: 0.7, duration: 0.2, delay: 0, lift: 0 }],
  passDenied: [{ color: PALETTE.passNone, billboard: false, r0: 1.2, r1: 0.7, duration: 0.3, delay: 0, lift: 0.04 }],
  /** Plaquage (étape 5) : onde de choc au sol, en deux temps. */
  tackled: [
    { color: PALETTE.tackleRing, billboard: false, r0: 0.4, r1: 3.2, duration: 0.45, delay: 0, lift: 0.04 },
    { color: PALETTE.tackleBurst, billboard: false, r0: 0.3, r1: 2.2, duration: 0.4, delay: 0.08, lift: 0.05 },
  ],
  /** Relevé : anneau discret qui se resserre. */
  getup: [{ color: PALETTE.fxGetup, billboard: false, r0: 1.4, r1: 0.6, duration: 0.3, delay: 0, lift: 0.04 }],
  /** Essai : grandes ondes dorées au sol autour du marqueur, en trois temps. */
  try: [
    { color: PALETTE.fxPickup, billboard: false, r0: 0.5, r1: 6.0, duration: 0.7, delay: 0, lift: 0.05 },
    { color: PALETTE.fxCatch, billboard: false, r0: 0.4, r1: 4.5, duration: 0.6, delay: 0.12, lift: 0.06 },
    { color: PALETTE.fxPickup, billboard: true, r0: 0.3, r1: 2.4, duration: 0.5, delay: 0.05, lift: 0 },
  ],
  /** Mêlée : déclenchement (grande onde au centre de la zone) ; résolution (onde sur le joueur qui reçoit le ballon). */
  scrumStart: [
    { color: PALETTE.fxScrum, billboard: false, r0: 0.5, r1: 7.0, duration: 0.6, delay: 0, lift: 0.06 },
    { color: PALETTE.scrumOvertime, billboard: false, r0: 0.4, r1: 5.0, duration: 0.5, delay: 0.1, lift: 0.07 },
  ],
  scrumWon: [
    { color: PALETTE.fxPickup, billboard: false, r0: 0.4, r1: 3.5, duration: 0.45, delay: 0, lift: 0.05 },
    { color: PALETTE.fxCatch, billboard: true, r0: 0.2, r1: 1.4, duration: 0.35, delay: 0, lift: 0 },
  ],
  /** Capacité (sprint boosté). */
  ability: [
    { color: PALETTE.fxAbility, billboard: false, r0: 0.4, r1: 2.0, duration: 0.35, delay: 0, lift: 0.04 },
    { color: PALETTE.fxAbility, billboard: true, r0: 0.3, r1: 1.2, duration: 0.25, delay: 0, lift: 0 },
  ],
} as const satisfies Record<string, readonly RingFx[]>;

/**
 * Personnages 3D (src/render/characters) : valeurs purement visuelles (animation, postures, contour).
 * Angles en radians. Aucune n'a d'effet sur le jeu (la hitbox reste la capsule de la sim).
 */
export const CHARACTER_STYLE = {
  /** Contour cartoon (épaisseur en m, le long des normales) ; plus épais et clair pendant l'invulnérabilité. */
  outlineWidth: 0.016,
  invulnOutlineWidth: 0.045,
  /** Sous cette vitesse (m/s) : immobile ; à `runBlendSpeed` : cycle de course plein. */
  idleSpeed: 0.6,
  runBlendSpeed: 3.0,
  /** Vitesse au sol (m/s) qui correspond au cycle de course joué à vitesse 1, et bornes de la vitesse de lecture. */
  runClipSpeed: 6.0,
  runTimeScaleMin: 0.75,
  runTimeScaleMax: 1.8,
  /** Lissage des poids d'animation (1/s) et des postures (1/s). */
  weightRate: 14,
  poseRate: 12,
  /** Part du pitch de visée appliquée au buste (le reste par la tête). */
  aimChestFraction: 0.6,
  aimHeadFraction: 0.3,
  /** Porteur : bras droit qui serre le ballon contre le flanc (avant, intérieur, coude plié). */
  carryUpperArmForward: 0.55,
  carryUpperArmIn: 0.25,
  carryForearmBend: 1.5,
  /** Pilier, bouclier levé : bras gauche tendu vers l'avant. */
  shieldArmForward: 1.3,
  shieldForearmBend: 0.3,
  /** En l'air : genoux repliés. */
  airThigh: 0.6,
  airKnee: 1.0,
  /** Postures basses (bascule depuis les pieds) : glissade en arrière, plongeon en avant ; esquive : penché vers le dash. */
  slideTilt: -1.0,
  diveTilt: 1.3,
  diveArmsUp: 2.6,
  dodgeLean: 0.35,
  dodgeTimeScale: 1.7,
  /** Durée des gestes ponctuels (s) : passe, coup de pied, tir reçu. */
  throwSec: 0.45,
  kickSec: 0.6,
  hitSec: 0.3,
  hitWeight: 0.55,
  /** Durée pendant laquelle un tir garde la posture de tir (s). */
  shootHoldSec: 0.35,
  /** Arme tenue : décalage depuis le poignet (m, repère du personnage : avant). */
  gunForward: 0.08,
  /** Échelle de l'arme tenue (armes « jouet » volumineuses, lisibles de loin). */
  gunScale: 1.45,
} as const;

/**
 * Décor autour du terrain (src/render/environment) : ciel, stade, foule et ville. Purement visuel, géométries
 * procédurales uniquement (aucun asset). Distances en mètres, angles en radians sauf mention contraire. Les couleurs
 * des équipes viennent de PALETTE.teams. Le décor reste au-delà de `standsGap` mètres des murs invisibles : la caméra
 * épaule (au plus ≈ 6 m hors du terrain) ne le traverse jamais.
 */
export const ENVIRONMENT = {
  // --- Ciel ---
  /**
   * Direction VERS le soleil (normalisée dans le code) : partagée par le disque du ciel et la lumière directionnelle
   * (Renderer), pour que l'éclairage et le soleil visible concordent. Élévation ≈ 38°, côté +X / −Z.
   */
  sunDirection: { x: 18, y: 16, z: -10 },
  /** Rayon de la sphère du ciel (m ; elle suit la caméra et se dessine toujours au fond). */
  skyRadius: 500,
  /** Dégradé du ciel : zénith, milieu, horizon (= brouillard), sous l'horizon. */
  skyTop: '#1b56f5',
  skyMid: '#3f9bff',
  skyHorizon: '#c9ecff',
  skyBelow: '#d4f1ff',
  /** Hauteurs (composante verticale de la direction, 0..1) où le milieu, puis le zénith, sont atteints. */
  skyMidHeight: 0.2,
  skyTopHeight: 0.85,
  /** Soleil : cœur, liseré, halo ; rayon du disque et du liseré (degrés). */
  sunCore: '#fffdf2',
  sunRim: '#ffe48a',
  sunHalo: '#fff2c4',
  sunDiskDeg: 2.4,
  sunRimDeg: 3.1,
  /** Halo : exposant (↑ = plus serré) et intensité ; lueur chaude de l'horizon du côté du soleil (intensité). */
  sunHaloPower: 14,
  sunHaloStrength: 0.5,
  sunGlow: '#ffe6c4',
  sunGlowStrength: 0.45,
  /** Anneau plat et discret autour du soleil (style cartoon) : rayon (degrés), intensité. */
  sunRingDeg: 9,
  sunRingStrength: 0.12,

  /** Nuages : nombre, boules par nuage (min, max), distance au centre, altitude, rayon d'une boule (m). */
  cloudCount: 18,
  cloudPuffs: [4, 7] as const,
  cloudDistance: [170, 430] as const,
  cloudHeight: [85, 150] as const,
  cloudPuffSize: [9, 20] as const,
  /** Nuages : face au soleil / à l'ombre (ombrage plat, sans brouillard) ; dérive (rotation autour du stade, rad/s). */
  cloudLit: '#ffffff',
  cloudShade: '#c3d3f7',
  cloudDriftRate: 0.004,

  /** Oiseaux qui tournent au-dessus du stade : nombre, envergure (m), rayon de l'orbite, altitude, vitesse (rad/s), battements (rad/s). */
  birdCount: 11,
  birdSpan: 1.9,
  birdOrbit: [45, 95] as const,
  birdHeight: [32, 55] as const,
  birdSpeed: [0.1, 0.18] as const,
  birdFlapRate: 9,
  birdColor: '#2a2643',

  /** Dirigeable : longueur (m), rayon de l'orbite, altitude, vitesse angulaire (rad/s), couleurs. */
  blimpLength: 28,
  blimpOrbit: 210,
  blimpHeight: 82,
  blimpSpeed: 0.016,
  blimpBody: '#ffffff',
  blimpFin: '#1f8cff',
  blimpNose: '#ff7417',
  blimpGondola: '#2a2643',

  /** Montgolfières au loin : rayon de l'enveloppe (m), distance, altitude, dérive (rad/s), couleurs (bandes alternées avec le blanc). */
  balloonRadius: 9,
  balloonDistance: [240, 330] as const,
  balloonHeight: [55, 105] as const,
  balloonDrift: 0.01,
  balloonColors: ['#ff4fa3', '#ffe12e', '#3dffa0', '#7b5cff'] as const,
  balloonBasket: '#8a5a3c',

  // --- Stade ---
  /** Distance entre la bordure du terrain et le premier gradin (m) : la caméra épaule ne va jamais jusque-là. */
  standsGap: 10,
  /** Gradins : nombre de rangs, profondeur et hauteur d'un rang, hauteur du muret avant (porte les panneaux). */
  standsRows: 9,
  standsRowDepth: 1.5,
  standsRowRise: 0.7,
  standsFrontWall: 1.3,
  /** Mur du fond : hauteur au-dessus du dernier rang, épaisseur. */
  backWallExtra: 1.8,
  backWallThickness: 0.8,
  /** Sièges des tribunes latérales (alternés par rang) ; muret avant ; mur du fond et son bandeau haut. */
  sidelineSeats: ['#7b5cff', '#ff4fa3'] as const,
  frontWallColor: '#2a2643',
  backWallColor: '#ece7ff',
  backWallBand: '#2a2643',
  /** Escaliers : un tous les `aisleEvery` m, largeur, couleur. */
  aisleEvery: 16,
  aisleWidth: 1.3,
  aisleColor: '#f4f1ff',
  /**
   * Toit des tribunes latérales (le long des touches) : hauteur au-dessus du dernier rang, part des gradins couverte
   * (depuis le fond), épaisseur, inclinaison (bord avant relevé), bandeau avant (hauteur, couleur), poteaux (espacement).
   */
  roofLift: 5.5,
  roofCover: 0.72,
  roofThickness: 0.45,
  roofTilt: 0.1,
  roofColor: '#f7f5ff',
  roofFasciaHeight: 1.3,
  roofFascia: '#ff4fa3',
  roofColumnEvery: 12,
  roofColumnColor: '#d6d0f0',
  /**
   * Éclaircissement émissif des boîtes du stade (fraction de leur couleur) : partout (faces à l'ombre moins ternes) et
   * en plus sur les faces tournées vers le bas (dessous du toit : la lumière hémisphérique du sol, verte, le salissait).
   */
  standsLift: 0.22,
  undersideLift: 0.55,
  /** Pylônes d'éclairage aux 4 coins : hauteur, recul derrière l'angle des tribunes, couleurs du mât et de la tête. */
  pylonHeight: 34,
  pylonOffset: 4,
  pylonColor: '#d3d6ea',
  pylonHeadColor: '#2a2643',
  /** Projecteurs : grille (colonnes × rangées), couleur, inclinaison de la tête vers le terrain. */
  lampCols: 4,
  lampRows: 3,
  lampColor: '#fffbe3',
  pylonTilt: 0.42,
  /** Halo des projecteurs (billboard additif) : couleur, taille (m), opacité. */
  glowColor: '#fff4c2',
  glowSize: 11,
  glowOpacity: 0.32,
  /** Panneaux publicitaires sur le muret avant : longueur, hauteur, espace entre deux panneaux. */
  adLength: 5.4,
  adHeight: 0.95,
  adGap: 0.12,
  /** Écrans géants derrière les en-buts : largeur max (m) et part de la largeur du terrain, rapport hauteur / largeur, hauteur au-dessus du mur, cadre. */
  screenWidth: 18,
  screenWidthShare: 0.42,
  screenAspect: 0.42,
  screenLift: 0.6,
  screenFrame: '#17142a',

  // --- Foule ---
  /** Espacement des spectateurs le long d'un rang (m), taux de remplissage (0..1), échelle (personnages cartoon un peu grands). */
  crowdSpacing: 0.9,
  crowdFill: 0.68,
  crowdScale: 1.2,
  /** Derrière les en-buts : part des supporters à la couleur de l'équipe qui défend cet en-but ; le long des touches : par équipe. */
  crowdTeamShareEnds: 0.72,
  crowdTeamShareSides: 0.28,
  /** Maillots des spectateurs neutres ; teints de peau ; pantalons. */
  crowdColors: ['#ffe12e', '#3dffa0', '#ff4fa3', '#7b5cff', '#ffffff', '#2bd9ff', '#ff3d5a', '#b5ff4d'] as const,
  skinTones: ['#ffd9b8', '#e0a979', '#9c6a46'] as const,
  pantsColor: '#2a2643',
  /** Éclaircissement émissif de la foule (fraction de sa couleur) : souvent à contre-jour, elle reste vive. */
  crowdLift: 0.32,
  /** Bonds (m) : au repos (une partie de la foule), à l'excitation max ; cadence (rad/s). */
  jumpIdle: 0.06,
  jumpMax: 0.6,
  jumpRate: 7,
  /** Excitation : au repos, après un essai (1) qui redescend en `crowdTryDecaySec` s, porteur à moins de `crowdNearTryDist` m de l'en-but adverse. */
  crowdIdleExcitement: 0.12,
  crowdTryDecaySec: 4.5,
  crowdNearTryDist: 18,
  crowdNearTryExcitement: 0.55,
  /** Lissage de l'excitation : montée, descente (1/s). */
  crowdRiseRate: 5,
  crowdFallRate: 1.2,

  // --- Ville ---
  /** Graine du placement (PRNG local, déterministe). */
  citySeed: 20261025,
  /** Marge entre l'arrière des tribunes et la ville (la place est ensuite calée sur la grille des rues). */
  plazaMargin: 12,
  /** Grille : pas des îlots (rue comprise), largeur des rues, des trottoirs ; rayon de la ville. */
  cityBlock: 36,
  cityStreet: 9,
  citySidewalk: 1.8,
  cityRadius: 340,
  /** Part des îlots en parcs. */
  parkShare: 0.12,
  /** Hauteurs (m) : près de la place (min, max), au bord de la ville (min, max). */
  heightNear: [10, 22] as const,
  heightFar: [34, 95] as const,
  /**
   * Tours : probabilité près / loin (aucune avant `towerMinT` : part du chemin entre la place et le bord de la ville),
   * multiplicateur de hauteur et hauteur ajoutée (m).
   */
  towerShareNear: 0,
  towerShareFar: 0.24,
  towerMinT: 0.3,
  towerBoost: 1.5,
  towerExtra: 14,
  /** Fenêtres (shader) : largeur d'une travée et hauteur d'un étage (m), socle sans fenêtres, acrotère. */
  windowCell: [2.6, 3.4] as const,
  windowBase: 3.6,
  windowParapet: 1.1,
  /** Fenêtres allumées : part (0..1), intensité émissive. */
  windowLitShare: 0.1,
  windowGlow: 0.35,
  /** Vitres (sombre, reflet du ciel), fenêtre allumée, assombrissement du socle (facteur). */
  glass: '#5563bf',
  glassHi: '#bdf1ff',
  windowLit: '#ffe39a',
  baseShade: 0.8,
  /** Éclaircissement émissif des façades (fraction de leur couleur) : les faces à l'ombre restent pastel. */
  facadeLift: 0.18,
  /** Façades des immeubles (pastel et saturées), des tours (verre teinté) ; toits plats colorés. */
  facades: ['#ffd3df', '#ffe7b3', '#c4f1e2', '#cddfff', '#e4d2ff', '#fff3c9', '#ff9f73', '#7fd0ff', '#a594ff', '#62d4a8'] as const,
  towerFacades: ['#5fa8ff', '#7ee0e8', '#9f8cff', '#ff8fb8', '#5ccfb4'] as const,
  roofs: ['#ff4fa3', '#ffd23e', '#3dd6a0', '#8f7bff'] as const,
  /** Équipements de toit (climatiseurs, réservoirs, antennes). */
  roofProps: ['#f2efff', '#c9c3e6', '#ff7a5c', '#2a2643'] as const,
  /** Sol : chaussée, marquage, trottoir, parcelle, place du stade (dallage en damier), parc. */
  road: '#5d5a7a',
  roadMark: '#f4f1ff',
  sidewalk: '#dad4ea',
  lot: '#ebe2d3',
  plazaA: '#f0eaf7',
  plazaB: '#e3dbf0',
  park: '#79d16a',
  /** Arbres : feuillages (verts, plus quelques cerisiers roses), tronc ; espacement le long de la place (m). */
  treeGreens: ['#4fc95c', '#3fb65a', '#6fdc5f', '#2fa676', '#ff9fc6'] as const,
  trunk: '#8a5a3c',
  treeSpacing: 9,
  /** Voitures : couleurs, vitesse (m/s, min et max), voitures par voie. */
  carColors: ['#ff4d6d', '#ffe12e', '#1f8cff', '#ffffff', '#3dffa0', '#ff7417', '#7b5cff'] as const,
  carSpeed: [7, 13] as const,
  carsPerLane: 3,
  /**
   * Silhouettes lointaines (sans brouillard) : nombre, distance, largeur, hauteur, couleurs du sommet ; le pied se fond
   * dans la couleur de l'horizon (`skylineHaze` : part de l'horizon au sommet).
   */
  skylineCount: 56,
  skylineDistance: [500, 650] as const,
  skylineWidth: [14, 34] as const,
  skylineHeight: [40, 150] as const,
  skylineColors: ['#93b2e6', '#a3b5ea', '#8eaee0', '#a9c0ee'] as const,
  skylineHaze: 0.25,
} as const;
