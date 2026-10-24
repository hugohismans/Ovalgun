/**
 * Armes et statut corporel (étape 5) — générique à partir de WeaponStats (constants.ts).
 *
 *  - updateStatusTimers (étape 4 de `step`) : 'down' -> 'getting_up' -> 'active' (stabilité pleine,
 *    invulnérabilité GETUP_INVULN_SEC, événement 'getup') ; rechargement (chargeur plein à la fin) ; délai de régénération.
 *  - updateShooting (étape 5) : rechargement manuel / automatique, tir automatique (FIRE maintenu) à la cadence
 *    de l'arme, dispersion seedée sur state.rng, création des projectiles (projectiles.ts les déplace à l'étape 6, avant le déplacement des joueurs).
 *  - canShoot / fireOverridesSprint : règles partagées avec le déplacement (le tir l'emporte sur le sprint).
 *
 * Projectiles et collisions : projectiles.ts ; dégâts, plaquage, régénération : stability.ts.
 * ÉTAPE 7 : grenades (weaponImplemented), bouclier levé (canShoot, blocage dans projectiles.ts).
 */

import { GETUP_DURATION_SEC, GETUP_INVULN_SEC, PROJECTILE_MAX_LIFE_SEC, ROLES, type WeaponStats } from './constants';
import { has, type TickInput } from './input';
import { aimOrigin, cooldownTicks, isCarrier } from './playerStatus';
import { rand } from './prng';
import { secToTicks } from './time';
import { Buttons, type MatchState, type PlayerState } from './types';
import { aimDir, type Vec3 } from './vec';

const DEG = Math.PI / 180;

/** L'arme est-elle implémentée ? Étape 5 : balles et plombs. TODO ÉTAPE 7 : grenades (explosion, knockback). */
export const weaponImplemented = (w: WeaponStats): boolean => w.projectile !== 'grenade';

/** Cadence de tir en ticks (fireInterval arrondi au tick, au moins 1). Non raccourcie en dernière minute. */
export const fireIntervalTicks = (w: WeaponStats): number => Math.max(1, secToTicks(w.fireInterval));

/**
 * Le joueur peut-il se servir de son arme (tirer, recharger à la main) ? Actif (ni plaqué ni en train de se
 * relever), NON porteur (cahier des charges), pas en posture basse (glissade, plongeon / récupération au sol :
 * l'origine de visée reste à AIM_ORIGIN_HEIGHT, on tirerait par-dessus un muret avec une hitbox cachée derrière),
 * pas en grimpe. Permis en course, en saut et en esquive. Le sprint n'empêche pas de tirer : le tir l'emporte
 * (fireOverridesSprint). TODO ÉTAPE 7 : bouclier levé (pilier) => pas de tir.
 */
export function canShoot(state: MatchState, p: PlayerState): boolean {
  return (
    p.status === 'active' &&
    !isCarrier(state, p) &&
    p.move !== 'slide' &&
    p.move !== 'dive' &&
    p.move !== 'dive_recover' &&
    p.move !== 'climb'
  );
}

/**
 * Tir contre sprint : vrai si FIRE est maintenu ET que le tir est possible (canShoot, arme implémentée, chargeur
 * non vide, pas en rechargement). Le déplacement ignore alors le sprint ce tick : le tir l'emporte (on ne court
 * pas en tirant). Entre deux balles (cadence), le sprint reste coupé ; pendant un rechargement, il reprend.
 */
export function fireOverridesSprint(state: MatchState, p: PlayerState, inp: TickInput): boolean {
  if (!has(inp.buttons, Buttons.FIRE) || p.reloadTicks > 0 || p.ammo <= 0) return false;
  return weaponImplemented(ROLES[p.role].weapon) && canShoot(state, p);
}

/**
 * Direction d'un projectile dans le cône de dispersion (PURE) : uniforme sur la calotte sphérique de demi-angle
 * `halfAngle` (rad) autour de aimDir(yaw, pitch). `u1`, `u2` ∈ [0, 1) : deux tirages uniformes
 * (cos de l'écart uniforme dans [cos θ, 1], azimut uniforme dans [0, 2π)).
 */
export function spreadDirection(yaw: number, pitch: number, halfAngle: number, u1: number, u2: number): Vec3 {
  const d = aimDir(yaw, pitch);
  const cosA = 1 - u1 * (1 - Math.cos(halfAngle));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const phi = 2 * Math.PI * u2;
  // Base orthonormée autour de d : r = right(yaw) (horizontal, ⟂ d), u = d × r.
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const rx = -cy;
  const rz = sy;
  const ux = sp * sy;
  const uy = -cp;
  const uz = sp * cy;
  const a = Math.cos(phi) * sinA;
  const b = Math.sin(phi) * sinA;
  // `+ 0` : pas de -0 dans l'état (il deviendrait 0 après un aller-retour JSON).
  return { x: d.x * cosA + rx * a + ux * b + 0, y: d.y * cosA + uy * b + 0, z: d.z * cosA + rz * a + uz * b + 0 };
}

