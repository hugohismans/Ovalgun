/**
 * Matériaux du décor : Lambert / Basic de three.js retouchés par onBeforeCompile (fenêtres des immeubles, foule qui
 * sautille, sol de la ville, troncs des arbres, voitures qui roulent) et un billboard additif (halo des projecteurs).
 * Créés UNE fois par Environment et partagés entre les reconstructions du décor ; leurs uniformes (temps, excitation,
 * dimensions de la place) sont des objets partagés mis à jour sans allocation.
 */

import * as THREE from 'three';
import { ENVIRONMENT as E } from '../palette';
import { GLSL_HASH } from './instancing';

/** Uniformes partagés du décor. */
export interface EnvUniforms {
  time: { value: number };
  excite: { value: number };
  /** Demi-dimensions de la place (sol de la ville). */
  plaza: { value: THREE.Vector2 };
  /** Rayon de la ville (boucle des voitures). */
  radius: { value: number };
}

const color = (c: string): { value: THREE.Color } => ({ value: new THREE.Color(c) });

/**
 * Immeubles : fenêtres calculées dans le repère de chaque instance (dimensions lues dans instanceMatrix, donc en
 * mètres, alignées sur les arêtes), toit plat coloré, socle sans fenêtres, acrotère. `curtain` : murs-rideaux des tours
 * (verre presque partout) ; sinon style tiré par immeuble (fenêtres, bandeaux, verre). Fenêtres allumées par hachage,
 * motif lissé au loin (fwidth) pour éviter le moiré.
 */
