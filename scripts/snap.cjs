// Outil de dev : capture d'écran headless (Chromium + SwiftShader) d'une URL.
// Usage : node scripts/snap.cjs <url> <sortie.png> [attente_ms]
// Nécessite Playwright installé globalement (non listé dans package.json).
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:5173/';
  const out = process.argv[3] || 'shot.png';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(Number(process.argv[4] || 2000));
  await page.screenshot({ path: out });
  console.log(logs.join('\n'));
  await browser.close();
})();
