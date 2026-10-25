/**
 * Portraits des personnages pour le menu (cartes de rôle) : chaque classe rendue une fois, en posture de visée, de
 * trois quarts, sur fond transparent, dans un rendu hors écran (contexte WebGL temporaire, libéré aussitôt) — l'UI
 * n'affiche que des images.
 */

import * as THREE from 'three';
import { createMatch, GETUP_DURATION_SEC, type Role } from '../../sim';
import { PlayerAssets } from '../PlayerView';
import { PALETTE, STYLE } from '../palette';
import { characterLibrary } from './CharacterLibrary';
import { CHARACTERS, skinFor } from './characterDefs';
import { CharacterModel } from './CharacterModel';

const ROLES: readonly Role[] = ['pilier', 'ailier', 'demi'];

/** Rend les portraits (data URL PNG) des classes qui ont un modèle ; {} si WebGL ou les modèles sont indisponibles. */
export async function renderCharacterPortraits(width = 240, height = 300): Promise<Partial<Record<Role, string>>> {
  const lib = characterLibrary();
  await lib.load();
  const out: Partial<Record<Role, string>> = {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, STYLE.hemiIntensity));
  const sun = new THREE.DirectionalLight(PALETTE.sun, STYLE.sunIntensity);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 50);
  camera.position.set(0, 1.15, 4.3);
  camera.lookAt(0, 0.95, 0);
  const assets = new PlayerAssets();
  const match = createMatch({ teamSize: 3, seed: 1, roles: [['pilier', 'ailier', 'demi'], ['pilier', 'ailier', 'demi']] });
  const frame = { pitch: 0.05, velFwd: 0, velSide: 0, carrier: false, shooting: false, celebrate: false, shield: false };
  for (const role of ROLES) {
    const def = CHARACTERS[role];
    const skin = skinFor(role);
    const tpl = skin !== null ? lib.template(skin.model) : null;
    if (def === null || skin === null || tpl === null || !lib.ready(role)) continue;
    const model = new CharacterModel(tpl, lib.clips, def, skin, 0, assets.gradient, GETUP_DURATION_SEC);
    const holder = new THREE.Group();
    holder.rotation.y = 0.55; // trois quarts, l'arme vers le spectateur
    holder.add(model.root);
    scene.add(holder);
    const p = match.players.find((q) => q.role === role) ?? match.players[0];
    for (let i = 0; i < 45; i++) model.update(p, frame, 1 / 30);
    renderer.render(scene, camera);
    out[role] = renderer.domElement.toDataURL('image/png');
    scene.remove(holder);
    model.dispose();
  }
  assets.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
