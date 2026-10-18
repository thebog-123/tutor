import { useMemo, useState } from 'react';
import Board from '../components/Board';
import { puzzles, THEMES, type Puzzle } from '../data/puzzles';
import { progress } from '../lib/progress';
import { usePuzzle } from '../lib/usePuzzle';
import { pickPuzzle } from './Puzzles';

const ORDER = ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'backRankMate', 'knightMate', 'fork', 'hangingPiece', 'sacrifice', 'quietMove', 'promotion', 'enPassant', 'opening', 'middlegame', 'endgame', 'oneMove', 'short', 'long', 'veryLong'];

export default function Themes({ theme }: { theme?: string }) {
  if (theme) return <ThemePractice theme={theme} />;
  const counts: Record<string, number> = {};
  for (const p of puzzles) for (const t of p.themes) counts[t] = (counts[t] ?? 0) + 1;
  const seen = new Set(progress.seen());
  const list = ORDER.filter((t) => counts[t]);
  return (
    <div className="page fade-in">
      <div className="page-title"><span className="icon">🏷</span>Puzzle Themes</div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>Practise one idea at a time. Theme puzzles are unrated.</p>
      <div className="grid-cards">
        {list.map((t) => {
          const n = counts[t];
          const done = puzzles.filter((p) => p.themes.includes(t) && seen.has(p.id)).length;
          return (
            <a key={t} className="card" href={`#/puzzles/themes/${t}`}>
              <div className="row spread"><h3>{THEMES[t]?.name ?? t}</h3><span className="tag">{n}</span></div>
              <p>{THEMES[t]?.description}</p>
              <div className="row" style={{ gap: 10, marginTop: 'auto' }}>
                <div className="progress" style={{ flex: 1 }}><div style={{ width: `${(done / n) * 100}%` }} /></div>
                <span className="muted" style={{ fontSize: 12 }}>{done}/{n}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function ThemePractice({ theme }: { theme: string }) {
  const pool = useMemo(() => puzzles.filter((p) => p.themes.includes(theme)), [theme]);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => pickPuzzle(progress.rating().rating, new Set(progress.seen()), pool));
  const [streak, setStreak] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const pz = usePuzzle(puzzle, {
    onResult: (won) => {
      if (puzzle) progress.markSeen(puzzle.id);
      setStreak((s) => (won ? s + 1 : 0));
      if (won) setSolvedCount((c) => c + 1);
    },
  });
  const next = () => setPuzzle(pickPuzzle(progress.rating().rating, new Set(progress.seen()), pool));
  const info = THEMES[theme];
  if (!puzzle) return <div className="page"><p>No puzzles for this theme. <a href="#/puzzles/themes">Back</a></p></div>;
  const side = pz.playerColor === 'w' ? 'White' : 'Black';

  return (
    <div className="play">
      <div className="play-board">
        <Board fen={pz.fen} orientation={pz.playerColor} movable={pz.movable} onMove={pz.onMove} lastMove={pz.lastMove} markers={pz.markers} highlights={pz.highlights} />
      </div>
      <div className="side">
        <div className="side-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <a href="#/puzzles/themes" className="muted" style={{ fontSize: 14 }}>← Themes</a>
          <div>{info?.name ?? theme}</div>
        </div>
        <div className="side-body">
          <p className="muted" style={{ margin: 0 }}>{info?.description}</p>
          {pz.state === 'solved' ? (
            <div className={`status ${pz.failedOnce ? 'info' : 'ok'} fade-in`}><span className="dot">✓</span><div>{pz.failedOnce ? 'Solution shown' : 'Solved!'}<small>Puzzle rating {puzzle.rating}</small></div></div>
          ) : pz.state === 'failed' ? (
            <div className="status bad fade-in"><span className="dot">✕</span><div>Incorrect<small>Try again, or see the solution.</small></div></div>
          ) : (
            <div className={`status turn-${pz.playerColor}`}><span className="dot" /><div>{side} to Move</div></div>
          )}
          <div className="stats-row" style={{ marginBottom: 0 }}>
            <div className="stat" style={{ background: '#21201d' }}><b>{solvedCount}</b><span>Solved this session</span></div>
            <div className="stat" style={{ background: '#21201d' }}><b>{streak}</b><span>Streak</span></div>
          </div>
        </div>
        <div className="side-foot">
          {pz.state === 'solved' || pz.state === 'failed' ? <button className="btn block" onClick={next}>Next Puzzle</button> : <button className="btn block" onClick={pz.hint} disabled={pz.state !== 'playing'}>💡 Hint</button>}
          <div className="row">
            <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.retry}>↺ Retry</button>
            <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.showSolution} disabled={pz.state === 'solved'}>Solution</button>
          </div>
        </div>
      </div>
    </div>
  );
}
