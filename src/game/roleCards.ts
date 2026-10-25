/**
 * Cartes de rôle du menu de lancement (étape 8), PURES et testées : nom, description, capacité et statistiques
 * visuelles (vitesse, portée, dégâts) tirées de ROLES (src/sim/constants.ts) — aucune valeur recopiée. Chaque
 * statistique a sa valeur réelle (affichée) et une note de 1 à STAT_PIPS, relative aux trois rôles (le meilleur a toutes
 * les pastilles, le moins bon une seule).
 *
 * Dégâts = dégâts d'UN tir au contact (plombs du fusil à pompe cumulés ; grenade : centre de l'explosion + impact
 * direct) : c'est ce que le joueur ressent (« faible mais précis » pour le pistolet-mitrailleur). Portée = portée maximale
 * de l'arme (`range`).
 */

import { ROLES, type Role, type TeamSize } from '../sim';
import { assignRoles, defaultComposition, ROLE_ORDER } from './roles';

/** Nombre de pastilles d'une statistique. */
export const STAT_PIPS = 5;

export type RoleStatId = 'speed' | 'range' | 'damage';

export interface RoleStat {
  id: RoleStatId;
  label: string;
  /** Valeur réelle (m/s, m, points de stabilité). */
  value: number;
  /** Texte de la valeur (« 8,8 m/s »). */
  text: string;
  /** Note 1..STAT_PIPS relative aux trois rôles. */
  rating: number;
}

export interface RoleCard {
  role: Role;
  label: string;
  description: string;
  weapon: string;
  ability: { label: string; detail: string };
  stats: RoleStat[];
}

/** Noms des armes affichés (cahier des charges). */
const WEAPON_NAMES: Readonly<Record<Role, string>> = {
  pilier: 'Fusil à pompe',
  ailier: 'Pistolet-mitrailleur',
  demi: 'Lance-grenades',
};

const fmt = (v: number, digits = 1): string => {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Number.isInteger(r) ? String(r) : r.toFixed(digits)).replace('.', ',');
};

/** Dégâts d'un tir au contact. */
export function burstDamage(role: Role): number {
  const w = ROLES[role].weapon;
  return w.projectile === 'grenade' ? w.blastDamageCenter + w.directHitBonus : w.damage * w.pellets;
}

const STAT_VALUE: Readonly<Record<RoleStatId, (r: Role) => number>> = {
  speed: (r) => ROLES[r].runSpeed,
  range: (r) => ROLES[r].weapon.range,
  damage: burstDamage,
};

/** Note 1..STAT_PIPS d'une valeur entre le min et le max des trois rôles. */
export function statRating(id: RoleStatId, role: Role): number {
  const values = ROLE_ORDER.map((r) => STAT_VALUE[id](r));
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return STAT_PIPS;
  return 1 + Math.round(((STAT_VALUE[id](role) - min) / (max - min)) * (STAT_PIPS - 1));
}

export function roleCard(role: Role): RoleCard {
  const r = ROLES[role];
  const a = r.ability;
  const detail = a.duration > 0 ? `${fmt(a.duration)} s · recharge ${fmt(a.cooldown)} s` : `recharge ${fmt(a.cooldown)} s`;
  const stat = (id: RoleStatId, label: string, unit: string): RoleStat => {
    const value = STAT_VALUE[id](role);
    return { id, label, value, text: `${fmt(value)} ${unit}`, rating: statRating(id, role) };
  };
  return {
    role,
    label: r.label,
    description: r.description,
    weapon: WEAPON_NAMES[role],
    ability: { label: a.label, detail: role === 'demi' ? `zone ${fmt(a.duration)} s · recharge ${fmt(a.cooldown)} s` : detail },
    stats: [stat('speed', 'Vitesse', 'm/s'), stat('range', 'Portée', 'm'), stat('damage', 'Dégâts', 'par tir')],
  };
}

/** Les trois cartes, dans l'ordre d'affichage. */
export const roleCards = (): RoleCard[] => ROLE_ORDER.map(roleCard);

/** Composition de l'équipe du joueur pour un choix (le joueur en tête), pour l'aperçu du menu. */
export const teamPreview = (teamSize: TeamSize, role: Role): Role[] => assignRoles(teamSize, role)[0];

/**
 * Composition par défaut d'une équipe en toutes lettres (« 1 pilier, 2 ailiers, 2 demis »), tirée de TEAM_ROLES_*
 * (constants.ts) : la note du menu suit un réglage de la composition. Rôles dans l'ordre d'affichage, absents omis.
 */
export function compositionText(teamSize: TeamSize): string {
  const comp = defaultComposition(teamSize);
  return ROLE_ORDER.map((r) => [r, comp.filter((x) => x === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${ROLES[r].label.toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(', ');
}

export { ROLE_ORDER };
