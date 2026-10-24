/**
 * Manette : zones mortes radiales, courbe, boost, conventions d'axes, mapping -> bits Buttons,
 * bascule de sprint L3, état complet avec une fausse manette.
 */
import { describe, expect, it } from 'vitest';
import {
  GamepadInput,
  GamepadPicker,
  LookBoost,
  lookCurve,
  radialDeadzone,
  SprintToggle,
  stickLookRates,
  type GamepadLike,
} from '../../src/input/gamepad';
import {
  DEFAULT_GAMEPAD_MAP,
  detectGamepadStyle,
  padActionGlyph,
  padActionsToButtons,
  readPadActions,
  type PadButtonLike,
} from '../../src/input/gamepadMap';
import {
  GAMEPAD_ACTIVITY_THRESHOLD,
  GAMEPAD_AIM_LOOK_MULT,
  GAMEPAD_LOOK_BOOST_DELAY_SEC,
  GAMEPAD_LOOK_BOOST_MULT,
  GAMEPAD_LOOK_BOOST_RAMP_SEC,
  GAMEPAD_LOOK_CURVE,
  GAMEPAD_LOOK_DEADZONE,
  GAMEPAD_LOOK_OUTER_DEADZONE,
  GAMEPAD_LOOK_PITCH_SPEED_DEG,
  GAMEPAD_LOOK_YAW_SPEED_DEG,
  GAMEPAD_MOVE_DEADZONE,
  GAMEPAD_TRIGGER_THRESHOLD,
} from '../../src/sim/constants';
import { Buttons } from '../../src/sim/types';

const DEG = Math.PI / 180;
const NO_OPTS = { aiming: false, boost: 1, assist: 1, invertY: false };

describe('zone morte radiale', () => {
  const dz = GAMEPAD_MOVE_DEADZONE;
  it('rien sous la zone morte, quelle que soit la direction', () => {
    expect(radialDeadzone(dz * 0.9, 0, dz).mag).toBe(0);
    expect(radialDeadzone(dz * 0.6, dz * 0.6, dz).mag).toBe(0);
  });

  it('remise à l’échelle linéaire : pas de saut au bord, 1 en bout de course', () => {
    expect(radialDeadzone(dz + 1e-4, 0, dz).mag).toBeLessThan(0.001);
    const mid = radialDeadzone(dz + (1 - dz) * 0.5, 0, dz);
    expect(mid.mag).toBeCloseTo(0.5, 9);
    expect(mid.x).toBeCloseTo(0.5, 9);
    expect(radialDeadzone(1, 0, dz).mag).toBeCloseTo(1, 12);
  });

  it('direction conservée (pas d’effet croix), norme bornée à 1', () => {
    const d = radialDeadzone(0.6, 0.6, dz);
    expect(d.x).toBeCloseTo(d.y, 12);
    expect(d.mag).toBeCloseTo((Math.hypot(0.6, 0.6) - dz) / (1 - dz), 12);
    // Petite composante sur un axe : conservée (une zone morte par axe l'aurait annulée).
    const e = radialDeadzone(0.9, 0.1, dz);
    expect(e.y).toBeGreaterThan(0);
    const c = radialDeadzone(1, 1, dz);
    expect(c.mag).toBe(1);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1, 12);
  });

  it('valeurs non finies ignorées', () => {
    expect(radialDeadzone(Number.NaN, Infinity, dz)).toEqual({ x: 0, y: 0, mag: 0 });
  });
});

