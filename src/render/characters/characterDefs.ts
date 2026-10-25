/**
 * Personnages 3D : modèles par classe et skins (données pures, sans Three.js).
 *
 * Modèles : Quaternius « Ultimate Modular Characters » (CC0, voir public/models/CREDITS.md), convertis en GLB par
 * scripts/build-characters.mjs. Tous les personnages du pack partagent le MÊME squelette : un seul fichier
 * d'animations (animations.glb) sert à tous les modèles, et les parties (tête, corps, jambes, pieds) pourront plus tard
 * se mélanger d'un modèle à l'autre.
 *
 * Skin = donnée pure : quel modèle, quelle couleur pour chaque matériau du modèle (couleur fixe ou couleur de l'équipe),
 * quels nœuds masquer. La couleur d'équipe passe par des références `{ team: 'main' | 'dark' | 'light' }` : une skin
 * garde toujours une zone à la couleur de l'équipe pour que les deux camps restent lisibles.
 *
 * Une classe sans entrée dans CHARACTERS garde la capsule (repli), le temps que son modèle arrive.
 */

import type { Role, TeamId } from '../../sim';
import { PALETTE } from '../palette';

/** Modèles disponibles (fichiers dans public/models/characters/). */
export const CHARACTER_MODELS = {
  punk: 'models/characters/punk.glb',
} as const;

export type CharacterModelId = keyof typeof CHARACTER_MODELS;

/** Animations partagées par tous les modèles. */
export const CHARACTER_ANIMATIONS_URL = 'models/characters/animations.glb';

/** Couleur d'un matériau dans une skin : fixe (#rrggbb) ou dérivée de l'équipe. */
export type ColorRef = string | { team: 'main' | 'dark' | 'light' };

export interface SkinDef {
  id: string;
  label: string;
  role: Role;
  model: CharacterModelId;
  /** Couleur par NOM de matériau du modèle ; un matériau absent garde sa couleur d'origine. */
  colors: Readonly<Record<string, ColorRef>>;
  /** Nœuds du modèle à masquer (accessoires d'origine non voulus). */
  hidden?: readonly string[];
}

/** Forme de l'arme tenue en main (construite en code, voir CharacterModel.ts). */
export type WeaponShape = 'smg' | 'shotgun' | 'launcher';

export interface CharacterDef {
  role: Role;
  defaultSkin: string;
  /** Échelle du modèle (le pack mesure ~1,8 m, comme PLAYER_HEIGHT). */
  scale: number;
  /** Échelle de la tête : tête un peu plus grosse = silhouette plus cartoon (style Splatoon). */
  headScale: number;
  weapon: WeaponShape;
}

export const SKINS: Readonly<Record<string, SkinDef>> = {
  'ailier-punk': {
    id: 'ailier-punk',
    label: 'Punk',
    role: 'ailier',
    model: 'punk',
    colors: {
      // Crête et gilet à la couleur de l'équipe (clin d'œil à l'encre de Splatoon), t-shirt blanc, jean sombre.
      Red: { team: 'main' },
      Red_Dark: { team: 'dark' },
      Black: { team: 'main' },
      White: '#f4f1ea',
      LightBlue: '#2c3550',
    },
  },
};

/** Modèle par classe (null : capsule de repli). Phase A : seul l'ailier a son modèle. */
export const CHARACTERS: Readonly<Record<Role, CharacterDef | null>> = {
  ailier: { role: 'ailier', defaultSkin: 'ailier-punk', scale: 0.96, headScale: 1.3, weapon: 'smg' },
  pilier: null,
  demi: null,
};

/** Résout une couleur de skin pour une équipe. */
export function resolveSkinColor(ref: ColorRef, team: TeamId): string {
  if (typeof ref === 'string') return ref;
  return PALETTE.teams[team][ref.team];
}

/** Skin effective d'une classe (skin demandée si elle existe et correspond à la classe, sinon skin par défaut). */
export function skinFor(role: Role, skinId?: string): SkinDef | null {
  const def = CHARACTERS[role];
  if (def === null) return null;
  const wanted = skinId !== undefined ? SKINS[skinId] : undefined;
  if (wanted !== undefined && wanted.role === role) return wanted;
  return SKINS[def.defaultSkin] ?? null;
}
