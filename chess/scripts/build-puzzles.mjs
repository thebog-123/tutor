// Turns generator output (JSON lines) into src/data/puzzles.json.
// Usage: node scripts/build-puzzles.mjs out1.jsonl out2.jsonl ...
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/build-puzzles.mjs <file.jsonl>...');
  process.exit(1);
}

const byKey = new Map();
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    const key = p.fen.split(' ').slice(0, 4).join(' ');
    if (!byKey.has(key)) byKey.set(key, p);
  }
}
let list = [...byKey.values()];

// Keep "take the free piece" puzzles to a small share so the set isn't dominated by them.
const easy = list.filter((p) => p.themes.includes('hangingPiece'));
const rest = list.filter((p) => !p.themes.includes('hangingPiece'));
const maxEasy = Math.round(rest.length * 0.18);
easy.sort((a, b) => hash(a.fen).localeCompare(hash(b.fen)));
list = [...rest, ...easy.slice(0, maxEasy)];

// Spread the raw difficulty scores over a realistic rating range, keeping their order.
list.sort((a, b) => a.rating - b.rating || hash(a.fen).localeCompare(hash(b.fen)));
const n = list.length;
list.forEach((p, i) => {
  const q = (i + 0.5) / n;
  p.rating = Math.round(Math.max(400, Math.min(2800, 1350 + 520 * probit(q))));
});

const out = list
  .map((p) => [hash(p.fen + p.moves.join('')).slice(0, 6), p.fen, p.moves.join(' '), p.rating, p.themes.join(' ')])
  .sort((a, b) => a[3] - b[3]);

const dest = fileURLToPath(new URL('../src/data/puzzles.json', import.meta.url));
fs.writeFileSync(dest, '[\n' + out.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`wrote ${out.length} puzzles (${Math.min(easy.length, maxEasy)} hanging-piece) to ${dest}`);

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('base64url').replace(/[-_]/g, 'x');
}

// Inverse normal CDF (Acklam's approximation).
function probit(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
