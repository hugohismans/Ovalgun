/**
 * Aides de contrôle (étape 8), PURES et testées : quelle touche / quel bouton afficher pour une action, selon le
 * périphérique actif (clavier/souris ou manette) et la famille de manette (glyphes Xbox / PlayStation). Tout est lu
 * dans les DONNÉES de src/input (`Keymap`, `GamepadMap`) — jamais de touche en dur — avec les libellés AZERTY par
 * défaut ou ceux de la disposition réelle (`getLayoutMap`).
 *
 * `CONTROL_GROUPS` structure le panneau des contrôles : une ligne par action, avec les actions de la keymap et du
 * mapping manette qu'elle couvre (`keys`, `pad`). C'est la base du futur remapping : rendre une ligne éditable
 * consistera à remplacer les liaisons de ces actions dans une `Keymap` / un `GamepadMap` (pas d'édition pour l'instant).
 */

import { bindingLabel, DEFAULT_KEYMAP, type Action, type Keymap, type LayoutLabels } from '../../input/keymap';
import { buttonGlyph, DEFAULT_GAMEPAD_MAP, type GamepadAction, type GamepadMap, type GamepadStyle } from '../../input/gamepadMap';
import type { InputDevice } from '../../input/InputManager';

/** Un glyphe à dessiner : touche, bouton de souris, bouton de manette, stick. */
export type GlyphSpec =
  | { kind: 'key'; label: string }
  | { kind: 'mouse'; button: number; label: string }
  | { kind: 'pad'; index: number; label: string; style: GamepadStyle }
  | { kind: 'stick'; side: 'L' | 'R'; label: string };

export type ControlId =
  | 'move'
  | 'look'
  | 'jump'
  | 'dodge'
  | 'sprint'
  | 'slide'
  | 'dive'
  | 'pass'
  | 'kick'
  | 'ability'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'pause'
  | 'giveBall'
  | 'resetBall';

/** Définition d'une ligne de contrôle : actions de la keymap et du mapping manette couvertes. */
export interface ControlDef {
  id: ControlId;
  label: string;
  /** Actions clavier/souris (dans l'ordre d'affichage). Vide : liaison fixe (`fixedKey`) ou souris (`look`). */
  keys: readonly Action[];
  /** Actions manette. Vide : stick (`stick`). */
  pad: readonly GamepadAction[];
  /** Stick de la manette (déplacement / caméra). */
  stick?: 'L' | 'R';
  /** Touche fixe, hors keymap (Échap : sortie du pointer lock, gérée par le navigateur). */
  fixedKey?: string;
  /** Précision (« appui », « maintien », « porteur »…). */
  note?: string;
  /** Outil de test (?debug / entraînement seulement). */
  debug?: boolean;
  /** Le remapping de cette ligne est possible (keymap / mapping manette) — pas d'édition pour l'instant. */
  remappable: boolean;
}

