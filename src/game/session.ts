/**
 * GameSession : colle côté client entre la simulation, les entrées et le rendu.
 *
 *  - Boucle à pas fixe (TICK_DT, `FixedStepLoop` de loop.ts, pure et testée) ; au plus
 *    MAX_CATCHUP_TICKS ticks rattrapés par frame (au-delà, le retard est abandonné).
 *  - État précédent (cloneState AVANT step) + état courant => interpolation par le rendu,
 *    alpha = accumulateur / TICK_DT.
 *  - Entrées : humain (joueur 0) via InputManager, une fois par tick ; autres joueurs via
 *    `inputProviders` (contrat `InputProvider` de src/bots : (état, id) -> entrée) ou entrée neutre
 *    qui garde leur visée.
 *  - Pause : pointer lock perdu au clavier (sauf ?debug), Start à la manette, manette active débranchée
 *    (sauf ?debug).
 *  - `onFrame(snapshot)` pour l'UI (vitesse, mode de mouvement, cooldowns, cible de passe, retour texte…).
 *  - Après chaque step : événements -> vibrations (haptics), effets visuels (renderer.handleEvents), retours
 *    texte temporaires (feedback.ts).
 *  - Outils de test (?debug ou entraînement seulement) : G / View = ballon pour moi, B = ballon au centre,
 *    appliqués ENTRE deux ticks via debugGiveBall / debugResetBall de la sim (jamais d'écriture directe dans l'état).
 *  - Étape 5 : retours de visée (combatHud.ts : hitmarker, direction des tirs reçus, vignette) et mini-HUD
 *    (stabilité, munitions, capacité) dans l'instantané.
 *  - Étape 6 : boucle de match complète (coup d'envoi, essai, remise en jeu, chrono, fin) ; HUD de match
 *    (matchHud.ts : score, chrono, « 3, 2, 1, JOUEZ ! », bannière d'essai, dernière minute, écran de fin) dans
 *    l'instantané. À chaque remise en jeu, la caméra du joueur local est retournée vers l'en-but adverse. À la fin :
 *    pointer lock relâché (sans mise en pause), A / Entrée / bouton « Rejouer » => `restart()` (nouveau match).
 *    Producteurs d'entrées (bots) installés par `installProviders()` à chaque match.
 *  - Étape 6 (bots) : chaque joueur non humain (coéquipiers ET adversaires) est piloté par un bot (src/bots, createBot)
 *    de la difficulté choisie (`difficulty`, ?difficulty=facile|normal|difficile), qui sait quel joueur est humain
 *    (`externalIds`) ; le joueur humain reçoit le ballon aux coups d'envoi de son équipe (`kickoffReceivers`) ; `passive`
 *    (?dummies=off) : joueurs passifs (entrée neutre). `autopilot` (?debug&autopilot) : le joueur 0 est aussi un bot (match bots contre bots
 *    observé depuis sa caméra ; clavier / souris / manette ignorés pour lui).
 *  - Étape 7 (mêlée) : rien de spécifique ici — les événements de la mêlée passent par les mêmes canaux (HUD de match :
 *    décompte, « MÊLÉE ! », « Mêlée gagnée par … » ; vibrations ; zone de capture dessinée par le rendu).
 *  - Étape 8 (HUD et menus, docs/ARCHITECTURE.md §16) : deux modes. `attract` = fond du menu de lancement (match bots contre
 *    bots en entraînement, caméra spectateur, jamais en pause, aucune vibration) ; `play` = la partie du joueur.
 *    `launch(options)` passe de l'un à l'autre (nouveau match, même rendu). Les menus (UI) reçoivent les intentions de
 *    navigation de la manette (`onMenuIntent` : croix / stick, A, B, Start, LB / RB) quand aucun jeu n'est en cours (menu,
 *    pause, écran de fin) ; en jeu, elles sont jetées et Start met en pause. La reprise, « Recommencer », « Rejouer » et le
 *    retour au menu sont décidés par l'UI (`requestPlay`, `restart`, `launch`). Réglages du joueur appliqués à chaud
 *    (`applySettings`). Instantané enrichi : flux d'événements (eventFeed.ts), ballon en repère caméra pour la mini-flèche
 *    hors champ (ballArrow.ts), invulnérabilité, régénération, cooldowns totaux, nom de la cible de passe…
 *  - Passe finale : regard légèrement vers le bas à chaque coup d'envoi (KICKOFF_PITCH_DEG) ; pause sur perte de focus
 *    de la fenêtre et sur perte du pointer lock quel que soit le périphérique (avant : clavier seulement — avec la manette,
 *    alt-tab laissait les bots jouer) ; rapport de pixels réappliqué quand `devicePixelRatio` change (zoom, écran HiDPI) ;
 *    préférence « animations réduites » transmise au rendu ; risque de la passe et nom court de la capacité dans
 *    l'instantané ; vibration de la passe réussie (équipe du receveur).
 */

