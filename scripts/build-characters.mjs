// Outil de dev : convertit les personnages Quaternius (CC0, « Ultimate Modular Characters », glTF) en GLB légers
// pour le jeu : un GLB par modèle (maillages + squelette, sans animations) et un GLB d'animations partagé (squelette
// + clips, sans maillage : tous les personnages du pack ont le même squelette, donc les mêmes clips s'appliquent à tous).
// Compression meshopt (décodée par three/examples/jsm/libs/meshopt_decoder).
//
// Usage : node scripts/build-characters.mjs "<dossier Individual Characters/glTF du pack>"
// Source : https://quaternius.com/packs/ultimatemodularcharacters.html (licence CC0, voir public/models/CREDITS.md).

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync } from 'node:fs';

/** Modèles utilisés par le jeu (nom du fichier source -> nom de sortie). Étendre ici pour les autres classes. */
const MODELS = { Punk: 'punk' };
/** Personnage dont on extrait les animations (identiques dans tout le pack). */
const ANIMATION_SOURCE = 'Punk';
/** Clips gardés (les autres — épée, coups de poing gauches, marche… — ne servent pas au jeu). */
const KEEP_CLIPS = new Set([
  'Death', 'HitRecieve', 'HitRecieve_2', 'Idle', 'Idle_Gun', 'Idle_Gun_Pointing', 'Idle_Gun_Shoot', 'Gun_Shoot',
  'Kick_Right', 'Punch_Right', 'Roll', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Run_Shoot', 'Wave',
]);
const OUT = new URL('../public/models/characters/', import.meta.url).pathname;

const src = process.argv[2];
if (!src) {
  console.error('Usage : node scripts/build-characters.mjs "<dossier glTF du pack Quaternius>"');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function write(doc, name) {
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const path = join(OUT, `${name}.glb`);
  await io.write(path, doc);
  console.log(`${path} : ${(statSync(path).size / 1024).toFixed(0)} Ko`);
}

for (const [file, name] of Object.entries(MODELS)) {
  const doc = await io.read(join(src, `${file}.gltf`));
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(prune(), dedup(), weld(), quantize());
  await write(doc, name);
}

{
  const doc = await io.read(join(src, `${ANIMATION_SOURCE}.gltf`));
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMeshes()) m.dispose();
  for (const a of root.listAnimations()) if (!KEEP_CLIPS.has(a.getName())) a.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), quantize());
  await write(doc, 'animations');
}