export const CONTROLS: Readonly<Record<ControlId, ControlDef>> = {
  move: { id: 'move', label: 'Se déplacer', keys: ['forward', 'left', 'back', 'right'], pad: [], stick: 'L', remappable: true },
  look: { id: 'look', label: 'Caméra / visée', keys: [], pad: [], stick: 'R', note: 'souris', remappable: false },
  jump: { id: 'jump', label: 'Saut', keys: ['jump'], pad: ['jump'], note: 'double saut : ailier', remappable: true },
  dodge: { id: 'dodge', label: 'Esquive', keys: ['dodgeSprint'], pad: ['dodge'], note: 'appui bref au clavier', remappable: true },
  sprint: { id: 'sprint', label: 'Sprint', keys: ['dodgeSprint'], pad: ['sprintToggle'], note: 'maintien / bascule', remappable: true },
  slide: { id: 'slide', label: 'Glissade', keys: ['slide'], pad: ['slide'], note: 'en courant', remappable: true },
  dive: { id: 'dive', label: 'Plongeon', keys: ['slide'], pad: ['slide'], note: 'porteur', remappable: true },
  pass: { id: 'pass', label: 'Passe arrière', keys: ['pass'], pad: ['pass'], note: 'porteur', remappable: true },
  kick: { id: 'kick', label: 'Coup de pied', keys: ['kick'], pad: ['kick'], note: 'porteur', remappable: true },
  ability: { id: 'ability', label: 'Capacité', keys: ['ability'], pad: ['ability'], remappable: true },
  fire: { id: 'fire', label: 'Tir', keys: ['fire'], pad: ['fire'], remappable: true },
  aim: { id: 'aim', label: 'Visée', keys: ['aim'], pad: ['aim'], remappable: true },
  reload: { id: 'reload', label: 'Recharger', keys: ['reload'], pad: ['reload'], remappable: true },
  pause: { id: 'pause', label: 'Pause', keys: [], fixedKey: 'Échap', pad: ['pause'], remappable: false },
  giveBall: { id: 'giveBall', label: 'Ballon pour moi', keys: ['debugGiveBall'], pad: ['debugGiveBall'], debug: true, remappable: true },
  resetBall: { id: 'resetBall', label: 'Ballon au centre', keys: ['debugResetBall'], pad: ['debugResetBall'], debug: true, remappable: true },
};

/** Groupes du panneau des contrôles (ordre d'affichage). */
export const CONTROL_GROUPS: ReadonlyArray<{ title: string; ids: readonly ControlId[] }> = [
  { title: 'Déplacement', ids: ['move', 'look', 'jump', 'dodge', 'sprint', 'slide'] },
  { title: 'Combat', ids: ['fire', 'aim', 'reload', 'ability'] },
  { title: 'Avec le ballon', ids: ['pass', 'kick', 'dive'] },
  { title: 'Système', ids: ['pause', 'giveBall', 'resetBall'] },
];

/** Glyphes clavier/souris d'une action (AZERTY par défaut, ou disposition réelle `layout`). */
export function keyGlyphs(id: ControlId, layout: LayoutLabels | null = null, keymap: Keymap = DEFAULT_KEYMAP): GlyphSpec[] {
  const def = CONTROLS[id];
  if (def.fixedKey !== undefined) return [{ kind: 'key', label: def.fixedKey }];
  if (id === 'look') return [{ kind: 'mouse', button: -1, label: 'Souris' }];
  const out: GlyphSpec[] = [];
  for (const a of def.keys) {
    const b = keymap[a][0];
    if (b === undefined) continue;
    out.push(b.kind === 'mouse' ? { kind: 'mouse', button: b.button, label: bindingLabel(b, layout) } : { kind: 'key', label: bindingLabel(b, layout) });
  }
  return out;
}

/** Glyphes manette d'une action (famille Xbox / PlayStation). */
export function padGlyphs(id: ControlId, style: GamepadStyle, map: GamepadMap = DEFAULT_GAMEPAD_MAP): GlyphSpec[] {
  const def = CONTROLS[id];
  if (def.stick !== undefined) return [{ kind: 'stick', side: def.stick, label: def.stick === 'L' ? 'Stick G' : 'Stick D' }];
  const out: GlyphSpec[] = [];
  for (const a of def.pad) {
    const b = map.buttons.find((x) => x.actions.includes(a));
    if (b !== undefined) out.push({ kind: 'pad', index: b.index, label: buttonGlyph(style, b.index), style });
  }
  return out;
}

/** Glyphes d'une action pour le périphérique actif. */
export function controlGlyphs(id: ControlId, device: InputDevice, style: GamepadStyle, layout: LayoutLabels | null = null): GlyphSpec[] {
  return device === 'gamepad' ? padGlyphs(id, style) : keyGlyphs(id, layout);
}

/** Glyphe d'un bouton de manette par index (aides des menus : A valider, B retour…). */
export const padButtonGlyph = (index: number, style: GamepadStyle): GlyphSpec => ({ kind: 'pad', index, label: buttonGlyph(style, index), style });

/** Texte d'un glyphe (lecteurs d'écran, attribut title). */
export const glyphText = (g: GlyphSpec): string => g.label;
