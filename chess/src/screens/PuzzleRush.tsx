import { useCallback, useEffect, useRef, useState } from 'react';
import Board from '../components/Board';
import { puzzles, type Puzzle } from '../data/puzzles';
import { progress } from '../lib/progress';
import { playSound } from '../lib/sound';
import { usePuzzle } from '../lib/usePuzzle';

type Mode = '3' | '5' | 'survival';
const MODES: { id: Mode; label: string; sub: string; icon: string }[] = [
  { id: '3', label: '3 min', sub: '3 strikes', icon: '⏱' },
  { id: '5', label: '5 min', sub: '3 strikes', icon: '⏲' },
  { id: 'survival', label: 'Survival', sub: 'No timer', icon: '♾' },
];

/** Build a run of puzzles that starts easy and climbs steadily. */
function buildRun(): Puzzle[] {
  const byRating = [...puzzles].sort((a, b) => a.rating - b.rating);
  const used = new Set<string>();
  const run: Puzzle[] = [];
  for (let i = 0; i < 150 && used.size < byRating.length; i++) {
    const target = 400 + i * 45;
    const near = byRating.filter((p) => !used.has(p.id) && Math.abs(p.rating - target) < 120);
    const pool = near.length ? near : byRating.filter((p) => !used.has(p.id) && p.rating >= target - 120);
    const pick = (pool.length ? pool : byRating.filter((p) => !used.has(p.id)))[Math.floor(Math.random() * Math.max(1, Math.min(pool.length || 1, 6)))];
    if (!pick) break;
    used.add(pick.id);
    run.push(pick);
  }
  return run;
}

type Result = { puzzle: Puzzle; won: boolean };

