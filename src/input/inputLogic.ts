/**
 * Logique d'entrée PURE (sans DOM), testable sous Node : verrouillage des appuis brefs,
 * Shift « appui = esquive / maintien = sprint », déplacement clavier, fusion des périphériques.
 *
 * Le temps est toujours passé en paramètre (secondes) : aucune horloge interne.
 */

import { Buttons, KEYBOARD_DODGE_ON_RELEASE, SPRINT_HOLD_DELAY_SEC, type PlayerInput } from '../sim';
import { actionBit, actionsToButtons } from './keymap';

/**
 * Verrou d'appuis : un bouton enfoncé PUIS relâché entre deux ticks doit quand même être vu
 * par la simulation au tick suivant (sinon un clic rapide serait perdu à 30 Hz).
 * Les masques sont des bits arbitraires (actions clavier, bits `Buttons` de la manette…).
 */
export class PressLatch {
  /** Bits actuellement maintenus (hors bits neutralisés). */
  held = 0;
  /** Bits pressés depuis le dernier `sample()` (même s'ils ont été relâchés depuis). */
  private pressed = 0;
  /** Bits neutralisés jusqu'à leur relâchement (boutons déjà enfoncés au moment d'un reset). */
  private suppressed = 0;

  /** Remplace l'état maintenu ; les nouveaux bits sont mémorisés jusqu'au prochain `sample()`. */
  setHeld(mask: number): void {
    this.suppressed &= mask; // un bit relâché n'est plus neutralisé
    const effective = mask & ~this.suppressed;
    this.pressed |= effective & ~this.held;
    this.held = effective;
  }

  /** Bits à transmettre pour ce tick : maintenus OU pressés depuis le dernier échantillon. Vide le verrou. */
  sample(): number {
    const out = this.held | this.pressed;
    this.pressed = 0;
    return out;
  }

  /**
   * Tout relâcher (perte de focus, pause) : aucun appui en attente. `stillDown` : bits encore
   * physiquement enfoncés, ignorés jusqu'à leur relâchement (le bouton qui a servi à reprendre
   * la partie ne déclenche pas d'action).
   */
  reset(stillDown = 0): void {
    this.held = 0;
    this.pressed = 0;
    this.suppressed = stillDown;
  }
}

/**
 * Shift : appui bref => esquive pendant UN tick ; maintien au-delà de SPRINT_HOLD_DELAY_SEC => sprint.
 * - `dodgeOnRelease` (KEYBOARD_DODGE_ON_RELEASE, défaut) : l'esquive part au RELÂCHEMENT d'un appui plus
 *   bref que le délai ; un maintien sprinte sans consommer l'esquive.
 * - sinon : l'esquive part à l'enfoncement (latence nulle) et un maintien donne esquive PUIS sprint.
 * Un appui bref (pressé et relâché entre deux ticks) donne toujours son esquive au tick suivant.
 */
export class TapHoldState {
  private down = false;
  private downAt = 0;
  private pendingTap = false;

  constructor(
    private readonly holdDelaySec: number = SPRINT_HOLD_DELAY_SEC,
    private readonly dodgeOnRelease: boolean = KEYBOARD_DODGE_ON_RELEASE,
  ) {}

  press(nowSec: number): void {
    if (this.down) return; // répétition clavier
    this.down = true;
    this.downAt = nowSec;
    if (!this.dodgeOnRelease) this.pendingTap = true;
  }

  release(nowSec: number): void {
    if (!this.down) return;
    this.down = false;
    if (this.dodgeOnRelease && nowSec - this.downAt < this.holdDelaySec) this.pendingTap = true;
  }

  reset(): void {
    this.down = false;
    this.pendingTap = false;
  }

  get isDown(): boolean {
    return this.down;
  }

  /** Échantillon d'un tick : `tap` vrai une seule fois par appui, `hold` tant que le maintien dépasse le délai. */
  sample(nowSec: number): { tap: boolean; hold: boolean } {
    const tap = this.pendingTap;
    this.pendingTap = false;
    const hold = this.down && nowSec - this.downAt >= this.holdDelaySec;
    return { tap, hold };
  }
}

/** Déplacement clavier : touches opposées s'annulent. La sim normalise la diagonale. */
export function keyboardMove(forward: boolean, back: boolean, left: boolean, right: boolean): { x: number; y: number } {
  return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (forward ? 1 : 0) - (back ? 1 : 0) };
}

/**
 * Fusion des déplacements clavier et manette : on garde le plus « grand » (norme bornée à 1),
 * à égalité celui du périphérique actif. Les deux ne s'additionnent jamais (pas de vitesse x2).
 */
export function mergeMove(
  kb: { x: number; y: number },
  pad: { x: number; y: number },
  gamepadActive: boolean,
): { x: number; y: number } {
  const mk = Math.min(1, Math.hypot(kb.x, kb.y));
  const mp = Math.min(1, Math.hypot(pad.x, pad.y));
  if (mp > mk || (mp === mk && gamepadActive)) return { x: pad.x, y: pad.y };
  return { x: kb.x, y: kb.y };
}

const BIT_FORWARD = actionBit('forward');
const BIT_BACK = actionBit('back');
const BIT_LEFT = actionBit('left');
const BIT_RIGHT = actionBit('right');

/** Ce que chaque périphérique a produit pour un tick (entrée de `composeInput`). */
export interface InputParts {
  /** Actions clavier/souris maintenues ou verrouillées depuis le dernier tick (masque `actionBit`). */
  keyboardActions: number;
  /** Échantillon de Shift (TapHoldState). */
  shift: { tap: boolean; hold: boolean };
  /** Bits `Buttons` de la manette (appuis verrouillés + sprint en bascule). */
  gamepadButtons: number;
  /** Déplacement manette après zone morte (+y = avant). */
  gamepadMove: { x: number; y: number };
  /** Manette = périphérique actif (départage des déplacements à égalité). */
  gamepadActive: boolean;
  yaw: number;
  pitch: number;
}

/**
 * Assemble le PlayerInput d'un tick (PUR) : boutons clavier + Shift (DODGE / SPRINT) + boutons
 * manette en OU, déplacement = le plus grand des deux périphériques, yaw/pitch communs.
 */
export function composeInput(p: InputParts): PlayerInput {
  const a = p.keyboardActions;
  const kb = keyboardMove((a & BIT_FORWARD) !== 0, (a & BIT_BACK) !== 0, (a & BIT_LEFT) !== 0, (a & BIT_RIGHT) !== 0);
  let buttons = actionsToButtons(a);
  if (p.shift.tap) buttons |= Buttons.DODGE;
  if (p.shift.hold) buttons |= Buttons.SPRINT;
  buttons |= p.gamepadButtons;
  const move = mergeMove(kb, p.gamepadMove, p.gamepadActive);
  return { moveX: move.x, moveY: move.y, yaw: p.yaw, pitch: p.pitch, buttons };
}