describe('courbe et vitesses de caméra', () => {
  it('courbe : précision au centre, 1 en bout de course', () => {
    expect(lookCurve(0)).toBe(0);
    expect(lookCurve(1)).toBe(1);
    expect(lookCurve(0.5)).toBeCloseTo(Math.pow(0.5, GAMEPAD_LOOK_CURVE), 12);
    expect(lookCurve(0.5)).toBeLessThan(0.5);
  });

  it('stick à droite => yaw diminue ; stick vers le haut => pitch augmente', () => {
    const r = stickLookRates({ x: 1, y: 0, mag: 1 }, NO_OPTS);
    expect(r.yawRate).toBeCloseTo(-GAMEPAD_LOOK_YAW_SPEED_DEG * DEG, 9);
    expect(r.pitchRate).toBeCloseTo(0, 12);
    const u = stickLookRates({ x: 0, y: -1, mag: 1 }, NO_OPTS);
    expect(u.pitchRate).toBeCloseTo(GAMEPAD_LOOK_PITCH_SPEED_DEG * DEG, 9);
    const inv = stickLookRates({ x: 0, y: -1, mag: 1 }, { ...NO_OPTS, invertY: true });
    expect(inv.pitchRate).toBeCloseTo(-GAMEPAD_LOOK_PITCH_SPEED_DEG * DEG, 9);
  });

  it('courbe appliquée à la norme, visée et aide à la visée ralentissent', () => {
    const half = stickLookRates({ x: 0.5, y: 0, mag: 0.5 }, NO_OPTS);
    expect(half.yawRate).toBeCloseTo(-Math.pow(0.5, GAMEPAD_LOOK_CURVE) * GAMEPAD_LOOK_YAW_SPEED_DEG * DEG, 9);
    const aim = stickLookRates({ x: 1, y: 0, mag: 1 }, { ...NO_OPTS, aiming: true });
    expect(aim.yawRate).toBeCloseTo(-GAMEPAD_AIM_LOOK_MULT * GAMEPAD_LOOK_YAW_SPEED_DEG * DEG, 9);
    const assisted = stickLookRates({ x: 1, y: 0, mag: 1 }, { ...NO_OPTS, assist: 0.5 });
    expect(assisted.yawRate).toBeCloseTo(-0.5 * GAMEPAD_LOOK_YAW_SPEED_DEG * DEG, 9);
    expect(stickLookRates({ x: 0, y: 0, mag: 0 }, NO_OPTS)).toEqual({ yawRate: 0, pitchRate: 0 });
  });

  it('boost en bout de course : délai, montée, plafond, retombée immédiate, désactivé en visée', () => {
    const b = new LookBoost();
    const RIGHT = { x: 1, y: 0, mag: 1 };
    expect(b.update(RIGHT, GAMEPAD_LOOK_BOOST_DELAY_SEC * 0.9, true)).toBe(1);
    const t = GAMEPAD_LOOK_BOOST_DELAY_SEC * 0.1 + GAMEPAD_LOOK_BOOST_RAMP_SEC * 0.5;
    const m = b.update(RIGHT, t, true);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThan(GAMEPAD_LOOK_BOOST_MULT);
    expect(b.update(RIGHT, GAMEPAD_LOOK_BOOST_RAMP_SEC, true)).toBeCloseTo(GAMEPAD_LOOK_BOOST_MULT, 9);
    expect(b.update(RIGHT, 5, true)).toBeCloseTo(GAMEPAD_LOOK_BOOST_MULT, 9);
    expect(b.update({ x: 0.5, y: 0, mag: 0.5 }, 0.016, true)).toBe(1);
    expect(b.update(RIGHT, 5, false)).toBe(1);
    // Le boost ne touche que le lacet.
    const r = stickLookRates({ x: 0.6, y: -0.8, mag: 1 }, { ...NO_OPTS, boost: 2 });
    const r1 = stickLookRates({ x: 0.6, y: -0.8, mag: 1 }, NO_OPTS);
    expect(r.yawRate).toBeCloseTo(2 * r1.yawRate, 9);
    expect(r.pitchRate).toBeCloseTo(r1.pitchRate, 9);
  });
});

const btns = (pressedIdx: number[], values: Record<number, number> = {}): PadButtonLike[] =>
  Array.from({ length: 17 }, (_, i) => ({ pressed: pressedIdx.includes(i), value: values[i] ?? (pressedIdx.includes(i) ? 1 : 0) }));

