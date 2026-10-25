/**
 * Moteur audio (Web Audio) : bus de mixage (effets, interface, ambiance, musique) sous un volume général, sons
 * spatialisés autour de la caméra, limite de voix par priorité, anti-rafale, ambiance de foule qui suit l'excitation
 * du match, battements de cœur quand la stabilité du joueur est basse, pas des joueurs, compte à rebours, musique du
 * menu.
 *
 * Les navigateurs n'autorisent le son qu'après une interaction : le contexte est créé / repris au premier clic, touche
 * ou appui tactile (`unlock`). Avant, tout appel est simplement ignoré. Aucune dépendance au rendu : la session passe la
 * pose de la caméra en nombres.
 */

import { ROLES, TICK_RATE, type MatchEvent, type MatchState, type Vec3 } from '../sim';
import { MenuMusic } from './music';
import { CUE_DEFS, countdownBeep, crowdExcitement, cuesForEvents, Throttle, type Bus, type CueRequest } from './soundCues';
import { SYNTH_LEVEL, SYNTHS, type SynthName } from './synth';

/** Réglages de mixage (valeurs purement sonores). */
export const AUDIO_MIX = {
  master: 0.9,
  sfx: 0.8,
  ui: 0.7,
  ambience: 0.5,
  music: 0.45,
  /** Atténuation des effets et de l'ambiance pendant la pause. */
  pauseDuck: 0.25,
  /** Voix simultanées max (au-delà, les sons les moins prioritaires sont abandonnés). */
  maxVoices: 28,
  /** Anti-rafale par clé (s). */
  throttleSec: 0.045,
  /** Spatialisation : distance de référence, distance max (m), atténuation. */
  refDistance: 5,
  maxDistance: 90,
  rolloff: 1.1,
  /** Foule : volume du fond sonore au repos et au maximum d'excitation, lissage (1/s). */
  crowdBase: 0.06,
  crowdMax: 0.32,
  crowdRate: 1.5,
  /** Pas : longueur de foulée (m), vitesse mini (m/s), distance max d'audition (m). */
  strideM: 1.7,
  stepMinSpeed: 1.5,
  stepMaxDist: 28,
  /** Battements de cœur sous cette fraction de stabilité, intervalle (s). */
  heartbeatBelow: 0.35,
  heartbeatSec: 0.75,
  /** Fondu de la musique (s). */
  musicFadeSec: 1.2,
} as const;

/** Pose de l'auditeur (caméra). */
export interface ListenerPose {
  pos: Vec3;
  fwd: Vec3;
  up: Vec3;
}

interface Voice {
  end: number;
  priority: number;
}

export class AudioEngine {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus | 'music', GainNode>();
  private noise: AudioBuffer | null = null;
  private music: MenuMusic | null = null;
  private crowdGain: GainNode | null = null;
  private voices: Voice[] = [];
  private readonly throttle = new Throttle(AUDIO_MIX.throttleSec);
  private volume = 0.8;
  private musicVolume = 0.7;
  private musicWanted = false;
  private paused = false;
  private sfxEnabled = true;
  private crowd = 0;
  private stepPhase: number[] = [];
  private lastPhaseTicks = 0;
  private nextHeartbeat = 0;
  private unlockBound = false;

  /** Crée / reprend le contexte audio au premier geste de l'utilisateur. */
  unlock(target: Window): void {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const resume = (): void => {
      this.ensure();
      void this.ac?.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) target.addEventListener(ev, resume, { passive: true });
  }

