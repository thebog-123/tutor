import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { type Arrow } from '../components/Board';
import { engine, formatEval, whiteEval, type EngineLine } from '../lib/engine';
import { parseUci, sanOf, turnOf } from '../lib/chess';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
type Ply = { fen: string; san: string; uci: string };

export default function Analysis({ fen: initial }: { fen?: string }) {
  const [root, setRoot] = useState(initial ?? START);
  const [plies, setPlies] = useState<Ply[]>([]);
  const [cur, setCur] = useState(0);
  const [flip, setFlip] = useState(false);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [on, setOn] = useState(true);
  const [fenInput, setFenInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoot(initial ?? START);
    setPlies([]);
    setCur(0);
    setFlip(initial ? turnOf(initial) === 'b' : false);
  }, [initial]);

  const fen = cur === 0 ? root : plies[cur - 1].fen;
  const turn = turnOf(fen);
  const game = useMemo(() => { try { return new Chess(fen); } catch { return null; } }, [fen]);

  useEffect(() => {
    setLines([]);
    if (!on || !game || game.isGameOver()) return;
    let live = true;
    const t = setTimeout(() => {
      void engine.analyse(fen, { depth: 18, multipv: 3, onInfo: (l) => live && setLines(l) }).then((l) => live && setLines(l));
    }, 120);
    return () => { live = false; clearTimeout(t); engine.stop(); };
  }, [fen, on, game]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!game) return false;
    try {
      const g = new Chess(fen);
      const m = g.move({ from, to, promotion });
      const ply = { fen: g.fen(), san: m.san, uci: m.lan };
      setPlies([...plies.slice(0, cur), ply]);
      setCur(cur + 1);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') setCur((c) => Math.max(0, c - 1));
      if (e.key === 'ArrowRight') setCur((c) => Math.min(plies.length, c + 1));
      if (e.key === 'f') setFlip((f) => !f);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plies.length]);

  const loadFen = () => {
    try {
      const g = new Chess(fenInput.trim());
      setRoot(g.fen());
      setPlies([]);
      setCur(0);
      setError(null);
      setFenInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid FEN');
    }
  };

  const best = lines[0];
  const ev = whiteEval(best, turn);
  const whitePct = best ? Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-0.45 * ev)) - 1))) : 50;
  const arrows: Arrow[] = on && best ? [{ from: best.move.slice(0, 2), to: best.move.slice(2, 4), color: 'rgba(129,182,76,.9)' }] : [];
  const last = cur > 0 ? parseUci(plies[cur - 1].uci) : null;
  const startNo = +root.split(' ')[5] || 1;
  const blackFirst = turnOf(root) === 'b';
  const orientation = flip ? 'b' : 'w';

  const rows: { n: number; w?: number; b?: number }[] = [];
  plies.forEach((_, i) => {
    const absolute = i + (blackFirst ? 1 : 0);
    const n = startNo + Math.floor(absolute / 2);
    if (absolute % 2 === 0) rows.push({ n, w: i });
    else {
      if (!rows.length || rows[rows.length - 1].n !== n) rows.push({ n });
      rows[rows.length - 1].b = i;
    }
  });

  const status = game?.isCheckmate() ? 'Checkmate' : game?.isStalemate() ? 'Stalemate' : game?.isDraw() ? 'Draw' : null;

  return (
    <div className="play">
      <div className="play-board with-eval">
        <div className="eval-bar" style={{ transform: flip ? 'rotate(180deg)' : undefined }}>
          <div className="white" style={{ height: `${whitePct}%` }} />
          <span style={{ [ev >= 0 ? 'bottom' : 'top']: 4, color: ev >= 0 ? '#333' : '#eee', transform: flip ? 'rotate(180deg)' : undefined } as React.CSSProperties}>
            {best ? formatEval(best, turn).replace('+', '') : ''}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <Board fen={fen} orientation={orientation} movable="both" onMove={onMove} lastMove={last ? [last.from, last.to] : null} arrows={arrows} />
        </div>
      </div>
      <div className="side">
        <div className="side-head">
          <span style={{ fontSize: 22 }}>🔍</span> Analysis
          <label className="row" style={{ marginLeft: 'auto', fontSize: 13, gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Engine
          </label>
        </div>
        <div className="side-body">
          {on && (
            <div className="panel" style={{ background: '#21201d', padding: 10, fontSize: 13.5 }}>
              {status ? <b>{status}</b> : lines.length === 0 ? <span className="muted">Thinking…</span> : lines.map((l, i) => (
                <div key={i} className="row" style={{ gap: 8, padding: '3px 0', alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 800, borderRadius: 3, padding: '1px 4px', background: whiteEval(l, turn) >= 0 ? '#fff' : '#403d39', color: whiteEval(l, turn) >= 0 ? '#222' : '#fff' }}>{formatEval(l, turn)}</span>
                  <span style={{ color: '#ccc', lineHeight: 1.45 }}>{pvSan(fen, l.pv.slice(0, 10))}</span>
                </div>
              ))}
              {lines[0] && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>depth {lines[0].depth}</div>}
            </div>
          )}
          <div className="moves-list">
            {rows.map((r) => (
              <div key={r.n} style={{ display: 'contents' }}>
                <span className="n">{r.n}.</span>
                <span className={`m ${r.w != null && cur === r.w + 1 ? 'cur' : ''}`} onClick={() => r.w != null && setCur(r.w + 1)}>{r.w != null ? plies[r.w].san : '…'}</span>
                <span className={`m ${r.b != null && cur === r.b + 1 ? 'cur' : ''}`} onClick={() => r.b != null && setCur(r.b + 1)}>{r.b != null ? plies[r.b].san : ''}</span>
              </div>
            ))}
            {!rows.length && <span className="muted" style={{ gridColumn: '1 / -1' }}>Make moves on the board to explore. Use ← → to step through.</span>}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>LOAD POSITION (FEN)</div>
            <div className="row">
              <input value={fenInput} onChange={(e) => setFenInput(e.target.value)} placeholder="Paste a FEN…" onKeyDown={(e) => e.key === 'Enter' && loadFen()}
                style={{ flex: 1, background: '#1b1a18', border: '1px solid #4a4744', borderRadius: 6, padding: '8px 10px', color: '#fff', minWidth: 0 }} />
              <button className="btn sm" onClick={loadFen}>Load</button>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{error}</div>}
            <div className="muted" style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-all' }}>{fen}</div>
          </div>
        </div>
        <div className="side-foot">
          <div className="row">
            <button className="icon-btn" title="Start" onClick={() => setCur(0)} disabled={cur === 0}>⏮</button>
            <button className="icon-btn" title="Back" onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0}>‹</button>
            <button className="icon-btn" title="Forward" onClick={() => setCur(Math.min(plies.length, cur + 1))} disabled={cur === plies.length}>›</button>
            <button className="icon-btn" title="End" onClick={() => setCur(plies.length)} disabled={cur === plies.length}>⏭</button>
            <button className="icon-btn" title="Flip board (f)" onClick={() => setFlip(!flip)}>⇅</button>
            <button className="btn grey sm" style={{ marginLeft: 'auto' }} onClick={() => { setRoot(START); setPlies([]); setCur(0); }}>New</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function pvSan(fen: string, pv: string[]) {
  const out: string[] = [];
  let f = fen;
  let moveNo = +fen.split(' ')[5] || 1;
  let t = turnOf(fen);
  for (const u of pv) {
    const san = sanOf(f, u);
    try {
      const c = new Chess(f);
      c.move(parseUci(u));
      f = c.fen();
    } catch { break; }
    if (t === 'w') out.push(`${moveNo}. ${san}`);
    else out.push(out.length ? san : `${moveNo}… ${san}`);
    if (t === 'b') moveNo++;
    t = t === 'w' ? 'b' : 'w';
  }
  return out.join(' ');
}
