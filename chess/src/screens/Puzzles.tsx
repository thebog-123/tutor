import { useCallback, useEffect, useState } from 'react';
import Board from '../components/Board';
import { puzzles, THEMES, type Puzzle } from '../data/puzzles';
import { applyUci } from '../lib/chess';
import { progress, type PuzzleResult } from '../lib/progress';
import { update } from '../lib/rating';
import { go } from '../lib/router';
import { usePuzzle } from '../lib/usePuzzle';

/** Pick an unseen puzzle close to the player's rating, widening the window if needed. */
export function pickPuzzle(target: number, exclude: Set<string>, pool: Puzzle[] = puzzles): Puzzle | null {
  if (!pool.length) return null;
  for (const w of [75, 150, 300, 600, 5000]) {
    const c = pool.filter((p) => Math.abs(p.rating - target) <= w && !exclude.has(p.id));
    if (c.length) return c[Math.floor(Math.random() * c.length)];
  }
  // Everything seen: start recycling.
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function Puzzles() {
  const [rating, setRating] = useState(progress.rating());
  const [history, setHistory] = useState<PuzzleResult[]>(progress.history());
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => pickPuzzle(rating.rating, new Set(progress.seen())));
  const [delta, setDelta] = useState<number | null>(null);
  const [rated, setRated] = useState(true);

  const onResult = useCallback((solved: boolean) => {
    if (!puzzle) return;
    progress.markSeen(puzzle.id);
    if (!rated) return;
    const cur = progress.rating();
    const { next, delta: d } = update(cur, puzzle.rating, solved);
    progress.setRating(next);
    setRating(next);
    setDelta(d);
    const r: PuzzleResult = { id: puzzle.id, won: solved, delta: d, rating: puzzle.rating, at: Date.now() };
    progress.addResult(r);
    setHistory((h) => [r, ...h]);
  }, [puzzle, rated]);

  const pz = usePuzzle(puzzle, { onResult });

  const next = () => {
    setDelta(null);
    setRated(true);
    setPuzzle(pickPuzzle(progress.rating().rating, new Set(progress.seen())));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (pz.state === 'solved' || pz.state === 'failed')) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!puzzle) return <div className="page"><p>No puzzles available.</p></div>;

  const side = pz.playerColor === 'w' ? 'White' : 'Black';
  const finished = pz.state === 'solved' || (pz.state === 'failed' && delta != null);
  const afterBlunderFen = applyUci(puzzle.fen, puzzle.moves[0]) ?? puzzle.fen;

  return (
    <div className="play">
      <div className="play-board">
        <Board fen={pz.fen} orientation={pz.playerColor} movable={pz.movable} onMove={pz.onMove} lastMove={pz.lastMove} markers={pz.markers} highlights={pz.highlights} />
      </div>
      <div className="side">
        <div className="side-head">
          <span style={{ fontSize: 22 }}>🧩</span> Puzzles
          <span style={{ marginLeft: 'auto' }} className="row">
            <button className={`chip ${rated ? 'on' : ''}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setRated(!rated)} disabled={pz.state !== 'loading' && pz.state !== 'playing'} title="Rated puzzles change your rating">
              {rated ? 'Rated' : 'Unrated'}
            </button>
          </span>
        </div>
        <div className="side-body">
          {pz.state === 'solved' && !pz.failedOnce ? (
            <div className="status ok fade-in"><span className="dot">✓</span><div>Solved!<small>Puzzle rating {puzzle.rating}</small></div></div>
          ) : pz.state === 'solved' ? (
            <div className="status info fade-in"><span className="dot">✓</span><div>Solution shown<small>Puzzle rating {puzzle.rating}</small></div></div>
          ) : pz.state === 'failed' ? (
            <div className="status bad fade-in"><span className="dot">✕</span><div>Incorrect<small>That's not the move. You can keep trying.</small></div></div>
          ) : pz.moveIndex > 1 ? (
            <div className="status ok fade-in"><span className="dot">✓</span><div>Best move!<small>Keep going…</small></div></div>
          ) : (
            <div className={`status turn-${pz.playerColor}`}><span className="dot" /><div>{side} to Move<small>Find the best move for {side.toLowerCase()}.</small></div></div>
          )}

          <div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>PUZZLE RATING</div>
            <div className="rating-big">
              <b>{rating.rating}</b>
              {delta != null && <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>{delta >= 0 ? '+' : ''}{delta}</span>}
              {rating.games < 10 && <span className="muted" style={{ fontSize: 13 }}>provisional</span>}
            </div>
          </div>

          {finished && (
            <div className="fade-in">
              <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>THEMES</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {puzzle.themes.map((t) => <a key={t} className="tag" href={`#/puzzles/themes/${t}`}>{THEMES[t]?.name ?? t}</a>)}
              </div>
            </div>
          )}

          <div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>RECENT</div>
            <div className="history">
              {history.slice(0, 30).map((h, i) => <span key={i} className={h.won ? 'w' : 'l'} title={`${h.rating} (${h.delta >= 0 ? '+' : ''}${h.delta})`}>{h.won ? '✓' : '✕'}</span>)}
              {!history.length && <span className="n" style={{ width: 'auto', padding: '0 8px', color: '#999', fontWeight: 600 }}>No puzzles yet</span>}
            </div>
          </div>
        </div>
        <div className="side-foot">
          {finished || pz.state === 'failed' ? (
            <button className="btn block" onClick={next}>Next Puzzle</button>
          ) : (
            <button className="btn block" onClick={pz.hint} disabled={pz.state !== 'playing'}>💡 Hint</button>
          )}
          <div className="row">
            <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.retry} disabled={pz.state === 'loading'}>↺ Retry</button>
            <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.showSolution} disabled={pz.state === 'loading' || pz.state === 'solved'}>Solution</button>
            <button className="btn grey sm" style={{ flex: 1 }} onClick={() => go(`learn/analysis/${encodeURIComponent(afterBlunderFen)}`)} disabled={!finished}>Analyze</button>
          </div>
        </div>
      </div>
    </div>
  );
}
