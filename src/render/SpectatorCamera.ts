/**
 * Caméra « spectateur » (étape 8) : vue de biais depuis le bord du terrain qui suit le ballon en douceur, pour le match
 * bots contre bots affiché en fond du menu de lancement. Purement visuelle (réglages STYLE.spectator*), elle ne lit que
 * la position affichée du ballon. Lissage exponentiel indépendant du framerate ; premier appel : placement direct.
 */

import * as THREE from 'three';
import type { FieldLayout, Vec3 } from '../sim';
import { blendToward } from './cameraMath';
import { STYLE } from './palette';

export class SpectatorCamera {
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private placed = false;

  /** Oublie la position (nouveau match : la caméra se replace directement). */
  reset(): void {
    this.placed = false;
  }

  update(camera: THREE.PerspectiveCamera, field: FieldLayout, ball: Vec3, dt: number, timeSec: number): void {
    const sway = Math.sin(timeSec * STYLE.spectatorSwayRate) * STYLE.spectatorSwayAmp;
    const wantX = -(field.width / 2 + STYLE.spectatorSideOffset);
    const wantY = STYLE.spectatorHeight;
    const wantZ = ball.z * STYLE.spectatorFollowZ + STYLE.spectatorBackZ + sway;
    const rate = STYLE.spectatorBlendRate;
    const tz = ball.z + STYLE.spectatorLookOffsetZ;
    if (!this.placed) {
      this.pos.set(wantX, wantY, wantZ);
      this.target.set(ball.x, ball.y, tz);
      this.placed = true;
    } else {
      this.pos.set(blendToward(this.pos.x, wantX, dt, rate), blendToward(this.pos.y, wantY, dt, rate), blendToward(this.pos.z, wantZ, dt, rate));
      this.target.set(
        blendToward(this.target.x, ball.x, dt, rate * 1.5),
        blendToward(this.target.y, ball.y, dt, rate * 1.5),
        blendToward(this.target.z, tz, dt, rate * 1.5),
      );
    }
    camera.position.copy(this.pos);
    camera.lookAt(this.target);
    if (Math.abs(camera.fov - STYLE.spectatorFov) > 1e-3) {
      camera.fov = STYLE.spectatorFov;
      camera.updateProjectionMatrix();
    }
  }
}
