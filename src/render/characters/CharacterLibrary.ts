/**
 * Chargement des personnages 3D (GLB compressés meshopt) et des animations partagées.
 *
 * Le chargement est asynchrone et ne bloque jamais le jeu : tant qu'un modèle n'est pas prêt, PlayerView affiche la
 * capsule, puis bascule sur le personnage dès qu'il l'est. Un échec de chargement laisse simplement la capsule
 * (message en console).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Role } from '../../sim';
import { CHARACTER_ANIMATIONS_URL, CHARACTER_MODELS, CHARACTERS, skinFor, type CharacterModelId } from './characterDefs';

export interface CharacterTemplate {
  /** Scène d'origine (à cloner avec SkeletonUtils.clone, jamais à ajouter telle quelle). */
  scene: THREE.Group;
}

/** Chemin d'un fichier de public/ en tenant compte de `base` (build sous un sous-chemin). */
const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

export class CharacterLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly models = new Map<CharacterModelId, CharacterTemplate>();
  private clipList: THREE.AnimationClip[] | null = null;
  private loading: Promise<void> | null = null;
  private failed = false;

  /** Lance le chargement (une seule fois) de tous les modèles utilisés par une classe et des animations. */
  load(): Promise<void> {
    if (this.loading !== null) return this.loading;
    const wanted = new Set<CharacterModelId>();
    for (const role of Object.keys(CHARACTERS) as Role[]) {
      const skin = skinFor(role);
      if (skin !== null) wanted.add(skin.model);
    }
    const jobs: Promise<void>[] = [...wanted].map(async (id) => {
      const gltf = await this.loader.loadAsync(assetUrl(CHARACTER_MODELS[id]));
      this.models.set(id, { scene: gltf.scene });
    });
    jobs.push(
      (async () => {
        const gltf = await this.loader.loadAsync(assetUrl(CHARACTER_ANIMATIONS_URL));
        this.clipList = gltf.animations;
      })(),
    );
    this.loading = Promise.all(jobs).then(
      () => undefined,
      (err: unknown) => {
        this.failed = true;
        console.warn('Ovalgun : personnages 3D indisponibles, capsules utilisées.', err);
      },
    );
    return this.loading;
  }

  /** Vrai si le modèle de cette classe et les animations sont prêts. */
  ready(role: Role): boolean {
    if (this.failed || this.clipList === null) return false;
    const skin = skinFor(role);
    return skin !== null && this.models.has(skin.model);
  }

  template(id: CharacterModelId): CharacterTemplate | null {
    return this.models.get(id) ?? null;
  }

  get clips(): readonly THREE.AnimationClip[] {
    return this.clipList ?? [];
  }
}
