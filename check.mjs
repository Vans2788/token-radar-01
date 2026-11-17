// Local gate checker for the token-radar entry: the 7 gate checks plus the no-network,
// source-size and data.js/board.json agreement checks the judge reads.
//
//   node check.mjs --out out --input ../input/snapshot.json
// Exits 0 when every check passes, 1 otherwise.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const outDir = opt('--out', 'out');
const input = opt('--input', '/input/snapshot.json');

const fails = [];
const oks = [];
const check = (name, ok, detail = '') => {
  (ok ? oks : fails).push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const boardText = readFileSync(join(outDir, 'board.json'), 'utf8');
const board = JSON.parse(boardText).rows;

// dashboard_files
const dashFiles = [];
(function walk(rel) {
  for (const e of readdirSync(join(outDir, 'dashboard', rel), { withFileTypes: true })) {
    const p = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) check('dashboard_files', false, `dot-directory ${p}`);
      walk(p);
    } else if (e.isFile()) dashFiles.push(p);
  }
})('');
const dashBytes = dashFiles.reduce((n, f) => n + statSync(join(outDir, 'dashboard', f)).size, 0);
const hasHtml = dashFiles.some((f) => f === 'index.html' || f.endsWith('.html'));
const hasCss = dashFiles.some((f) => f.endsWith('.css'));
const hasJs = dashFiles.some((f) => f.endsWith('.js'));
const badName = dashFiles.find((f) => !/^[A-Za-z0-9._-]+$/.test(f.split('/').pop()) || f.split('/').pop().startsWith('.') || f.split('/').pop().startsWith('-'));
check('dashboard_files', hasHtml && hasCss && hasJs && dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024 && !badName,
  `${dashFiles.length} files, ${dashBytes} bytes${badName ? `, bad name ${badName}` : ''}`);

// no-network + source size
let urlHit = null;
for (const f of dashFiles.filter((x) => /\.(html|css|js)$/.test(x))) {
  const t = readFileSync(join(outDir, 'dashboard', f), 'utf8');
  if (/https?:\/\//.test(t)) urlHit = f;
}
check('dashboard_no_network', urlHit === null, urlHit ? `URL in ${urlHit}` : 'no http(s) URLs in dashboard source');
check('dashboard_source_lt_64k', dashBytes < 65536, `${dashBytes} bytes`);

// board_file
check('board_file', Array.isArray(board) && board.length >= 100 && board.length <= 4000 && Buffer.byteLength(boardText) <= 8 * 1024 * 1024,
  `${board.length} rows, ${Buffer.byteLength(boardText)} bytes`);

// sorted_by_value
const ranksOk = board.every((r, i) => r.rank === i + 1);
const monoOk = board.every((r, i) => i === 0 || r.implied_value_usd <= board[i - 1].implied_value_usd);
const valOk = board.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 100_000_000_000_000);
const uniqOk = new Set(board.map((r) => r.slug)).size === board.length;
check('sorted_by_value', ranksOk && monoOk && valOk && uniqOk, `ranks ${ranksOk}, monotonic ${monoOk}, values ${valOk}, unique ${uniqOk}`);

// coverage
const missing = snapshot.watchlist.filter((s) => !board.some((r) => r.slug === s));
check('coverage', missing.length === 0, missing.length === 0 ? `${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist` : `missing ${missing.join(', ')}`);

// farm_steps
const outside = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
let stepBad = null;
for (const r of board) {
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { stepBad = `${r.slug}: ${r.farm_steps.length} steps`; break; }
  const bad = r.farm_steps.find((s) => s.length < 20 || s.length > 600);
  if (bad !== undefined) { stepBad = `${r.slug}: step of ${bad.length} chars`; break; }
}
check('farm_steps', stepBad === null && outside >= 60, stepBad ?? `${outside} rows outside the watchlist`);

// screenshots
function pngSize(b) {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const shots = readdirSync(join(outDir, 'screenshots')).filter((f) => !f.startsWith('.')).sort();
let shotBad = null;
for (const f of shots) {
  const b = readFileSync(join(outDir, 'screenshots', f));
  const size = pngSize(b) ?? jpegSize(b);
  if (size === null) { shotBad = `${f}: not a whole PNG/JPEG`; break; }
  if (b.length > 512 * 1024) { shotBad = `${f}: ${b.length} bytes over 512 KiB`; break; }
  const long = Math.max(size.w, size.h);
  const short = Math.min(size.w, size.h);
  if (long > 1440 || short < 800) { shotBad = `${f}: ${size.w}x${size.h}`; break; }
}
check('screenshots', shots.length >= 3 && shots.length <= 4 && shotBad === null,
  shotBad ?? `${shots.length} images: ${shots.join(', ')}`);

// dossier_matches
const dossierOnDisk = readFileSync(join(outDir, 'dossier.json'));
let rebuilt;
try {
  rebuilt = buildDossier(outDir, { text_max_bytes: 65536 });
} catch (e) {
  check('dossier_matches', false, String(e));
  rebuilt = null;
}
if (rebuilt !== null) {
  const same = Buffer.from(rebuilt).equals(dossierOnDisk);
  const doc = JSON.parse(dossierOnDisk.toString('utf8'));
  check('dossier_matches', same && dossierOnDisk.length <= 1.5 * 1024 * 1024 && Buffer.byteLength(doc.text) <= 65536,
    same ? `${dossierOnDisk.length} bytes, text ${Buffer.byteLength(doc.text)} bytes` : 'dossier.json differs from buildDossier output');
}

// data.js agrees with board.json
const dataText = readFileSync(join(outDir, 'data.js'), 'utf8');
const radar = JSON.parse(dataText.replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
const dataOk = radar.rows.length === board.length &&
  radar.rows.every((r, i) => r.slug === board[i].slug && r.implied_value_usd === board[i].implied_value_usd &&
    JSON.stringify(r.farm_steps) === JSON.stringify(board[i].farm_steps));
check('data_matches_board', dataOk, `${radar.rows.length} rows in data.js`);

for (const line of [...oks, ...fails]) console.log(line);
console.log(fails.length === 0 ? `\nALL ${oks.length} CHECKS PASSED` : `\n${fails.length} CHECK(S) FAILED`);
process.exit(fails.length === 0 ? 0 : 1);
