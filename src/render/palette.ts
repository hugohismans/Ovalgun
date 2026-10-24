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
  /** Distance (m) au-delà de laquelle un saut entre deux ticks est une téléportation (pas d'interpolation). */
  teleportDist: 4,
} as const;