export function createBuildingMaterial(curtain: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uOgCell: { value: new THREE.Vector2(E.windowCell[0], E.windowCell[1]) },
    uOgBands: { value: new THREE.Vector3(E.windowBase, E.windowParapet, E.baseShade) },
    uOgLit: { value: new THREE.Vector2(E.windowLitShare, E.windowGlow) },
    uOgGlass: color(E.glass),
    uOgGlassHi: color(E.glassHi),
    uOgLitColor: color(E.windowLit),
    uOgRoofs: { value: E.roofs.map((c) => new THREE.Color(c)) },
    uOgCurtain: { value: curtain ? 1 : 0 },
    uOgFacadeLift: { value: E.facadeLift },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      [GLSL_HASH, 'varying vec3 vOgUV;', 'varying vec3 vOgInfo;', ''].join('\n') +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 ogS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));',
          '  vec2 ogKey = instanceMatrix[3].xz * 0.173 + instanceMatrix[3].y * 0.071;',
          '#else',
          '  vec3 ogS = vec3(1.0);',
          '  vec2 ogKey = vec2(0.0);',
          '#endif',
          '  float ogU = abs(normal.x) > 0.5 ? (position.z + 0.5) * ogS.z : (position.x + 0.5) * ogS.x;',
          '  vOgUV = vec3(ogU, position.y * ogS.y, normal.y > 0.5 ? 1.0 : (normal.y < -0.5 ? 2.0 : 0.0));',
          '  vOgInfo = vec3(ogHash(ogKey), ogS.y, ogHash(ogKey + 7.13));',
        ].join('\n'),
      );
    shader.fragmentShader =
      [
        GLSL_HASH,
        'varying vec3 vOgUV;',
        'varying vec3 vOgInfo;',
        'uniform vec2 uOgCell; uniform vec3 uOgBands; uniform vec2 uOgLit;',
        'uniform vec3 uOgGlass; uniform vec3 uOgGlassHi; uniform vec3 uOgLitColor; uniform vec3 uOgRoofs[4];',
        'uniform float uOgCurtain; uniform float uOgFacadeLift;',
        '',
      ].join('\n') +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '  if (vOgUV.z > 0.5) {',
          // Toit plat coloré (palette des toits, tirée par immeuble).
          '    int ogR = int(floor(vOgInfo.z * 3.999));',
          '    vec3 ogRoof = uOgRoofs[0];',
          '    if (ogR == 1) ogRoof = uOgRoofs[1]; else if (ogR == 2) ogRoof = uOgRoofs[2]; else if (ogR == 3) ogRoof = uOgRoofs[3];',
          '    diffuseColor.rgb = mix(diffuseColor.rgb, ogRoof, 0.85);',
          '  } else {',
          '    vec2 ogC = vec2(vOgUV.x / uOgCell.x, vOgUV.y / uOgCell.y);',
          '    vec2 ogF = fract(ogC);',
          '    float ogStyle = uOgCurtain > 0.5 ? 2.0 : floor(vOgInfo.x * 2.999);',
          '    float ogWin;',
          '    float ogCover;',
          '    if (ogStyle < 0.5) {',
          '      ogWin = step(0.2, ogF.x) * step(ogF.x, 0.8) * step(0.3, ogF.y) * step(ogF.y, 0.82);',
          '      ogCover = 0.31;',
          '    } else if (ogStyle < 1.5) {',
          '      ogWin = step(0.3, ogF.y) * step(ogF.y, 0.8);',
          '      ogCover = 0.5;',
          '    } else {',
          '      ogWin = step(0.14, ogF.x) * step(0.18, ogF.y);',
          '      ogCover = 0.7;',
          '    }',
          // Au loin (travée de moins de ≈ 8 px, motif plein sous 2,5 px) : on fond le motif vers sa couverture moyenne (pas de moiré ni de grésillement).
          '    float ogAA = smoothstep(0.12, 0.4, max(fwidth(ogC.x), fwidth(ogC.y)));',
          '    float ogBand = step(uOgBands.x, vOgUV.y) * step(vOgUV.y, vOgInfo.y - uOgBands.y);',
          '    ogWin = mix(ogWin, ogCover, ogAA) * ogBand;',
          '    float ogLit = mix(step(ogHash(floor(ogC) * 0.37 + vOgInfo.x * 91.7), uOgLit.x), uOgLit.x, ogAA);',
          '    vec3 ogGlass = mix(uOgGlass, uOgGlassHi, 0.25 + 0.5 * ogF.y * (1.0 - ogAA));',
          '    vec3 ogWinCol = mix(ogGlass, uOgLitColor, ogLit);',
          '    diffuseColor.rgb = mix(diffuseColor.rgb, ogWinCol, ogWin);',
          '    totalEmissiveRadiance += uOgLitColor * (ogWin * ogLit * uOgLit.y);',
          // Socle plus sombre (rez-de-chaussée) ; dessous (jamais vu) ignoré.
          '    diffuseColor.rgb *= mix(uOgBands.z, 1.0, step(uOgBands.x, vOgUV.y));',
          '  }',
          '  totalEmissiveRadiance += diffuseColor.rgb * uOgFacadeLift;',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'og-building';
  return mat;
}

/**
 * Foule : chaque spectateur (corps, tête, bras ; attribut `aPart`) saute d'une hauteur qui croît avec l'excitation,
 * phase et cadence tirées de sa position (hachage de instanceMatrix) ; une part croissante lève les bras en V (sinon ils
 * pendent le long du corps : symétrie autour de l'épaule). Léger émissif (`crowdLift`) : la foule, souvent à contre-jour,
 * garde des couleurs vives.
 */
