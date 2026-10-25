/**
 * Zone de capture de la mêlée (étape 7, Three.js) : lit `state.scrum`, n'écrit jamais dans l'état.
 *
 *  - Disque au sol de rayon EXACT (`scrum.radius`, liseré blanc au bord), dessiné par un petit shader :
 *      * bande extérieure de RÉPARTITION : deux arcs aux couleurs des équipes, proportionnels au décompte (joueurs actifs
 *        dans la zone) ; l'arc de chaque équipe grandit depuis le côté de SON en-but (équipe 0 vers −Z, équipe 1 vers +Z) :
 *        un « tir à la corde » lisible d'un coup d'œil, de n'importe quel côté ;
 *      * intérieur : PROGRESSION de la capture, un disque qui grandit du centre vers la bande (plein = résolution), de la
 *        couleur de l'équipe qui mène (blanc à égalité) ;
 *      * PROLONGATION : la bande et le remplissage passent au doré et pulsent, le remplissage repart du centre sur la
 *        durée de la prolongation.
 *  - Rideau bas translucide (visible de loin, par-dessus les joueurs), couleur de l'équipe qui mène.
 *  - Apparition (STYLE.scrumAppearSec) puis, à la résolution, fondu (STYLE.scrumFadeSec) à la couleur du vainqueur.
 * `scrumGauge` (PURE, testée) calcule tout ce qui s'affiche ; le HUD (matchHud.ts) la réutilise.
 */

import * as THREE from 'three';
import { scrumCaptureTicks, scrumInOvertime, scrumMaxTicks, TICK_RATE, type MatchEvent, type ScrumState, type TeamId } from '../sim';
import { SCRUM_NEUTRAL, SCRUM_OVERTIME, SCRUM_RIM, TEAM_MAIN } from './colors';
import { PALETTE, STYLE } from './palette';

/** Ce qu'affiche la zone de capture pour une frame. */
export interface ScrumGauge {
  /** Avancement de la phase en cours (capture, ou prolongation), 0..1. */
  progress: number;
  overtime: boolean;
  /** Part de l'équipe 0 dans le décompte (0..1 ; 0,5 à 0 contre 0). */
  share0: number;
  /** Équipe qui mène au décompte, −1 à égalité. */
  leader: TeamId | -1;
  /** Temps restant avant la fin de la phase en cours (s ; la prolongation peut finir plus tôt). */
  secLeft: number;
}

/**
 * Jauge de la mêlée (PURE) : `alpha` (0..1) = fraction du tick en cours écoulée (interpolation du rendu ; 0 pour le HUD).
 * La capture dure scrumCaptureTicks() ticks ; ensuite (égalité) la prolongation jusqu'à scrumMaxTicks().
 */
export function scrumGauge(scrum: Readonly<ScrumState>, alpha = 0): ScrumGauge {
  const capture = scrumCaptureTicks();
  const overtime = scrumInOvertime(scrum);
  const t = scrum.ticks + Math.min(1, Math.max(0, alpha));
  const start = overtime ? capture : 0;
  const end = overtime ? scrumMaxTicks() : capture;
  const progress = Math.min(1, Math.max(0, (t - start) / Math.max(1, end - start)));
  const [a, b] = scrum.counts;
  return {
    progress,
    overtime,
    share0: a + b > 0 ? a / (a + b) : 0.5,
    leader: a === b ? -1 : a > b ? 0 : 1,
    secLeft: Math.max(0, (end - t) / TICK_RATE),
  };
}

