/**
 * Garde-fous de la contrainte d'architecture n°1 (voir docs/ARCHITECTURE.md §1).
 * - src/sim n'importe rien hors de src/sim.
 * - src/bots n'importe que src/sim et src/bots.
 * - Aucune source d'aléatoire ou de temps non déterministe, aucune API navigateur/Node.
 * (tsconfig.sim.json complète ce test en compilant sim+bots sans lib DOM.)
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
    else if (/\.(ts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
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
    const src = stripComments(readFileSync(file, 'utf8'));
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

describe('architecture', () => {
  it('src/sim est pur et autonome', () => {
    expect(checkModule('src/sim', [join('src', 'sim')])).toBeGreaterThan(0);
  });

  it('src/bots ne dépend que de src/sim', () => {
    expect(checkModule('src/bots', [join('src', 'sim'), join('src', 'bots')])).toBeGreaterThan(0);
  });
});
