/**
 * Navigation dans les menus à la manette (étape 8) — module PUR, testable sous Node.
 *
 * Transforme l'état d'une manette (`GamepadLike`, lu à chaque frame) en intentions de navigation : directions (croix
 * directionnelle ou stick gauche, avec répétition quand on maintient), valider (A / Croix), retour (B / Rond), Start,
 * onglet précédent / suivant (LB / RB). Seuls les FRONTS comptent : un bouton déjà enfoncé au branchement (ou au moment
 * d'un `reset`) ne produit rien tant qu'il n'a pas été relâché — le A qui vient de lancer la partie, ou le Start qui
 * vient de la mettre en pause, n'agit pas une seconde fois dans le menu suivant.
 *
 * Le temps est passé en paramètre (secondes) : aucune horloge interne. Réglages : MENU_NAV_* (src/sim/constants.ts).
 */

import { GAMEPAD_MOVE_DEADZONE, MENU_NAV_REPEAT_DELAY_SEC, MENU_NAV_REPEAT_SEC, MENU_NAV_STICK_THRESHOLD } from '../sim';
import { radialDeadzone, type GamepadLike } from './gamepad';
import { DEFAULT_GAMEPAD_MAP, DEFAULT_MENU_PAD_MAP, type GamepadMap, type MenuPadMap } from './gamepadMap';

export type NavDirection = 'up' | 'down' | 'left' | 'right';
export type MenuIntent = NavDirection | 'confirm' | 'back' | 'start' | 'prev' | 'next';

const DIRECTIONS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];
const BUTTON_INTENTS = ['confirm', 'back', 'start', 'prev', 'next'] as const;

/** Direction du stick (axe dominant) au-delà de MENU_NAV_STICK_THRESHOLD, ou null. Axe Y brut : + = bas. */
export function stickDirection(x: number, y: number, threshold: number = MENU_NAV_STICK_THRESHOLD): NavDirection | null {
  const s = radialDeadzone(x, y, GAMEPAD_MOVE_DEADZONE);
  if (s.mag < threshold) return null;
  if (Math.abs(s.x) >= Math.abs(s.y)) return s.x > 0 ? 'right' : 'left';
  return s.y > 0 ? 'down' : 'up';
}

/**
 * Vrai à la frame où le joueur QUITTE le jeu (pause, fin du match) : la session remet alors la navigation à zéro
 * (`MenuNavReader.reset`) pour que le stick / la croix / les boutons maintenus depuis le jeu n'agissent pas dans le menu
 * qui s'ouvre (correction de l'étape 8 : le stick de course maintenu faisait défiler le focus de la pause).
 */
export const leftGame = (wasInGame: boolean, inGame: boolean): boolean => wasInGame && !inGame;

interface RepeatState {
  /** Direction maintenue (croix ou stick), null : aucune. */
  dir: NavDirection | null;
  /** Prochain instant (s) où la direction maintenue se répète. */
  nextAt: number;
}

export class MenuNavReader {
  private padId = '';
  private prevButtons: Record<(typeof BUTTON_INTENTS)[number], boolean> = { confirm: false, back: false, start: false, prev: false, next: false };
  private readonly repeat: RepeatState = { dir: null, nextAt: 0 };
  /** Direction encore maintenue au dernier reset : ignorée jusqu'à son relâchement. */
  private suppressedDir: NavDirection | null = null;

  constructor(
    private readonly menuMap: MenuPadMap = DEFAULT_MENU_PAD_MAP,
    private readonly padMap: GamepadMap = DEFAULT_GAMEPAD_MAP,
  ) {}

  /** Intentions produites depuis la frame précédente (dans l'ordre : directions, puis boutons). */
  update(pad: GamepadLike | null, nowSec: number): MenuIntent[] {
    if (pad === null || !pad.connected) {
      this.padId = '';
      this.repeat.dir = null;
      this.suppressedDir = null;
      for (const k of BUTTON_INTENTS) this.prevButtons[k] = false;
      return [];
    }
    const buttons = this.readButtons(pad);
    const dir = this.readDirection(pad);
    if (pad.id !== this.padId) {
      // Nouvelle manette : ce qui est déjà enfoncé ne compte pas.
      this.padId = pad.id;
      this.prevButtons = buttons;
      this.suppressedDir = dir;
      this.repeat.dir = null;
      return [];
    }
    const out: MenuIntent[] = [];
    if (this.suppressedDir !== null && dir !== this.suppressedDir) this.suppressedDir = null;
    const effective = dir === this.suppressedDir ? null : dir;
    if (effective === null) {
      this.repeat.dir = null;
    } else if (effective !== this.repeat.dir) {
      this.repeat.dir = effective;
      this.repeat.nextAt = nowSec + MENU_NAV_REPEAT_DELAY_SEC;
      out.push(effective);
    } else if (nowSec >= this.repeat.nextAt) {
      this.repeat.nextAt = Math.max(nowSec, this.repeat.nextAt + MENU_NAV_REPEAT_SEC);
      out.push(effective);
    }
    for (const k of BUTTON_INTENTS) {
      if (buttons[k] && !this.prevButtons[k]) out.push(k);
    }
    this.prevButtons = buttons;
    return out;
  }

  /**
   * Oublie les appuis en cours (changement d'écran) : les boutons et la direction encore maintenus sont ignorés
   * jusqu'à leur relâchement. `pad` : état actuel de la manette (null : aucune).
   */
  reset(pad: GamepadLike | null): void {
    this.repeat.dir = null;
    if (pad === null || !pad.connected) {
      this.suppressedDir = null;
      return;
    }
    this.padId = pad.id;
    this.prevButtons = this.readButtons(pad);
    this.suppressedDir = this.readDirection(pad);
  }

  private readButtons(pad: GamepadLike): Record<(typeof BUTTON_INTENTS)[number], boolean> {
    const down = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
    const m = this.menuMap;
    return { confirm: down(m.confirm), back: down(m.back), start: down(m.start), prev: down(m.prev), next: down(m.next) };
  }

  private readDirection(pad: GamepadLike): NavDirection | null {
    const down = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
    for (const d of DIRECTIONS) if (down(this.menuMap[d])) return d;
    const ax = pad.axes;
    return stickDirection(ax[this.padMap.moveAxes.x] ?? 0, ax[this.padMap.moveAxes.y] ?? 0);
  }
}
