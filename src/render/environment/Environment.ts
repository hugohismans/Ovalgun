/**
 * Décor complet autour du terrain : ciel (Sky), stade et foule (Stadium), ville (City). Appelé par le Renderer à la
 * place de l'ancien ciel en dégradé et des tribunes en blocs. Purement visuel : ne lit que les dimensions du terrain.
 *
 *  - Construit une fois : ciel, géométries de base, matériaux, atlas des panneaux.
 *  - `build(width, length)` à chaque match : le stade et la ville ne sont reconstruits (instances seulement) que si
 *    la taille du terrain change ; l'ancien décor est libéré.
 *  - `update` à chaque image : temps des shaders, excitation lissée de la foule, ciel recentré sur la caméra.
 *    Aucune allocation par image.
 *
 * Coût : ≈ 20 appels de dessin (ciel 6, stade 5, ville 9), avant découpage par le frustum.
 */

import * as THREE from 'three';
import { ENVIRONMENT as E } from '../palette';
import { createAtlas, type Atlas } from './atlas';
import { buildCity, CAR_CABIN_Y, createCarGeometry, createConeTree, createRoundTree, TRUNK_TOP, type CityResources } from './City';
import { unitBox } from './instancing';
import { cityLayout, stadiumLayout } from './layout';
import {
  createBuildingMaterial,
  createCarMaterial,
  createCityGroundMaterial,
  createCrowdMaterial,
  createGlowMaterial,
  createSkylineMaterial,
  createStadiumBoxMaterial,
  createTreeMaterial,
  type EnvUniforms,
} from './materials';
import { Sky } from './Sky';
import { buildStadium, createFanGeometry, FAN_SHOULDER_Y, type Built, type StadiumResources } from './Stadium';

/** Direction VERS le soleil (normalisée), partagée avec la lumière directionnelle du Renderer. */
export function sunDirection(): THREE.Vector3 {
  return new THREE.Vector3(E.sunDirection.x, E.sunDirection.y, E.sunDirection.z).normalize();
}

export class Environment {
  readonly group = new THREE.Group();
  readonly sunDirection = sunDirection();
  private readonly uniforms: EnvUniforms = {
    time: { value: 0 },
    excite: { value: E.crowdIdleExcitement },
    plaza: { value: new THREE.Vector2(100, 100) },
    radius: { value: E.cityRadius },
  };
  private readonly atlas: Atlas;
  private readonly sky: Sky;
  private readonly stadiumRes: StadiumResources;
  private readonly cityRes: CityResources;
  private readonly shared: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
  private site: Built[] = [];
  private siteKey = '';
  private targetExcitement: number = E.crowdIdleExcitement;
  private excitement: number = E.crowdIdleExcitement;
  private motionScale = 1;

  constructor() {
    this.atlas = createAtlas();
    const adMat = new THREE.MeshBasicMaterial({ map: this.atlas.texture });
    const box = unitBox();
    const glowQuad = new THREE.PlaneGeometry(1, 1);
    this.stadiumRes = {
      box,
      fan: createFanGeometry(),
      glowQuad,
      boxMat: createStadiumBoxMaterial(),
      lampMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      glowMat: createGlowMaterial(),
      adMat,
      crowdMat: createCrowdMaterial(this.uniforms, FAN_SHOULDER_Y),
      atlas: this.atlas,
    };
    this.cityRes = {
      box,
      roundTree: createRoundTree(),
      coneTree: createConeTree(),
      car: createCarGeometry(),
      groundMat: createCityGroundMaterial(this.uniforms),
      parkMat: new THREE.MeshLambertMaterial({ color: E.park, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      blockMat: createBuildingMaterial(false),
      towerMat: createBuildingMaterial(true),
      propMat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      treeMat: createTreeMaterial(TRUNK_TOP),
      carMat: createCarMaterial(this.uniforms, CAR_CABIN_Y),
      skylineMat: createSkylineMaterial(),
    };
    const s = this.stadiumRes;
    const c = this.cityRes;
    this.shared = {
      geometries: [box, s.fan, glowQuad, c.roundTree, c.coneTree, c.car],
      materials: [s.boxMat, s.lampMat, s.glowMat, adMat, s.crowdMat, c.groundMat, c.parkMat, c.blockMat, c.towerMat, c.propMat, c.treeMat, c.carMat, c.skylineMat],
    };
    this.sky = new Sky(this.sunDirection, this.atlas, adMat, this.uniforms.time);
    this.group.add(this.sky.group);
  }

  /** (Re)construit le stade et la ville pour un terrain de cette taille (rien à faire si elle n'a pas changé). */
  build(width: number, length: number): void {
    const key = `${width.toFixed(3)}x${length.toFixed(3)}`;
    if (key === this.siteKey) return;
    this.clearSite();
    this.siteKey = key;
    const st = stadiumLayout(width, length);
    const city = cityLayout(st);
    this.uniforms.plaza.value.set(city.plazaX, city.plazaZ);
    this.uniforms.radius.value = city.radius;
    this.site = [buildStadium(st, this.stadiumRes), buildCity(city, this.cityRes)];
    for (const b of this.site) this.group.add(b.group);
  }

  /** Excitation visée de la foule (0 = calme, 1 = délire) ; lissée dans `update`. */
  setExcitement(value: number): void {
    this.targetExcitement = Math.min(1, Math.max(0, value));
  }

  /** Excitation courante (lissée). */
  get currentExcitement(): number {
    return this.excitement;
  }

  /** Préférence « animations réduites » : bonds de la foule réduits de 70 %. */
  setReducedMotion(reduced: boolean): void {
    this.motionScale = reduced ? 0.3 : 1;
  }

  update(dt: number, timeSec: number, camera: THREE.Camera): void {
    const rate = this.targetExcitement > this.excitement ? E.crowdRiseRate : E.crowdFallRate;
    this.excitement += (this.targetExcitement - this.excitement) * (1 - Math.exp(-rate * Math.max(0, dt)));
    this.uniforms.excite.value = this.excitement * this.motionScale;
    this.uniforms.time.value = timeSec;
    this.sky.update(dt, timeSec, camera.position);
  }

  private clearSite(): void {
    for (const b of this.site) {
      this.group.remove(b.group);
      b.dispose();
    }
    this.site = [];
    this.siteKey = '';
  }

  dispose(): void {
    this.clearSite();
    this.sky.dispose();
    for (const g of this.shared.geometries) g.dispose();
    for (const m of this.shared.materials) m.dispose();
    this.atlas.texture.dispose();
  }
}