export function createCrowdMaterial(u: EnvUniforms, shoulderY: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uShoulder: { value: shoulderY },
    uLift: { value: E.crowdLift },
    uTime: u.time,
    uExcite: u.excite,
    uJump: { value: new THREE.Vector3(E.jumpIdle, E.jumpMax, E.jumpRate) },
    uSkin0: color(E.skinTones[0]),
    uSkin1: color(E.skinTones[1]),
    uSkin2: color(E.skinTones[2]),
    uPants: color(E.pantsColor),
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      [GLSL_HASH, 'attribute float aPart;', 'uniform float uTime; uniform float uExcite; uniform vec3 uJump; uniform float uShoulder;', 'varying vec3 vOgCrowd;', ''].join('\n') +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec2 ogKey = instanceMatrix[3].xz * 0.291;',
          '#else',
          '  vec2 ogKey = vec2(0.0);',
          '#endif',
          '  float ogH1 = ogHash(ogKey);',
          '  float ogH2 = ogHash(ogKey + 17.17);',
          '  float ogH3 = ogHash(ogKey + 41.9);',
          '  float ogActive = step(ogH3, 0.3 + 0.7 * uExcite);',
          '  float ogAmp = mix(uJump.x, uJump.y, uExcite) * mix(0.25, 1.0, ogActive);',
          '  float ogJump = ogAmp * abs(sin(uTime * uJump.z * (0.8 + 0.4 * ogH2) + ogH1 * 6.2831853));',
          '  float ogRaise = step(ogH2, uExcite * 1.1 - 0.12);',
          '  if (aPart > 1.5 && ogRaise < 0.5) transformed.y = uShoulder - (transformed.y - uShoulder) * 0.85;',
          '  transformed.y += ogJump;',
          '  vOgCrowd = vec3(aPart, ogH1, position.y);',
        ].join('\n'),
      );
    shader.fragmentShader =
      ['varying vec3 vOgCrowd;', 'uniform vec3 uSkin0; uniform vec3 uSkin1; uniform vec3 uSkin2; uniform vec3 uPants; uniform float uLift;', ''].join('\n') +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '  if (vOgCrowd.x > 0.5 && vOgCrowd.x < 1.5) diffuseColor.rgb = vOgCrowd.y < 0.45 ? uSkin0 : (vOgCrowd.y < 0.8 ? uSkin1 : uSkin2);',
          '  else if (vOgCrowd.x < 0.5 && vOgCrowd.z < 0.28) diffuseColor.rgb = uPants;',
        ].join('\n'),
      ).replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uLift;',
      );
  };
  mat.customProgramCacheKey = () => 'og-crowd';
  return mat;
}

/** Sol de la ville : place du stade en damier, rues (marquage central pointillé), trottoirs, parcelles. */
export function createCityGroundMaterial(u: EnvUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uPlaza: u.plaza,
    uGrid: { value: new THREE.Vector3(E.cityBlock, E.cityStreet, E.citySidewalk) },
    uRoad: color(E.road),
    uMark: color(E.roadMark),
    uWalk: color(E.sidewalk),
    uLot: color(E.lot),
    uPlazaA: color(E.plazaA),
    uPlazaB: color(E.plazaB),
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 vOgWorld;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader =
      [
        'varying vec3 vOgWorld;',
        'uniform vec2 uPlaza; uniform vec3 uGrid;',
        'uniform vec3 uRoad; uniform vec3 uMark; uniform vec3 uWalk; uniform vec3 uLot; uniform vec3 uPlazaA; uniform vec3 uPlazaB;',
        'vec3 ogCity(vec2 p) {',
        '  if (abs(p.x) < uPlaza.x && abs(p.y) < uPlaza.y) {',
        '    float c = mod(floor(p.x / 4.0) + floor(p.y / 4.0), 2.0);',
        '    return mix(uPlazaA, uPlazaB, c);',
        '  }',
        '  vec2 q = abs(p - uGrid.x * floor(p / uGrid.x + 0.5));',
        '  float s = uGrid.y * 0.5;',
        '  if (q.x < s || q.y < s) {',
        '    float dashX = step(q.x, 0.13) * step(0.5, fract(p.y / 6.0)) * step(s, q.y);',
        '    float dashZ = step(q.y, 0.13) * step(0.5, fract(p.x / 6.0)) * step(s, q.x);',
        '    return mix(uRoad, uMark, max(dashX, dashZ));',
        '  }',
        '  if (q.x < s + uGrid.z || q.y < s + uGrid.z) return uWalk;',
        '  return uLot;',
        '}',
        '',
      ].join('\n') +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= ogCity(vOgWorld.xz);');
  };
  mat.customProgramCacheKey = () => 'og-city-ground';
  return mat;
}

/** Arbres : feuillage à la couleur de l'instance, tronc (sous `trunkTop` en local) brun. Facettes plates. */
export function createTreeMaterial(trunkTop: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const uniforms = { uTrunk: color(E.trunk), uTrunkTop: { value: trunkTop } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying float vOgY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOgY = position.y;');
    shader.fragmentShader =
      'varying float vOgY;\nuniform vec3 uTrunk; uniform float uTrunkTop;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (vOgY < uTrunkTop) diffuseColor.rgb = uTrunk;');
  };
  mat.customProgramCacheKey = () => 'og-tree';
  return mat;
}