export default function PuzzleRush() {
  const [mode, setMode] = useState<Mode>('3');
  const [phase, setPhase] = useState<'menu' | 'countdown' | 'playing' | 'over'>('menu');
  const [run, setRun] = useState<Puzzle[]>([]);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [count, setCount] = useState(3);
  const [newBest, setNewBest] = useState(false);
  const deadline = useRef(0);
  const resultsRef = useRef<Result[]>([]);
  const over = useRef(false);

  const strikes = results.filter((r) => !r.won).length;
  const score = results.filter((r) => r.won).length;
  const puzzle = phase === 'playing' ? run[i] ?? null : null;

  const end = useCallback((finalResults: Result[]) => {
    if (over.current) return;
    over.current = true;
    const s = finalResults.filter((r) => r.won).length;
    setPhase('over');
    setNewBest(progress.setRushBest(mode, s));
    progress.addRush(mode, s);
    playSound('success');
  }, [mode]);

  const onResult = useCallback((won: boolean) => {
    if (!puzzle) return;
    progress.markSeen(puzzle.id);
    const nextResults = [...resultsRef.current, { puzzle, won }];
    resultsRef.current = nextResults;
    setResults(nextResults);
    const strikesNow = nextResults.filter((r) => !r.won).length;
    setTimeout(() => {
      if (over.current) return;
      if (strikesNow >= 3 || i + 1 >= run.length) end(nextResults);
      else setI((x) => x + 1);
    }, won ? 350 : 900);
  }, [puzzle, i, run.length, end]);

  const pz = usePuzzle(puzzle, { onResult, endOnWrong: true, wrongDelay: 800 });

  // Countdown, then the clock.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      setPhase('playing');
      deadline.current = Date.now() + (mode === 'survival' ? 0 : +mode * 60_000);
      return;
    }
    playSound('start');
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count, mode]);

  useEffect(() => {
    if (phase !== 'playing' || mode === 'survival') return;
    const t = setInterval(() => {
      const left = Math.max(0, deadline.current - Date.now());
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        end(resultsRef.current);
      }
    }, 200);
    return () => clearInterval(t);
  }, [phase, mode, end]);

  const start = () => {
    setRun(buildRun());
    setI(0);
    setResults([]);
    resultsRef.current = [];
    over.current = false;
    setNewBest(false);
    setTimeLeft(mode === 'survival' ? 0 : +mode * 60_000);
    setCount(3);
    setPhase('countdown');
  };

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="play">
      <div className="play-board" style={{ position: 'relative' }}>
        <Board
          fen={puzzle ? pz.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
          orientation={puzzle ? pz.playerColor : 'w'}
          movable={puzzle ? pz.movable : null}
          onMove={pz.onMove}
          lastMove={puzzle ? pz.lastMove : null}
          markers={puzzle ? pz.markers : []}
        />
        {phase === 'countdown' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)', zIndex: 50, fontSize: 120, fontWeight: 900 }}>
            {count}
          </div>
        )}
      </div>
      <div className="side">
        <div className="side-head"><span style={{ fontSize: 22 }}>⚡</span> Puzzle Rush</div>
        {phase === 'menu' && (
          <>
            <div className="side-body">
              <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>Solve as many puzzles as you can. They get harder as you go. Three wrong moves and the run is over.</p>
              <div className="mode-pick">
                {MODES.map((m) => (
                  <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
                    <span style={{ fontSize: 26 }}>{m.icon}</span>
                    {m.label}
                    <small>{m.sub}</small>
                  </button>
                ))}
              </div>
              <div className="panel" style={{ background: '#21201d', padding: 14 }}>
                <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>YOUR BEST</div>
                <div className="row spread">
                  {MODES.map((m) => (
                    <div key={m.id} style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 28, fontWeight: 900 }}>{progress.rushBest(m.id)}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {progress.rushHistory().length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>RECENT RUNS</div>
                  <table className="simple">
                    <tbody>
                      {progress.rushHistory().slice(0, 6).map((h, k) => (
                        <tr key={k}><td>{MODES.find((m) => m.id === h.mode)?.label}</td><td style={{ fontWeight: 800 }}>{h.score}</td><td className="muted">{new Date(h.at).toLocaleDateString()}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="side-foot"><button className="btn block" onClick={start}>Start</button></div>
          </>
        )}
        {(phase === 'playing' || phase === 'countdown') && (
          <>
            <div className="side-body" style={{ alignItems: 'center' }}>
              {mode !== 'survival' && <div className={`timer ${timeLeft < 15000 ? 'low' : ''}`}>{mins}:{String(secs).padStart(2, '0')}</div>}
              <div className="rush-score">{score}</div>
              <div className="strikes">{[0, 1, 2].map((k) => <span key={k} className={k < strikes ? 'x' : ''}>✕</span>)}</div>
              {puzzle && (
                <div className={`status turn-${pz.playerColor}`} style={{ width: '100%' }}>
                  <span className="dot" />
                  <div>{pz.playerColor === 'w' ? 'White' : 'Black'} to Move</div>
                </div>
              )}
              <div className="history" style={{ alignSelf: 'stretch' }}>
                {results.map((r, k) => <span key={k} className={r.won ? 'w' : 'l'}>{r.won ? '✓' : '✕'}</span>)}
              </div>
            </div>
            <div className="side-foot">
              <button className="btn grey block sm" onClick={() => end(resultsRef.current)}>End run</button>
            </div>
          </>
        )}
        {phase === 'over' && (
          <>
            <div className="side-body" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="muted" style={{ fontWeight: 700 }}>{MODES.find((m) => m.id === mode)?.label} · Run over</div>
              <div className="rush-score">{score}</div>
              {newBest ? <div className="tag green" style={{ fontSize: 14 }}>🏆 New personal best!</div> : <div className="muted">Best: {progress.rushBest(mode)}</div>}
              <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
                <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>PUZZLES</div>
                <div className="history">
                  {results.map((r, k) => <span key={k} className={r.won ? 'w' : 'l'} title={String(r.puzzle.rating)}>{r.won ? '✓' : '✕'}</span>)}
                </div>
                {score > 0 && <p className="muted" style={{ fontSize: 13 }}>Hardest solved: {Math.max(...results.filter((r) => r.won).map((r) => r.puzzle.rating))}</p>}
              </div>
            </div>
            <div className="side-foot">
              <button className="btn block" onClick={start}>Play again</button>
              <button className="btn grey block sm" onClick={() => setPhase('menu')}>Change mode</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
