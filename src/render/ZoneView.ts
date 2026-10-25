/**
 * Zones de ralentissement du demi (étape 7) et aperçus du joueur local (Three.js, pools préalloués) :
 *  - zone : disque translucide au sol (couleur de l'équipe), rideau bas translucide (visible de loin), bord en
 *    tirets qui tourne et pulse ; apparition et fondu de fin de vie ;
 *  - aperçus du joueur LOCAL : point de pose de sa zone (slowZonePlacement de la sim, capacité prête) et point d'impact
 *    de sa grenade (predictGrenadeImpact, en visée) — calculés par Renderer, ici seulement affichés.
 * Ne lit que des MatchState ; n'écrit jamais dans l'état.
 */

import * as THREE from 'three';
import { ROLES, SLOW_ZONE_RADIUS, TICK_RATE, type MatchState, type Vec3 } from '../sim';
import { PALETTE, STYLE } from './palette';

/** Anneau de tirets (géométrie plate, plan XZ) : `n` arcs de rayon intérieur r0 et extérieur r1. */
function dashedRing(r0: number, r1: number, n: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = 4;
  for (let d = 0; d < n; d++) {
    const a0 = (d / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n / 2;
    const base = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pos.push(Math.sin(a) * r0, 0, Math.cos(a) * r0, Math.sin(a) * r1, 0, Math.cos(a) * r1);
    }
    for (let i = 0; i < steps; i++) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

interface ZoneSlot {
  group: THREE.Group;
  discMat: THREE.MeshBasicMaterial;
  rimMat: THREE.MeshBasicMaterial;
  wallMat: THREE.MeshBasicMaterial;
  dashes: THREE.Mesh;
}

/** Aperçus du joueur local pour une frame (null : masqué). */
export interface AimPreviewFrame {
  zone: Vec3 | null;
  grenade: Vec3 | null;
  team: 0 | 1;
}

export class ZoneView {
  readonly group = new THREE.Group();
  private readonly discGeo = new THREE.CircleGeometry(SLOW_ZONE_RADIUS, 48).rotateX(-Math.PI / 2);
  private readonly rimGeo = new THREE.RingGeometry(SLOW_ZONE_RADIUS - STYLE.zoneRimWidth, SLOW_ZONE_RADIUS, 64).rotateX(-Math.PI / 2);
  private readonly dashGeo = dashedRing(SLOW_ZONE_RADIUS - STYLE.zoneRimWidth * 2.2, SLOW_ZONE_RADIUS - STYLE.zoneRimWidth * 1.4, 16);
  private readonly wallGeo = new THREE.CylinderGeometry(SLOW_ZONE_RADIUS, SLOW_ZONE_RADIUS, STYLE.zoneWallHeight, 48, 1, true);
  private readonly slots: ZoneSlot[] = [];
  private readonly previewZone: THREE.Mesh;
  private readonly previewZoneMat: THREE.MeshBasicMaterial;
  private readonly previewGrenade: THREE.Mesh;
  private readonly previewGrenadeMat: THREE.MeshBasicMaterial;
  private readonly previewGrenadeGeo = new THREE.RingGeometry(STYLE.grenadePreviewRadius * 0.75, STYLE.grenadePreviewRadius, 32).rotateX(-Math.PI / 2);
  /** Balise verticale fine de l'aperçu de grenade (lisible de loin : au ras du sol l'anneau s'écrase). */
  private readonly previewBeaconGeo = new THREE.CylinderGeometry(STYLE.grenadePreviewBeaconRadius, STYLE.grenadePreviewBeaconRadius, STYLE.grenadePreviewBeaconHeight, 6, 1, true).translate(
    0,
    STYLE.grenadePreviewBeaconHeight / 2,
    0,
  );

  constructor() {
    const flat = (color: string, opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
      });
    for (let i = 0; i < STYLE.zonePoolSize; i++) {
      const discMat = flat(PALETTE.teams[0].main, STYLE.zoneDiscOpacity);
      const rimMat = flat(PALETTE.teams[0].light, STYLE.zoneRimOpacity);
      const wallMat = flat(PALETTE.teams[0].light, STYLE.zoneWallOpacity);
      const disc = new THREE.Mesh(this.discGeo, discMat);
      const rim = new THREE.Mesh(this.rimGeo, rimMat);
      const dashes = new THREE.Mesh(this.dashGeo, rimMat);
      const wall = new THREE.Mesh(this.wallGeo, wallMat);
      disc.renderOrder = 1;
      rim.renderOrder = 2;
      dashes.renderOrder = 2;
      wall.renderOrder = 3;
      rim.position.y = 0.01;
      dashes.position.y = 0.015;
      wall.position.y = STYLE.zoneWallHeight / 2;
      const group = new THREE.Group();
      group.add(disc, rim, dashes, wall);
      group.visible = false;
      this.slots.push({ group, discMat, rimMat, wallMat, dashes });
      this.group.add(group);
    }
    this.previewZoneMat = flat(PALETTE.zonePreview, STYLE.zonePreviewOpacity);
    this.previewZone = new THREE.Mesh(this.dashGeo, this.previewZoneMat);
    this.previewZone.visible = false;
    this.previewZone.renderOrder = 2;
    this.previewGrenadeMat = flat(PALETTE.grenadePreview, STYLE.grenadePreviewOpacity);
    this.previewGrenade = new THREE.Mesh(this.previewGrenadeGeo, this.previewGrenadeMat);
    this.previewGrenade.add(new THREE.Mesh(this.previewBeaconGeo, this.previewGrenadeMat));
    this.previewGrenade.visible = false;
    this.previewGrenade.renderOrder = 2;
    this.group.add(this.previewZone, this.previewGrenade);
  }

  /** Une frame : zones de l'état courant (au plus STYLE.zonePoolSize), aperçus du joueur local. */
  update(curr: MatchState, preview: AimPreviewFrame, timeSec: number): void {
    const life = ROLES.demi.ability.duration * TICK_RATE;
    let n = 0;
    for (const z of curr.zones) {
      if (n >= this.slots.length) break;
      const slot = this.slots[n++];
      const team = curr.players[z.ownerId]?.team ?? z.team;
      const age = (life - z.ttl) / TICK_RATE;
      const appear = Math.min(1, Math.max(0, age / STYLE.zoneAppearSec));
      const fade = Math.min(1, z.ttl / TICK_RATE / STYLE.zoneFadeSec);
      const k = appear * fade;
      const pulse = 1 + STYLE.zonePulse * Math.sin(timeSec * STYLE.zonePulseRate);
      slot.group.visible = true;
      slot.group.position.set(z.pos.x, z.pos.y + 0.03, z.pos.z);
      const s = (z.radius / SLOW_ZONE_RADIUS) * (0.6 + 0.4 * appear);
      slot.group.scale.set(s, 1, s);
      slot.discMat.color.set(PALETTE.teams[team].main);
      slot.rimMat.color.set(PALETTE.teams[team].light);
      slot.wallMat.color.set(PALETTE.teams[team].light);
      slot.discMat.opacity = STYLE.zoneDiscOpacity * k * pulse;
      slot.rimMat.opacity = STYLE.zoneRimOpacity * k;
      slot.wallMat.opacity = STYLE.zoneWallOpacity * k * pulse;
      slot.dashes.rotation.y = timeSec * STYLE.zoneSpinRate;
    }
    for (let i = n; i < this.slots.length; i++) this.slots[i].group.visible = false;

    this.previewZone.visible = preview.zone !== null;
    if (preview.zone !== null) {
      this.previewZone.position.set(preview.zone.x, preview.zone.y + 0.04, preview.zone.z);
      this.previewZone.rotation.y = -timeSec * STYLE.zoneSpinRate;
      this.previewZoneMat.color.set(PALETTE.teams[preview.team].light);
    }
    this.previewGrenade.visible = preview.grenade !== null;
    if (preview.grenade !== null) this.previewGrenade.position.set(preview.grenade.x, preview.grenade.y + 0.05, preview.grenade.z);
  }

  dispose(): void {
    this.discGeo.dispose();
    this.rimGeo.dispose();
    this.dashGeo.dispose();
    this.wallGeo.dispose();
    this.previewGrenadeGeo.dispose();
    this.previewBeaconGeo.dispose();
    for (const s of this.slots) {
      s.discMat.dispose();
      s.rimMat.dispose();
      s.wallMat.dispose();
    }
    this.previewZoneMat.dispose();
    this.previewGrenadeMat.dispose();
  }
}
