/**
 * Correspondance actions -> touches physiques (clavier/souris).
 *
 * On lit `KeyboardEvent.code` (position PHYSIQUE de la touche) : ZQSD sur AZERTY = WASD sur
 * QWERTY, sans rien configurer. Les libellés affichés sont ceux de l'AZERTY par défaut, ou ceux
 * de la disposition réelle quand le navigateur expose `navigator.keyboard.getLayoutMap()`.
 *
 * La keymap est une DONNÉE passée à l'InputManager (jamais de touche en dur dans le code) :
 * le remapping consistera à fournir une autre `Keymap` (menu d'options, étape ultérieure).
 */

import { Buttons } from '../sim';

/** Actions clavier/souris. Le déplacement et Shift (esquive/sprint) sont traités à part par l'InputManager. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'dodgeSprint'
  | 'slide'
  | 'pass'
  | 'kick'
  | 'ability'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'debugGiveBall'
  | 'debugResetBall';

/** Toutes les actions, dans un ordre fixe (index = bit dans les masques internes de l'InputManager). */
export const ACTIONS: readonly Action[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'dodgeSprint',
  'slide',
  'pass',
  'kick',
  'ability',
  'fire',
  'aim',
  'reload',
  'debugGiveBall',
  'debugResetBall',
];

/** Bit d'une action dans un masque d'actions. */
export const actionBit = (a: Action): number => 1 << ACTIONS.indexOf(a);

/** Une liaison : une touche (KeyboardEvent.code) ou un bouton de souris (MouseEvent.button : 0 gauche, 1 milieu, 2 droit). */
export type Binding = { kind: 'key'; code: string } | { kind: 'mouse'; button: number };

/** Keymap : chaque action peut avoir plusieurs liaisons. */
export type Keymap = Readonly<Record<Action, readonly Binding[]>>;

const key = (code: string): Binding => ({ kind: 'key', code });
const mouse = (button: number): Binding => ({ kind: 'mouse', button });

/**
 * Keymap par défaut (docs/ARCHITECTURE.md §4). Jamais de Ctrl (Ctrl+W ferme l'onglet).
 * Entre parenthèses : la touche correspondante sur un clavier AZERTY.
 */
export const DEFAULT_KEYMAP: Keymap = {
  forward: [key('KeyW'), key('ArrowUp')], // Z
  back: [key('KeyS'), key('ArrowDown')],
  left: [key('KeyA'), key('ArrowLeft')], // Q
  right: [key('KeyD'), key('ArrowRight')],
  jump: [key('Space')],
  dodgeSprint: [key('ShiftLeft'), key('ShiftRight')],
  slide: [key('KeyC')],
  pass: [key('KeyE')],
  kick: [key('KeyF')],
  ability: [key('KeyQ')], // A
  fire: [mouse(0)],
  aim: [mouse(2)],
  reload: [key('KeyR')],
  // Outils de test (mode ?debug / entraînement uniquement) : pas de bit `Buttons`, la session les traite.
  debugGiveBall: [key('KeyG')],
  debugResetBall: [key('KeyB')],
};

/**
 * Bit `Buttons` émis directement par chaque action « bouton ». Le déplacement (forward/back/left/right)
 * produit moveX/moveY ; `dodgeSprint` produit DODGE puis SPRINT selon la durée d'appui (voir inputLogic.ts).
 */
export const ACTION_BUTTONS: Readonly<Partial<Record<Action, number>>> = {
  jump: Buttons.JUMP,
  slide: Buttons.SLIDE,
  pass: Buttons.PASS,
  kick: Buttons.KICK,
  ability: Buttons.ABILITY,
  fire: Buttons.FIRE,
  aim: Buttons.AIM,
  reload: Buttons.RELOAD,
};

/** Bits `Buttons` émis par un masque d'actions (actions « bouton » seulement : ni déplacement, ni Shift). */
export function actionsToButtons(actions: number): number {
  let buttons = 0;
  for (const a of ACTIONS) {
    const bit = ACTION_BUTTONS[a];
    if (bit !== undefined && (actions & actionBit(a)) !== 0) buttons |= bit;
  }
  return buttons;
}

