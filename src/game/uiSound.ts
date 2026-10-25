/**
 * Sons d'interface des menus (passe-plat vers src/audio : l'UI n'importe que src/game et src/input).
 * Écoute globale : un déplacement du focus au clavier / à la manette fait « tic », une validation (clic, Entrée, A)
 * fait « tac ». Les focus provoqués par la souris (juste avant un clic) ne font pas de bruit.
 */

import { audioEngine } from '../audio/AudioEngine';

/** Délai (s) pendant lequel un focus est attribué à la souris après un appui de pointeur. */
const POINTER_FOCUS_WINDOW_SEC = 0.25;

const isControl = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement && el.matches('button, [role="radio"], [role="switch"], input, select, a[href]');

/** Installe les sons d'interface ; renvoie la fonction de désinstallation. */
export function installUiSounds(doc: Document): () => void {
  const audio = audioEngine();
  let lastPointer = -Infinity;
  const now = (): number => performance.now() / 1000;
  const onPointer = (): void => {
    lastPointer = now();
  };
  const onFocus = (e: FocusEvent): void => {
    if (isControl(e.target) && now() - lastPointer > POINTER_FOCUS_WINDOW_SEC) audio.ui('move');
  };
  const onClick = (e: MouseEvent): void => {
    const t = e.target instanceof Element ? e.target.closest('button, [role="radio"], [role="switch"]') : null;
    if (t !== null && !(t as HTMLButtonElement).disabled) audio.ui('confirm');
  };
  const onInput = (e: Event): void => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') audio.ui('move');
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('focusin', onFocus);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('input', onInput);
  return () => {
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('focusin', onFocus);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('input', onInput);
  };
}

/** Son de retour (B / Échap dans un menu). */
export function uiBackSound(): void {
  audioEngine().ui('back');
}
