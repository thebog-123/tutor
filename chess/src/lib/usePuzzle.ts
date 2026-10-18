import { useCallback, useEffect, useRef, useState } from 'react';
import type { Marker } from '../components/Board';
import type { Puzzle } from '../data/puzzles';
import { applyUci, isMateAfter, parseUci, toUci, turnOf } from './chess';
import { playSound } from './sound';

export type PuzzleState = 'loading' | 'playing' | 'solved' | 'failed';

type Opts = {
  /** Called once, the first time the puzzle is solved or failed. */
  onResult?: (solved: boolean) => void;
  /** How long the wrong move stays on the board before it's taken back. */
  wrongDelay?: number;
  /** Puzzle Rush: a wrong move ends the puzzle instead of letting you retry. */
  endOnWrong?: boolean;
  /** Lessons: the solver moves first, so moves[0] is already the solution. */
  playerFirst?: boolean;
};

export function usePuzzle(puzzle: Puzzle | null, opts: Opts = {}) {
  const [fen, setFen] = useState(puzzle?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1');
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<PuzzleState>('loading');
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [failedOnce, setFailedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const reported = useRef(false);
  const timers = useRef<number[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const report = (solved: boolean) => {
    if (reported.current) return;
    reported.current = true;
    optsRef.current.onResult?.(solved);
  };

  const playOpponent = useCallback((fromFen: string, u: string, nextIdx: number, delay: number) => {
    setBusy(true);
    later(() => {
      const next = applyUci(fromFen, u);
      if (!next) return;
      const m = parseUci(u);
      setFen(next);
      setLastMove([m.from, m.to]);
      setIdx(nextIdx);
      setBusy(false);
      setState('playing');
    }, delay);
  }, []);

  // Load a new puzzle: show the position, then play the opponent's move.
  useEffect(() => {
    clearTimers();
    reported.current = false;
    setMarkers([]);
    setHighlights({});
    setFailedOnce(false);
    if (!puzzle) return;
    setFen(puzzle.fen);
    setLastMove(null);
    setIdx(0);
    if (optsRef.current.playerFirst) {
      setState('playing');
      setBusy(false);
    } else {
      setState('loading');
      playOpponent(puzzle.fen, puzzle.moves[0], 1, 600);
    }
    return clearTimers;
  }, [puzzle, playOpponent]);

  const playerColor = puzzle ? (opts.playerFirst ? turnOf(puzzle.fen) : turnOf(puzzle.fen) === 'w' ? 'b' : 'w') : 'w';

  const onMove = (from: string, to: string, promotion?: string): boolean => {
    if (!puzzle || busy || state === 'loading' || state === 'solved') return false;
    if (state === 'failed' && optsRef.current.endOnWrong) return false;
    const u = toUci(from, to, promotion);
    const expected = puzzle.moves[idx];
    const isLast = idx === puzzle.moves.length - 1;
    const next = applyUci(fen, u);
    if (!next) return false;
    setHighlights({});
    // Any checkmate is accepted, as is the expected move.
    if (u === expected || isMateAfter(fen, u)) {
      setFen(next);
      setLastMove([from, to]);
      const done = isLast || isMateAfter(fen, u);
      setMarkers([{ sq: to, kind: done ? 'best' : 'correct' }]);
      if (done) {
        setIdx(puzzle.moves.length);
        setState('solved');
        playSound('success');
        report(!failedOnce);
      } else {
        playSound('correct');
        playOpponent(next, puzzle.moves[idx + 1], idx + 2, 450);
      }
      return true;
    }
    // Wrong move: show it, mark it, then take it back.
    const before = fen;
    const prevLast = lastMove;
    setFen(next);
    setLastMove([from, to]);
    setMarkers([{ sq: to, kind: 'wrong' }]);
    playSound('wrong');
    setFailedOnce(true);
    setState('failed');
    report(false);
    setBusy(true);
    later(() => {
      setFen(before);
      setLastMove(prevLast);
      setMarkers([]);
      setBusy(false);
    }, optsRef.current.wrongDelay ?? 700);
    return true;
  };

  const hint = () => {
    if (!puzzle || state === 'solved' || busy) return;
    const exp = puzzle.moves[idx];
    if (!exp) return;
    const { from } = parseUci(exp);
    setHighlights({ [from]: 'rgba(93,155,232,.75)' });
    setFailedOnce(true);
  };

  const showSolution = () => {
    if (!puzzle || busy) return;
    setFailedOnce(true);
    report(false);
    let f = fen;
    let i = idx;
    setBusy(true);
    setHighlights({});
    const step = () => {
      if (i >= puzzle.moves.length) {
        setBusy(false);
        setState('solved');
        return;
      }
      const u = puzzle.moves[i];
      const n = applyUci(f, u);
      if (!n) return;
      const m = parseUci(u);
      f = n;
      i++;
      setFen(n);
      setLastMove([m.from, m.to]);
      setMarkers(i % 2 === 0 ? [{ sq: m.to, kind: 'best' }] : []);
      setIdx(i);
      later(step, 700);
    };
    later(step, 100);
  };

  const retry = () => {
    if (!puzzle) return;
    clearTimers();
    setMarkers([]);
    setHighlights({});
    setFen(puzzle.fen);
    setLastMove(null);
    setIdx(0);
    setFailedOnce(false);
    if (optsRef.current.playerFirst) {
      setBusy(false);
      setState('playing');
    } else {
      setState('loading');
      playOpponent(puzzle.fen, puzzle.moves[0], 1, 400);
    }
  };

  return {
    fen, lastMove, markers, highlights, state, playerColor, onMove, hint, showSolution, retry,
    busy, failedOnce, moveIndex: idx,
    movable: (state === 'playing' || (state === 'failed' && !opts.endOnWrong)) && !busy ? playerColor : null,
  };
}
