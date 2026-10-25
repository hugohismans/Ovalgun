/**
 * Son : décisions pures (événements -> sons, foule, compte à rebours, anti-rafale) et musique du menu.
 * (Le Web Audio lui-même est vérifié dans Chromium : voir docs/TESTING.md, section Son.)
 */
import { describe, expect, it } from 'vitest';
import { createMatch, TICK_RATE, type MatchEvent } from '../../src/sim';
import { CUE_DEFS, countdownBeep, crowdExcitement, cuesForEvents, Throttle } from '../../src/audio/soundCues';
import { SONG_BARS, songNotes } from '../../src/audio/music';
import { SYNTHS } from '../../src/audio/synth';

const match = () => createMatch({ teamSize: 3, seed: 3, roles: [['pilier', 'ailier', 'demi'], ['pilier', 'ailier', 'demi']] });
const pos = { x: 1, y: 1, z: 2 };

describe('événements -> sons', () => {
  it('chaque son a un bus et une recette', () => {
    for (const k of Object.keys(SYNTHS)) expect(CUE_DEFS[k as keyof typeof CUE_DEFS], k).toBeDefined();
  });

  it('tir : arme selon le projectile ; spatialisé pour les autres, 2D pour soi', () => {
    const s = match();
    const shot = (id: number, kind: 'bullet' | 'pellet' | 'grenade'): MatchEvent => ({ type: 'shot', playerId: id, kind, pos, dir: { x: 0, y: 0, z: 1 } });
    const c = cuesForEvents([shot(4, 'bullet'), shot(3, 'pellet'), shot(0, 'grenade')], s, 0);
    expect(c.map((r) => r.cue)).toEqual(['smg', 'shotgun', 'launcher']);
    expect(c[0].pos).not.toBeNull();
    expect(c[2].pos).toBeNull();
  });

  it('retours personnels réservés au joueur local', () => {
    const s = match();
    const hitByMe = cuesForEvents([{ type: 'hit', targetId: 4, sourceId: 0, amount: 5, pos }], s, 0).map((r) => r.cue);
    expect(hitByMe).toContain('hitmarker');
    const hitByBot = cuesForEvents([{ type: 'hit', targetId: 4, sourceId: 1, amount: 5, pos }], s, 0).map((r) => r.cue);
    expect(hitByBot).not.toContain('hitmarker');
    expect(cuesForEvents([{ type: 'tackled', targetId: 0, byId: 4 }], s, 0).map((r) => r.cue)).toContain('tackledSelf');
    expect(cuesForEvents([{ type: 'tackled', targetId: 4, byId: 0 }], s, 0).map((r) => r.cue)).toContain('tackleConfirm');
    expect(cuesForEvents([{ type: 'pass_denied', playerId: 1 }], s, 0)).toHaveLength(0);
  });

  it('essai : fanfare pour son équipe, thème de défaite pour l’autre, foule dans les deux cas', () => {
    const s = match();
    const ours = cuesForEvents([{ type: 'try', team: 0, scorerId: 1 }], s, 0).map((r) => r.cue);
    const theirs = cuesForEvents([{ type: 'try', team: 1, scorerId: 4 }], s, 0).map((r) => r.cue);
    expect(ours).toEqual(expect.arrayContaining(['fanfare', 'crowdCheer', 'whistleShort']));
    expect(theirs).toEqual(expect.arrayContaining(['defeat', 'crowdCheer']));
  });
});

describe('foule, compte à rebours, anti-rafale', () => {
  it('excitation nulle hors jeu, monte quand le porteur approche de l’en-but adverse', () => {
    const s = match();
    expect(crowdExcitement(s)).toBe(0); // coup d'envoi
    s.phase = 'play';
    const c = s.players[s.ball.carrierId];
    c.pos.z = -s.field.tryLineZ + 2;
    const far = crowdExcitement(s);
    c.pos.z = s.field.tryLineZ - 2;
    const near = crowdExcitement(s);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
  });

  it('bip à chaque seconde affichée 3, 2, 1', () => {
    const beeps: number[] = [];
    for (let t = 3 * TICK_RATE; t > 0; t--) {
      const b = countdownBeep(t + 1, t, TICK_RATE);
      if (b > 0) beeps.push(b);
    }
    expect(beeps).toEqual([3, 2, 1]);
    // Début du décompte (aucune frame précédente en coup d'envoi) : le premier chiffre sonne aussi.
    expect(countdownBeep(0, 2 * TICK_RATE, TICK_RATE)).toBe(2);
    expect(countdownBeep(0, 0, TICK_RATE)).toBe(0);
  });

  it('anti-rafale par clé', () => {
    const t = new Throttle(0.05);
    expect(t.allow('a', 0)).toBe(true);
    expect(t.allow('a', 0.02)).toBe(false);
    expect(t.allow('b', 0.02)).toBe(true);
    expect(t.allow('a', 0.06)).toBe(true);
    expect(t.allow('', 0.06)).toBe(true);
  });
});

describe('musique du menu', () => {
  it('chaque mesure : grosse caisse sur 1 et 3, caisse claire sur 2 et 4, notes dans la mesure et dans une tessiture raisonnable', () => {
    for (let b = 0; b < SONG_BARS; b++) {
      const n = songNotes(b);
      const beats = (inst: string) => n.filter((x) => x.inst === inst).map((x) => x.beat);
      expect(beats('kick')).toEqual(expect.arrayContaining([0, 2]));
      expect(beats('snare')).toEqual([1, 3]);
      for (const x of n) {
        expect(x.beat).toBeGreaterThanOrEqual(0);
        expect(x.beat + x.len).toBeLessThanOrEqual(4 + 1e-9);
        if (!['kick', 'snare', 'hat'].includes(x.inst)) {
          expect(x.midi).toBeGreaterThanOrEqual(24);
          expect(x.midi).toBeLessThanOrEqual(96);
        }
      }
    }
    expect(songNotes(4).some((x) => x.inst === 'lead')).toBe(true);
    expect(songNotes(0).some((x) => x.inst === 'lead')).toBe(false);
    expect(songNotes(SONG_BARS)).toEqual(songNotes(0));
  });
});