import {
  abilityActive,
  abilityImplemented,
  aimOrigin,
  attackYaw,
  Buttons,
  canShoot,
  cloneState,
  createMatch,
  debugGiveBall,
  debugResetBall,
  isCarrier,
  CARRIER_DODGE_COOLDOWN_SEC,
  cooldownTicks,
  DODGE_COOLDOWN_SEC,
  GETUP_DURATION_SEC,
  makeInput,
  playerHeight,
  ROLES,
  step,
  TICK_RATE,
  ticksToSec,
  weaponImplemented,
  type InputFrame,
  type MatchEvent,
  type MatchState,
  type MoveMode,
  type PlayerInput,
  type PlayerStatus,
  type BotDifficulty,
  type Role,
  type TeamId,
  type TeamSize,
  type Vec3,
  DEFAULT_BOT_DIFFICULTY,
  DIVE_COOLDOWN_SEC,
  DOWN_DURATION_SEC,
  KICKOFF_PITCH_DEG,
  SLIDE_COOLDOWN_SEC,
  canCarrierAct,
  lerpAngle,
} from '../sim';
import type { InputProvider } from '../bots';
import { createBot } from '../bots';
import { aimAssistApplies, resetAssistCandidates, type AssistCandidate } from '../input/aimAssist';
import type { GamepadStyle } from '../input/gamepadMap';
import { audioEngine, type AudioEngine } from '../audio/AudioEngine';
import type { NetClient, StartInfo } from '../net/NetClient';
import { joinState } from '../net/shared/protocol';
import { isSelfEvent, Predictor } from '../net/predict';
import { Haptics } from '../input/haptics';
import { CombatHud, type CombatHudFrame } from './combatHud';
import { FEEDBACK_SEC, feedbackFor, type Feedback } from './feedback';
import { MatchHud, type MatchHudFrame } from './matchHud';
import { InputManager, type InputDevice } from '../input/InputManager';
import { leftGame, type MenuIntent } from '../input/menuNav';
import { EventFeed, type FeedItem } from './eventFeed';
import { playerName } from './names';
import type { PlayerSettings, QualitySetting } from './settings';
import { AutoQuality } from './autoQuality';
import { lerpPos } from '../render/interpolate';
import { STYLE, type QualityLevel } from '../render/palette';
import { Renderer } from '../render/Renderer';
import { FixedStepLoop, MAX_FRAME_DT } from './loop';
import { assignRoles } from './roles';

// Pour l'UI (qui n'importe pas la sim) : difficulté des bots, taille d'équipe, rôles, équipes.
export { DEFAULT_BOT_DIFFICULTY, type BotDifficulty, type Role, type TeamId, type TeamSize } from '../sim';
export type { MenuIntent } from '../input/menuNav';

/** `play` : la partie du joueur ; `attract` : match bots contre bots en fond du menu (caméra spectateur). */
export type SessionMode = 'play' | 'attract';

/** Délai (s) au-delà duquel une demande de pointer lock sans réponse est abandonnée (le menu de pause réapparaît). */
const LOCK_PENDING_TIMEOUT_SEC = 1.5;

/** Noms du risque de passe (Renderer.passRisk : 0, 1, 2) pour l'UI. */
const PASS_RISK_NAMES = ['open', 'risky', 'marked'] as const;

/** Qui a le ballon, vu par le joueur local (couleur de la mini-flèche). */
export type BallHolder = 'mine' | 'ally' | 'enemy' | 'free' | 'scrum' | 'dead';

/** Ballon pour la mini-flèche hors champ (étape 8) : repère caméra de la dernière frame + état. */
export interface BallView {
  /** Position affichée du ballon dans le repère caméra (x droite, y haut, la caméra regarde vers −z). */
  cam: Vec3;
  tanHalfFovY: number;
  /** Taille d'affichage (px CSS). */
  width: number;
  height: number;
  /** Distance horizontale joueur local -> ballon (m). */
  distance: number;
  holder: BallHolder;
}

export interface SessionOptions {
  teamSize: TeamSize;
  humanRole: Role;
  seed: number;
  training?: boolean;
  /** Mode debug (?debug) : clavier sans pointer lock, pas de pause, session exposée sur window. */
  debug?: boolean;
  /** Difficulté des bots (défaut : DEFAULT_BOT_DIFFICULTY ; ?difficulty=facile|normal|difficile). */
  difficulty?: BotDifficulty;
  /** Joueurs non humains passifs (entrée neutre qui garde leur visée) au lieu de bots (?dummies=off) : réglage du plaquage. */
  passive?: boolean;
  /** Le joueur 0 est aussi piloté par un bot (?debug&autopilot) : match bots contre bots, vu depuis sa caméra. */
  autopilot?: boolean;
  /** Étape 8 : mode de la session (défaut `play`) ; `attract` impose autopilote, entraînement et caméra spectateur. */
  mode?: SessionMode;
  /** Durée du match (s) ; défaut MATCH_DURATION_SEC (?debug&duration=… pour un écran de fin rapide). */
  durationSec?: number;
  /** Partie en ligne : l'état vient du serveur autoritaire (instantanés interpolés), les entrées lui sont envoyées. */
  online?: OnlineMatch;
}

/** Partie en ligne : client réseau connecté et message de départ du serveur. */
export interface OnlineMatch {
  client: NetClient;
  start: StartInfo;
}

/** Retard d'affichage en ligne (ticks) : de quoi toujours avoir deux instantanés à interpoler (instantané tous les 2 ticks + gigue). */
const ONLINE_INTERP_TICKS = 5;
/** Écart au-delà duquel l'horloge d'affichage est recalée d'un coup (ticks). */
const ONLINE_RESYNC_TICKS = 20;

