// Puzzle generator: plays noisy engine-vs-engine games, finds moments where one side
// blunders and the other has a single winning reply, then extends the forced line.
// Usage: node gen.mjs <outfile.jsonl> <count> <seed>
import { Chess } from 'chess.js';
import fs from 'node:fs';
import { Engine, score } from './engine.mjs';

const [, , out, countArg, seedArg] = process.argv;
const target = +countArg || 50;
let seed = +seedArg || 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const DEPTH = 13;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const e = new Engine();
await e.init();

const seen = new Set();
let made = 0;

function uci(m) { return m.from + m.to + (m.promotion || ''); }
function apply(ch, u) { return ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
function material(ch, color) {
  let s = 0;
  for (const row of ch.board()) for (const sq of row) if (sq) s += (sq.color === color ? 1 : -1) * VAL[sq.type];
  return s;
}
function nonPawn(ch) {
  let s = 0;
  for (const row of ch.board()) for (const sq of row) if (sq && sq.type !== 'p' && sq.type !== 'k') s += VAL[sq.type];
  return s;
}

async function pickGameMove(ch) {
  const moves = ch.moves({ verbose: true });
  if (rand() < 0.01) return uci(moves[Math.floor(rand() * moves.length)]);
  const lines = await e.analyse(ch.fen(), { nodes: 600 + Math.floor(rand() * 4000), multipv: 4 });
  if (!lines.length) return uci(moves[0]);
  const top = score(lines[0]);
  const ok = lines.filter((l) => score(l) > top - 60);
  return ok[Math.floor(rand() * ok.length)].move;
}

// Depth at which the engine first finds (and keeps) the move: proxy for difficulty.
async function findDepth(fen, move) {
  let found = null;
  for (const d of [1, 2, 3, 4, 6, 8, 10, 12]) {
    const [l] = await e.analyse(fen, { depth: d });
    if (l?.move === move) { if (found == null) found = d; } else found = null;
  }
  return found ?? 14;
}

function themesFor(start, line, isMate, mateIn) {
  const t = new Set();
  const ch = new Chess(start);
  const player = (() => { const c = new Chess(start); apply(c, line[0]); return c.turn(); })();
  if (isMate) { t.add('mate'); t.add(`mateIn${mateIn}`); }
  apply(ch, line[0]);
  const pm = [];
  for (let i = 1; i < line.length; i++) {
    const m = apply(ch, line[i]);
    if (ch.turn() !== player) pm.push({ m, fen: ch.fen() });
    if (m.promotion) t.add('promotion');
    if (m.flags.includes('k') || m.flags.includes('q')) t.add('castling');
    if (m.flags.includes('e')) t.add('enPassant');
  }
  const first = pm[0];
  // Fork: the moved piece attacks two or more enemy pieces worth more than itself (or the king).
  {
    const c = new Chess(first.fen);
    const to = first.m.to;
    const piece = first.m.piece;
    let hits = 0;
    for (const row of c.board()) for (const sq of row) {
      if (!sq || sq.color === player) continue;
      const attackers = c.attackers(sq.square, player);
      if (attackers.includes(to) && (sq.type === 'k' || VAL[sq.type] > VAL[piece] || (VAL[sq.type] >= 3 && !c.attackers(sq.square, sq.color).length))) hits++;
    }
    if (hits >= 2 && !isMate) t.add('fork');
  }
  if (!first.m.captured && !first.fen.includes('+') && !new Chess(first.fen).inCheck()) t.add('quietMove');
  if (line.length === 2 && first.m.captured && !isMate) t.add('hangingPiece');
  if (isMate) {
    const last = new Chess(start); for (const u of line) apply(last, u);
    const kingSq = last.board().flat().find((s) => s && s.type === 'k' && s.color !== player)?.square;
    if (kingSq && (kingSq[1] === '1' || kingSq[1] === '8') && pm.at(-1).m.piece !== 'n' && pm.at(-1).m.piece !== 'q') t.add('backRankMate');
    if (pm.at(-1).m.piece === 'n') {
      // smothered: king has no free squares because of own pieces
      t.add('knightMate');
    }
  }
  // Sacrifice: player's material drops after their first move and the opponent can recapture.
  {
    const c = new Chess(start); apply(c, line[0]);
    const before = material(c, player);
    apply(c, line[1]);
    const capturedVal = first.m.captured ? VAL[first.m.captured] : 0;
    const attacked = c.attackers(first.m.to, c.turn()).length > 0 && !c.isCheckmate();
    if (attacked && VAL[first.m.piece] - capturedVal >= 2 && before !== null) t.add('sacrifice');
  }
  const np = nonPawn(new Chess(start));
  t.add(np <= 14 ? 'endgame' : new Chess(start).moveNumber() < 14 ? 'opening' : 'middlegame');
  t.add(pm.length === 1 ? 'oneMove' : pm.length === 2 ? 'short' : pm.length <= 3 ? 'long' : 'veryLong');
  return [...t];
}

async function tryPuzzle(beforeFen, blunder, prevEvalForBlunderer) {
  const ch = new Chess(beforeFen);
  apply(ch, blunder);
  if (ch.isGameOver()) return null;
  const pos = ch.fen();
  const [b1, b2] = await e.analyse(pos, { depth: DEPTH, multipv: 2 });
  if (!b1) return null;
  const s1 = score(b1), s2 = b2 ? score(b2) : -100000;
  // Before the blunder the blunderer was fine; now the opponent is winning with one move only.
  if (prevEvalForBlunderer < -120) return null;
  const isMate = b1.mate != null && b1.mate > 0;
  if (!isMate && (s1 < 280 || s1 > 3000)) return null;
  if (isMate && b1.mate > 4) return null;
  if (isMate ? (b2 && b2.mate != null && b2.mate > 0 && b2.mate <= b1.mate + 1 && b1.mate > 1) : s2 > Math.min(150, s1 - 250)) return null;
  if (isMate && b1.mate === 1 && b2 && b2.mate === 1) return null; // two mates in one: ambiguous

  const line = [blunder, b1.move];
  apply(ch, b1.move);
  const maxPlayer = isMate ? b1.mate : 4;
  let playerMoves = 1;
  while (!ch.isGameOver() && playerMoves < maxPlayer) {
    const [reply] = await e.analyse(ch.fen(), { depth: DEPTH });
    if (!reply) break;
    const c2 = new Chess(ch.fen()); apply(c2, reply.move);
    const [n1, n2] = await e.analyse(c2.fen(), { depth: DEPTH, multipv: 2 });
    if (!n1) break;
    const unique = isMate
      ? n1.mate != null && n1.mate > 0 && !(n2 && n2.mate != null && n2.mate > 0 && n1.mate > 1)
      : score(n1) >= 280 && (!n2 || score(n2) < score(n1) - 250 || score(n2) < 120);
    if (!unique) break;
    apply(ch, reply.move); apply(ch, n1.move);
    line.push(reply.move, n1.move);
    playerMoves++;
  }
  if (isMate && !ch.isCheckmate()) return null;
  // Non-mate puzzles must actually win material by the end of the line (look one reply ahead).
  if (!isMate) {
    const player = new Chess(pos).turn();
    const start = new Chess(beforeFen); apply(start, blunder);
    const m0 = material(start, player);
    const end = new Chess(ch.fen());
    if (!end.isGameOver()) {
      const [r] = await e.analyse(end.fen(), { depth: 8 });
      if (r) { apply(end, r.move); const [r2] = await e.analyse(end.fen(), { depth: 8 }); if (r2 && new Chess(end.fen()).move({ from: r2.move.slice(0, 2), to: r2.move.slice(2, 4), promotion: r2.move[4] })?.captured) apply(end, r2.move); }
    }
    if (material(end, player) - m0 < 2) return null;
  }
  const d = await findDepth(pos, b1.move);
  const themes = themesFor(beforeFen, line, isMate, isMate ? b1.mate : 0);
  const pmCount = (line.length) / 2;
  let rating = 450 + d * 105 + (pmCount - 1) * 230 + (themes.includes('quietMove') ? 180 : 0) + (themes.includes('sacrifice') ? 120 : 0) - (themes.includes('hangingPiece') ? 150 : 0) + Math.floor(rand() * 160 - 80);
  rating = Math.max(400, Math.min(2900, Math.round(rating)));
  return { fen: beforeFen, moves: line, rating, themes };
}

const KEEP_EASY = +(process.env.KEEP_EASY ?? 0.2);

while (made < target) {
  const ch = new Chess();
  await e.newGame();
  for (let ply = 0; ply < 220 && !ch.isGameOver() && made < target; ply++) {
    const before = ch.fen();
    const key = before.split(' ').slice(0, 4).join(' ');
    if (ply >= 10 && !seen.has(key)) {
      // Look for a plausible mistake in this position (not necessarily the move we play).
      const lines = await e.analyse(before, { depth: 8, multipv: 14 });
      const s0 = score(lines[0]);
      if (Math.abs(s0) < 300) {
        const bad = lines.filter((l) => score(l) <= s0 - 250);
        // Prefer mistakes that allow mate some of the time, otherwise the least obvious ones.
        bad.sort((a, b) => score(b) - score(a));
        const mates = bad.filter((l) => l.mate != null && l.mate < 0);
        const pick = mates.length && rand() < 0.5 ? mates[Math.floor(rand() * mates.length)] : bad[Math.floor(rand() * Math.min(bad.length, 4))];
        if (pick) {
          const p = await tryPuzzle(before, pick.move, s0);
          if (p) {
            const easy = p.themes.includes('hangingPiece');
            if (!easy || rand() < KEEP_EASY) {
              seen.add(key);
              fs.appendFileSync(out, JSON.stringify(p) + '\n');
              made++;
            }
          }
        }
      }
    }
    apply(ch, await pickGameMove(ch));
  }
}
e.quit();
process.exit(0);