/** Étape 4 de `step` : statut corporel (plaqué -> relevé -> actif), rechargement, délai de régénération. */
export function updateStatusTimers(state: MatchState): void {
  for (const p of state.players) {
    if (p.reloadTicks > 0) {
      p.reloadTicks--;
      if (p.reloadTicks === 0) p.ammo = ROLES[p.role].weapon.magazine;
    }
    if (p.regenDelayTicks > 0) p.regenDelayTicks--;
    if (p.status === 'down') {
      if (p.statusTicks > 0) p.statusTicks--;
      if (p.statusTicks === 0) {
        // Se relève : immobile et invulnérable pendant GETUP_DURATION_SEC.
        p.status = 'getting_up';
        p.statusTicks = secToTicks(GETUP_DURATION_SEC);
      }
    } else if (p.status === 'getting_up') {
      if (p.statusTicks > 0) p.statusTicks--;
      if (p.statusTicks === 0) {
        // Debout, sur place (pas de respawn) : stabilité pleine, brève invulnérabilité (pas de re-plaquage instantané).
        p.status = 'active';
        p.stability = ROLES[p.role].stabilityMax;
        p.regenDelayTicks = 0;
        p.lastHitBy = -1;
        p.invulnTicks = Math.max(p.invulnTicks, secToTicks(GETUP_INVULN_SEC));
        state.events.push({ type: 'getup', playerId: p.id });
      }
    }
  }
}

/** Démarre un rechargement (reloadSec, raccourci en dernière minute) ; événement 'reload'. */
function startReload(state: MatchState, p: PlayerState, w: WeaponStats): void {
  p.reloadTicks = Math.max(1, cooldownTicks(state, w.reloadSec));
  state.events.push({ type: 'reload', playerId: p.id });
}

/**
 * Un tir : `pellets` projectiles depuis l'origine de visée (aimOrigin), chacun dans le cône de dispersion
 * (spreadHipDeg, ou spreadAimDeg en visée), 2 tirages state.rng par projectile ; une munition consommée.
 * Événement 'shot' (direction visée, avant dispersion) ; stats.shotsFired compte les PROJECTILES (précision =
 * shotsHit / shotsFired ≤ 1, plombs compris).
 */
function fire(state: MatchState, p: PlayerState, w: WeaponStats, aiming: boolean): void {
  const origin = aimOrigin(p.pos, p.yaw);
  const half = (aiming ? w.spreadAimDeg : w.spreadHipDeg) * DEG;
  const ttl = Math.max(1, secToTicks(PROJECTILE_MAX_LIFE_SEC));
  for (let k = 0; k < w.pellets; k++) {
    const u1 = rand(state);
    const u2 = rand(state);
    const dir = spreadDirection(p.yaw, p.pitch, half, u1, u2);
    state.projectiles.push({
      id: state.nextEntityId++,
      kind: w.projectile,
      ownerId: p.id,
      team: p.team,
      pos: { x: origin.x, y: origin.y, z: origin.z },
      vel: { x: dir.x * w.speed, y: dir.y * w.speed, z: dir.z * w.speed },
      ttl,
      traveled: 0,
      damage: w.damage,
    });
  }
  p.ammo--;
  p.fireCd = fireIntervalTicks(w);
  p.stats.shotsFired += w.pellets;
  state.events.push({ type: 'shot', playerId: p.id, kind: w.projectile, pos: origin, dir: aimDir(p.yaw, p.pitch) });
}

/**
 * Étape 5 de `step` : armes, ordre des ids (les tirages de dispersion sont donc déterministes).
 *  - Seulement si canShoot (ni porteur, ni au sol, ni en glissade / plongeon / grimpe) et l'arme est implémentée.
 *  - `carrierAtStart` : id du porteur au DÉBUT du tick (−1 : aucun). Il n'utilise pas son arme ce tick, même s'il
 *    vient de passer ou de taper le ballon (à la manette, Y émet KICK + RELOAD : le coup de pied ne déclenche pas
 *    en plus un rechargement).
 *  - Rechargement : automatique chargeur vide, manuel sur front montant RELOAD si le chargeur est incomplet
 *    (le rechargement prime sur un tir du même tick).
 *  - Tir : FIRE maintenu, fireCd == 0, munitions, pas en rechargement ; cadence fireIntervalTicks. Le dernier
 *    coup du chargeur déclenche aussitôt le rechargement automatique.
 */
export function updateShooting(state: MatchState, inputs: readonly TickInput[], carrierAtStart: number): void {
  for (const p of state.players) {
    const inp = inputs[p.id];
    if (inp === undefined || p.id === carrierAtStart) continue;
    const w = ROLES[p.role].weapon;
    if (!weaponImplemented(w) || !canShoot(state, p)) continue;
    if (p.reloadTicks === 0 && p.ammo < w.magazine && (p.ammo <= 0 || has(inp.pressed, Buttons.RELOAD))) {
      startReload(state, p, w);
      continue;
    }
    if (!has(inp.buttons, Buttons.FIRE) || p.fireCd > 0 || p.ammo <= 0 || p.reloadTicks > 0) continue;
    fire(state, p, w, has(inp.buttons, Buttons.AIM));
    if (p.ammo <= 0) startReload(state, p, w);
  }
}
