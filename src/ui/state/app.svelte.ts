/**
 * État de l'application (étape 8), en runes : écran courant, panneau ouvert, choix du menu, réglages, périphérique
 * actif — et les transitions entre écrans. App.svelte n'est qu'un routeur qui lit cet état.
 *
 * Écrans : `menu` (menu de lancement, match bots contre bots en fond : session en mode `attract`) et `game` (la partie ;
 * la pause et l'écran de fin sont lus dans l'instantané de la session : `paused`, `ended`). Un panneau (`controls`,
 * `settings`) peut s'ouvrir par-dessus le menu ou la pause. AUCUNE logique de jeu ici : on appelle l'API de la session
 * (`launch`, `requestPlay`, `restart`, `setPaused`, `applySettings`) et on lit ses instantanés (hud.svelte.ts).
 *
 * Choix du menu et réglages : mémorisés dans localStorage (logic/storage.ts, try/catch partout) ; les paramètres d'URL
 * (?size, ?role, ?difficulty, ?training) priment pour le debug ; `?debug` lance la partie sans menu (sauf `?menu`).
 */

import { debugFlagsFromParams, DEFAULT_SETUP, sanitizeSetup, setupFromParams, type DebugFlags, type MatchSetup } from '../../game/launch';
import { GameSession, type MenuIntent, type SessionOptions } from '../../game/session';
import { sanitizeSettings, type PlayerSettings } from '../../game/settings';
import { uiBackSound } from '../../game/uiSound';
import type { GamepadStyle } from '../../input/gamepadMap';
import type { InputDevice } from '../../input/InputManager';
import { loadLayoutLabels, type LayoutLabels } from '../../input/keymap';
import { browserStorage, loadJson, saveJson, STORAGE_KEYS } from '../logic/storage';
import { hud } from './hud.svelte';
import { nav } from './nav.svelte';

export type Screen = 'menu' | 'game';
export type Panel = 'controls' | 'settings' | null;

/** Seed de base des parties du joueur (la session y ajoute le numéro du match) et du match de fond du menu. */
const PLAY_SEED = 1234;
const ATTRACT_SEED = 4242;
/** Le match de fond du menu se joue en 5v5 (plus vivant). */
const ATTRACT_TEAM_SIZE = 5;
/**
 * Échap reçu juste après la mise en pause : c'est la touche qui vient de libérer le pointer lock (le navigateur peut la
 * transmettre aussi) — elle ne doit pas refermer le menu de pause aussitôt (s).
 */
const ESCAPE_AFTER_PAUSE_GUARD_SEC = 0.4;

/** Id du bouton « Reprendre » du menu de pause (PauseMenu.svelte). */
const PAUSE_RESUME_ID = 'pause-resume';

const nowSec = (): number => performance.now() / 1000;

class AppState {
  screen = $state<Screen>('menu');
  panel = $state<Panel>(null);
  /** Dernier panneau ouvert depuis la pause (au retour, son bouton reprend le focus), null : aucun. */
  lastPanel = $state<Panel>(null);
  setup = $state<MatchSetup>({ ...DEFAULT_SETUP });
  settings = $state<PlayerSettings>(sanitizeSettings(null));
  device = $state<InputDevice>('keyboard');
  padStyle = $state<GamepadStyle>('xbox');
  /** Glyphes affichés par le panneau des contrôles (bascule Xbox / PlayStation, LB / RB), initialisés à son ouverture. */
  controlsStyle = $state<GamepadStyle>('xbox');
  padConnected = $state(false);
  padIgnored = $state(false);
  layout = $state.raw<LayoutLabels | null>(null);

  session: GameSession | null = null;
  flags: DebugFlags = { debug: false, showMenu: true, autopilot: false, passive: false, durationSec: 0 };
  private pausedAt = -Infinity;
  private wasPaused = false;

  /** Un menu (menu, pause, fin, panneau) a la main : les entrées de navigation vont à l'UI. */
  get menuOpen(): boolean {
    const s = hud.snap;
    return this.screen === 'menu' || this.panel !== null || (s !== null && (s.ended || (s.paused && !s.awaitingLock)));
  }

  /** Crée la session sur le canvas (au montage d'App.svelte). Renvoie la fonction de nettoyage. */
  init(canvas: HTMLCanvasElement): () => void {
    const params = new URLSearchParams(window.location.search);
    this.flags = debugFlagsFromParams(params);
    const storage = browserStorage();
    const stored = sanitizeSetup(loadJson(storage, STORAGE_KEYS.setup));
    this.setup = setupFromParams(params, stored);
    this.settings = sanitizeSettings(loadJson(storage, STORAGE_KEYS.settings));
    const direct = !this.flags.showMenu;
    const s = new GameSession(canvas, { ...(direct ? this.playOptions() : this.attractOptions()), debug: this.flags.debug });
    this.session = s;
    this.screen = direct ? 'game' : 'menu';
    s.applySettings(this.settings);
    s.onFrame = (snap) => {
      hud.push(snap, nowSec());
      if (snap.activeDevice !== this.device) this.device = snap.activeDevice;
      if (snap.gamepadStyle !== this.padStyle) this.padStyle = snap.gamepadStyle;
      if (snap.gamepadConnected !== this.padConnected) this.padConnected = snap.gamepadConnected;
      if (snap.gamepadIgnored !== this.padIgnored) this.padIgnored = snap.gamepadIgnored;
      const paused = snap.paused && snap.mode === 'play';
      if (paused && !this.wasPaused) {
        this.pausedAt = nowSec();
        this.lastPanel = null;
      }
      if (!paused && this.wasPaused) this.panel = null; // reprise (pointer lock, Start) : les panneaux de la pause se ferment
      this.wasPaused = paused;
    };
    s.onMenuIntent = (i) => this.onIntent(i);
    s.start();
    void loadLayoutLabels().then((l) => (this.layout = l));
    return () => {
      s.dispose();
      this.session = null;
      hud.clear();
    };
  }

