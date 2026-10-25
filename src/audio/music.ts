/**
 * Musique du menu (uniquement le menu) : boucle synthétique entraînante, 8 mesures à 112 BPM, en la mineur
 * (Am – F – C – G, deux fois, la seconde avec une variation). Batterie, basse, nappes et arpège, tous synthétisés.
 *
 * `songNotes(bar)` (pur, testé) décrit les notes d'une mesure ; `MenuMusic` les programme en avance sur l'horloge audio
 * (fenêtre glissante), ce qui garde un tempo parfait même si l'affichage ralentit.
 */

export const MUSIC_BPM = 112;
export const BEATS_PER_BAR = 4;
export const SONG_BARS = 8;

export type Instrument = 'kick' | 'snare' | 'hat' | 'bass' | 'pad' | 'arp' | 'lead';

export interface Note {
  inst: Instrument;
  /** Début, en temps (beats) depuis le début de la mesure. */
  beat: number;
  /** Durée en temps. */
  len: number;
  /** Note MIDI (ignorée pour la batterie). */
  midi: number;
  vel: number;
}

/** Accords (fondamentale MIDI + tierce/quinte) des 4 mesures de la grille. */
const CHORDS: ReadonlyArray<readonly [number, number, number]> = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
/** Mélodie de la seconde moitié (temps, note) : petit motif accrocheur. */
const LEAD: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 76, 1], [1.5, 74, 0.5], [2, 72, 1], [3, 69, 1]],
  [[0, 72, 1.5], [2, 69, 0.5], [2.5, 72, 0.5], [3, 74, 1]],
  [[0, 76, 1], [1, 79, 1], [2, 76, 0.5], [2.5, 74, 0.5], [3, 72, 1]],
  [[0, 74, 2], [2, 71, 1], [3, 74, 1]],
];

export function songNotes(bar: number): Note[] {
  const b = ((bar % SONG_BARS) + SONG_BARS) % SONG_BARS;
  const chord = CHORDS[b % 4];
  const second = b >= 4;
  const notes: Note[] = [];
  // Batterie : grosse caisse sur 1 et 3 (+ contretemps en fin de grille), caisse claire sur 2 et 4, charleston en croches.
  notes.push({ inst: 'kick', beat: 0, len: 0.5, midi: 0, vel: 1 }, { inst: 'kick', beat: 2, len: 0.5, midi: 0, vel: 1 });
  if (b % 4 === 3) notes.push({ inst: 'kick', beat: 3.5, len: 0.5, midi: 0, vel: 0.8 });
  notes.push({ inst: 'snare', beat: 1, len: 0.5, midi: 0, vel: 1 }, { inst: 'snare', beat: 3, len: 0.5, midi: 0, vel: 1 });
  for (let i = 0; i < 8; i++) notes.push({ inst: 'hat', beat: i * 0.5, len: 0.25, midi: 0, vel: i % 2 === 0 ? 0.6 : 1 });
  // Basse en croches : fondamentale grave, octave sur les contretemps.
  for (let i = 0; i < 8; i++) notes.push({ inst: 'bass', beat: i * 0.5, len: 0.45, midi: chord[0] - 24 + (i % 2 === 1 ? 12 : 0), vel: i % 2 === 0 ? 1 : 0.7 });
  // Nappe : l'accord tenu toute la mesure.
  for (const n of chord) notes.push({ inst: 'pad', beat: 0, len: 4, midi: n, vel: 0.6 });
  // Arpège en doubles croches (montant puis descendant), une octave au-dessus.
  const arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1]];
  for (let i = 0; i < 16; i++) notes.push({ inst: 'arp', beat: i * 0.25, len: 0.2, midi: arp[i % arp.length] + 12, vel: 0.5 });
  if (second) for (const [beat, m, len] of LEAD[b % 4]) notes.push({ inst: 'lead', beat, len, midi: m, vel: 0.8 });
  return notes;
}

const freq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Joue une note sur `out` à l'instant `t` (durées en secondes). */
function playNote(ac: BaseAudioContext, out: AudioNode, n: Note, t: number, beatSec: number, noise: AudioBuffer): void {
  const dur = n.len * beatSec;
  const g = ac.createGain();
  g.connect(out);
  const env = (peak: number, attack: number, release: number): void => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, release));
  };
  if (n.inst === 'kick') {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(0.9 * n.vel, 0.002, 0.22);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
    return;
  }
  if (n.inst === 'snare' || n.inst === 'hat') {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = n.inst === 'snare' ? 'bandpass' : 'highpass';
    f.frequency.value = n.inst === 'snare' ? 1800 : 7000;
    f.Q.value = n.inst === 'snare' ? 0.8 : 0.5;
    env((n.inst === 'snare' ? 0.45 : 0.12) * n.vel, 0.002, n.inst === 'snare' ? 0.16 : 0.05);
    s.connect(f);
    f.connect(g);
    s.start(t, Math.random());
    s.stop(t + 0.2);
    return;
  }
  const o = ac.createOscillator();
  o.frequency.value = freq(n.midi);
  if (n.inst === 'bass') {
    o.type = 'sawtooth';
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    o.connect(f);
    f.connect(g);
    env(0.32 * n.vel, 0.005, dur);
  } else if (n.inst === 'pad') {
    o.type = 'triangle';
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06 * n.vel, t + 0.3);
    g.gain.setValueAtTime(0.06 * n.vel, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else if (n.inst === 'arp') {
    o.type = 'square';
    o.connect(g);
    env(0.035 * n.vel, 0.003, dur);
  } else {
    o.type = 'square';
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    o.connect(f);
    f.connect(g);
    env(0.09 * n.vel, 0.01, dur);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Programme toutes les notes de `bars` mesures à partir de `t0` (utilisé aussi pour l'export d'aperçu hors ligne). */
export function scheduleBars(ac: BaseAudioContext, out: AudioNode, t0: number, firstBar: number, bars: number, noise: AudioBuffer): void {
  const beatSec = 60 / MUSIC_BPM;
  for (let i = 0; i < bars; i++) {
    const barStart = t0 + i * BEATS_PER_BAR * beatSec;
    for (const n of songNotes(firstBar + i)) playNote(ac, out, n, barStart + n.beat * beatSec, beatSec, noise);
  }
}

/** Lecteur en boucle : programme une mesure d'avance sur l'horloge audio. */
export class MenuMusic {
  private nextBar = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ac: AudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ac.currentTime + 0.1;
    this.pump();
    this.timer = setInterval(() => this.pump(), 200);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const barSec = (BEATS_PER_BAR * 60) / MUSIC_BPM;
    // Contexte suspendu (onglet en arrière-plan) : on ne prend pas de retard, on repart de maintenant.
    if (this.nextTime < this.ac.currentTime) this.nextTime = this.ac.currentTime + 0.05;
    while (this.nextTime < this.ac.currentTime + barSec) {
      scheduleBars(this.ac, this.out, this.nextTime, this.nextBar, 1, this.noise);
      this.nextBar = (this.nextBar + 1) % SONG_BARS;
      this.nextTime += barSec;
    }
  }
}
