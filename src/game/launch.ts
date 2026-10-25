/**
 * Paramètres de lancement d'une partie (étape 8), PURS et testés : taille d'équipe, rôle du joueur, difficulté des
 * bots, entraînement — choisis dans le menu, mémorisés par l'UI (localStorage) et toujours lisibles dans l'URL pour le
 * debug (`?size=5&role=pilier&difficulty=difficile&training`). Drapeaux de debug : `?debug` (partie lancée tout de
 * suite, sans menu ni pointer lock), `?menu` (avec `?debug` : afficher quand même le menu), `?autopilot`,
 * `?dummies=off`, `?duration=<s>` (match raccourci, debug seulement : écran de fin rapide).
 *
 * `sanitizeSetup` accepte n'importe quelle valeur (JSON relu du stockage) et rend un choix valide.
 */

import { DEFAULT_BOT_DIFFICULTY, type BotDifficulty, type Role, type TeamSize } from '../sim';
import { parseRole } from './roles';

export interface MatchSetup {
  teamSize: TeamSize;
  role: Role;
  difficulty: BotDifficulty;
  /** Mode entraînement : chrono figé, outils de test (ballon pour moi / au centre). */
  training: boolean;
}

export const DIFFICULTIES: readonly BotDifficulty[] = ['facile', 'normal', 'difficile'];
export const TEAM_SIZES: readonly TeamSize[] = [3, 5];

export const DEFAULT_SETUP: Readonly<MatchSetup> = Object.freeze({
  teamSize: 3,
  role: 'ailier',
  difficulty: DEFAULT_BOT_DIFFICULTY,
  training: false,
});

export const parseDifficulty = (v: unknown, fallback: BotDifficulty): BotDifficulty =>
  v === 'facile' || v === 'normal' || v === 'difficile' ? v : fallback;

const parseTeamSize = (v: unknown, fallback: TeamSize): TeamSize => (v === 3 || v === '3' ? 3 : v === 5 || v === '5' ? 5 : fallback);

/** Choix valide à partir de n'importe quelle valeur ; champ manquant ou invalide => `base`. */
export function sanitizeSetup(raw: unknown, base: Readonly<MatchSetup> = DEFAULT_SETUP): MatchSetup {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    teamSize: parseTeamSize(o.teamSize, base.teamSize),
    role: parseRole(typeof o.role === 'string' ? o.role : null, base.role),
    difficulty: parseDifficulty(o.difficulty, base.difficulty),
    training: typeof o.training === 'boolean' ? o.training : base.training,
  };
}

/** Lecture des paramètres d'URL (sous-ensemble de URLSearchParams, pour les tests). */
export interface ParamReader {
  get(name: string): string | null;
  has(name: string): boolean;
}

/** Choix de l'URL appliqués par-dessus `base` (les paramètres absents gardent la valeur de `base`). */
export function setupFromParams(p: ParamReader, base: Readonly<MatchSetup>): MatchSetup {
  return {
    teamSize: p.has('size') ? parseTeamSize(p.get('size'), base.teamSize) : base.teamSize,
    role: parseRole(p.get('role'), base.role),
    difficulty: parseDifficulty(p.get('difficulty'), base.difficulty),
    training: p.has('training') ? p.get('training') !== '0' && p.get('training') !== 'off' : base.training,
  };
}

export interface DebugFlags {
  /** ?debug : clavier sans pointer lock, pas de pause automatique, session exposée sur window, partie lancée sans menu. */
  debug: boolean;
  /** ?debug&menu : afficher le menu même en debug (tests de l'UI). */
  showMenu: boolean;
  /** ?debug&autopilot : le joueur 0 est aussi un bot. */
  autopilot: boolean;
  /** ?dummies=off : joueurs non humains passifs. */
  passive: boolean;
  /** ?debug&duration=<s> : durée du match (s), 0 = durée normale. */
  durationSec: number;
}

/** Drapeaux de debug de l'URL. */
export function debugFlagsFromParams(p: ParamReader): DebugFlags {
  const debug = p.has('debug');
  const d = Number(p.get('duration'));
  return {
    debug,
    showMenu: !debug || p.has('menu'),
    autopilot: debug && p.has('autopilot'),
    passive: p.get('dummies') === 'off',
    durationSec: debug && Number.isFinite(d) && d > 0 ? d : 0,
  };
}