  private playOptions(): Omit<SessionOptions, 'debug'> {
    const st = this.setup;
    return {
      mode: 'play',
      teamSize: st.teamSize,
      humanRole: st.role,
      difficulty: st.difficulty,
      training: st.training,
      seed: PLAY_SEED,
      passive: this.flags.passive,
      autopilot: this.flags.autopilot,
      ...(this.flags.durationSec > 0 ? { durationSec: this.flags.durationSec } : {}),
    };
  }

  private attractOptions(): Omit<SessionOptions, 'debug'> {
    return { mode: 'attract', teamSize: ATTRACT_TEAM_SIZE, humanRole: this.setup.role, difficulty: 'normal', training: true, seed: ATTRACT_SEED };
  }

  /** Choix du menu (mémorisé). */
  updateSetup(patch: Partial<MatchSetup>): void {
    this.setup = sanitizeSetup({ ...this.setup, ...patch });
    saveJson(browserStorage(), STORAGE_KEYS.setup, this.setup);
  }

  /** Réglages (mémorisés, appliqués à chaud). */
  updateSettings(patch: Partial<PlayerSettings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    saveJson(browserStorage(), STORAGE_KEYS.settings, this.settings);
    this.session?.applySettings(this.settings);
  }

  resetSettings(): void {
    this.updateSettings(sanitizeSettings(null));
  }

  /** JOUER (geste utilisateur : clic, Entrée, ou A à la manette). */
  play(): void {
    const s = this.session;
    if (s === null) return;
    this.panel = null;
    this.screen = 'game';
    s.launch(this.playOptions());
    s.requestPlay();
  }

  /** Reprendre (menu de pause). */
  resume(): void {
    this.panel = null;
    this.session?.requestPlay();
  }

  /** Recommencer (pause) / Rejouer (écran de fin) : nouveau match, mêmes choix. */
  restart(): void {
    const s = this.session;
    if (s === null) return;
    this.panel = null;
    s.restart();
    s.requestPlay();
  }

  /** Quitter vers le menu de lancement. */
  quitToMenu(): void {
    const s = this.session;
    if (s === null) return;
    this.panel = null;
    this.screen = 'menu';
    s.launch(this.attractOptions());
  }

  openPanel(p: Exclude<Panel, null>): void {
    if (p === 'controls') this.controlsStyle = this.padStyle;
    this.panel = p;
    this.lastPanel = p;
    this.session?.resetMenuNav();
  }

  closePanel(): void {
    this.panel = null;
  }

  /** Retour (B, Échap) : ferme le panneau, ou reprend la partie depuis la pause. */
  back(fromEscape = false): void {
    if (this.panel !== null) {
      uiBackSound();
      this.closePanel();
      return;
    }
    const s = hud.snap;
    if (this.screen === 'game' && s !== null && s.paused && !s.ended) {
      if (fromEscape && nowSec() - this.pausedAt < ESCAPE_AFTER_PAUSE_GUARD_SEC) return;
      // Au clavier hors ?debug, Échap ne peut pas reprendre (le navigateur refuse le pointer lock demandé sur Échap) :
      // on montre « Reprendre » (focus visible), qu'Entrée ou un clic valident.
      if (fromEscape && !s.debug && this.device === 'keyboard') {
        nav.focusById(PAUSE_RESUME_ID);
        return;
      }
      this.resume();
    }
  }

  /** Mise en pause demandée par l'UI (Échap en ?debug, sans pointer lock). */
  pause(): void {
    this.session?.setPaused(true);
  }

  /** Intentions de navigation de la manette (seulement quand un menu a la main, voir GameSession.onMenuIntent). */
  private onIntent(i: MenuIntent): void {
    const s = hud.snap;
    switch (i) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        nav.move(i);
        break;
      case 'confirm':
        nav.confirm();
        break;
      case 'back':
        this.back();
        break;
      case 'start':
        if (this.panel !== null) this.closePanel();
        else if (this.screen === 'menu') this.play();
        else if (s !== null && s.paused && !s.ended) this.resume();
        else if (s !== null && s.ended && s.match.final?.canReplay === true) this.restart(); // écran de fin : Rejouer
        break;
      case 'prev':
      case 'next':
        // LB / RB : glyphes Xbox / PlayStation du panneau des contrôles.
        if (this.panel === 'controls') this.controlsStyle = this.controlsStyle === 'xbox' ? 'playstation' : 'xbox';
        break;
      default:
        break;
    }
  }
}

export const app = new AppState();