/** Instantané pour l'UI, produit à chaque frame. */
export interface FrameSnapshot {
  tick: number;
  /** Partie en ligne : ping (ms) ; -1 hors ligne. */
  ping: number;
  /** Qualité graphique en cours (réglage fixe, ou niveau choisi par Auto). */
  quality: QualityLevel;
  /** Étape 8 : mode de la session, match terminé, demande de pointer lock en cours. */
  mode: SessionMode;
  paused: boolean;
  ended: boolean;
  awaitingLock: boolean;
  debug: boolean;
  pointerLocked: boolean;
  activeDevice: InputDevice;
  gamepadConnected: boolean;
  gamepadStyle: GamepadStyle;
  /** Une manette est branchée mais sans mapping « standard » : elle est ignorée. */
  gamepadIgnored: boolean;
  /** Vitesse horizontale du joueur humain (m/s). */
  speed: number;
  move: MoveMode;
  status: PlayerStatus;
  onGround: boolean;
  carrier: boolean;
  aiming: boolean;
  sprinting: boolean;
  /** Cooldowns restants (s). */
  dodgeCd: number;
  slideCd: number;
  diveCd: number;
  abilityCd: number;
  stability: number;
  stabilityMax: number;
  /** Stabilité basse (sous STYLE.stabilityBarLowFraction) : jauge rouge dans le HUD. */
  stabilityLow: boolean;
  /** Stabilité moyenne (sous STYLE.stabilityBarMidFraction) : jauge jaune. */
  stabilityMid: boolean;
  /** Temps restant au sol / à se relever (s), 0 si actif. */
  statusSec: number;
  /** Durée totale au sol + relevé (s) : progression de « PLAQUÉ ». */
  statusTotalSec: number;
  /** Invulnérabilité restante (s : plongeon, fin de relevé), 0 sinon. */
  invulnSec: number;
  /** La jauge remonte (délai de régénération écoulé, jauge incomplète). */
  regenerating: boolean;
  role: Role;
  roleLabel: string;
  team: TeamId;
  /** Arme (étape 5) : munitions, chargeur, rechargement (progression 0..1, -1 hors rechargement), tir possible. */
  ammo: number;
  magazine: number;
  reloadProgress: number;
  canShoot: boolean;
  /** Munitions basses (au plus STYLE.ammoLowFraction du chargeur, au moins 1 ; hors rechargement) : pastille rouge. */
  ammoLow: boolean;
  /**
   * Capacité : nom, implémentée, temps actif restant (s : sprint boosté, bouclier ; pour le demi, vie restante de SA
   * zone), durée et cooldown totaux (s), indication contextuelle (« appuie à nouveau pour baisser » bouclier levé).
   */
  abilityLabel: string;
  abilityImplemented: boolean;
  abilityActiveSec: number;
  abilityHint: string;
  abilityDurationSec: number;
  abilityCooldownSec: number;
  dodgeCooldownSec: number;
  /** Cooldowns totaux de la glissade et du plongeon (s, dernière minute comprise) : anneaux des pastilles. */
  slideCooldownSec: number;
  diveCooldownSec: number;
  /** Le porteur local peut passer / taper (ni plongeon, ni récupération : canCarrierAct). */
  canCarrierAct: boolean;
  /** Retours de visée : hitmarker, direction des tirs reçus, vignette. */
  combat: CombatHudFrame;
  /** Images par seconde (lissées). */
  fps: number;
  /** Cible de l'aide à la visée (-1 : aucune). */
  assistTarget: number;
  /** Cible de la passe assistée affichée (-1 : aucune ou pas porteur). */
  passTarget: number;
  /** Nom de la cible de passe (« Pilier 1 »), chaîne vide sans cible. */
  passTargetName: string;
  /** Passe finale : risque de cette passe (démarquage du receveur) — 'open', 'risky', 'marked' ; 'open' sans cible. */
  passRisk: 'open' | 'risky' | 'marked';
  /** Retour texte temporaire en cours (null : aucun) ; `seq` change à chaque nouveau message. */
  feedback: (Feedback & { seq: number }) | null;
  /** Outils de test disponibles (?debug ou entraînement). */
  debugTools: boolean;
  /** Étape 6 : score, chrono, coup d'envoi, essai, dernière minute, écran de fin. */
  match: MatchHudFrame;
  /** Étape 8 : flux d'événements (plaquages, interceptions, essais, mêlées). */
  feed: FeedItem[];
  /** Étape 8 : ballon pour la mini-flèche hors champ (null : ballon mort ou porté par le joueur local). */
  ball: BallView | null;
}

export class GameSession {
  /** Id du joueur humain. */
  /** Joueur humain : 0 hors ligne ; en ligne, l'id attribué par le serveur. */
  humanId = 0;
  state: MatchState;
  prev: MatchState;
  readonly input: InputManager;
  readonly renderer: Renderer;
  readonly haptics = new Haptics();
  readonly combatHud = new CombatHud();
  readonly matchHud = new MatchHud();
  readonly eventFeed = new EventFeed();
  /** Producteurs d'entrées des autres joueurs (bots, étape 6), appelés avec (état, id). Absent => entrée neutre. */
  readonly inputProviders = new Map<number, InputProvider>();
  onFrame: ((s: FrameSnapshot) => void) | null = null;
  /**
   * Étape 8 : intentions de navigation de la manette (menus), appelé seulement quand aucun jeu n'est en cours (menu
   * `attract`, pause, écran de fin). En jeu, elles sont jetées (A = saut) et Start met en pause.
   */
  onMenuIntent: ((intent: MenuIntent) => void) | null = null;

  paused: boolean;
  private options: SessionOptions;
  /** Nombre de matchs relancés (la seed du match suivant en dépend : options.seed + matchIndex). */
  private matchIndex = 0;
  private readonly debug: boolean;
  private pendingGiveBall = false;
  private pendingResetBall = false;
  private feedback: Feedback | null = null;
  private feedbackUntil = 0;
  private feedbackSeq = 0;
  private raf = 0;
  private running = false;
  private lastTime = -1;
  private readonly loopStep = new FixedStepLoop();
  private fps = 60;
  private qualitySetting: QualitySetting | null = null;
  private readonly autoQuality = new AutoQuality();
  private readonly onResize = (): void => this.renderer.resize();
  /** Requête média du rapport de pixels courant, réarmée à chaque changement (zoom, autre écran). */
  private dprQuery: MediaQueryList | null = null;
  private readonly onDprChange = (): void => {
    this.renderer.resize();
    this.watchPixelRatio();
  };
  private reducedMotionQuery: MediaQueryList | null = null;
  private readonly onReducedMotionChange = (): void => {
    this.renderer.setReducedMotion(this.reducedMotionQuery?.matches === true);
  };
  /** Équipe d'un joueur du match courant (vibration de la passe réussie). */
  private readonly teamOf = (id: number): TeamId | undefined => this.state.players[id]?.team;
  private readonly candidates: AssistCandidate[] = [];
  private readonly tmpFeet = { x: 0, y: 0, z: 0 };
  private lockRequestedAt = -Infinity;
  /** « En jeu » à la frame précédente : à la sortie du jeu, la navigation des menus est remise à zéro. */
  private wasInGame = false;
  /** Son : moteur partagé (musique du menu, effets de jeu, foule). */
  private readonly audio: AudioEngine = audioEngine();
  private readonly listener = { pos: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };

