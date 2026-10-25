/**
 * Navigation au focus dans les menus (étape 8) : manette (croix / stick, A, B), clavier (flèches, Tab, Entrée, Échap)
 * et souris utilisent le VRAI focus du navigateur (`element.focus()`), donc Tab, Entrée et les lecteurs d'écran marchent
 * comme partout.
 *
 *  - Portée : le dernier élément `[data-nav-scope]` du document (le menu ouvert au premier plan). L'attache `navScope`
 *    le marque, donne le focus à son élément `[data-autofocus]` (sinon le premier) à l'ouverture et rend le focus à
 *    l'élément précédent à la fermeture (fermer les réglages revient sur le bouton « Réglages »).
 *  - Directions : navigation spatiale pure (logic/focusNav.ts) parmi les éléments focalisables visibles de la portée ;
 *    gauche / droite sur un curseur (`input[type=range]`) le font varier d'un pas.
 *  - Focus visible (`nav-visible` sur <html>) dès qu'on navigue au clavier ou à la manette, retiré quand la souris
 *    bouge : l'anneau de focus n'apparaît pas sous la souris, mais ne disparaît jamais pendant une navigation.
 *  - Pas de piège : Tab sort normalement vers le navigateur ; un menu resté monté sous un panneau (menu de lancement
 *    sous Contrôles / Réglages) est `inert` (Menu.svelte), donc hors d'atteinte ; un focus perdu (sur <body>) est
 *    rattrapé à la prochaine direction ou validation.
 */

import type { Attachment } from 'svelte/attachments';
import type { NavDirection } from '../../input/menuNav';
import { firstFocusIndex, nextFocusIndex, type NavRect } from '../logic/focusNav';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

function currentScope(): HTMLElement | null {
  const scopes = document.querySelectorAll<HTMLElement>('[data-nav-scope]');
  return scopes.length > 0 ? scopes[scopes.length - 1] : null;
}

function focusables(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

const rectOf = (el: HTMLElement): NavRect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const isRange = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'range';

class NavController {
  /** Anneau de focus visible (navigation clavier / manette). */
  visible = $state(false);

  setVisible(v: boolean): void {
    if (this.visible === v) return;
    this.visible = v;
    document.documentElement.classList.toggle('nav-visible', v);
  }

  /** Élément focalisé dans la portée courante (null : aucun). */
  private activeIn(scope: HTMLElement): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && scope.contains(a) && a !== scope ? a : null;
  }

  /** Déplace le focus dans une direction (croix / stick / flèches). Renvoie vrai si quelque chose a été fait. */
  move(dir: NavDirection): boolean {
    this.setVisible(true);
    const scope = currentScope();
    if (scope === null) return false;
    const active = this.activeIn(scope);
    if ((dir === 'left' || dir === 'right') && isRange(active)) {
      this.stepRange(active, dir === 'right' ? 1 : -1);
      return true;
    }
    const els = focusables(scope);
    if (els.length === 0) return false;
    const idx = active === null ? -1 : els.indexOf(active);
    const next = idx < 0 ? this.autofocusIndex(scope, els) : nextFocusIndex(els.map(rectOf), idx, dir);
    if (next >= 0) els[next].focus();
    return true;
  }

  /** Valide l'élément focalisé (A) ; sans focus, le donne au premier élément. */
  confirm(): void {
    this.setVisible(true);
    const scope = currentScope();
    if (scope === null) return;
    const active = this.activeIn(scope);
    if (active === null) {
      const els = focusables(scope);
      const i = this.autofocusIndex(scope, els);
      if (i >= 0) els[i].focus();
      return;
    }
    if (isRange(active)) return;
    active.click();
  }

  /** Donne le focus (visible) à l'élément `id` de la portée courante, s'il existe. */
  focusById(id: string): void {
    const el = currentScope()?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (el === null) return;
    this.setVisible(true);
    el.focus();
  }

  private autofocusIndex(scope: HTMLElement, els: HTMLElement[]): number {
    const auto = scope.querySelector<HTMLElement>('[data-autofocus]');
    const i = auto === null ? -1 : els.indexOf(auto);
    return i >= 0 ? i : firstFocusIndex(els.map(rectOf));
  }

  private stepRange(el: HTMLInputElement, sign: number): void {
    const step = Number(el.step) || 1;
    const min = Number(el.min);
    const max = Number(el.max);
    const v = Math.min(max, Math.max(min, Number(el.value) + sign * step));
    el.value = String(Math.round(v * 1e6) / 1e6);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export const nav = new NavController();

/**
 * Attache d'une portée de navigation (menu, panneau) : focus initial sur `[data-autofocus]` (ou le premier élément),
 * focus rendu à l'élément précédent à la fermeture.
 */
export const navScope: Attachment<HTMLElement> = (node) => {
  node.setAttribute('data-nav-scope', '');
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Après le rendu des enfants (le premier bouton peut dépendre d'un état calculé).
  queueMicrotask(() => {
    if (!node.isConnected || node.contains(document.activeElement)) return;
    const auto = node.querySelector<HTMLElement>('[data-autofocus]');
    const target = auto ?? node.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  });
  return () => {
    queueMicrotask(() => {
      if (previous === null || !previous.isConnected) return;
      const scope = currentScope();
      if (scope === null || scope.contains(previous)) previous.focus({ preventScroll: true });
    });
  };
};
