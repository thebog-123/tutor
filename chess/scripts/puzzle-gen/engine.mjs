import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const enginePath = require('stockfish').findEngine(process.env.SF || 'single');

export class Engine {
  constructor() {
    this.p = spawn(process.execPath, [enginePath], { stdio: 'pipe' });
    this.buf = '';
    this.waiters = [];
    this.lines = [];
    this.p.stdout.on('data', (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.onLine(line);
      }
    });
  }
  onLine(line) {
    this.lines.push(line);
    const w = this.waiters[0];
    if (w && w.re.test(line)) {
      this.waiters.shift();
      const out = this.lines;
      this.lines = [];
      w.resolve(out);
    }
  }
  send(cmd) { this.p.stdin.write(cmd + '\n'); }
  wait(re) { return new Promise((resolve) => this.waiters.push({ re, resolve })); }
  async init() {
    this.send('uci');
    await this.wait(/^uciok/);
    this.send('setoption name Hash value 64');
    this.send('isready');
    await this.wait(/^readyok/);
  }
  async newGame() {
    this.send('ucinewgame');
    this.send('isready');
    await this.wait(/^readyok/);
  }
  // Returns [{move, cp, mate, pv}] sorted by multipv index, from side-to-move's perspective.
  async analyse(fen, { depth = 12, nodes, multipv = 1 } = {}) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    this.send(nodes ? `go nodes ${nodes}` : `go depth ${depth}`);
    const lines = await this.wait(/^bestmove/);
    const best = {};
    for (const l of lines) {
      if (!l.startsWith('info') || !l.includes(' pv ')) continue;
      const mp = +(l.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = l.match(/ score cp (-?\d+)/);
      const mate = l.match(/ score mate (-?\d+)/);
      if (l.includes('lowerbound') || l.includes('upperbound')) continue;
      const pv = l.split(' pv ')[1].split(' ');
      best[mp] = { move: pv[0], pv, cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null };
    }
    return Object.keys(best).sort((a, b) => a - b).map((k) => best[k]);
  }
  quit() { this.send('quit'); setTimeout(() => this.p.kill(), 100); }
}

// Convert a score to a single number for comparisons (mate = big).
export function score(l) {
  if (!l) return -100000;
  if (l.mate != null) return l.mate > 0 ? 100000 - l.mate * 100 : -100000 - l.mate * 100;
  return l.cp;
}
