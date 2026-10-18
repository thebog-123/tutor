import { useMemo } from 'react';
import Board from '../components/Board';
import Rich from '../components/Rich';
import type { Step } from '../data/lessons';
import type { Puzzle } from '../data/puzzles';
import { usePuzzle } from '../lib/usePuzzle';

type LineStep = Extract<Step, { type: 'line' }>;

/** A lesson challenge with several moves, played like a puzzle that starts on your move. */
export default function PuzzleStep({ step, header, onDone, onBack }: { step: LineStep; header: React.ReactNode; onDone: () => void; onBack?: () => void }) {
  const puzzle = useMemo<Puzzle>(() => ({ id: 'lesson', fen: step.fen, moves: step.solution, rating: 0, themes: [] }), [step]);
  const pz = usePuzzle(puzzle, { playerFirst: true });
  const myMoves = Math.ceil(step.solution.length / 2);
  const madeMoves = Math.ceil(pz.moveIndex / 2);

  return (
    <div className="play">
      <div className="play-board">
        <Board
          fen={pz.fen}
          orientation={step.orientation ?? pz.playerColor}
          movable={pz.movable}
          onMove={pz.onMove}
          lastMove={pz.lastMove}
          markers={pz.markers}
          highlights={pz.highlights}
        />
      </div>
      <div className="side">
        {header}
        <div className="side-body">
          <div className="coach fade-in">
            <div className="coach-avatar"><img src="pieces/wN.svg" alt="" /></div>
            <div className="bubble lesson-text"><Rich text={step.text} /></div>
          </div>
          {pz.state === 'solved' && (
            <div className="status ok fade-in"><span className="dot">✓</span><div>{step.success ?? 'Correct!'}</div></div>
          )}
          {pz.state === 'failed' && (
            <div className="status bad fade-in"><span className="dot">✕</span><div>Not quite. Try again!</div></div>
          )}
          {pz.state === 'playing' && madeMoves > 0 && (
            <div className="status ok fade-in"><span className="dot">✓</span><div>Good move! Keep going.<small>{madeMoves} of {myMoves} moves</small></div></div>
          )}
        </div>
        <div className="side-foot">
          {pz.state === 'solved' ? (
            <button className="btn block" onClick={onDone}>Continue</button>
          ) : (
            <button className="btn block" disabled>Your move</button>
          )}
          <div className="row">
            <button className="icon-btn" title="Previous step" disabled={!onBack} onClick={onBack}>‹</button>
            <button className="icon-btn" title="Reset" onClick={pz.retry}>↺</button>
            {pz.state !== 'solved' && <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.hint}>💡 Hint</button>}
            {pz.state !== 'solved' && <button className="btn grey sm" style={{ flex: 1 }} onClick={pz.showSolution}>Show me</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