describe('régressions manette (relecture étape 3)', () => {
  it('boost : regarder en l’air à fond ne prépare pas un demi-tour instantané', () => {
    const b = new LookBoost();
    // 0,66 s stick à fond vers le haut…
    for (let i = 0; i < 40; i++) expect(b.update({ x: 0, y: -1, mag: 1 }, 1 / 60, true)).toBe(1);
    // …puis à fond à droite : pas de boost à la première frame, la montée repart de zéro.
    expect(b.update({ x: 1, y: 0, mag: 1 }, 1 / 60, true)).toBe(1);
    const yaw = stickLookRates({ x: 1, y: 0, mag: 1 }, { ...NO_OPTS, boost: b.multiplier }).yawRate;
    expect(Math.abs(yaw)).toBeCloseTo(GAMEPAD_LOOK_YAW_SPEED_DEG * DEG, 9);
    // Une diagonale franchement horizontale charge toujours le boost.
    const d = new LookBoost();
    d.update({ x: 0.9, y: -0.436, mag: 1 }, 1, true);
    expect(d.multiplier).toBeCloseTo(GAMEPAD_LOOK_BOOST_MULT, 9);
  });

  it('zone morte extérieure : un stick usé qui plafonne à 0,93 atteint la vitesse max', () => {
    const v = radialDeadzone(0.93, 0, GAMEPAD_LOOK_DEADZONE, GAMEPAD_LOOK_OUTER_DEADZONE);
    expect(v.mag).toBe(1);
    // Sans zone extérieure (fonction pure, paramètre par défaut) : comportement historique.
    expect(radialDeadzone(0.93, 0, GAMEPAD_LOOK_DEADZONE).mag).toBeLessThan(1);
    // La GamepadInput l'applique.
    const g = new GamepadInput();
    const p = fakePad();
    p.axes[2] = 0.93;
    g.update(p);
    expect(g.look.mag).toBe(1);
  });

  it('débranchée gâchette gauche enfoncée : la caméra ne reste pas en visée', () => {
    const g = new GamepadInput();
    const p = fakePad();
    p.buttons[6] = { pressed: true, value: 1 };
    g.update(p);
    expect(g.aiming).toBe(true);
    g.update(null);
    expect(g.aiming).toBe(false);
    expect(g.heldActions).toBe(0);
  });

  it('un stick qui dérive à peine au-delà de la zone morte ne rend pas la manette active', () => {
    const g = new GamepadInput();
    const p = fakePad();
    p.axes[2] = GAMEPAD_LOOK_DEADZONE + 0.02;
    g.update(p);
    expect(g.look.mag).toBeGreaterThan(0); // la caméra tourne (un peu)…
    expect(g.active).toBe(false); // …mais la manette ne prend pas la main
    p.axes[2] = 0.8;
    g.update(p);
    expect(g.look.mag).toBeGreaterThanOrEqual(GAMEPAD_ACTIVITY_THRESHOLD);
    expect(g.active).toBe(true);
  });

  it('porteur : la gâchette de visée ne vise pas et ne coupe pas le sprint L3', () => {
    const g = new GamepadInput();
    const p = fakePad();
    g.carrier = true;
    g.update(p);
    p.axes[1] = -1;
    press(p, 10, true);
    g.update(p);
    press(p, 10, false);
    p.buttons[6] = { pressed: true, value: 1 };
    g.update(p);
    expect(g.aiming).toBe(false);
    expect(g.sprinting).toBe(true);
    g.carrier = false;
    g.update(p);
    expect(g.aiming).toBe(true);
    expect(g.sprinting).toBe(false);
  });

  it('plusieurs manettes : celle qu’on utilise est lue, même à l’index 1 ; une manette non standard est signalée', () => {
    const picker = new GamepadPicker();
    const idle = fakePad();
    const used = { ...fakePad(), id: 'DualSense (054c)' };
    expect(picker.pick([idle, used])).toBe(idle); // personne n'agit : la première
    press(used, 0, true);
    expect(picker.pick([idle, used])).toBe(used); // geste sur la seconde : bascule
    press(used, 0, false);
    expect(picker.pick([idle, used])).toBe(used); // et on la garde
    expect(picker.pick([idle, null])).toBe(idle); // débranchée : retour à l'autre
    expect(picker.nonStandard).toBe(false);
    const raw = { ...fakePad(), mapping: '' };
    expect(picker.pick([raw])).toBe(null);
    expect(picker.nonStandard).toBe(true);
  });
});

