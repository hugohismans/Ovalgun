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
} as const satisfies Record<string, readonly RingFx[]>;