  private ensure(): AudioContext | null {
    if (this.ac !== null) return this.ac;
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (Ctor === undefined) return null;
    const ac = new Ctor();
    this.ac = ac;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ac.destination);
    this.master = ac.createGain();
    this.master.gain.value = AUDIO_MIX.master * this.volume;
    this.master.connect(comp);
    for (const [bus, level] of [['sfx', AUDIO_MIX.sfx], ['ui', AUDIO_MIX.ui], ['ambience', AUDIO_MIX.ambience], ['music', 0]] as const) {
      const g = ac.createGain();
      g.gain.value = level;
      g.connect(this.master);
      this.buses.set(bus, g);
    }
    this.noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startCrowdBed(ac);
    this.music = new MenuMusic(ac, this.bus('music'), this.noise);
    this.applyBusLevels(0);
    if (this.musicWanted) this.setMusic(true);
    return ac;
  }

  private bus(b: Bus | 'music'): GainNode {
    const g = this.buses.get(b);
    if (g === undefined) throw new Error(`bus audio inconnu : ${b}`);
    return g;
  }

  /** Fond sonore de foule : bruit filtré en boucle, volume piloté par l'excitation du match. */
  private startCrowdBed(ac: AudioContext): void {
    if (this.noise === null) return;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const low = ac.createBiquadFilter();
    low.type = 'bandpass';
    low.frequency.value = 650;
    low.Q.value = 0.5;
    const high = ac.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 2200;
    this.crowdGain = ac.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(low);
    low.connect(high);
    high.connect(this.crowdGain);
    this.crowdGain.connect(this.bus('ambience'));
    src.start();
  }

  /** Volume général 0..1 (réglages). */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master !== null && this.ac !== null) this.master.gain.setTargetAtTime(AUDIO_MIX.master * this.volume, this.ac.currentTime, 0.05);
  }

  /** Volume de la musique 0..1 (réglages). */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    if (this.musicWanted && this.ac !== null) this.bus('music').gain.setTargetAtTime(AUDIO_MIX.music * this.musicVolume, this.ac.currentTime, 0.05);
  }

  /** Musique du menu : fondu d'entrée / de sortie. */
  setMusic(on: boolean): void {
    if (on === this.musicWanted && (!on || (this.music?.playing ?? false))) return;
    this.musicWanted = on;
    const ac = this.ac;
    if (ac === null || this.music === null) return;
    const g = this.bus('music').gain;
    g.cancelScheduledValues(ac.currentTime);
    g.setTargetAtTime(on ? AUDIO_MIX.music * this.musicVolume : 0, ac.currentTime, AUDIO_MIX.musicFadeSec / 3);
    if (on) this.music.start();
    else setTimeout(() => {
      if (!this.musicWanted) this.music?.stop();
    }, AUDIO_MIX.musicFadeSec * 1000);
  }

  /** Effets de jeu actifs (faux en fond de menu : seule la musique joue) et pause (effets et foule atténués). */
  setGameState(sfxEnabled: boolean, paused: boolean): void {
    if (sfxEnabled === this.sfxEnabled && paused === this.paused) return;
    this.sfxEnabled = sfxEnabled;
    this.paused = paused;
    this.applyBusLevels(0.15);
  }

  private applyBusLevels(tau: number): void {
    const ac = this.ac;
    if (ac === null) return;
    const duck = this.paused ? AUDIO_MIX.pauseDuck : 1;
    const on = this.sfxEnabled ? 1 : 0;
    const set = (b: Bus, level: number): void => {
      const g = this.bus(b).gain;
      if (tau <= 0) g.value = level;
      else g.setTargetAtTime(level, ac.currentTime, tau);
    };
    set('sfx', AUDIO_MIX.sfx * duck * on);
    set('ambience', AUDIO_MIX.ambience * duck * on);
  }

  /** Joue un son (2D si `pos` est null). */
  play(name: SynthName, pos: Vec3 | null = null, gain = 1, pitch = 1): void {
    const ac = this.ac;
    if (ac === null || ac.state !== 'running') return;
    const def = CUE_DEFS[name];
    const now = ac.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= AUDIO_MIX.maxVoices) {
      const weakest = this.voices.reduce((m, v) => Math.min(m, v.priority), Infinity);
      if (def.priority <= weakest) return;
    }
    let out: AudioNode = this.bus(def.bus);
    if (pos !== null) {
      const pan = ac.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = AUDIO_MIX.refDistance;
      pan.maxDistance = AUDIO_MIX.maxDistance;
      pan.rolloffFactor = AUDIO_MIX.rolloff;
      pan.positionX.value = pos.x;
      pan.positionY.value = pos.y;
      pan.positionZ.value = pos.z;
      pan.connect(out);
      out = pan;
    }
    // Petite variation de hauteur : deux tirs identiques ne sonnent jamais exactement pareil.
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    const dur = SYNTHS[name](ac, out, now + 0.005, { pitch: pitch * jitter, gain: gain * (SYNTH_LEVEL[name] ?? 1) });
    this.voices.push({ end: now + dur, priority: def.priority });
  }

  /** Son d'interface (navigation des menus). */
  ui(kind: 'move' | 'confirm' | 'back' | 'error'): void {
    this.play(kind === 'move' ? 'uiMove' : kind === 'confirm' ? 'uiConfirm' : kind === 'back' ? 'uiBack' : 'uiError');
  }

  /** Sons des événements d'un tick. */
  handleEvents(events: readonly MatchEvent[], state: MatchState, localId: number): void {
    if (this.ac === null || !this.sfxEnabled) return;
    const now = this.ac.currentTime;
    for (const r of cuesForEvents(events, state, localId)) this.request(r, now);
  }

  private request(r: CueRequest, now: number): void {
    if (!this.throttle.allow(r.throttleKey, now)) return;
    this.play(r.cue, r.pos, r.gain, r.pitch);
  }

  /** Une frame : auditeur, foule, pas, battements de cœur, compte à rebours. */
  frame(dt: number, state: MatchState, localId: number, listener: ListenerPose): void {
    const ac = this.ac;
    if (ac === null || ac.state !== 'running') return;
    const L = ac.listener;
    const t = ac.currentTime;
    if (L.positionX !== undefined) {
      L.positionX.setTargetAtTime(listener.pos.x, t, 0.02);
      L.positionY.setTargetAtTime(listener.pos.y, t, 0.02);
      L.positionZ.setTargetAtTime(listener.pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(listener.fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(listener.fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(listener.fwd.z, t, 0.02);
      L.upX.setTargetAtTime(listener.up.x, t, 0.02);
      L.upY.setTargetAtTime(listener.up.y, t, 0.02);
      L.upZ.setTargetAtTime(listener.up.z, t, 0.02);
    } else {
      L.setPosition(listener.pos.x, listener.pos.y, listener.pos.z);
      L.setOrientation(listener.fwd.x, listener.fwd.y, listener.fwd.z, listener.up.x, listener.up.y, listener.up.z);
    }
    if (!this.sfxEnabled) return;

    // Foule.
    const target = this.paused ? 0 : crowdExcitement(state);
    this.crowd += (target - this.crowd) * (1 - Math.exp(-AUDIO_MIX.crowdRate * dt));
    const level = state.phase === 'ended' ? AUDIO_MIX.crowdBase * 0.5 : AUDIO_MIX.crowdBase + (AUDIO_MIX.crowdMax - AUDIO_MIX.crowdBase) * this.crowd;
    this.crowdGain?.gain.setTargetAtTime(level, t, 0.1);
    if (this.paused) return;

    // Compte à rebours du coup d'envoi.
    if (state.phase === 'kickoff') {
      const s = countdownBeep(this.lastPhaseTicks, state.phaseTicks, TICK_RATE);
      if (s > 0) this.play('countdown', null, 1, s === 1 ? 1.12 : 1);
      this.lastPhaseTicks = state.phaseTicks;
    } else this.lastPhaseTicks = 0;

    // Pas des joueurs proches (le joueur local en 2D, plus doux).
    if (this.stepPhase.length !== state.players.length) this.stepPhase = state.players.map(() => 0);
    for (const p of state.players) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const moving = p.status === 'active' && p.onGround && (p.move === 'run' || p.move === 'climb') && speed > AUDIO_MIX.stepMinSpeed;
      if (!moving) {
        this.stepPhase[p.id] = 0.6;
        continue;
      }
      const d = Math.hypot(p.pos.x - listener.pos.x, p.pos.z - listener.pos.z);
      if (p.id !== localId && d > AUDIO_MIX.stepMaxDist) continue;
      this.stepPhase[p.id] += (speed * dt) / AUDIO_MIX.strideM;
      if (this.stepPhase[p.id] >= 1) {
        this.stepPhase[p.id] -= 1;
        const local = p.id === localId;
        this.play('footstep', local ? null : { x: p.pos.x, y: p.pos.y + 0.1, z: p.pos.z }, local ? 0.35 : 0.6, p.role === 'pilier' ? 0.85 : p.role === 'ailier' ? 1.1 : 1);
      }
    }

    // Battements de cœur : stabilité du joueur local basse.
    const me = state.players[localId];
    if (me !== undefined && me.status === 'active' && state.phase === 'play') {
      if (me.stability / ROLES[me.role].stabilityMax < AUDIO_MIX.heartbeatBelow && t >= this.nextHeartbeat) {
        this.play('heartbeat', null, 0.9);
        this.nextHeartbeat = t + AUDIO_MIX.heartbeatSec;
      }
    }
  }

  /** Nouveau match : oublie l'état des pas et du compte à rebours. */
  resetMatch(): void {
    this.stepPhase = [];
    this.lastPhaseTicks = 0;
    this.throttle.clear();
  }
}

let shared: AudioEngine | null = null;

/** Moteur audio unique de la page (la session et les sons d'interface le partagent). */
export function audioEngine(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
