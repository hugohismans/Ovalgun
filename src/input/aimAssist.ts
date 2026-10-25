/**
 * Aide à la visée (MANETTE uniquement, côté client) — module PUR, testable sous Node.
 *
 * Elle ne fait que moduler la rotation de caméra produite par le stick (donc le yaw/pitch du
 * PlayerInput) : la simulation n'en sait rien et un serveur autoritaire n'a rien à vérifier.
 *
 *  - Ralentissement : quand la visée passe à moins de AIM_ASSIST_ANGLE_DEG d'un adversaire actif à
 *    portée, la vitesse de caméra est multipliée par un facteur qui descend progressivement jusqu'à
 *    AIM_ASSIST_SLOWDOWN au centre de la cible (aucune marche : la sensation reste continue).
 *  - Suivi : si le joueur agit (stick incliné), une fraction AIM_ASSIST_TRACKING du déplacement
 *    angulaire de la cible depuis la frame précédente est ajoutée, bornée à
 *    AIM_ASSIST_MAX_TRACK_DEG_PER_SEC. Jamais d'accrochage : sans action du joueur, rien ne bouge,
 *    et la correction ne dépasse jamais quelques degrés par seconde.
 */

import {
  AIM_ASSIST_ANGLE_DEG,
  AIM_ASSIST_MAX_TRACK_DEG_PER_SEC,
  AIM_ASSIST_SLOWDOWN,
  AIM_ASSIST_TRACKING,
  aimDir,
  angleDiff,
  canShoot,
  clamp,
  PLAYER_RADIUS,
  ROLES,
  segmentSegment,
  type MatchState,
  type PlayerState,
  type PlayerStatus,
  type TeamId,
  type Vec3,
} from '../sim';

const DEG = Math.PI / 180;

/**
 * L'aide à la visée s'applique-t-elle au joueur `me` ? Seulement s'il peut tirer (canShoot : actif, non porteur, ni
 * glissade / plongeon / grimpe, ni bouclier levé — le pilier qui tourne son bouclier vers la menace ne doit pas voir sa
 * caméra « accrocher ») et si son arme tire en ligne droite : une grenade se lobe AU-DESSUS de la cible, l'aide (rayon
 * droit vers le corps) ralentirait la caméra au mauvais endroit (étape 7). PURE.
 */
export function aimAssistApplies(state: Readonly<MatchState>, me: Readonly<PlayerState>): boolean {
  return canShoot(state, me) && ROLES[me.role].weapon.gravity <= 0;
}

/** Un joueur vu par l'aide à la visée (positions INTERPOLÉES de la frame). */
export interface AssistCandidate {
  id: number;
  team: TeamId;
  status: PlayerStatus;
  /** Pieds. */
  x: number;
  y: number;
  z: number;
  /** Hauteur courante de la capsule. */
  height: number;
}

export interface AimAssistQuery {
  candidates: readonly AssistCandidate[];
  selfId: number;
  selfTeam: TeamId;
  /** Origine de visée (sim : aimOrigin) et orientation courante. */
  origin: Vec3;
  yaw: number;
  pitch: number;
  /** Portée de l'arme (m) : au-delà, pas d'aide. */
  range: number;
  /** Durée de la frame (s). */
  dt: number;
  /** Le joueur agit-il (stick de caméra ou de déplacement incliné) ? Sinon, pas de suivi. */
  inputActive: boolean;
}

export interface AimAssistResult {
  /** Multiplicateur de vitesse de caméra (1 = aucun effet). */
  slowdown: number;
  /** Corrections de suivi à ajouter au yaw / pitch pour cette frame (rad). */
  yawCorrection: number;
  pitchCorrection: number;
  /** Cible retenue, -1 si aucune. */
  targetId: number;
}

export const NO_ASSIST: Readonly<AimAssistResult> = Object.freeze({
  slowdown: 1,
  yawCorrection: 0,
  pitchCorrection: 0,
  targetId: -1,
});

/**
 * (Re)crée les candidats de l'aide à la visée pour les joueurs d'un match : un par joueur, à l'index de son id, avec son
 * équipe (positions remplies à chaque frame par la session). Réécrit `out` en place. À appeler à CHAQUE nouveau match :
 * depuis l'étape 8, la taille d'équipe change dans une même session (menu en 5v5 -> partie en 3v3), et des candidats
 * d'un match précédent donneraient de mauvaises équipes ou des « fantômes » (correction de l'étape 8).
 */