const VERTEX = [
  'varying vec2 vP;',
  'void main() {',
  '  vP = position.xz;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

/** Disque unité (plan XZ) : liseré, bande de répartition, remplissage radial de la progression. */
const FRAGMENT = [
  'uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uFill; uniform vec3 uRim;',
  'uniform float uShare; uniform float uProgress; uniform float uBand; uniform float uRimW;',
  'uniform float uBandOp; uniform float uRimOp; uniform float uBaseOp; uniform float uFillOp; uniform float uOpacity;',
  'varying vec2 vP;',
  'void main() {',
  '  float r = length(vP);',
  '  if (r > 1.0) discard;',
  '  vec3 col; float a;',
  '  float inner = 1.0 - uRimW - uBand;',
  '  if (r > 1.0 - uRimW) { col = uRim; a = uRimOp; }',
  '  else if (r > inner) {',
  // angle depuis −Z (côté de l'équipe 0), 0..1 jusqu'à +Z, symétrique gauche / droite
  '    float ang = acos(clamp(-vP.y / max(r, 1e-4), -1.0, 1.0)) / 3.14159265;',
  '    col = ang < uShare ? uC0 : uC1;',
  '    a = abs(ang - uShare) < 0.012 && uShare > 0.0 && uShare < 1.0 ? 0.0 : uBandOp;',
  '  } else {',
  '    float fr = r / inner;',
  '    col = uFill;',
  '    a = fr < uProgress ? uFillOp : uBaseOp;',
  '    if (abs(fr - uProgress) < 0.035 && uProgress > 0.0) a = min(1.0, uFillOp * 2.2);',
  '  }',
  '  gl_FragColor = vec4(col, a * uOpacity);',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

export class ScrumView {
  readonly group = new THREE.Group();
  private readonly discGeo = new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2);
  private readonly wallGeo = new THREE.CylinderGeometry(1, 1, STYLE.scrumWallHeight, 64, 1, true).translate(0, STYLE.scrumWallHeight / 2, 0);
  private readonly discMat: THREE.ShaderMaterial;
  private readonly wallMat: THREE.MeshBasicMaterial;
  private readonly disc: THREE.Mesh;
  private readonly wall: THREE.Mesh;
  /** Dernière mêlée vue (fondu après la résolution) et instant de son apparition / de sa fin (s, −1 : aucune). */
  private last: { x: number; y: number; z: number; radius: number; gauge: ScrumGauge } | null = null;
  private startedAt = -1;
  private endedAt = -1;
  /** Vainqueur de la dernière mêlée (couleur du fondu), −1 : aucun (ballon rendu libre). */
  private winner: TeamId | -1 = -1;

  constructor() {
    this.discMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      uniforms: {
        uC0: { value: new THREE.Color(PALETTE.teams[0].main) },
        uC1: { value: new THREE.Color(PALETTE.teams[1].main) },
        uFill: { value: new THREE.Color(PALETTE.scrumNeutral) },
        uRim: { value: new THREE.Color(PALETTE.scrumRim) },
        uShare: { value: 0.5 },
        uProgress: { value: 0 },
        uBand: { value: 0.1 },
        uRimW: { value: 0.02 },
        uBandOp: { value: STYLE.scrumBandOpacity },
        uRimOp: { value: STYLE.scrumRimOpacity },
        uBaseOp: { value: STYLE.scrumBaseOpacity },
        uFillOp: { value: STYLE.scrumFillOpacity },
        uOpacity: { value: 1 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.wallMat = new THREE.MeshBasicMaterial({
      color: PALETTE.scrumNeutral,
      transparent: true,
      opacity: STYLE.scrumWallOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.disc = new THREE.Mesh(this.discGeo, this.discMat);
    this.disc.renderOrder = 1;
    this.wall = new THREE.Mesh(this.wallGeo, this.wallMat);
    this.wall.renderOrder = 3;
    this.group.add(this.disc, this.wall);
    this.group.visible = false;
  }

  /** Événements d'un tick : vainqueur de la mêlée (couleur du fondu). */
  handleEvent(e: MatchEvent): void {
    if (e.type === 'scrum_won') this.winner = e.team;
    else if (e.type === 'scrum_released') this.winner = -1;
  }

  /** Une frame : `scrum` = mêlée de l'état courant (null : aucune), `alpha` = interpolation du tick en cours. */
  update(scrum: Readonly<ScrumState> | null, alpha: number, timeSec: number): void {
    if (scrum !== null) {
      if (this.last === null || this.endedAt >= 0) {
        this.startedAt = timeSec;
        this.endedAt = -1;
        this.winner = -1;
      }
      this.last = { x: scrum.center.x, y: scrum.center.y, z: scrum.center.z, radius: scrum.radius, gauge: scrumGauge(scrum, alpha) };
    } else if (this.last !== null && this.endedAt < 0) {
      this.endedAt = timeSec;
    }
    const l = this.last;
    if (l === null) {
      this.group.visible = false;
      return;
    }
    let k = 1;
    if (this.endedAt >= 0) {
      k = 1 - (timeSec - this.endedAt) / STYLE.scrumFadeSec;
      if (k <= 0) {
        this.last = null;
        this.group.visible = false;
        return;
      }
    }
    const appear = Math.min(1, Math.max(0, (timeSec - this.startedAt) / STYLE.scrumAppearSec));
    const g = l.gauge;
    const ended = this.endedAt >= 0;
    const pulse = g.overtime && !ended ? 1 - STYLE.scrumPulse * (0.5 + 0.5 * Math.sin(timeSec * STYLE.scrumPulseRate)) : 1;
    this.group.visible = true;
    this.group.position.set(l.x, l.y + 0.03, l.z);
    const s = l.radius * (0.7 + 0.3 * appear);
    this.group.scale.set(s, 1, s);

    const u = this.discMat.uniforms;
    const gold = SCRUM_OVERTIME;
    // Couleur du remplissage et du rideau : équipe qui mène (vainqueur pendant le fondu), blanc à égalité, doré en prolongation.
    const lead: TeamId | -1 = ended ? this.winner : g.leader;
    const leadColor = lead === -1 ? (g.overtime && !ended ? gold : SCRUM_NEUTRAL) : TEAM_MAIN[lead];
    (u.uFill.value as THREE.Color).copy(leadColor);
    (u.uRim.value as THREE.Color).copy(g.overtime && !ended ? gold : SCRUM_RIM);
    u.uShare.value = g.share0;
    u.uProgress.value = ended ? 1 : g.progress;
    u.uBand.value = STYLE.scrumBandWidth / Math.max(0.5, l.radius);
    u.uRimW.value = STYLE.scrumRimWidth / Math.max(0.5, l.radius);
    u.uFillOp.value = STYLE.scrumFillOpacity * pulse;
    u.uOpacity.value = k * appear;
    this.wallMat.color.copy(leadColor);
    this.wallMat.opacity = STYLE.scrumWallOpacity * k * appear * pulse;
  }

  dispose(): void {
    this.discGeo.dispose();
    this.wallGeo.dispose();
    this.discMat.dispose();
    this.wallMat.dispose();
  }
}
