/**
 * HUD de la boucle de match (étape 6) : chrono, compte à rebours, « JOUEZ ! », bannière d'essai, dernière minute,
 * écran de fin. Pur : le temps est passé en paramètre.
 */
import { describe, expect, it } from 'vitest';
import { formatClock, MatchHud, TEAM_NAMES } from '../../src/game/matchHud';
import { STYLE } from '../../src/render/palette';
import { createMatch, FIRST_KICKOFF_FREEZE_SEC, secToTicks, step, TICK_RATE, TRY_POINTS, type MatchState } from '../../src/sim';

const match = (): MatchState => createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']] });

describe('formatClock', () => {
  it('m:ss arrondi à la seconde supérieure', () => {
    expect(formatClock(secToTicks(360))).toBe('6:00');
    expect(formatClock(secToTicks(359) + 1)).toBe('6:00');
    expect(formatClock(secToTicks(359))).toBe('5:59');
    expect(formatClock(secToTicks(65))).toBe('1:05');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });
});

describe('MatchHud', () => {
  it('premier coup d’envoi : 3, 2, 1 puis « JOUEZ ! » pendant STYLE.playCallSec', () => {
    const s = match();
    const hud = new MatchHud();
    const seen: number[] = [];
    let t = 0;
    for (let i = 0; i < secToTicks(FIRST_KICKOFF_FREEZE_SEC); i++) {
      const f = hud.frame(s, 0, t);
      if (seen[seen.length - 1] !== f.countdown) seen.push(f.countdown);
      expect(f.playCall).toBe(false);
      step(s, {});
      t = s.tick / TICK_RATE;
      hud.handleEvents(s.events, s, t);
    }
    expect(seen).toEqual([3, 2, 1]);
    const f = hud.frame(s, 0, t);
    expect(f.phase).toBe('play');
    expect(f.countdown).toBe(0);
    expect(f.playCall).toBe(true);
    expect(f.kickoffTeam).toBe(0);
    expect(hud.frame(s, 0, t + STYLE.playCallSec + 0.01).playCall).toBe(false);
    expect(f.clock).toBe('6:00');
    expect(f.score).toEqual([0, 0]);
    expect(f.teamNames).toBe(TEAM_NAMES);
  });

  it('bannière d’essai pendant la pause, dernière minute, écran de fin et délai avant « Rejouer »', () => {
    const s = match();
    const hud = new MatchHud();
    s.phase = 'try';
    s.score = [TRY_POINTS, 0];
    hud.handleEvents([{ type: 'try', team: 0, scorerId: 1 }], s, 10);
    const tb = hud.frame(s, 0, 10).tryBanner;
    expect(tb).toMatchObject({ team: 0, teamName: TEAM_NAMES[0], scorerId: 1, ours: true, mine: false, score: [TRY_POINTS, 0] });
    expect(tb?.scorerLabel).toContain('#1');
    expect(hud.frame(s, 4, 10).tryBanner?.ours).toBe(false); // vu par un joueur de l'équipe 1
    s.phase = 'play';
    expect(hud.frame(s, 0, 10).tryBanner).toBeNull();
    s.lastMinute = true;
    hud.handleEvents([{ type: 'last_minute' }], s, 20);
    expect(hud.frame(s, 0, 20.5).lastMinuteBanner).toBe(true);
    expect(hud.frame(s, 0, 20 + STYLE.lastMinuteBannerSec + 0.01).lastMinuteBanner).toBe(false);
    expect(hud.frame(s, 0, 21).lastMinute).toBe(true);
    // Fin : score, résultat, stats (équipe locale d'abord), délai avant de rejouer.
    s.phase = 'ended';
    s.score = [TRY_POINTS, 2 * TRY_POINTS];
    s.players[0].stats = { tries: 1, tackles: 2, passes: 3, interceptions: 1, shotsFired: 40, shotsHit: 10 };
    hud.handleEvents([{ type: 'match_end', score: [TRY_POINTS, 2 * TRY_POINTS] }], s, 30);
    const fin = hud.frame(s, 0, 30.2).final;
    expect(fin?.outcome).toBe('loss');
    expect(fin?.winner).toBe(1);
    expect(fin?.canReplay).toBe(false);
    expect(hud.canReplay(30 + STYLE.endScreenInputDelaySec)).toBe(true);
    expect(fin?.players.map((p) => p.team)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(fin?.players[0]).toMatchObject({ id: 0, local: true, tries: 1, tackles: 2, passes: 3, interceptions: 1, accuracy: 0.25 });
    expect(fin?.players[1].accuracy).toBeNull(); // n'a pas tiré
    expect(hud.frame(s, 4, 31).final?.outcome).toBe('win');
    expect(hud.frame(s, 4, 31).final?.players[0].team).toBe(1);
    s.score = [0, 0];
    expect(hud.frame(s, 0, 31).final?.outcome).toBe('draw');
    hud.reset();
    expect(hud.canReplay(1e9)).toBe(false);
  });

  it('entraînement : drapeau transmis', () => {
    const s = createMatch({ teamSize: 3, seed: 1, roles: [['ailier', 'demi', 'pilier'], ['ailier', 'demi', 'pilier']], training: true });
    expect(new MatchHud().frame(s, 0, 0).training).toBe(true);
  });
});