/**
 * Voitures : chaque instance avance le long de son +X local (vitesse tirée de sa position de départ) et boucle sur
 * [−rayon, rayon] ; vitres sombres sur la cabine (au-dessus de `cabinY` en local).
 */
export function createCarMaterial(u: EnvUniforms, cabinY: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uTime: u.time,
    uRadius: u.radius,
    uSpeed: { value: new THREE.Vector2(E.carSpeed[0], E.carSpeed[1]) },
    uCabinY: { value: cabinY },
    uWindow: color(E.glass),
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      [GLSL_HASH, 'uniform float uTime; uniform float uRadius; uniform vec2 uSpeed;', 'varying float vOgY;', ''].join('\n') +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 ogT = instanceMatrix[3].xyz;',
          '  vec3 ogAx = normalize(instanceMatrix[0].xyz);',
          '  float ogAlong = dot(ogT, ogAx);',
          '  float ogV = mix(uSpeed.x, uSpeed.y, ogHash(ogT.xz * 0.37));',
          '  float ogS = mod(ogAlong + uTime * ogV + uRadius, 2.0 * uRadius) - uRadius;',
          '  transformed.x += (ogS - ogAlong) / length(instanceMatrix[0].xyz);',
          '#endif',
          '  vOgY = position.y;',
        ].join('\n'),
      );
    shader.fragmentShader =
      'varying float vOgY;\nuniform float uCabinY; uniform vec3 uWindow;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  if (vOgY > uCabinY) diffuseColor.rgb = mix(diffuseColor.rgb, uWindow, 0.75);',
      );
  };
  mat.customProgramCacheKey = () => 'og-car';
  return mat;
}

/**
 * Boîtes du stade (gradins, murs, toit, pylônes) : Lambert à couleur par instance, éclairci d'une fraction émissive de
 * sa couleur (`standsLift`), davantage sur les faces tournées vers le bas (`undersideLift`, dessous du toit).
 */
export function createStadiumBoxMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = { uOgLift: { value: new THREE.Vector2(E.standsLift, E.undersideLift) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader =
      'uniform vec2 uOgLift;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          '  float ogDown = smoothstep(0.3, 0.9, -inverseTransformDirection(normal, viewMatrix).y);',
          '  totalEmissiveRadiance += diffuseColor.rgb * (uOgLift.x + uOgLift.y * ogDown);',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'og-stadium-box';
  return mat;
}

/** Silhouettes lointaines : aplat sans brouillard dont le pied se fond dans la couleur de l'horizon. */
export function createSkylineMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const uniforms = { uOgHorizon: color(E.skyHorizon), uOgHaze: { value: E.skylineHaze } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying float vOgY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOgY = position.y;');
    shader.fragmentShader =
      'varying float vOgY;\nuniform vec3 uOgHorizon; uniform float uOgHaze;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb = mix(uOgHorizon, diffuseColor.rgb, (1.0 - uOgHaze) * smoothstep(0.0, 0.9, vOgY));',
      );
  };
  mat.customProgramCacheKey = () => 'og-skyline';
  return mat;
}

/** Halo des projecteurs : quad face caméra, dégradé radial additif (taille = échelle X de l'instance). */
export function createGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    forceSinglePass: true,
    fog: false,
    uniforms: { uColor: color(E.glowColor), uOpacity: { value: E.glowOpacity } },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
      '  float s = length(instanceMatrix[0].xyz);',
      '  c.xy += position.xy * s;',
      '  gl_Position = projectionMatrix * c;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor; uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main() {',
      '  float d = length(vUv - 0.5) * 2.0;',
      '  float a = (1.0 - smoothstep(0.0, 1.0, d));',
      '  a = a * a * uOpacity + step(d, 0.12) * 0.6;',
      '  gl_FragColor = vec4(uColor * a, 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
}