/** Masque d'actions déclenché par une touche (0 si non liée). */
export function actionsForKey(keymap: Keymap, code: string): number {
  let mask = 0;
  for (const a of ACTIONS) {
    for (const b of keymap[a]) if (b.kind === 'key' && b.code === code) mask |= actionBit(a);
  }
  return mask;
}

/** Masque d'actions déclenché par un bouton de souris (0 si non lié). */
export function actionsForMouse(keymap: Keymap, button: number): number {
  let mask = 0;
  for (const a of ACTIONS) {
    for (const b of keymap[a]) if (b.kind === 'mouse' && b.button === button) mask |= actionBit(a);
  }
  return mask;
}

/** Libellés français des actions (aide des contrôles, futur menu de remapping). */
export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  forward: 'Avancer',
  back: 'Reculer',
  left: 'Gauche',
  right: 'Droite',
  jump: 'Saut',
  dodgeSprint: 'Esquive (appui) / sprint (maintien)',
  slide: 'Glissade / plongeon (porteur)',
  pass: 'Passe (porteur)',
  kick: 'Coup de pied (porteur)',
  ability: 'Capacité',
  fire: 'Tir',
  aim: 'Visée',
  reload: 'Recharger',
  debugGiveBall: 'Ballon pour moi (test)',
  debugResetBall: 'Ballon au centre (test)',
};

/** Libellés AZERTY (disposition par défaut supposée) des codes physiques. */
const AZERTY_LABELS: Readonly<Record<string, string>> = {
  KeyQ: 'A',
  KeyW: 'Z',
  KeyA: 'Q',
  KeyZ: 'W',
  KeyM: ',',
  Semicolon: 'M',
  Space: 'Espace',
  ShiftLeft: 'Maj',
  ShiftRight: 'Maj D',
  ControlLeft: 'Ctrl',
  AltLeft: 'Alt',
  Tab: 'Tab',
  Enter: 'Entrée',
  Escape: 'Échap',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const MOUSE_LABELS: readonly string[] = ['Clic gauche', 'Clic milieu', 'Clic droit', 'Bouton 4', 'Bouton 5'];

/** Disposition réelle du clavier : code physique -> caractère (fournie par navigator.keyboard quand dispo). */
export type LayoutLabels = ReadonlyMap<string, string>;

/** Libellé lisible d'une liaison (AZERTY par défaut, ou disposition réelle si fournie). */
export function bindingLabel(b: Binding, layout: LayoutLabels | null = null): string {
  if (b.kind === 'mouse') return MOUSE_LABELS[b.button] ?? `Souris ${b.button}`;
  const fixed = AZERTY_LABELS[b.code];
  // Les touches non imprimables (Espace, Maj, flèches) gardent leur nom français.
  if (fixed !== undefined && !/^Key|^Digit|^Semicolon/.test(b.code)) return fixed;
  const real = layout?.get(b.code);
  if (real !== undefined && real.length > 0) return real.toUpperCase();
  if (fixed !== undefined) return fixed;
  if (b.code.startsWith('Key')) return b.code.slice(3);
  if (b.code.startsWith('Digit')) return b.code.slice(5);
  return b.code;
}

/** Libellé de la première liaison d'une action (aide affichée). */
export const actionLabel = (keymap: Keymap, a: Action, layout: LayoutLabels | null = null): string => {
  const b = keymap[a][0];
  return b === undefined ? '—' : bindingLabel(b, layout);
};

/** API Keyboard Map (non standard partout, absente des types DOM de TypeScript). */
interface KeyboardLayoutApi {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

/**
 * Lit la disposition réelle du clavier (Chromium : navigator.keyboard.getLayoutMap()).
 * Renvoie null si l'API est absente ou refusée : on garde alors les libellés AZERTY.
 */
export async function loadLayoutLabels(): Promise<LayoutLabels | null> {
  if (typeof navigator === 'undefined') return null;
  const kb = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
  if (kb === undefined || typeof kb.getLayoutMap !== 'function') return null;
  try {
    return await kb.getLayoutMap();
  } catch {
    return null;
  }
}
