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

  skyTop: '#2a6cff',
  skyHorizon: '#a8eaff',
  skyBottom: '#d9f6ff',
  fog: '#c4ecff',
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
  /** Point de chute prévu du coup de pied. */
  kickLanding: '#ffffff',
  /** Effets (FX) des événements du porteur. */
  fxPickup: '#ffe12e',
  fxCatch: '#ffffff',
  fxIntercept: '#ff3d5a',
  fxKick: '#fff6b0',
  fxDive: '#7fe7ff',
  fxPass: '#ffffff',
  /** Coque d'invulnérabilité (plongeon, relevé). */
  invuln: '#ffffff',

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

  /** Décor lointain autour de l'arène. */
  backdropA: '#7b5cff',
  backdropB: '#ff4fa3',
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

  /** Brouillard : début et fin (m). */
  fogNear: 70,
  fogFar: 260,
  /** Intensités des lumières hémisphérique et directionnelle (soleil). */
  hemiIntensity: 1.5,
  sunIntensity: 1.9,
  /** Tribunes : distance à la bordure (m), nombre de gradins, profondeur et hauteur d'un gradin (m). */
  standsGap: 10,
  standsTiers: 4,
  standsDepth: 3.2,
  standsRise: 1.6,

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
  /** Coque d'invulnérabilité : échelle, opacité moyenne, amplitude et vitesse (rad/s) de la pulsation. */
  invulnScale: 1.16,
  invulnOpacity: 0.5,
  invulnPulse: 0.3,
  invulnPulseRate: 40,
  /** Distance (m) au-delà de laquelle un saut entre deux ticks est une téléportation (pas d'interpolation). */
  teleportDist: 4,

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
  /** Étincelles d'impact : nombre max, par impact (joueur / relief), vitesse (m/s), durée (s), taille (m), gravité (m/s²). */
  sparkPoolSize: 120,
  sparksPerHit: 6,
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
  /** Plaquage : éclat en étoile (durée s, taille max m), nombre max simultanés. */
  tackleBurstSec: 0.4,
  tackleBurstSize: 2.2,
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
  /** Capacité (sprint boosté). */
  ability: [
    { color: PALETTE.fxAbility, billboard: false, r0: 0.4, r1: 2.0, duration: 0.35, delay: 0, lift: 0.04 },
    { color: PALETTE.fxAbility, billboard: true, r0: 0.3, r1: 1.2, duration: 0.25, delay: 0, lift: 0 },
  ],
} as const satisfies Record<string, readonly RingFx[]>;
