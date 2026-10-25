/**
 * Navigation spatiale du focus (étape 8) : grilles, rangées, éléments surélevés, boucle verticale, premier élément.
 */
import { describe, expect, it } from 'vitest';
import { firstFocusIndex, nextFocusIndex, type NavRect } from '../../src/ui/logic/focusNav';

const r = (x: number, y: number, w = 100, h = 40): NavRect => ({ x, y, w, h });

describe('nextFocusIndex', () => {
  // Menu type : rangée de 2 boutons (format), 3 cartes dessous (celle du milieu surélevée de 4 px), JOUER dessous à droite.
  const rects = [r(0, 0, 80), r(84, 0, 80), r(0, 60, 200, 200), r(210, 56, 200, 200), r(420, 60, 200, 200), r(300, 300, 200, 50)];

  it('gauche / droite dans une rangée, sans sortir de la rangée', () => {
    expect(nextFocusIndex(rects, 0, 'right')).toBe(1);
    expect(nextFocusIndex(rects, 1, 'left')).toBe(0);
    expect(nextFocusIndex(rects, 0, 'left')).toBe(0);
  });

  it('une carte surélevée reste « à droite » (pas « en haut »)', () => {
    expect(nextFocusIndex(rects, 2, 'right')).toBe(3);
    expect(nextFocusIndex(rects, 3, 'right')).toBe(4);
    expect(nextFocusIndex(rects, 4, 'up')).not.toBe(3);
  });

  it('un élément plus haut et décalé n’est pas « à gauche »', () => {
    // La carte de gauche n'a rien à sa gauche, même si le bouton du format est un peu plus à gauche et au-dessus.
    expect(nextFocusIndex([r(2, 0, 80), r(0, 60, 200, 200)], 1, 'left')).toBe(1);
  });

  it('haut / bas : le candidat le plus aligné', () => {
    expect(nextFocusIndex(rects, 5, 'up')).toBe(3); // JOUER (300..500) chevauche les cartes 3 et 4 : centre plus proche de 3
    expect(nextFocusIndex(rects, 2, 'up')).toBe(1); // les deux boutons chevauchent la carte : le plus centré
    expect(nextFocusIndex(rects, 0, 'down')).toBe(2);
  });

  it('boucle verticale : du bas vers le haut et inversement ; rien en horizontal', () => {
    const list = [r(0, 0), r(0, 50), r(0, 100)];
    expect(nextFocusIndex(list, 2, 'down')).toBe(0);
    expect(nextFocusIndex(list, 0, 'up')).toBe(2);
    expect(nextFocusIndex(list, 1, 'right')).toBe(1);
  });

  it('sans focus : premier élément en haut à gauche ; liste vide : −1', () => {
    expect(nextFocusIndex(rects, -1, 'down')).toBe(0);
    expect(firstFocusIndex([r(50, 10), r(0, 10), r(0, 0, 10)])).toBe(2);
    expect(nextFocusIndex([], 0, 'up')).toBe(-1);
  });
});
