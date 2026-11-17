// Screenshot the built dashboard: board, protocol detail, filtered view.
// Serves out/ over localhost (the page itself makes no network requests) and captures
// three 1440x900 PNGs into screenshots/. Fails on any page JS error.
//
//   node shot.mjs --out out
// Requires: playwright-core + a Chromium in the Playwright cache
// (npx -y playwright@1.49.1 install chromium).

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const outDir = opt('--out', 'out');
const shotDir = 'screenshots';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'dashboard/index.html';
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = readFileSync(join(outDir, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  // The full Chromium build (the headless-shell build is a separate download).
  executablePath: process.env.CHROME_PATH ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`,
});
const errors = [];
const shots = [
  ['01-board.png', '/dashboard/'],
  ['02-detail.png', '/dashboard/#/row/steakhouse-financial'],
  ['03-filtered.png', '/dashboard/#/cat/Risk%20Curators'],
];
mkdirSync(shotDir, { recursive: true });
for (const [name, url] of shots) {
  // A fresh page per shot: a hash-only navigation does not reload the page, so the
  // dashboard's deep-link handling would never run on the second and third shots.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board-body tr', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shotDir, name) });
  console.log(`shot ${name} <- ${url}`);
  await page.close();
}
await browser.close();
server.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('no page errors');
