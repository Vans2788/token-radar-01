// Token Radar entrypoint: snapshot in, board.json + dashboard + dossier out.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Deterministic: every figure comes from the snapshot (its fixed as_of date, never the wall
// clock), there is no randomness, and ties break on slug, so two runs write identical bytes.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The --input value, or the sealed snapshot's path when none is given. */
function inputPath(argv: string[]): string {
  const i = argv.indexOf('--input');
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1]!;
  return '/input/snapshot.json';
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const input = inputPath(process.argv.slice(2));

const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
const { board, radar } = buildRadar(snapshot);

const issue = boardIssue(board, snapshot);
if (issue !== null) throw new Error(`board refused: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

for (const dir of ['dashboard', 'screenshots']) {
  const src = join(here, dir);
  if (!existsSync(src)) throw new Error(`missing ./${dir}/ next to main.ts`);
  cpSync(src, join(outDir, dir), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536 }));

const top = board[0]!;
const watchlistCovered = snapshot.watchlist.filter((s) => board.some((r) => r.slug === s)).length;
console.log(`token-radar ${radar.model_version}: ${board.length} rows, watchlist ${watchlistCovered}/${snapshot.watchlist.length}, as of ${snapshot.as_of}`);
console.log(`top row: #1 ${top.name} — implied $${top.implied_value_usd.toLocaleString('en-US')} on $${top.tvl_usd.toLocaleString('en-US')} TVL`);
console.log(`wrote ${outDir}/board.json, ${outDir}/data.js, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`);
