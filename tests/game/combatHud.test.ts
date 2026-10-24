/**
 * Retours de visée du joueur local (étape 5) : hitmarker, direction des tirs reçus, vignette.
 */
import { describe, expect, it } from 'vitest';
import { CombatHud, relativeAngleDeg } from '../../src/game/combatHud';
import { STYLE } from '../../src/render/palette';
import { createMatch } from '../../src/sim/match';

const match = () => createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']] });

describe('CombatHud', () => {
  it('relativeAngleDeg : 0 devant, +90 à droite, −90 à gauche, 180 derrière (yaw 0 regarde +Z, droite = −X)', () => {
    expect(relativeAngleDeg(0, 10, 0)).toBeCloseTo(0, 9);
    expect(relativeAngleDeg(-10, 0, 0)).toBeCloseTo(90, 9);
    expect(relativeAngleDeg(10, 0, 0)).toBeCloseTo(-90, 9);
    expect(Math.abs(relativeAngleDeg(0, -10, 0))).toBeCloseTo(180, 9);
    expect(relativeAngleDeg(0, -10, Math.PI)).toBeCloseTo(0, 9);
  });

  it('hitmarker : sur une touche du joueur local, plus fort sur un plaquage, puis s’efface', () => {
    const s = match();
    const hud = new CombatHud();
    const me = s.players[0];
    expect(hud.frame(0, me, 0, s).hitMarker).toBeNull();
    hud.handleEvents([{ type: 'hit', targetId: 3, sourceId: 0, amount: 6, pos: { x: 0, y: 1, z: 5 } }], s, 0, 1);
    const a = hud.frame(1.01, me, 0, s).hitMarker;
    expect(a).toMatchObject({ strong: false, durationSec: STYLE.hitMarkerSec });
    expect(hud.frame(1 + STYLE.hitMarkerSec + 0.01, me, 0, s).hitMarker).toBeNull();
    hud.handleEvents(
      [
        { type: 'hit', targetId: 3, sourceId: 0, amount: 6, pos: { x: 0, y: 1, z: 5 } },
        { type: 'tackled', targetId: 3, byId: 0 },
      ],
      s,
      0,
      2,
    );
    const b = hud.frame(2.01, me, 0, s).hitMarker;
    expect(b?.strong).toBe(true);
    expect(b?.durationSec).toBe(STYLE.hitMarkerStrongSec);
    expect(b?.seq).not.toBe(a?.seq);
    // Une touche suivante ne remplace pas le hitmarker de plaquage encore affiché.
    hud.handleEvents([{ type: 'hit', targetId: 4, sourceId: 0, amount: 6, pos: { x: 0, y: 1, z: 5 } }], s, 0, 2.05);
    expect(hud.frame(2.06, me, 0, s).hitMarker?.strong).toBe(true);
    // Touches des autres : rien.
    const other = new CombatHud();
    other.handleEvents([{ type: 'hit', targetId: 3, sourceId: 1, amount: 6, pos: { x: 0, y: 1, z: 5 } }], s, 0, 1);
    expect(other.frame(1.01, me, 0, s).hitMarker).toBeNull();
  });

  it('tirs reçus : indicateur tourné vers le tireur (position courante, caméra courante), qui s’estompe ; vignette', () => {
    const s = match();
    const hud = new CombatHud();
    const me = s.players[0];
    me.pos = { x: 0, y: 0, z: 0 };
    s.players[3].pos = { x: -10, y: 0, z: 0 }; // à droite d'une caméra qui regarde +Z
    me.stability = 30;
    hud.handleEvents([{ type: 'hit', targetId: 0, sourceId: 3, amount: 6, pos: { x: 0, y: 1, z: 0 } }], s, 0, 1);
    let f = hud.frame(1.05, me, 0, s);
    expect(f.damage).toHaveLength(1);
    expect(f.damage[0].angleDeg).toBeCloseTo(90, 6);
    expect(f.damage[0].alpha).toBeGreaterThan(0.9);
    expect(f.vignette).toBeGreaterThan(0);
    // La caméra tourne : l'indicateur suit (le tireur est maintenant devant).
    f = hud.frame(1.1, me, -Math.PI / 2, s);
    expect(f.damage[0].angleDeg).toBeCloseTo(0, 6);
    // Même tireur : un seul indicateur rafraîchi.
    hud.handleEvents([{ type: 'hit', targetId: 0, sourceId: 3, amount: 6, pos: { x: 0, y: 1, z: 0 } }], s, 0, 1.2);
    expect(hud.frame(1.21, me, 0, s).damage).toHaveLength(1);
    expect(hud.frame(1.2 + STYLE.damageIndicatorSec + 0.01, me, 0, s).damage).toHaveLength(0);
    // Vignette : nulle jauge pleine (hors flash), maximale à 0.
    me.stability = 100;
    expect(hud.frame(10, me, 0, s).vignette).toBe(0);
    me.stability = 0;
    expect(hud.frame(10, me, 0, s).vignette).toBe(1);
  });
});