describe('mapping manette -> bits Buttons', () => {
  const read = (b: PadButtonLike[]): number => padActionsToButtons(readPadActions(DEFAULT_GAMEPAD_MAP, b, GAMEPAD_TRIGGER_THRESHOLD));

  it('boutons de face et bumpers', () => {
    expect(read(btns([0]))).toBe(Buttons.JUMP);
    expect(read(btns([1]))).toBe(Buttons.DODGE);
    expect(read(btns([2]))).toBe(Buttons.SLIDE);
    expect(read(btns([4]))).toBe(Buttons.ABILITY);
    expect(read(btns([5]))).toBe(Buttons.PASS);
    expect(read(btns([0, 1]))).toBe(Buttons.JUMP | Buttons.DODGE);
  });

  it('Y émet coup de pied ET rechargement', () => {
    expect(read(btns([3]))).toBe(Buttons.KICK | Buttons.RELOAD);
  });

  it('gâchettes analogiques au seuil', () => {
    expect(read(btns([], { 7: GAMEPAD_TRIGGER_THRESHOLD - 0.05 }))).toBe(0);
    expect(read(btns([], { 7: GAMEPAD_TRIGGER_THRESHOLD + 0.05 }))).toBe(Buttons.FIRE);
    expect(read(btns([], { 6: 1 }))).toBe(Buttons.AIM);
  });

  it('L3 et Start ne produisent pas de bit direct', () => {
    expect(read(btns([9, 10]))).toBe(0);
  });

  it('glyphes Xbox / PlayStation et détection', () => {
    expect(detectGamepadStyle('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(detectGamepadStyle('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(detectGamepadStyle('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(detectGamepadStyle('Generic USB Joystick')).toBe('xbox');
    expect(padActionGlyph(DEFAULT_GAMEPAD_MAP, 'jump', 'xbox')).toBe('A');
    expect(padActionGlyph(DEFAULT_GAMEPAD_MAP, 'jump', 'playstation')).toBe('✕');
    expect(padActionGlyph(DEFAULT_GAMEPAD_MAP, 'fire', 'playstation')).toBe('R2');
  });
});

describe('sprint en bascule (L3)', () => {
  it('appui = bascule ; annulé au centre, en visée ou au tir', () => {
    const s = new SprintToggle();
    expect(s.update(true, 1, false, false)).toBe(true);
    expect(s.update(false, 0.8, false, false)).toBe(true);
    expect(s.update(false, 0, false, false)).toBe(false); // stick au centre
    expect(s.update(true, 1, false, false)).toBe(true);
    expect(s.update(true, 1, false, false)).toBe(false); // second appui : coupe
    s.update(true, 1, false, false);
    expect(s.update(false, 1, true, false)).toBe(false); // visée
    s.update(true, 1, false, false);
    expect(s.update(false, 1, false, true)).toBe(false); // tir
    expect(s.update(true, 0, false, false)).toBe(false); // stick au centre : rien
    // Porteur : visée / tir ignorés, seul le retour au centre coupe.
    expect(s.update(true, 1, false, false, true)).toBe(true);
    expect(s.update(false, 1, true, true, true)).toBe(true);
    expect(s.update(false, 0, false, false, true)).toBe(false);
  });
});

/** Fausse manette « standard » pilotable. */
function fakePad(): GamepadLike & { axes: number[]; buttons: PadButtonLike[] } {
  return { id: 'Xbox Controller (045e)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: btns([]) };
}
const press = (p: ReturnType<typeof fakePad>, i: number, down: boolean): void => {
  p.buttons[i] = { pressed: down, value: down ? 1 : 0 };
};

describe('GamepadInput (fausse manette)', () => {
  it('stick gauche vers le haut => avancer (+y), zone morte appliquée', () => {
    const g = new GamepadInput();
    const p = fakePad();
    p.axes[0] = 0.05;
    p.axes[1] = -1;
    g.update(p);
    expect(g.connected).toBe(true);
    expect(g.move.y).toBeCloseTo(1, 2);
    expect(g.move.x).toBeGreaterThan(0);
    expect(g.active).toBe(true);
  });

  it('appui bref entre deux ticks verrouillé ; sprint L3 => bit SPRINT', () => {
    const g = new GamepadInput();
    const p = fakePad();
    g.update(p);
    press(p, 0, true);
    g.update(p);
    press(p, 0, false);
    g.update(p);
    expect(g.sampleButtons()).toBe(Buttons.JUMP);
    expect(g.sampleButtons()).toBe(0);
    p.axes[1] = -1;
    press(p, 10, true);
    g.update(p);
    press(p, 10, false);
    g.update(p);
    expect(g.sampleButtons() & Buttons.SPRINT).toBe(Buttons.SPRINT);
    p.axes[1] = 0;
    g.update(p);
    expect(g.sampleButtons() & Buttons.SPRINT).toBe(0);
  });

  it('bouton déjà enfoncé au branchement : pas de faux front ; Start => une demande de pause', () => {
    const g = new GamepadInput();
    const p = fakePad();
    press(p, 9, true);
    g.update(p);
    expect(g.consumePause()).toBe(false);
    press(p, 9, false);
    g.update(p);
    press(p, 9, true);
    g.update(p);
    expect(g.consumePause()).toBe(true);
    expect(g.consumePause()).toBe(false);
  });

  it('reset (reprise de partie) : le bouton qui a servi à reprendre ne déclenche pas d’action', () => {
    const g = new GamepadInput();
    const p = fakePad();
    g.update(p);
    press(p, 0, true);
    g.update(p);
    expect(g.consumeConfirm()).toBe(true);
    g.reset();
    g.update(p); // A toujours enfoncé
    expect(g.sampleButtons()).toBe(0);
    press(p, 0, false);
    g.update(p);
    press(p, 0, true);
    g.update(p);
    expect(g.sampleButtons()).toBe(Buttons.JUMP);
  });

  it('déconnexion à chaud : plus rien n’est émis', () => {
    const g = new GamepadInput();
    const p = fakePad();
    press(p, 7, true);
    g.update(p);
    g.update(null);
    expect(g.connected).toBe(false);
    expect(g.sampleButtons()).toBe(0);
  });
});
