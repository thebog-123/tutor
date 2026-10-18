// Stockfish (lite, single-threaded WASM) running in a web worker.
export type EngineLine = { move: string; pv: string[]; cp: number | null; mate: number | null; depth: number };

type Job = { resolve: (l: EngineLine[]) => void; lines: Record<number, EngineLine>; onInfo?: (l: EngineLine[]) => void };

class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private job: Job | null = null;
  private queue: (() => void)[] = [];

  private start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(new URL('engine/stockfish-19-lite-single.js', document.baseURI));
      } catch (e) {
        reject(e);
        return;
      }
      this.worker.onmessage = (ev) => this.onLine(String(ev.data), resolve);
      this.worker.onerror = (e) => reject(e);
      this.worker.postMessage('uci');
    });
    return this.ready;
  }

  private onLine(line: string, onReady: () => void) {
    if (line === 'uciok') {
      this.worker!.postMessage('isready');
      return;
    }
    if (line === 'readyok' && !this.job) {
      onReady();
      return;
    }
    const job = this.job;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ') && !line.includes('bound')) {
      const mp = +(line.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = line.match(/ score cp (-?\d+)/);
      const mate = line.match(/ score mate (-?\d+)/);
      const depth = +(line.match(/ depth (\d+)/)?.[1] ?? 0);
      const pv = line.split(' pv ')[1].trim().split(' ');
      job.lines[mp] = { move: pv[0], pv, cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null, depth };
      job.onInfo?.(sorted(job.lines));
    } else if (line.startsWith('bestmove')) {
      this.job = null;
      job.resolve(sorted(job.lines));
      this.queue.shift()?.();
    }
  }

  async analyse(fen: string, opts: { depth?: number; movetime?: number; multipv?: number; skill?: number; onInfo?: (l: EngineLine[]) => void } = {}): Promise<EngineLine[]> {
    await this.start();
    if (this.job) {
      this.worker!.postMessage('stop');
      await new Promise<void>((r) => this.queue.push(r));
    }
    return new Promise((resolve) => {
      this.job = { resolve, lines: {}, onInfo: opts.onInfo };
      const w = this.worker!;
      w.postMessage(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      w.postMessage(`setoption name Skill Level value ${opts.skill ?? 20}`);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`);
    });
  }

  stop() {
    this.worker?.postMessage('stop');
  }
}

function sorted(lines: Record<number, EngineLine>) {
  return Object.keys(lines).map(Number).sort((a, b) => a - b).map((k) => lines[k]);
}

export const engine = new Engine();

/** Evaluation from White's point of view, in pawns (mate as ±100). */
export function whiteEval(l: EngineLine | undefined, turn: 'w' | 'b'): number {
  if (!l) return 0;
  const sign = turn === 'w' ? 1 : -1;
  if (l.mate != null) return sign * (l.mate > 0 ? 100 : -100);
  return (sign * (l.cp ?? 0)) / 100;
}

export function formatEval(l: EngineLine | undefined, turn: 'w' | 'b'): string {
  if (!l) return '0.0';
  const sign = turn === 'w' ? 1 : -1;
  if (l.mate != null) return `M${Math.abs(l.mate)}`;
  const v = (sign * (l.cp ?? 0)) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
