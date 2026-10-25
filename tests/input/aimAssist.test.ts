/**
 * Aide à la visée manette : ralentit près d'une cible, rien loin de toute cible, ignore coéquipiers
 * et joueurs au sol, suivi borné et seulement quand le joueur agit.
 */
import { describe, expect, it } from 'vitest';
import { AimAssist, aimAssistApplies, findAssistTarget, type AimAssistQuery, type AssistCandidate } from '../../src/input/aimAssist';
import { createMatch, debugGiveBall, startPlayNow } from '../../src/sim';
import {
  AIM_ASSIST_ANGLE_DEG,
  AIM_ASSIST_MAX_TRACK_DEG_PER_SEC,
  AIM_ASSIST_SLOWDOWN,
  PLAYER_HEIGHT,
} from '../../src/sim/constants';

const DEG = Math.PI / 180;
const cand = (id: number, team: 0 | 1, x: number, z: number, status: AssistCandidate['status'] = 'active'): AssistCandidate => ({
  id,
  team,
  status,
  x,
  y: 0,
  z,
  height: PLAYER_HEIGHT,
});

function query(candidates: AssistCandidate[], extra: Partial<AimAssistQuery> = {}): AimAssistQuery {
  return {
    candidates: [cand(0, 0, 0, 0), ...candidates],
    selfId: 0,
    selfTeam: 0,
    origin: { x: 0, y: 1.6, z: 0 },
    yaw: 0,
    pitch: 0,
    range: 45,
    dt: 1 / 60,
    inputActive: true,
    ...extra,
  };
}

describe('aide à la visée', () => {
  it('ralentit la caméra quand la visée est sur un adversaire actif à portée', () => {
    const a = new AimAssist();
    const r = a.update(query([cand(3, 1, 0, 12)]));
    expect(r.targetId).toBe(3);
    expect(r.slowdown).toBeCloseTo(AIM_ASSIST_SLOWDOWN, 6);
  });

  it('effet progressif : plus faible au bord du cône', () => {
    const a = new AimAssist();
    // Adversaire décalé latéralement : à ~ (cône − 1°) du bord de sa capsule.
    const d = 12;
    const ang = (AIM_ASSIST_ANGLE_DEG - 1) * DEG + Math.atan(0.45 / d);
    const r = a.update(query([cand(3, 1, Math.tan(ang) * d, d)]));
    expect(r.targetId).toBe(3);
    expect(r.slowdown).toBeGreaterThan(AIM_ASSIST_SLOWDOWN);
    expect(r.slowdown).toBeLessThan(1);
  });

  it('aucun effet loin de toute cible, hors de portée ou derrière', () => {
    const a = new AimAssist();
    expect(a.update(query([cand(3, 1, 8, 10)])).slowdown).toBe(1); // ~38° à côté
    expect(a.update(query([cand(3, 1, 0, 60)])).targetId).toBe(-1); // au-delà de la portée
    expect(a.update(query([cand(3, 1, 0, -10)])).targetId).toBe(-1); // derrière
  });

  it('ignore les coéquipiers, les joueurs au sol / qui se relèvent, et soi-même', () => {
    const a = new AimAssist();
    expect(a.update(query([cand(1, 0, 0, 12)])).targetId).toBe(-1);
    expect(a.update(query([cand(3, 1, 0, 12, 'down')])).targetId).toBe(-1);
    expect(a.update(query([cand(3, 1, 0, 12, 'getting_up')])).targetId).toBe(-1);
    expect(findAssistTarget(query([]))).toBeNull();
  });

  it('choisit la cible la plus proche angulairement', () => {
    const r = findAssistTarget(query([cand(3, 1, 0.6, 12), cand(4, 1, 0.05, 20)]));
    expect(r?.candidate.id).toBe(4);
  });

  it('suivi : suit le déplacement de la cible, borné, jamais sans action du joueur', () => {
    const a = new AimAssist();
    const dt = 1 / 60;
    expect(a.update(query([cand(3, 1, 0, 12)], { dt })).yawCorrection).toBe(0); // première frame
    // La cible se déplace vers +X (yaw croissant) : correction positive, bornée.
    const r = a.update(query([cand(3, 1, 0.2, 12)], { dt }));
    expect(r.yawCorrection).toBeGreaterThan(0);
    expect(r.yawCorrection).toBeLessThanOrEqual(AIM_ASSIST_MAX_TRACK_DEG_PER_SEC * DEG * dt + 1e-12);
    // Sans action du joueur : aucune correction (pas d'auto-visée).
    const idle = a.update(query([cand(3, 1, 0.4, 12)], { dt, inputActive: false }));
    expect(idle.yawCorrection).toBe(0);
    expect(idle.pitchCorrection).toBe(0);
  });

  it('désactivable', () => {
    const a = new AimAssist();
    a.enabled = false;
    const r = a.update(query([cand(3, 1, 0, 12)]));
    expect(r.slowdown).toBe(1);
    expect(r.targetId).toBe(-1);
  });
});

describe('aide à la visée : quand elle s’applique (étape 7)', () => {
  /** Match 3v3 en jeu (rôles : 0 pilier, 1 ailier, 2 demi), ballon libre loin des joueurs. */
  function match() {
    const s = createMatch({ teamSize: 3, seed: 1, roles: [['pilier', 'ailier', 'demi'], ['pilier', 'ailier', 'demi']] });
    startPlayNow(s);
    s.ball.mode = 'loose';
    s.ball.carrierId = -1;
    return s;
  }

  it('armes en ligne droite, joueur qui peut tirer : oui ; bouclier levé, porteur, au sol, lance-grenades : non', () => {
    const s = match();
    expect(aimAssistApplies(s, s.players[1])).toBe(true); // ailier
    expect(aimAssistApplies(s, s.players[0])).toBe(true); // pilier, bouclier baissé
    expect(aimAssistApplies(s, s.players[2])).toBe(false); // demi : tir en cloche
    s.players[0].abilityTicks = 10; // bouclier levé : pas de tir
    expect(aimAssistApplies(s, s.players[0])).toBe(false);
    s.players[1].status = 'down';
    expect(aimAssistApplies(s, s.players[1])).toBe(false);
    const t = match();
    debugGiveBall(t, 1);
    expect(aimAssistApplies(t, t.players[1])).toBe(false); // porteur
  });
});
