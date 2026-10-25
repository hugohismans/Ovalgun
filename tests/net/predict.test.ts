/**
 * Prédiction côté client : avec de la latence, la position prédite du joueur local correspond exactement à celle que
 * le serveur calculera avec les mêmes entrées ; les événements du joueur local sont joués tout de suite.
 */
import { describe, expect, it } from 'vitest';
import { Buttons, cloneState, createMatch, makeInput, startPlayNow, step, type MatchState, type PlayerInput } from '../../src/sim';
import { isSelfEvent, Predictor } from '../../src/net/predict';

const ME = 0;
const base = (): MatchState => {
  const s = createMatch({ teamSize: 3, seed: 5, roles: [['ailier', 'pilier', 'demi'], ['ailier', 'pilier', 'demi']] });
  startPlayNow(s);
  return s;
};
const frameFor = (s: MatchState, inp: PlayerInput) => {
  const f: Record<number, PlayerInput> = {};
  for (const p of s.players) f[p.id] = p.id === ME ? inp : makeInput({ yaw: p.yaw, pitch: p.pitch });
  return f;
};
const inputAt = (k: number): PlayerInput =>
  makeInput({ moveY: 1, moveX: k > 30 ? 0.6 : 0, yaw: k * 0.01, buttons: (k === 20 ? Buttons.JUMP : 0) | (k === 40 ? Buttons.DODGE : 0) });

describe('Predictor', () => {
  it('réconciliation avec 6 ticks de latence : prédiction = serveur avec toutes les entrées', () => {
    const server = base();
    const pred = new Predictor(ME);
    pred.reset(server);
    const LAT = 6;
    const sent: PlayerInput[] = [];
    let applied = -1;
    for (let k = 0; k < 80; k++) {
      const inp = inputAt(k);
      sent.push(inp);
      pred.advance(inp, k);
      // Le serveur applique les entrées arrivées (latence), instantané tous les 2 ticks.
      while (applied < k - LAT) {
        applied++;
        step(server, frameFor(server, sent[applied]));
      }
      if (k % 2 === 0) pred.reconcile(cloneState(server), applied);
    }
    const reference = base();
    for (const inp of sent) step(reference, frameFor(reference, inp));
    const p = pred.current?.players[ME];
    expect(p?.pos.x).toBeCloseTo(reference.players[ME].pos.x, 9);
    expect(p?.pos.z).toBeCloseTo(reference.players[ME].pos.z, 9);
    expect(pred.pendingCount).toBeGreaterThan(0);
    expect(pred.pendingCount).toBeLessThanOrEqual(LAT + 2);
  });

  it('écart serveur (ex. poussé par un autre) : absorbé en douceur, puis résorbé', () => {
    const server = base();
    const pred = new Predictor(ME);
    pred.reset(server);
    pred.advance(makeInput({ moveY: 1 }), 0);
    const pushed = cloneState(server);
    pushed.players[ME].pos.x += 0.8;
    pred.reconcile(pushed, -1);
    expect(Math.abs(pred.correction.x)).toBeCloseTo(0.8, 1);
    for (let i = 0; i < 60; i++) pred.decay(1 / 60);
    expect(Math.abs(pred.correction.x)).toBeLessThan(0.01);
    // Téléportation (remise en jeu) : pas de lissage.
    const far = cloneState(server);
    far.players[ME].pos.z += 30;
    pred.reconcile(far, -1);
    expect(Math.hypot(pred.correction.x, pred.correction.z)).toBe(0);
  });

  it('événements du joueur local renvoyés immédiatement, ceux des autres ignorés', () => {
    const pred = new Predictor(ME);
    pred.reset(base());
    const ev = pred.advance(makeInput({ buttons: Buttons.JUMP }), 0);
    expect(ev.map((e) => e.type)).toContain('jump');
    expect(isSelfEvent({ type: 'jump', playerId: 3, air: false }, ME)).toBe(false);
    expect(isSelfEvent({ type: 'try', team: 0, scorerId: 0 }, ME)).toBe(false);
  });
});
