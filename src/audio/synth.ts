/**
 * Recettes de sons synthétiques (Web Audio, aucun fichier) : chaque recette joue un son complet à l'instant `t` sur la
 * sortie `out` et renvoie sa durée (s). Elles marchent sur un AudioContext comme sur un OfflineAudioContext (tests,
 * export d'aperçu). Style « arcade » : sons courts, punchy, lisibles par-dessus l'action.
 *
 * Pour remplacer un son par un fichier enregistré plus tard : soundBank.ts (une entrée `url` à la place de `synth`).
 */

export interface SynthParams {
  /** Multiplicateur de hauteur (1 = nominal). */
  pitch: number;
  /** Multiplicateur de volume (1 = nominal). */
  gain: number;
}

export type Synth = (ac: BaseAudioContext, out: AudioNode, t: number, p: SynthParams) => number;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Bruit blanc de 2 s partagé par contexte (lu à un décalage aléatoire pour varier). */
function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ac);
  if (b === undefined) {
    b = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ac, b);
  }
  return b;
}

/** Enveloppe percussive : montée linéaire en `attack`, puis décroissance exponentielle jusqu'à `t + dur`. */
function envelope(ac: BaseAudioContext, out: AudioNode, t: number, peak: number, attack: number, dur: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.005, dur));
  g.connect(out);
  return g;
}