  constructor(canvas: HTMLCanvasElement, options: SessionOptions) {
    this.options = options;
    this.humanId = options.online?.start.playerId ?? 0;
    this.debug = options.debug ?? false;
    this.state = this.newMatch();
    this.prev = cloneState(this.state);
    this.renderer = new Renderer(canvas);
    this.renderer.setMatch(this.state, this.renderedHumanId);
    this.input = new InputManager(canvas, { debug: this.debug });
    this.audio.unlock(window);
    this.faceKickoff(this.state.players[this.humanId].team);
    this.input.onPointerLockChange = (locked) => {
      if (this.mode !== 'play') return;
      if (locked) this.setPaused(false);
      // Passe finale : quel que soit le périphérique actif (souris verrouillée puis manette, puis Échap : la partie
      // continuait et l'Échap suivant ne faisait rien).
      else if (!this.debug && !this.ended) this.setPaused(true);
    };
    // Passe finale : fenêtre qui perd le focus (alt-tab, clic ailleurs) => pause, même à la manette (avant : les bots
    // continuaient de jouer, et de marquer, fenêtre visible mais inactive).
    this.input.onFocusLost = () => {
      if (this.inGame && !this.debug) this.setPaused(true);
    };
    this.paused = this.mode === 'play' && !this.debug;
    this.installProviders();
    resetAssistCandidates(this.candidates, this.state.players);
    window.addEventListener('resize', this.onResize);
    this.watchPixelRatio();
    if (typeof window.matchMedia === 'function') {
      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange);
      this.onReducedMotionChange();
    }
    if (this.debug) (window as unknown as { __ovalgun?: { session: GameSession } }).__ovalgun = { session: this };
  }

  /**
   * Surveille le rapport de pixels courant : `(resolution: Xdppx)` cesse de correspondre quand il change (zoom du
   * navigateur, fenêtre déplacée sur un autre écran) ; on redimensionne alors le rendu et on réarme la requête.
   */
  private watchPixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = null;
    if (typeof window.matchMedia !== 'function') return;
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onDprChange);
  }

  /** Regard du joueur local à un coup d'envoi : vers l'en-but adverse, légèrement vers le bas (KICKOFF_PITCH_DEG). */
  private faceKickoff(team: TeamId): void {
    this.input.setOrientation(attackYaw(team), (KICKOFF_PITCH_DEG * Math.PI) / 180);
  }

  /** Vrai quand le match est terminé (écran de fin). */
  get ended(): boolean {
    return this.state.phase === 'ended';
  }

  /** Outils de test (ballon pour moi / au centre) : seulement en partie, en ?debug ou en entraînement. */
  get debugTools(): boolean {
    return this.mode === 'play' && this.online === null && (this.debug || (this.options.training ?? false));
  }

  /** Mode de la session (étape 8). */
  get mode(): SessionMode {
    return this.options.mode ?? 'play';
  }

  /** Vrai quand le joueur joue (partie en cours, ni pause, ni écran de fin, ni menu). */
  get inGame(): boolean {
    return this.mode === 'play' && !this.paused && !this.ended;
  }

  /** Joueur marqué comme humain par le rendu (anneau) : aucun en fond de menu. */
  private get renderedHumanId(): number {
    return this.mode === 'attract' ? -1 : this.humanId;
  }

  /** Nouveau match (seed = options.seed + matchIndex), en phase de coup d'envoi. */
  private newMatch(): MatchState {
    const o = this.options;
    if (o.online !== undefined) return joinState(o.online.start.statics, o.online.start.state);
    // Le joueur humain reçoit le ballon aux coups d'envoi de son équipe (sinon il ne le touchait jamais : le receveur
    // par défaut est le plus central de la formation, toujours un bot). En autopilote : défaut (le plus central).
    const humanIndex = this.humanId % o.teamSize;
    const humanTeam = this.humanId < o.teamSize ? 0 : 1;
    const receivers: [number, number] = [-1, -1];
    if (!this.autopilot) receivers[humanTeam] = humanIndex;
    return createMatch({
      teamSize: o.teamSize,
      seed: o.seed + this.matchIndex,
      roles: assignRoles(o.teamSize, o.humanRole),
      training: (o.training ?? false) || this.mode === 'attract',
      kickoffReceivers: receivers,
      ...(o.durationSec !== undefined && o.durationSec > 0 ? { durationSec: o.durationSec } : {}),
    });
  }

  /** Vrai si le joueur 0 est piloté par un bot (?debug&autopilot, ou fond du menu). */
  get autopilot(): boolean {
    return (this.options.autopilot ?? false) || this.mode === 'attract';
  }

  /**
   * Producteurs d'entrées des joueurs non humains (coéquipiers ET adversaires ; le joueur 0 aussi en autopilote),
   * recréés à chaque match : un bot par joueur (createBot), mémoire et PRNG propres dérivés de la seed du match et de
   * l'id. `passive` : aucun bot (entrée neutre qui garde la visée, voir tick()).
   */
  private installProviders(): void {
    this.inputProviders.clear();
    if ((this.options.passive ?? false) || this.online !== null) return;
    const seed = this.options.seed + this.matchIndex;
    const difficulty = this.options.difficulty ?? DEFAULT_BOT_DIFFICULTY;
    // Les bots savent quel joueur est humain : ils se répartissent les rôles (pression, course au ballon, repli…)
    // sans compter sur lui (bots/tactics.ts). En autopilote, tout le monde est un bot.
    const externalIds = this.autopilot ? [] : [this.humanId];
    for (const p of this.state.players) {
      if (p.id !== this.humanId || this.autopilot) this.inputProviders.set(p.id, createBot(p.id, difficulty, seed, { externalIds }));
    }
  }

  /**
   * Relance un match (bouton « Rejouer » / A sur l'écran de fin) : nouvel état, nouveaux producteurs d'entrées, rendu
   * reconstruit, HUD remis à zéro, entrées relâchées (le A qui relance ne fait pas sauter). Au clavier, l'UI demande
   * ensuite le pointer lock (`requestPlay`, dans le geste utilisateur).
   */
  restart(): void {
    this.matchIndex++;
    this.humanId = this.options.online?.start.playerId ?? 0;
    this.snaps = [];
    this.renderTick = -1;
    this.predictor = null;
    this.state = this.newMatch();
    this.prev = cloneState(this.state);
    this.renderer.setMatch(this.state, this.renderedHumanId);
    this.installProviders();
    // Candidats de l'aide à la visée recréés : `launch()` peut changer la taille d'équipe (menu 5v5 -> partie 3v3).
    resetAssistCandidates(this.candidates, this.state.players);
    this.combatHud.reset();
    this.matchHud.reset();
    this.audio.resetMatch();
    this.eventFeed.reset();
    this.feedback = null;
    this.pendingGiveBall = false;
    this.pendingResetBall = false;
    this.input.releaseAll();
    const me = this.state.players[this.humanId];
    this.faceKickoff(me.team);
    this.loopStep.reset();
    this.input.resetMenuNav();
    if (this.mode === 'attract') this.setPaused(false);
    // Au clavier (hors ?debug), on attend le pointer lock demandé par l'UI : le menu de pause sert de repli.
    else if (!this.debug && this.input.activeDevice === 'keyboard') this.setPaused(true);
  }

  /**
   * Étape 8 : change de partie (menu -> jeu, jeu -> menu). Garde le mode debug de la construction ; nouveau match,
   * nouveaux bots, même rendu. Au clavier, l'UI demande ensuite le pointer lock (`requestPlay`, dans le geste utilisateur).
   */
  launch(options: Omit<SessionOptions, 'debug'>): void {
    this.options = { ...options, debug: this.debug };
    this.restart();
  }

  /** Étape 8 : applique les réglages du joueur, à chaud (entrées, caméra, vibrations, volumes). */
  applySettings(s: Readonly<PlayerSettings>): void {
    this.input.applySettings({
      mouseSensitivity: s.mouseSensitivity,
      padSensitivity: s.padSensitivity,
      aimSensitivity: s.aimSensitivity,
      invertY: s.invertY,
      invertMouseY: s.invertMouseY,
      aimAssist: s.aimAssist,
    });
    this.renderer.setCameraPrefs({ fov: s.fov, distanceScale: s.cameraDistance, height: s.cameraHeight, speedFov: s.speedFov });
    if (s.quality !== this.qualitySetting) {
      this.qualitySetting = s.quality;
      if (s.quality === 'auto') this.autoQuality.reset();
      this.renderer.setQuality(s.quality === 'auto' ? this.autoQuality.level : s.quality);
    }
    this.haptics.enabled = s.rumble;
    this.audio.setVolume(s.volume);
    this.audio.setMusicVolume(s.musicVolume);
  }

  /** Étape 8 : oublie les appuis de navigation en cours (changement d'écran de l'UI). */
  resetMenuNav(): void {
    this.input.resetMenuNav();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /**
   * « Jouer » / « Reprendre » (geste utilisateur) : pointer lock au clavier (la reprise suit l'obtention du verrou),
   * reprise directe à la manette / en debug.
   */
  requestPlay(): void {
    if (this.mode !== 'play' || this.ended) return;
    if (this.debug || this.input.activeDevice === 'gamepad') this.setPaused(false);
    if (this.input.activeDevice === 'keyboard') {
      this.lockRequestedAt = this.lastTime;
      this.input.requestPointerLock();
    }
  }

  setPaused(paused: boolean): void {
    if (paused && this.mode !== 'play') return; // le fond du menu ne se met jamais en pause
    if (this.paused === paused) return;
    this.paused = paused;
    this.input.releaseAll();
    if (paused) {
      // L'accumulateur est conservé : l'image figée reste celle de la frame en cours (pas de recul d'un tick).
      this.input.exitPointerLock();
    } else {
      // Reprise : on repart de l'état affiché (prev = courant, alpha = 0), sans saut en arrière.
      this.prev = cloneState(this.state);
      this.loopStep.reset();
    }
  }

  private readonly loop = (t: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = t / 1000;
    const rawDt = this.lastTime < 0 ? 0 : now - this.lastTime;
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, rawDt));
    this.lastTime = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    // Qualité Auto : baisse d'un niveau si les images par seconde ne suivent pas (durées brutes, pas bornées).
    if (this.qualitySetting === 'auto' && !this.paused) {
      const lowered = this.autoQuality.frame(rawDt);
      if (lowered !== null) this.renderer.setQuality(lowered);
    }

    const padLost = this.input.pollGamepad();
    const pauseRequested = this.input.consumePauseRequest();
    this.input.consumeConfirm(); // A : saut en jeu ; dans les menus, l'UI lit les intentions de navigation
    const intents = this.input.consumeMenuIntents();
    if (this.inGame) {
      // Manette active débranchée en jeu (batterie, câble) : pause, comme sur console. Start : pause (la reprise passe par
      // le menu de pause de l'UI). Les intentions de navigation de cette frame sont jetées (A = saut).
      if ((padLost && !this.debug) || pauseRequested) this.setPaused(true);
    }
    if (leftGame(this.wasInGame, this.inGame)) {
      // Sortie du jeu (Start, manette débranchée, Échap, pointer lock perdu, fin du match — ici ou depuis la frame
      // précédente) : le stick / la croix / les boutons encore maintenus depuis le jeu n'agissent pas dans le menu qui
      // s'ouvre (sinon la répétition du stick de course ferait défiler le focus jusqu'à « Quitter vers le menu »).
      this.input.resetMenuNav();
    } else if (!this.inGame && this.onMenuIntent !== null) {
      for (const intent of intents) this.onMenuIntent(intent);
    }
    this.wasInGame = this.inGame;
    if (this.input.lockPending && now - this.lockRequestedAt > LOCK_PENDING_TIMEOUT_SEC) this.input.lockPending = false;
    this.input.gameplayActive = this.inGame;
    this.input.pointerLockAllowed = this.mode === 'play' && !this.ended;
    const me = this.state.players[this.humanId];
    this.input.setCarrier(isCarrier(this.state, me));

    const dbg = this.input.consumeDebugRequests();
    if (this.debugTools && !this.paused) {
      this.pendingGiveBall ||= dbg.giveBall;
      this.pendingResetBall ||= dbg.resetBall;
    }

    let alpha: number;
    if (this.online !== null) alpha = this.onlineFrame(dt, now);
    else {
      if (!this.paused) {
        this.input.frame(dt, this.assistQuery());
        const n = this.loopStep.advance(dt);
        for (let i = 0; i < n; i++) this.tick(now);
      }
      alpha = this.loopStep.alpha;
    }
    this.renderer.render(this.prev, this.state, alpha, this.view(alpha), dt, now);
    this.updateAudio(dt);
    this.onFrame?.(this.snapshot());
  };

  /**
   * Son de la frame : musique en fond de menu seulement ; effets et foule en partie (atténués en pause) ; l'auditeur
   * suit la caméra.
   */
  private updateAudio(dt: number): void {
    const cam = this.renderer.shoulder.camera;
    const e = cam.matrixWorld.elements;
    const l = this.listener;
    l.pos.x = e[12];
    l.pos.y = e[13];
    l.pos.z = e[14];
    l.fwd.x = -e[8];
    l.fwd.y = -e[9];
    l.fwd.z = -e[10];
    l.up.x = e[4];
    l.up.y = e[5];
    l.up.z = e[6];
    const play = this.mode === 'play';
    this.audio.setMusic(!play);
    this.audio.setGameState(play, this.paused);
    this.audio.frame(dt, this.state, play && !this.autopilot ? this.humanId : -1, l);
  }

  /** Ballon pour la mini-flèche hors champ (après le rendu de la frame : caméra et position affichée à jour). */
  private ballView(): BallView | null {
    const s = this.state;
    const b = s.ball;
    if (b.mode === 'dead' || s.phase === 'ended') return null;
    const me = s.players[this.humanId];
    let holder: BallHolder = 'free';
    if (b.mode === 'carried') {
      const c = s.players[b.carrierId];
      holder = c === undefined ? 'free' : c.id === me.id ? 'mine' : c.team === me.team ? 'ally' : 'enemy';
    } else if (b.mode === 'scrum') holder = 'scrum';
    if (holder === 'mine') return null;
    const pos = this.renderer.ballDisplayPos;
    const cam = this.renderer.toCameraSpace(pos, { x: 0, y: 0, z: 0 });
    return {
      cam,
      tanHalfFovY: this.renderer.tanHalfFovY,
      width: this.renderer.viewportWidth,
      height: this.renderer.viewportHeight,
      distance: Math.hypot(pos.x - me.pos.x, pos.z - me.pos.z),
      holder,
    };
  }

  /**
   * Regard de la caméra locale : celui de la souris / manette (non interpolé, visée réactive) ; en autopilote, celui du
   * bot (yaw / pitch du joueur 0 interpolés entre les deux derniers ticks).
   */
  private view(alpha: number): { localId: number; yaw: number; pitch: number; aiming: boolean; spectator: boolean } {
    const spectator = this.mode === 'attract';
    if (!this.autopilot) return { localId: this.humanId, yaw: this.input.yaw, pitch: this.input.pitch, aiming: this.input.aiming, spectator };
    const pc = this.state.players[this.humanId];
    const pp = this.prev.players[this.humanId] ?? pc;
    return {
      localId: this.humanId,
      yaw: lerpAngle(pp.yaw, pc.yaw, alpha),
      pitch: pp.pitch + (pc.pitch - pp.pitch) * alpha,
      aiming: (pc.lastButtons & Buttons.AIM) !== 0,
      spectator,
    };
  }

  /** Un tick de simulation : outils de test en attente, entrées de tous les joueurs, puis step. */
  private tick(nowSec: number): void {
    this.applyDebugTools(nowSec);
    this.prev = cloneState(this.state);
    const frame: Record<number, PlayerInput> = {};
    for (const p of this.state.players) {
      if (p.id === this.humanId && !this.autopilot) {
        frame[p.id] = this.input.sample();
        continue;
      }
      const provider = this.inputProviders.get(p.id);
      frame[p.id] = provider !== undefined ? provider(this.state, p.id) : makeInput({ yaw: p.yaw, pitch: p.pitch });
    }
    step(this.state, frame as InputFrame);
    this.processEvents(this.state.events, nowSec, this.prev);
  }

  /** Partie en ligne active (null hors ligne). */
  get online(): OnlineMatch | null {
    return this.options.online ?? null;
  }

  private snaps: Array<{ state: MatchState; events: readonly MatchEvent[]; handled: boolean }> = [];
  /** Prédiction du joueur local (partie en ligne). */
  private predictor: Predictor | null = null;
  /** Horloge d'affichage en ligne (ticks du serveur, fractionnaire) ; -1 tant qu'elle n'est pas calée. */
  private renderTick = -1;

  /**
   * Une frame en ligne : entrées envoyées au serveur à 30 Hz, instantanés reçus mis en tampon, affichage avec
   * ONLINE_INTERP_TICKS de retard (interpolation entre les deux instantanés qui l'encadrent), événements joués quand
   * l'affichage atteint leur tick. Renvoie l'alpha d'interpolation. La pause n'arrête rien (le serveur continue) : elle
   * envoie seulement des entrées neutres.
   */
  private onlineFrame(dt: number, nowSec: number): number {
    const net = this.online;
    if (net === null) return 0;
    if (!this.paused) this.input.frame(dt, this.assistQuery());
    const statics = net.start.statics;
    if (this.predictor === null) {
      this.predictor = new Predictor(this.humanId);
      this.predictor.reset(joinState(statics, net.start.state));
    }
    const pred = this.predictor;
    // Instantanés reçus : mis en tampon (affichage des autres) et réconciliation de la prédiction sur le plus récent.
    const fresh = net.client.drainSnapshots();
    for (const sn of fresh) this.snaps.push({ state: joinState(statics, sn.state), events: sn.events, handled: false });
    const newest = fresh[fresh.length - 1];
    if (newest !== undefined) pred.reconcile(this.snaps[this.snaps.length - 1].state, newest.acks[this.humanId] ?? -1);
    // Ticks locaux : entrée envoyée au serveur ET appliquée tout de suite à la prédiction (retours immédiats).
    const n = this.loopStep.advance(dt);
    for (let i = 0; i < n; i++) {
      const inp = this.inGame ? this.input.sample() : makeInput({ yaw: this.input.yaw, pitch: this.input.pitch });
      // Tick affiché quand l'entrée est lue (frame précédente) : le serveur juge les tirs sur cette vue (lagcomp.ts).
      const seq = net.client.queueInput(inp, this.renderTick);
      const selfEvents = pred.advance(inp, seq);
      if (selfEvents.length > 0) this.processEvents(selfEvents, nowSec, null);
    }
    pred.decay(dt);
    if (this.snaps.length === 0) return 0;
    const latest = this.snaps[this.snaps.length - 1].state.tick;
    const target = latest - ONLINE_INTERP_TICKS;
    if (this.renderTick < 0 || Math.abs(target - this.renderTick) > ONLINE_RESYNC_TICKS) this.renderTick = target;
    else this.renderTick += dt * TICK_RATE + (target - this.renderTick) * Math.min(1, dt * 2);
    // Événements des instantanés que l'affichage a atteints (dans l'ordre).
    for (let i = 0; i < this.snaps.length; i++) {
      const sn = this.snaps[i];
      if (sn.state.tick > this.renderTick) break;
      if (!sn.handled) {
        sn.handled = true;
        // Les gestes du joueur local ont déjà été joués par la prédiction.
        const me = this.humanId;
        this.processEvents(
          sn.events.filter((e) => !isSelfEvent(e, me)),
          nowSec,
          this.snaps[i - 1]?.state ?? null,
        );
      }
    }
    let a = 0;
    while (a + 1 < this.snaps.length && this.snaps[a + 1].state.tick <= this.renderTick) a++;
    const b = Math.min(a + 1, this.snaps.length - 1);
    const sa = this.snaps[a].state;
    const sb = this.snaps[b].state;
    // Le joueur local vient de la prédiction (même position dans les deux états : indépendant de l'alpha des autres).
    const local = pred.localDisplay(this.loopStep.alpha);
    if (local !== null) {
      const withLocal = (st: MatchState): MatchState => {
        const players = st.players.slice();
        players[this.humanId] = local;
        return { ...st, players };
      };
      this.prev = withLocal(sa);
      this.state = withLocal(sb);
    } else {
      this.prev = sa;
      this.state = sb;
    }
    // On garde un instantané d'avance de marge derrière l'affichage.
    if (a > 1) this.snaps.splice(0, a - 1);
    const span = sb.tick - sa.tick;
    return span > 0 ? Math.min(1, Math.max(0, (this.renderTick - sa.tick) / span)) : 1;
  }

  /** Effets des événements d'un tick (HUD, caméra, vibrations, rendu, son, retours) — local ou en ligne. */
  private processEvents(events: readonly MatchEvent[], nowSec: number, prev: MatchState | null): void {
    const me = this.state.players[this.humanId];
    this.matchHud.handleEvents(events, this.state, nowSec);
    for (const e of events) {
      // Remise en jeu : la caméra du joueur local regarde l'en-but adverse (la sim applique ce yaw au tick suivant).
      if (e.type === 'kickoff') this.faceKickoff(me.team);
      // Fin du match : tout est relâché, la souris redevient libre pour l'écran de fin (sans mise en pause).
      if (e.type === 'match_end') {
        this.input.releaseAll();
        this.input.exitPointerLock();
      }
    }
    // Aucune vibration en fond de menu (match bots contre bots).
    if (this.mode === 'play') {
      const pad = this.input.activeDevice === 'gamepad' ? this.input.activeGamepad : null;
      this.haptics.handleEvents(events, me.id, me.team, nowSec, pad, me.pos, this.teamOf);
    }
    this.renderer.handleEvents(events, this.state, nowSec, prev);
    if (this.mode === 'play') this.audio.handleEvents(events, this.state, this.autopilot ? -1 : this.humanId);
    this.combatHud.handleEvents(events, this.state, this.humanId, nowSec);
    this.eventFeed.handleEvents(events, this.state, this.humanId, nowSec);
    for (const e of events) {
      const fb = feedbackFor(e, this.state, this.humanId);
      if (fb !== null) this.showFeedback(fb, nowSec);
    }
  }

  /**
   * Outils de test (avant la copie `prev` du tick : le ballon « saute » sans traînée interpolée).
   * Passent par les fonctions pures de la sim (debugGiveBall / debugResetBall), déterministes.
   */
  private applyDebugTools(nowSec: number): void {
    // Refusés hors du jeu (pause d'essai, fin ; « au centre » aussi pendant le décompte) : pas de message alors.
    if (this.pendingResetBall && debugResetBall(this.state)) {
      this.showFeedback({ text: 'Ballon au centre', kind: 'info' }, nowSec);
    }
    if (this.pendingGiveBall && debugGiveBall(this.state, this.humanId)) {
      this.showFeedback({ text: 'Ballon pour toi', kind: 'info' }, nowSec);
    }
    this.pendingGiveBall = false;
    this.pendingResetBall = false;
  }

  private showFeedback(fb: Feedback, nowSec: number): void {
    this.feedback = fb;
    this.feedbackUntil = nowSec + FEEDBACK_SEC;
    this.feedbackSeq++;
  }

  /** Contexte de l'aide à la visée (positions interpolées), ou null quand elle ne s'applique pas. */
  private assistQuery(): Parameters<InputManager['frame']>[1] {
    const s = this.state;
    const me = s.players[this.humanId];
    if (!aimAssistApplies(s, me)) return null; // ne tire pas (au sol, porteur, bouclier levé…) ou tir en cloche
    const alpha = this.loopStep.alpha;
    for (let i = 0; i < s.players.length; i++) {
      const pc = s.players[i];
      const pp = this.prev.players[i] ?? pc;
      const c = this.candidates[i];
      lerpPos(this.tmpFeet, pp.pos, pc.pos, alpha);
      c.status = pc.status;
      c.x = this.tmpFeet.x;
      c.y = this.tmpFeet.y;
      c.z = this.tmpFeet.z;
      c.height = playerHeight(pc);
    }
    const mine = this.candidates[this.humanId];
    return {
      candidates: this.candidates,
      selfId: me.id,
      selfTeam: me.team,
      origin: aimOrigin(mine, this.input.yaw),
      range: ROLES[me.role].weapon.range,
    };
  }

  private snapshot(): FrameSnapshot {
    const s = this.state;
    const me = s.players[this.humanId];
    const role = ROLES[me.role];
    const reloadTotal = Math.max(1, cooldownTicks(s, role.weapon.reloadSec));
    const carrier = isCarrier(s, me);
    const passTarget = this.renderer.passTargetId;
    return {
      tick: s.tick,
      ping: this.online !== null ? Math.round(this.online.client.rtt) : -1,
      quality: this.renderer.quality,
      mode: this.mode,
      paused: this.paused,
      ended: this.ended,
      awaitingLock: this.input.lockPending,
      debug: this.debug,
      pointerLocked: this.input.pointerLocked,
      activeDevice: this.input.activeDevice,
      gamepadConnected: this.input.gamepad.connected,
      gamepadStyle: this.input.gamepad.style,
      gamepadIgnored: this.input.gamepadIgnored,
      speed: Math.hypot(me.vel.x, me.vel.z),
      move: me.move,
      status: me.status,
      onGround: me.onGround,
      carrier,
      aiming: this.input.aiming,
      sprinting: this.input.gamepad.sprinting || (me.lastButtons & Buttons.SPRINT) !== 0,
      dodgeCd: ticksToSec(me.dodgeCd),
      slideCd: ticksToSec(me.slideCd),
      diveCd: ticksToSec(me.diveCd),
      abilityCd: ticksToSec(me.abilityCd),
      stability: me.stability,
      stabilityMax: role.stabilityMax,
      stabilityLow: me.stability <= role.stabilityMax * STYLE.stabilityBarLowFraction,
      stabilityMid: me.stability < role.stabilityMax * STYLE.stabilityBarMidFraction,
      statusSec: me.status === 'active' ? 0 : ticksToSec(me.statusTicks) + (me.status === 'down' ? GETUP_DURATION_SEC : 0),
      statusTotalSec: DOWN_DURATION_SEC + GETUP_DURATION_SEC,
      invulnSec: ticksToSec(me.invulnTicks),
      regenerating: me.status === 'active' && me.regenDelayTicks === 0 && me.stability < role.stabilityMax,
      role: me.role,
      roleLabel: role.label,
      team: me.team,
      ammo: me.ammo,
      magazine: role.weapon.magazine,
      reloadProgress: me.reloadTicks > 0 ? Math.min(1, 1 - me.reloadTicks / reloadTotal) : -1,
      canShoot: canShoot(s, me) && weaponImplemented(role.weapon),
      ammoLow: me.reloadTicks === 0 && me.ammo <= Math.max(1, Math.floor(role.weapon.magazine * STYLE.ammoLowFraction)),
      abilityLabel: role.ability.hudLabel ?? role.ability.label,
      abilityImplemented: abilityImplemented(me),
      abilityActiveSec: abilityActive(me) ? ticksToSec(me.abilityTicks) : this.ownZoneSec(me.id),
      abilityHint: me.role === 'pilier' && abilityActive(me) ? 'réappuie : baisser' : '',
      abilityDurationSec: role.ability.duration,
      abilityCooldownSec: cooldownTicks(s, role.ability.cooldown) / TICK_RATE,
      dodgeCooldownSec: cooldownTicks(s, carrier ? CARRIER_DODGE_COOLDOWN_SEC : DODGE_COOLDOWN_SEC) / TICK_RATE,
      slideCooldownSec: cooldownTicks(s, SLIDE_COOLDOWN_SEC) / TICK_RATE,
      diveCooldownSec: cooldownTicks(s, DIVE_COOLDOWN_SEC) / TICK_RATE,
      canCarrierAct: carrier && canCarrierAct(me),
      combat: this.combatHud.frame(this.lastTime, me, this.input.yaw, s),
      fps: this.fps,
      assistTarget: this.input.lastAssist.targetId,
      passTarget,
      passTargetName: passTarget >= 0 ? playerName(s, passTarget) : '',
      passRisk: passTarget < 0 ? 'open' : PASS_RISK_NAMES[this.renderer.passRisk],
      feedback: this.feedback !== null && this.lastTime < this.feedbackUntil ? { ...this.feedback, seq: this.feedbackSeq } : null,
      debugTools: this.debugTools,
      match: this.matchHud.frame(s, this.humanId, this.lastTime),
      feed: this.eventFeed.frame(this.lastTime),
      ball: this.ballView(),
    };
  }

  /** Vie restante (s) de la zone de ralentissement posée par `id` (0 : aucune). */
  private ownZoneSec(id: number): number {
    for (const z of this.state.zones) if (z.ownerId === id) return ticksToSec(z.ttl);
    return 0;
  }

  dispose(): void {
    this.stop();
    this.audio.setMusic(false);
    this.audio.setGameState(false, false);
    window.removeEventListener('resize', this.onResize);
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.reducedMotionQuery?.removeEventListener('change', this.onReducedMotionChange);
    this.input.dispose();
    this.renderer.dispose();
    const w = window as unknown as { __ovalgun?: { session: GameSession } };
    if (w.__ovalgun?.session === this) delete w.__ovalgun;
  }
}
