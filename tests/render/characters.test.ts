/**
 * Personnages 3D : logique pure d'animation, skins, et cohérence des fichiers GLB avec le code
 * (clips, os et matériaux que le code utilise doivent exister dans les modèles convertis).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bodyMode, locomotionWeights, runTimeScale } from '../../src/render/characters/animState';
import { CHARACTER_ANIMATIONS_URL, CHARACTER_MODELS, CHARACTERS, SKINS, resolveSkinColor, skinFor } from '../../src/render/characters/characterDefs';
import { PALETTE } from '../../src/render/palette';

/** Lit le chunk JSON d'un GLB. */
function glbJson(publicPath: string): { nodes: Array<{ name?: string }>; materials?: Array<{ name?: string }>; animations?: Array<{ name?: string }> } {
  const buf = readFileSync(resolve(__dirname, '../../public', publicPath));
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const sum = (w: object): number => (Object.values(w) as number[]).reduce((a, b) => a + b, 0);

describe('animation : choix des cycles', () => {
  it('immobile sous le seuil, course pleine au-dessus', () => {
    expect(locomotionWeights(0.2, 0, 0.6, 3)).toMatchObject({ idle: 1, forward: 0 });
    const w = locomotionWeights(8, 0, 0.6, 3);
    expect(w.forward).toBeCloseTo(1);
    expect(w.idle).toBeCloseTo(0);
  });

  it('direction répartie entre cycles voisins, somme = 1', () => {
    const diag = locomotionWeights(5, 5, 0.6, 3); // avant-droite
    expect(diag.forward).toBeCloseTo(0.5);
    expect(diag.right).toBeCloseTo(0.5);
    expect(locomotionWeights(-6, 0, 0.6, 3).back).toBeCloseTo(1);
    expect(locomotionWeights(0, -6, 0.6, 3).left).toBeCloseTo(1);
    for (const [f, s] of [[1, 0.3], [-2, 4], [0.5, -0.9], [-3, -3]]) expect(sum(locomotionWeights(f, s, 0.6, 3))).toBeCloseTo(1);
  });

  it('vitesse de lecture proportionnelle et bornée', () => {
    expect(runTimeScale(6, 6, 0.75, 1.8)).toBe(1);
    expect(runTimeScale(1, 6, 0.75, 1.8)).toBe(0.75);
    expect(runTimeScale(30, 6, 0.75, 1.8)).toBe(1.8);
  });

  it('priorité des modes du corps', () => {
    const b = { status: 'active', move: 'run', onGround: true, celebrate: false } as const;
    expect(bodyMode(b)).toBe('locomotion');
    expect(bodyMode({ ...b, onGround: false })).toBe('air');
    expect(bodyMode({ ...b, onGround: false, move: 'climb' })).toBe('locomotion');
    expect(bodyMode({ ...b, move: 'dive_recover' })).toBe('dive');
    expect(bodyMode({ ...b, move: 'slide' })).toBe('slide');
    expect(bodyMode({ ...b, celebrate: true, move: 'slide' })).toBe('celebrate');
    expect(bodyMode({ ...b, status: 'down', celebrate: true })).toBe('down');
    expect(bodyMode({ ...b, status: 'getting_up' })).toBe('getup');
  });
});

describe('skins', () => {
  it('couleur d’équipe résolue depuis la palette, couleur fixe telle quelle', () => {
    expect(resolveSkinColor({ team: 'main' }, 1)).toBe(PALETTE.teams[1].main);
    expect(resolveSkinColor('#123456', 0)).toBe('#123456');
  });

  it('chaque skin garde au moins une zone à la couleur de l’équipe', () => {
    for (const s of Object.values(SKINS)) {
      expect(Object.values(s.colors).some((c) => typeof c !== 'string')).toBe(true);
    }
  });

  it('skinFor : skin demandée si elle correspond à la classe, sinon skin par défaut', () => {
    expect(skinFor('ailier')?.id).toBe(CHARACTERS.ailier?.defaultSkin);
    expect(skinFor('ailier', 'inconnue')?.id).toBe(CHARACTERS.ailier?.defaultSkin);
    for (const role of ['pilier', 'demi', 'ailier'] as const) {
      const def = CHARACTERS[role];
      if (def === null) expect(skinFor(role)).toBeNull();
      else expect(SKINS[def.defaultSkin]?.role).toBe(role);
    }
  });
});

describe('fichiers GLB', () => {
  const anims = glbJson(CHARACTER_ANIMATIONS_URL);
  const clipNames = new Set((anims.animations ?? []).map((a) => a.name));

  it('les clips utilisés par CharacterModel existent', () => {
    for (const c of ['Idle', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Idle_Gun_Pointing', 'Idle_Gun_Shoot', 'Punch_Right', 'HitRecieve', 'Death', 'Wave', 'Kick_Right']) {
      expect(clipNames.has(c), c).toBe(true);
    }
  });

  it('chaque modèle a les os retouchés par le code et les matériaux de ses skins', () => {
    for (const [id, url] of Object.entries(CHARACTER_MODELS)) {
      const json = glbJson(url);
      const nodes = new Set(json.nodes.map((n) => n.name));
      for (const b of ['Head', 'Chest', 'UpperArm.R', 'LowerArm.R', 'UpperArm.L', 'Wrist.R', 'UpperLeg.L', 'LowerLeg.R']) expect(nodes.has(b), `${id}:${b}`).toBe(true);
      const mats = new Set((json.materials ?? []).map((m) => m.name));
      for (const s of Object.values(SKINS).filter((k) => k.model === id)) {
        for (const name of Object.keys(s.colors)) expect(mats.has(name), `${s.id}:${name}`).toBe(true);
      }
      expect((json.animations ?? []).length).toBe(0); // animations dans le fichier partagé
    }
  });
});
