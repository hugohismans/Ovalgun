/**
 * Garde-fous de la contrainte d'architecture n°1 (voir docs/ARCHITECTURE.md §1).
 * - src/sim n'importe rien hors de src/sim.
 * - src/bots n'importe que src/sim et src/bots.
 * - Aucune source d'aléatoire ou de temps non déterministe, aucune API navigateur/Node.
 * - Côté client : graphe ui -> game / input, game -> render / input / bots, render -> sim, input -> sim ;
 *   hors de src/sim, on n'importe la sim QUE par son API publique (src/sim/index.ts).
 * (tsconfig.sim.json complète ce test en compilant sim+bots sans lib DOM.)
 * Les composants .svelte sont analysés aussi (contenu de leurs balises <script>).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(__dirname, '..');

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (/\.(ts|js|mjs|svelte)$/.test(name)) out.push(p);
  }
  return out;
}

/** Source analysée : le fichier entier, ou seulement les balises <script> d'un composant Svelte. */
function sourceOf(file: string): string {
  const raw = readFileSync(file, 'utf8');
  if (!file.endsWith('.svelte')) return raw;
  const scripts: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) scripts.push(m[1]);
  return scripts.join('\n');
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random (utiliser src/sim/prng.ts)'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\b/, 'performance'],
  [/\bwindow\b/, 'window'],
  [/\bdocument\b/, 'document'],
  [/\bnavigator\b/, 'navigator'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'timers'],
  [/\bprocess\b/, 'process'],
  [/\brequire\s*\(/, 'require'],
  // Présents dans la lib ES2022 (donc non rejetés par tsconfig.sim.json) mais dépendants de la
  // locale / de l'environnement : ils casseraient le déterminisme client/serveur.
  [/\bglobalThis\b/, 'globalThis'],
  [/\bIntl\b/, 'Intl'],
  [/\btoLocale\w*\b/, 'toLocale*'],
  // Défense en profondeur (vitest ne compile pas via tsconfig.sim.json).
  [/\bconsole\b/, 'console'],
  [/\bstructuredClone\b/, 'structuredClone'],
];

function importsOf(src: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function checkModule(dirRel: string, allowedRoots: string[]) {
  const dir = join(ROOT, dirRel);
  const files = listTs(dir);
  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = stripComments(sourceOf(file));
    for (const spec of importsOf(src)) {
      expect(spec.startsWith('.'), `${rel} importe un paquet externe interdit : "${spec}"`).toBe(true);
      const target = relative(ROOT, resolve(dirname(file), spec));
      const ok = allowedRoots.some((r) => target === r || target.startsWith(r + sep));
      expect(ok, `${rel} importe "${spec}" (${target}) hors de ${allowedRoots.join(', ')}`).toBe(true);
    }
    for (const [re, label] of FORBIDDEN) {
      expect(re.test(src), `${rel} utilise ${label}`).toBe(false);
    }
  }
  return files.length;
}

/**
 * Graphe de dépendances côté client (docs/ARCHITECTURE.md §1) : `dirRel` ne doit importer aucun
 * module local de `forbidden` (les paquets externes, ex. three, restent permis).
 */
function checkNoImportFrom(dirRel: string, forbidden: string[]) {
  const files = listTs(join(ROOT, dirRel));
  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = stripComments(sourceOf(file));
    for (const spec of importsOf(src)) {
      if (!spec.startsWith('.')) continue;
      const target = relative(ROOT, resolve(dirname(file), spec));
      for (const f of forbidden) {
        expect(target === f || target.startsWith(f + sep), `${rel} importe "${spec}" (${target}), interdit depuis ${dirRel}`).toBe(false);
      }
    }
  }
  return files.length;
}

/**
 * `dirRel` n'importe AUCUN module local hors de `allowed` (dossiers autorisés, en plus du sien).
 * Les paquets externes (three, svelte…) restent permis.
 */
function checkOnlyImportsFrom(dirRel: string, allowed: string[]) {
  const files = listTs(join(ROOT, dirRel));
  const roots = [dirRel, ...allowed].map((d) => d.split('/').join(sep));
  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = stripComments(sourceOf(file));
    for (const spec of importsOf(src)) {
      if (!spec.startsWith('.')) continue;
      const target = relative(ROOT, resolve(dirname(file), spec));
      const ok = roots.some((r) => target === r || target.startsWith(r + sep));
      expect(ok, `${rel} importe "${spec}" (${target}), interdit depuis ${dirRel} (autorisés : ${allowed.join(', ')})`).toBe(true);
    }
  }
  return files.length;
}

/** Hors de src/sim, la sim ne s'importe que par son API publique (src/sim ou src/sim/index). */
function checkSimPublicApi(dirRel: string) {
  const files = listTs(join(ROOT, dirRel));
  const simDir = join('src', 'sim');
  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = stripComments(sourceOf(file));
    for (const spec of importsOf(src)) {
      if (!spec.startsWith('.')) continue;
      const target = relative(ROOT, resolve(dirname(file), spec));
      if (!target.startsWith(simDir + sep)) continue;
      expect(target === join(simDir, 'index'), `${rel} importe un module interne de la sim : "${spec}" (passer par '../sim')`).toBe(true);
    }
  }
  return files.length;
}

describe('architecture', () => {
  it('src/ui n’importe que la colle (game) et les entrées (libellés des contrôles)', () => {
    expect(checkOnlyImportsFrom('src/ui', ['src/game', 'src/input'])).toBeGreaterThan(0);
  });

  it('src/render, src/input, src/game, src/ui n’utilisent que l’API publique de la sim', () => {
    for (const d of ['src/render', 'src/input', 'src/game', 'src/ui']) expect(checkSimPublicApi(d)).toBeGreaterThan(0);
  });

  it('les composants .svelte sont bien analysés', () => {
    const app = join(ROOT, 'src', 'ui', 'App.svelte');
    expect(importsOf(sourceOf(app)).some((s) => s.includes('game/session'))).toBe(true);
  });

  it('src/render ne dépend ni des entrées, ni de la colle, ni de l’UI', () => {
    expect(checkNoImportFrom('src/render', ['src/input', 'src/game', 'src/ui', 'src/bots'].map((d) => d.split('/').join(sep)))).toBeGreaterThan(0);
  });

  it('src/input ne dépend ni du rendu, ni de la colle, ni de l’UI', () => {
    expect(checkNoImportFrom('src/input', ['src/render', 'src/game', 'src/ui', 'src/bots'].map((d) => d.split('/').join(sep)))).toBeGreaterThan(0);
  });

  it('src/game ne dépend pas de l’UI', () => {
    expect(checkNoImportFrom('src/game', [join('src', 'ui')])).toBeGreaterThan(0);
  });

  it('src/sim est pur et autonome', () => {
    expect(checkModule('src/sim', [join('src', 'sim')])).toBeGreaterThan(0);
  });

  it('src/bots ne dépend que de src/sim', () => {
    expect(checkModule('src/bots', [join('src', 'sim'), join('src', 'bots')])).toBeGreaterThan(0);
  });
});
