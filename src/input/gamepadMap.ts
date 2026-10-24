/**
 * Correspondance manette -> actions, en DONNÉES (Gamepad API, disposition « standard » W3C).
 *
 * Disposition standard (identique Xbox / PlayStation, seuls les noms changent) :
 *   boutons 0 A/Croix · 1 B/Rond · 2 X/Carré · 3 Y/Triangle · 4 LB/L1 · 5 RB/R1 · 6 LT/L2 (analogique)
 *           7 RT/R2 (analogique) · 8 View/Share · 9 Menu/Options · 10 L3 · 11 R3 · 12-15 croix · 16 Xbox/PS
 *   axes    0 stick gauche X (+ = droite) · 1 stick gauche Y (+ = BAS) · 2 stick droit X · 3 stick droit Y
 *
 * Un bouton peut émettre plusieurs actions (Y = coup de pied + rechargement : la sim ignore celle
 * qui ne s'applique pas — le porteur ne recharge pas, un non-porteur ne tape pas).
 * Le remapping consistera à fournir un autre `GamepadMap`.
 */

import { Buttons } from '../sim';

/**
 * Actions manette. `sprintToggle` (L3), `pause` (Start), `debugGiveBall` (View) et `debugResetBall` (croix ↓)
 * — outils de test — sont traitées à part par GamepadInput.
 */
export type GamepadAction =
  | 'jump'
  | 'dodge'
  | 'slide'
  | 'kick'
  | 'reload'
  | 'pass'
  | 'ability'
  | 'fire'
  | 'aim'
  | 'sprintToggle'
  | 'pause'
  | 'debugGiveBall'
  | 'debugResetBall';

export const GAMEPAD_ACTIONS: readonly GamepadAction[] = [
  'jump',
  'dodge',
  'slide',
  'kick',
  'reload',
  'pass',
  'ability',
  'fire',
  'aim',
  'sprintToggle',
  'pause',
  'debugGiveBall',
  'debugResetBall',
];

/** Bit d'une action manette dans un masque d'actions manette. */
export const padActionBit = (a: GamepadAction): number => 1 << GAMEPAD_ACTIONS.indexOf(a);

/** Bit `Buttons` émis par chaque action manette (0 : action traitée à part). */
export const GAMEPAD_ACTION_BUTTONS: Readonly<Record<GamepadAction, number>> = {
  jump: Buttons.JUMP,
  dodge: Buttons.DODGE,
  slide: Buttons.SLIDE,
  kick: Buttons.KICK,
  reload: Buttons.RELOAD,
  pass: Buttons.PASS,
  ability: Buttons.ABILITY,
  fire: Buttons.FIRE,
  aim: Buttons.AIM,
  sprintToggle: 0, // SPRINT en bascule, géré par SprintToggle
  pause: 0,
  debugGiveBall: 0, // outil de test (?debug / entraînement), traité par la session
  debugResetBall: 0, // idem
};

/** Liaison d'un bouton physique. `analog` : gâchette lue via sa valeur (seuil GAMEPAD_TRIGGER_THRESHOLD). */
export interface PadButtonBinding {
  index: number;
  actions: readonly GamepadAction[];
  analog?: boolean;
}

export interface GamepadMap {
  buttons: readonly PadButtonBinding[];
  /** Axes du stick de déplacement (Y : + = bas, inversé à la lecture). */
  moveAxes: { x: number; y: number };
  /** Axes du stick de caméra. */
  lookAxes: { x: number; y: number };
  /** Bouton qui valide dans les menus / overlays (A / Croix). */
  confirmButton: number;
}

/** Mapping par défaut (docs/ARCHITECTURE.md §4). */
export const DEFAULT_GAMEPAD_MAP: GamepadMap = {
  buttons: [
    { index: 0, actions: ['jump'] }, // A / Croix
    { index: 1, actions: ['dodge'] }, // B / Rond
    { index: 2, actions: ['slide'] }, // X / Carré (plongeon pour le porteur)
    { index: 3, actions: ['kick', 'reload'] }, // Y / Triangle
    { index: 4, actions: ['ability'] }, // LB / L1
    { index: 5, actions: ['pass'] }, // RB / R1
    { index: 6, actions: ['aim'], analog: true }, // LT / L2
    { index: 7, actions: ['fire'], analog: true }, // RT / R2
    { index: 8, actions: ['debugGiveBall'] }, // View / Share : « ballon pour moi » (?debug / entraînement)
    { index: 9, actions: ['pause'] }, // Menu / Options
    { index: 10, actions: ['sprintToggle'] }, // L3
    { index: 13, actions: ['debugResetBall'] }, // croix ↓ : « ballon au centre » (?debug / entraînement)
  ],
  moveAxes: { x: 0, y: 1 },
  lookAxes: { x: 2, y: 3 },
  confirmButton: 0,
};

/** Famille de glyphes à afficher. */
export type GamepadStyle = 'xbox' | 'playstation';

/**
 * Devine la famille d'après `gamepad.id` : Xbox (vendeur Microsoft 045e, XInput) d'abord, puis Sony
 * (vendeur 054c, noms connus ; une DualShock 4 se présente parfois comme « Wireless Controller »).
 * Xbox par défaut (manettes génériques).
 */
export function detectGamepadStyle(id: string): GamepadStyle {
  if (/xbox|045e|xinput/i.test(id)) return 'xbox';
  return /054c|playstation|dualshock|dualsense|wireless controller|ps[345]/i.test(id) ? 'playstation' : 'xbox';
}

/** Glyphes par index de bouton standard. */
export const GAMEPAD_GLYPHS: Readonly<Record<GamepadStyle, readonly string[]>> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→', 'Xbox'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'],
};

/** Glyphe d'un bouton standard. */
export const buttonGlyph = (style: GamepadStyle, index: number): string => GAMEPAD_GLYPHS[style][index] ?? `B${index}`;

/** Glyphe du premier bouton qui émet `action` (aide des contrôles), « — » si aucun. */
export function padActionGlyph(map: GamepadMap, action: GamepadAction, style: GamepadStyle): string {
  const b = map.buttons.find((x) => x.actions.includes(action));
  return b === undefined ? '—' : buttonGlyph(style, b.index);
}

/** Bouton minimal (sous-ensemble de GamepadButton) : permet de tester avec de fausses manettes. */
export interface PadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

/**
 * Masque d'actions manette (bits padActionBit) pour l'état des boutons donné.
 * Gâchettes `analog` : valeur ≥ seuil ; autres boutons : `pressed`.
 */
export function readPadActions(map: GamepadMap, buttons: readonly PadButtonLike[], triggerThreshold: number): number {
  let mask = 0;
  for (const b of map.buttons) {
    const btn = buttons[b.index];
    if (btn === undefined) continue;
    const down = b.analog === true ? btn.value >= triggerThreshold : btn.pressed;
    if (!down) continue;
    for (const a of b.actions) mask |= padActionBit(a);
  }
  return mask;
}

/** Bits `Buttons` correspondant à un masque d'actions manette. */
export function padActionsToButtons(mask: number): number {
  let out = 0;
  for (const a of GAMEPAD_ACTIONS) if ((mask & padActionBit(a)) !== 0) out |= GAMEPAD_ACTION_BUTTONS[a];
  return out;
}