export function resetAssistCandidates(
  out: AssistCandidate[],
  players: readonly Readonly<{ id: number; team: TeamId; status: PlayerStatus }>[],
): void {
  out.length = 0;
  for (const p of players) out.push({ id: p.id, team: p.team, status: p.status, x: 0, y: 0, z: 0, height: 0 });
}

/** Cible la plus proche angulairement de la visée, dans le cône d'aide, ou null. */
export function findAssistTarget(q: AimAssistQuery): { candidate: AssistCandidate; angle: number } | null {
  const dir = aimDir(q.yaw, q.pitch);
  const rayEnd = { x: q.origin.x + dir.x * q.range, y: q.origin.y + dir.y * q.range, z: q.origin.z + dir.z * q.range };
  const maxAngle = AIM_ASSIST_ANGLE_DEG * DEG;
  let best: { candidate: AssistCandidate; angle: number } | null = null;
  for (const c of q.candidates) {
    if (c.id === q.selfId || c.team === q.selfTeam || c.status !== 'active') continue;
    // Axe de la capsule (centres des demi-sphères basse et haute).
    const lo = { x: c.x, y: c.y + Math.min(PLAYER_RADIUS, c.height / 2), z: c.z };
    const hi = { x: c.x, y: c.y + Math.max(c.height - PLAYER_RADIUS, c.height / 2), z: c.z };
    const s = segmentSegment(q.origin, rayEnd, lo, hi);
    const px = lo.x + (hi.x - lo.x) * s.t - q.origin.x;
    const py = lo.y + (hi.y - lo.y) * s.t - q.origin.y;
    const pz = lo.z + (hi.z - lo.z) * s.t - q.origin.z;
    const d = Math.hypot(px, py, pz);
    if (d < 1e-6 || d > q.range) continue;
    const cos = clamp((px * dir.x + py * dir.y + pz * dir.z) / d, -1, 1);
    // Taille apparente de la cible : l'aide agit dès que la visée effleure la capsule.
    const angle = Math.max(0, Math.acos(cos) - Math.atan(PLAYER_RADIUS / d));
    if (angle > maxAngle) continue;
    if (best === null || angle < best.angle) best = { candidate: c, angle };
  }
  return best;
}

/** Direction (yaw, pitch) du centre d'une cible vue depuis l'origine. */
function targetAngles(origin: Vec3, c: AssistCandidate): { yaw: number; pitch: number } {
  const dx = c.x - origin.x;
  const dy = c.y + c.height / 2 - origin.y;
  const dz = c.z - origin.z;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Aide à la visée avec sa (petite) mémoire : angles de la cible à la frame précédente. */
export class AimAssist {
  enabled = true;
  private lastTargetId = -1;
  private lastYaw = 0;
  private lastPitch = 0;

  update(q: AimAssistQuery): AimAssistResult {
    if (!this.enabled) {
      this.lastTargetId = -1;
      return NO_ASSIST;
    }
    const found = findAssistTarget(q);
    if (found === null) {
      this.lastTargetId = -1;
      return NO_ASSIST;
    }
    const strength = 1 - found.angle / (AIM_ASSIST_ANGLE_DEG * DEG); // 1 au centre, 0 au bord
    const slowdown = 1 - (1 - AIM_ASSIST_SLOWDOWN) * strength;
    const ang = targetAngles(q.origin, found.candidate);
    let yawCorrection = 0;
    let pitchCorrection = 0;
    if (found.candidate.id === this.lastTargetId && q.inputActive && q.dt > 0) {
      const maxStep = AIM_ASSIST_MAX_TRACK_DEG_PER_SEC * DEG * q.dt;
      yawCorrection = clamp(angleDiff(this.lastYaw, ang.yaw) * AIM_ASSIST_TRACKING * strength, -maxStep, maxStep);
      pitchCorrection = clamp((ang.pitch - this.lastPitch) * AIM_ASSIST_TRACKING * strength, -maxStep, maxStep);
    }
    this.lastTargetId = found.candidate.id;
    this.lastYaw = ang.yaw;
    this.lastPitch = ang.pitch;
    return { slowdown, yawCorrection, pitchCorrection, targetId: found.candidate.id };
  }

  reset(): void {
    this.lastTargetId = -1;
  }
}