/** Oscillateur avec glissement de fréquence `f0 -> f1` sur `dur`. */
function tone(ac: BaseAudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.004): void {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.connect(envelope(ac, out, t, peak, attack, dur));
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Bruit filtré (passe-bande / bas / haut), fréquence du filtre `f0 -> f1` sur `dur`. */
function noise(ac: BaseAudioContext, out: AudioNode, filter: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number, peak: number, attack = 0.002): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  src.connect(f);
  f.connect(envelope(ac, out, t, peak, attack, dur));
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/** Sifflet d'arbitre : sinus aigu modulé par un trille rapide. */
function whistleTone(ac: BaseAudioContext, out: AudioNode, t: number, dur: number, f: number, peak: number): void {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 28;
  const depth = ac.createGain();
  depth.gain.value = f * 0.045;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.02);
  g.gain.setValueAtTime(peak, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export const SYNTHS = {
  // --- Armes ---
  smg: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 3200 * p.pitch, 1400 * p.pitch, 0.9, t, 0.07, 0.55 * p.gain);
    tone(ac, out, 'square', 220 * p.pitch, 70 * p.pitch, t, 0.04, 0.18 * p.gain);
    return 0.08;
  },
  shotgun: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 2600 * p.pitch, 300, 0.7, t, 0.32, 0.8 * p.gain);
    tone(ac, out, 'sine', 110 * p.pitch, 38, t, 0.22, 0.7 * p.gain);
    noise(ac, out, 'highpass', 4000, 4000, 0.5, t, 0.04, 0.3 * p.gain);
    return 0.34;
  },
  launcher: (ac, out, t, p) => {
    tone(ac, out, 'sine', 340 * p.pitch, 110 * p.pitch, t, 0.16, 0.55 * p.gain);
    noise(ac, out, 'lowpass', 900, 300, 0.6, t, 0.14, 0.35 * p.gain);
    return 0.17;
  },
  explosion: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 2400 * p.pitch, 140, 0.6, t, 1.0, 1.0 * p.gain, 0.004);
    tone(ac, out, 'sine', 75 * p.pitch, 28, t, 0.7, 0.9 * p.gain);
    noise(ac, out, 'highpass', 3000, 3000, 0.6, t, 0.06, 0.45 * p.gain);
    return 1.0;
  },
  reload: (ac, out, t, p) => {
    tone(ac, out, 'square', 1300 * p.pitch, 900 * p.pitch, t, 0.02, 0.12 * p.gain);
    noise(ac, out, 'bandpass', 2400 * p.pitch, 2400, 4, t + 0.18, 0.05, 0.4 * p.gain);
    tone(ac, out, 'square', 700 * p.pitch, 500 * p.pitch, t + 0.19, 0.03, 0.12 * p.gain);
    return 0.25;
  },
  // --- Impacts et plaquage ---
  impact: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 1100 * p.pitch, 600, 2, t, 0.06, 0.5 * p.gain);
    tone(ac, out, 'sine', 240 * p.pitch, 120 * p.pitch, t, 0.07, 0.35 * p.gain);
    return 0.08;
  },
  hitmarker: (ac, out, t, p) => {
    tone(ac, out, 'triangle', 1900 * p.pitch, 1900 * p.pitch, t, 0.045, 0.3 * p.gain, 0.002);
    tone(ac, out, 'sine', 2850 * p.pitch, 2850 * p.pitch, t, 0.03, 0.12 * p.gain, 0.002);
    return 0.05;
  },
  tackleConfirm: (ac, out, t, p) => {
    tone(ac, out, 'square', midi(76) * p.pitch, midi(76) * p.pitch, t, 0.07, 0.16 * p.gain);
    tone(ac, out, 'square', midi(83) * p.pitch, midi(83) * p.pitch, t + 0.07, 0.12, 0.16 * p.gain);
    return 0.2;
  },
  shieldBlock: (ac, out, t, p) => {
    tone(ac, out, 'triangle', 1420 * p.pitch, 1380 * p.pitch, t, 0.3, 0.3 * p.gain, 0.001);
    tone(ac, out, 'triangle', 1890 * p.pitch, 1860 * p.pitch, t, 0.22, 0.2 * p.gain, 0.001);
    noise(ac, out, 'bandpass', 5000, 5000, 3, t, 0.03, 0.3 * p.gain);
    return 0.3;
  },
  bodyFall: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 500 * p.pitch, 120, 0.8, t, 0.3, 0.75 * p.gain);
    tone(ac, out, 'sine', 85 * p.pitch, 38, t, 0.25, 0.7 * p.gain);
    return 0.3;
  },
  tackledSelf: (ac, out, t, p) => {
    tone(ac, out, 'sine', 70, 30, t, 0.5, 0.9 * p.gain);
    noise(ac, out, 'lowpass', 700, 90, 0.8, t, 0.45, 0.8 * p.gain);
    tone(ac, out, 'sawtooth', midi(57) * p.pitch, midi(45) * p.pitch, t + 0.05, 0.4, 0.08 * p.gain);
    return 0.5;
  },
  getup: (ac, out, t, p) => {
    tone(ac, out, 'sine', 300 * p.pitch, 520 * p.pitch, t, 0.18, 0.18 * p.gain);
    return 0.2;
  },
  // --- Mouvement ---
  footstep: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 1100 * p.pitch, 400, 0.7, t, 0.06, 0.35 * p.gain);
    tone(ac, out, 'sine', 95 * p.pitch, 60, t, 0.05, 0.25 * p.gain);
    return 0.07;
  },
  jump: (ac, out, t, p) => {
    tone(ac, out, 'sine', 280 * p.pitch, 560 * p.pitch, t, 0.12, 0.2 * p.gain);
    noise(ac, out, 'bandpass', 1500, 2600, 1, t, 0.1, 0.12 * p.gain);
    return 0.13;
  },
  land: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 600, 150, 0.7, t, 0.1, 0.5 * p.gain);
    tone(ac, out, 'sine', 90, 50, t, 0.08, 0.35 * p.gain);
    return 0.11;
  },
  whoosh: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 700 * p.pitch, 2600 * p.pitch, 1.4, t, 0.24, 0.5 * p.gain, 0.04);
    return 0.25;
  },
  dive: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 500 * p.pitch, 2200 * p.pitch, 1.2, t, 0.45, 0.6 * p.gain, 0.06);
    tone(ac, out, 'sine', 180 * p.pitch, 90, t + 0.3, 0.15, 0.3 * p.gain);
    return 0.46;
  },
  slide: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 1400 * p.pitch, 700, 0.8, t, 0.55, 0.4 * p.gain, 0.05);
    return 0.56;
  },
  climb: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 900, 400, 0.7, t, 0.05, 0.3 * p.gain);
    noise(ac, out, 'lowpass', 900, 400, 0.7, t + 0.09, 0.05, 0.3 * p.gain);
    return 0.15;
  },
  // --- Capacités ---
  abilityBoost: (ac, out, t, p) => {
    tone(ac, out, 'sawtooth', 180 * p.pitch, 900 * p.pitch, t, 0.35, 0.14 * p.gain, 0.02);
    noise(ac, out, 'bandpass', 800, 4000, 1, t, 0.35, 0.25 * p.gain, 0.05);
    return 0.36;
  },
  abilityShield: (ac, out, t, p) => {
    tone(ac, out, 'sine', 220 * p.pitch, 330 * p.pitch, t, 0.45, 0.3 * p.gain, 0.08);
    tone(ac, out, 'triangle', 660 * p.pitch, 990 * p.pitch, t, 0.4, 0.12 * p.gain, 0.08);
    return 0.46;
  },
  abilityZone: (ac, out, t, p) => {
    tone(ac, out, 'sine', 520 * p.pitch, 180 * p.pitch, t, 0.5, 0.3 * p.gain, 0.01);
    tone(ac, out, 'sine', 260 * p.pitch, 90 * p.pitch, t + 0.05, 0.5, 0.25 * p.gain, 0.01);
    return 0.56;
  },
  // --- Ballon ---
  pickup: (ac, out, t, p) => {
    tone(ac, out, 'sine', 520 * p.pitch, 900 * p.pitch, t, 0.09, 0.35 * p.gain);
    noise(ac, out, 'lowpass', 800, 300, 0.7, t, 0.05, 0.25 * p.gain);
    return 0.1;
  },
  pass: (ac, out, t, p) => {
    noise(ac, out, 'lowpass', 600, 200, 0.7, t, 0.05, 0.35 * p.gain);
    noise(ac, out, 'bandpass', 900 * p.pitch, 2000 * p.pitch, 1.5, t, 0.2, 0.3 * p.gain, 0.03);
    return 0.21;
  },
  catch: (ac, out, t, p) => {
    tone(ac, out, 'sine', 190 * p.pitch, 120 * p.pitch, t, 0.07, 0.5 * p.gain);
    noise(ac, out, 'lowpass', 900, 300, 0.7, t, 0.05, 0.35 * p.gain);
    return 0.08;
  },
  kick: (ac, out, t, p) => {
    tone(ac, out, 'sine', 140 * p.pitch, 48, t, 0.14, 0.9 * p.gain);
    noise(ac, out, 'bandpass', 1800, 600, 1, t, 0.06, 0.5 * p.gain);
    return 0.15;
  },
  bounce: (ac, out, t, p) => {
    tone(ac, out, 'sine', 170 * p.pitch, 95 * p.pitch, t, 0.09, 0.5 * p.gain);
    noise(ac, out, 'lowpass', 500, 200, 0.7, t, 0.05, 0.25 * p.gain);
    return 0.1;
  },
  interception: (ac, out, t, p) => {
    [72, 67, 63].forEach((n, i) => tone(ac, out, 'square', midi(n) * p.pitch, midi(n) * p.pitch, t + i * 0.07, 0.09, 0.12 * p.gain));
    return 0.25;
  },
  // --- Match ---
  whistleShort: (ac, out, t, p) => {
    whistleTone(ac, out, t, 0.28, 2700 * p.pitch, 0.25 * p.gain);
    return 0.3;
  },
  whistlePlay: (ac, out, t, p) => {
    whistleTone(ac, out, t, 0.18, 2700 * p.pitch, 0.25 * p.gain);
    whistleTone(ac, out, t + 0.24, 0.45, 2700 * p.pitch, 0.25 * p.gain);
    return 0.7;
  },
  whistleLong: (ac, out, t, p) => {
    whistleTone(ac, out, t, 0.25, 2700 * p.pitch, 0.25 * p.gain);
    whistleTone(ac, out, t + 0.32, 0.25, 2700 * p.pitch, 0.25 * p.gain);
    whistleTone(ac, out, t + 0.64, 1.1, 2700 * p.pitch, 0.25 * p.gain);
    return 1.75;
  },
  horn: (ac, out, t, p) => {
    const g = ac.createBiquadFilter();
    g.type = 'lowpass';
    g.frequency.value = 1100;
    g.connect(out);
    tone(ac, g, 'sawtooth', 220 * p.pitch, 220 * p.pitch, t, 0.7, 0.18 * p.gain, 0.04);
    tone(ac, g, 'sawtooth', 277 * p.pitch, 277 * p.pitch, t, 0.7, 0.14 * p.gain, 0.04);
    return 0.72;
  },
  scrumWon: (ac, out, t, p) => {
    [67, 71, 74].forEach((n, i) => tone(ac, out, 'triangle', midi(n) * p.pitch, midi(n) * p.pitch, t + i * 0.06, 0.18, 0.2 * p.gain));
    return 0.32;
  },
  alarm: (ac, out, t, p) => {
    for (let i = 0; i < 3; i++) {
      tone(ac, out, 'square', 880 * p.pitch, 880 * p.pitch, t + i * 0.22, 0.1, 0.12 * p.gain, 0.002);
      tone(ac, out, 'square', 660 * p.pitch, 660 * p.pitch, t + i * 0.22 + 0.11, 0.1, 0.12 * p.gain, 0.002);
    }
    return 0.66;
  },
  countdown: (ac, out, t, p) => {
    tone(ac, out, 'sine', 660 * p.pitch, 660 * p.pitch, t, 0.14, 0.3 * p.gain, 0.003);
    return 0.15;
  },
  countdownGo: (ac, out, t, p) => {
    tone(ac, out, 'sine', 990 * p.pitch, 990 * p.pitch, t, 0.35, 0.32 * p.gain, 0.003);
    tone(ac, out, 'triangle', 1980 * p.pitch, 1980 * p.pitch, t, 0.2, 0.08 * p.gain, 0.003);
    return 0.36;
  },
  fanfare: (ac, out, t, p) => {
    [60, 64, 67, 72].forEach((n, i) => tone(ac, out, 'square', midi(n) * p.pitch, midi(n) * p.pitch, t + i * 0.09, 0.14, 0.11 * p.gain));
    [72, 76, 79].forEach((n) => tone(ac, out, 'triangle', midi(n) * p.pitch, midi(n) * p.pitch, t + 0.36, 0.7, 0.13 * p.gain, 0.01));
    return 1.08;
  },
  defeat: (ac, out, t, p) => {
    [67, 63, 60].forEach((n, i) => tone(ac, out, 'triangle', midi(n) * p.pitch, midi(n) * p.pitch, t + i * 0.16, 0.3, 0.14 * p.gain, 0.01));
    return 0.8;
  },
  crowdCheer: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 900 * p.pitch, 1300 * p.pitch, 0.6, t, 2.6, 0.55 * p.gain, 0.25);
    noise(ac, out, 'bandpass', 2400 * p.pitch, 2000 * p.pitch, 0.8, t + 0.05, 2.2, 0.3 * p.gain, 0.2);
    return 2.6;
  },
  crowdOoh: (ac, out, t, p) => {
    noise(ac, out, 'bandpass', 420 * p.pitch, 520 * p.pitch, 3, t, 0.9, 0.5 * p.gain, 0.12);
    return 0.9;
  },
  heartbeat: (ac, out, t, p) => {
    tone(ac, out, 'sine', 62, 40, t, 0.12, 0.6 * p.gain, 0.01);
    tone(ac, out, 'sine', 58, 38, t + 0.17, 0.12, 0.45 * p.gain, 0.01);
    return 0.3;
  },
  // --- Interface ---
  uiMove: (ac, out, t, p) => {
    tone(ac, out, 'sine', 880 * p.pitch, 880 * p.pitch, t, 0.035, 0.12 * p.gain, 0.002);
    return 0.04;
  },
  uiConfirm: (ac, out, t, p) => {
    tone(ac, out, 'triangle', 660 * p.pitch, 660 * p.pitch, t, 0.06, 0.2 * p.gain, 0.002);
    tone(ac, out, 'triangle', 990 * p.pitch, 990 * p.pitch, t + 0.06, 0.1, 0.2 * p.gain, 0.002);
    return 0.16;
  },
  uiBack: (ac, out, t, p) => {
    tone(ac, out, 'triangle', 600 * p.pitch, 380 * p.pitch, t, 0.1, 0.18 * p.gain, 0.002);
    return 0.11;
  },
  uiError: (ac, out, t, p) => {
    tone(ac, out, 'square', 170 * p.pitch, 150 * p.pitch, t, 0.14, 0.12 * p.gain, 0.002);
    return 0.15;
  },
} satisfies Record<string, Synth>;

export type SynthName = keyof typeof SYNTHS;

/**
 * Niveau de chaque son (multiplicateur appliqué par le moteur) : équilibre le mixage sans toucher aux recettes.
 * Mesuré par rendu hors ligne (crête visée ~0,3 – 0,9 avant le compresseur de sortie).
 */
export const SYNTH_LEVEL: Readonly<Partial<Record<SynthName, number>>> = {
  shotgun: 0.7,
  explosion: 0.6,
  tackledSelf: 0.85,
  pass: 2.6,
  climb: 2.5,
  reload: 1.8,
  crowdOoh: 2.5,
  interception: 1.8,
  alarm: 2,
  defeat: 1.6,
  tackleConfirm: 1.6,
  uiError: 1.5,
};
