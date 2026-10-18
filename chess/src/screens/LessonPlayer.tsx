import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { type Marker } from '../components/Board';
import Rich from '../components/Rich';
import { findCourse, type Step } from '../data/lessons';
import { applyUci, isMateAfter, parseUci, toUci, turnOf } from '../lib/chess';
import { engine } from '../lib/engine';
import { progress } from '../lib/progress';
import { go } from '../lib/router';
import { playSound } from '../lib/sound';
import PuzzleStep from './PuzzleStep';

type Status = 'idle' | 'wrong' | 'done' | 'failed';

export { SimpleStep };

export default function LessonPlayer({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const course = findCourse(courseId);
  const lessonIndex = course?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const lesson = course?.lessons[lessonIndex];
  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => { setStepIdx(0); setFinished(false); }, [courseId, lessonId]);

  if (!course || !lesson) return <div className="page"><p>Lesson not found. <a href="#/learn/lessons">Back to lessons</a></p></div>;

  const step = lesson.steps[stepIdx];
  const nextLesson = course.lessons[lessonIndex + 1];

  const advance = () => {
    if (stepIdx + 1 < lesson.steps.length) setStepIdx(stepIdx + 1);
    else {
      progress.markLesson(`${course.id}/${lesson.id}`);
      playSound('success');
      setFinished(true);
    }
  };

  const header = (
    <div className="side-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div className="row spread">
        <a href={`#/learn/lessons/${course.id}`} className="muted" style={{ fontSize: 14 }}>← {course.title}</a>
        <span className="muted" style={{ fontSize: 13 }}>Lesson {lessonIndex + 1} of {course.lessons.length}</span>
      </div>
      <div>{lesson.title}</div>
      <div className="steps">
        {lesson.steps.map((_, i) => <span key={i} className={finished || i < stepIdx ? 'done' : i === stepIdx ? 'cur' : ''} />)}
      </div>
    </div>
  );

  if (finished) {
    return (
      <div className="play">
        <div className="play-board"><Board fen={lesson.steps[lesson.steps.length - 1].fen} sound={false} /></div>
        <div className="side">
          {header}
          <div className="side-body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 64 }}>🏆</div>
            <h2 style={{ fontSize: 26, fontWeight: 900 }}>Lesson complete!</h2>
            <p className="muted">You finished <b style={{ color: '#fff' }}>{lesson.title}</b>.</p>
          </div>
          <div className="side-foot">
            {nextLesson ? (
              <button className="btn block" onClick={() => go(`learn/lessons/${course.id}/${nextLesson.id}`)}>Next lesson: {nextLesson.title}</button>
            ) : (
              <button className="btn block" onClick={() => go('learn/lessons')}>Course complete: back to lessons</button>
            )}
            <button className="btn grey block sm" onClick={() => { setStepIdx(0); setFinished(false); }}>Replay lesson</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <StepView
      key={`${course.id}/${lesson.id}/${stepIdx}`}
      step={step}
      header={header}
      onDone={advance}
      onBack={stepIdx > 0 ? () => setStepIdx(stepIdx - 1) : undefined}
      isLast={stepIdx === lesson.steps.length - 1}
    />
  );
}

/** Turn-independent move used by "reach" steps where a lone piece walks around. */
function freeMove(fen: string, u: string): string | null {
  try {
    const parts = fen.split(' ');
    const c = new Chess(fen, { skipValidation: true });
    const color = c.get(parseUci(u).from as never)?.color;
    if (!color) return null;
    parts[1] = color;
    parts[3] = '-';
    const g = new Chess(parts.join(' '), { skipValidation: true });
    g.move(parseUci(u));
    const out = g.fen().split(' ');
    out[1] = 'w';
    return out.join(' ');
  } catch {
    return null;
  }
}

function StepView({ step, header, onDone, onBack, isLast }: { step: Step; header: React.ReactNode; onDone: () => void; onBack?: () => void; isLast: boolean }) {
  if (step.type === 'line' && step.solution.length > 1) {
    // Multi-move lines play like a puzzle that starts on your move.
    return <PuzzleStep step={step} header={header} onDone={onDone} onBack={onBack} />;
  }
  return <SimpleStep step={step} header={header} onDone={onDone} onBack={onBack} isLast={isLast} />;
}

function SimpleStep({ step, header, onDone, onBack, isLast }: { step: Step; header: React.ReactNode; onDone: () => void; onBack?: () => void; isLast: boolean }) {
  const [fen, setFen] = useState(step.fen);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [status, setStatus] = useState<Status>(step.type === 'info' ? 'done' : 'idle');
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [hl, setHl] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<string[]>(step.type === 'reach' ? step.targets : []);
  const [message, setMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [moves, setMoves] = useState(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const game = useRef(new Chess(step.type === 'play' ? step.fen : undefined));
  const gen = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; engine.stop(); };
  }, []);

  const orientation = step.orientation ?? (step.type === 'reach' || step.type === 'info' ? 'w' : turnOf(step.fen));
  const player = turnOf(step.fen);

  const succeed = (text?: string) => {
    setStatus('done');
    setMessage(text ?? 'Correct!');
    playSound('correct');
  };

  const wrong = (from: string, to: string, next: string, text = 'Not quite. Try again!') => {
    const before = fen;
    busy.current = true;
    setFen(next);
    setLastMove([from, to]);
    setMarkers([{ sq: to, kind: 'wrong' }]);
    setStatus('wrong');
    setMessage(text);
    playSound('wrong');
    setTimeout(() => {
      if (!alive.current) return;
      setFen(before);
      setLastMove(null);
      setMarkers([]);
      busy.current = false;
    }, 800);
  };

  const lose = (text: string) => {
    busy.current = false;
    setStatus('failed');
    setMessage(text);
    playSound('wrong');
  };

  const engineReply = async (pos: string) => {
    const myGen = gen.current;
    setThinking(true);
    const [best] = await engine.analyse(pos, { movetime: 350, depth: 14 });
    if (!alive.current || myGen !== gen.current || step.type !== 'play') return;
    setThinking(false);
    if (!best) return;
    const g = game.current;
    let mv;
    try { mv = g.move(parseUci(best.move)); } catch { return; }
    setFen(g.fen());
    setLastMove([mv.from, mv.to]);
    busy.current = false;
    if (g.isCheckmate()) return lose('You were checkmated. Try again!');
    if (g.isGameOver()) return step.goal === 'draw' ? succeed(step.success) : lose('The game ended in a draw. Try again!');
    if (step.goal === 'draw' && mv.promotion) return lose('Your opponent promoted. Try again!');
    if (step.goal === 'promote' && countPawns(g.fen(), player) < countPawns(step.fen, player)) lose('Your pawn was captured. Try again!');
  };

  const onMove = (from: string, to: string, promotion?: string): boolean => {
    if (busy.current || status === 'done' || status === 'failed') return false;
    const u = toUci(from, to, promotion);
    setHl({});
    if (step.type === 'reach') {
      const next = freeMove(fen, u);
      if (!next) return false;
      setFen(next);
      setLastMove([from, to]);
      if (remaining.includes(to)) {
        const left = remaining.filter((t) => t !== to);
        setRemaining(left);
        if (!left.length) succeed('Nice! You collected every star.');
        else playSound('correct');
      }
      return true;
    }
    const next = applyUci(fen, u);
    if (!next) return false;
    if (step.type === 'line' || step.type === 'choose' || step.type === 'mate' || step.type === 'any') {
      const ok =
        step.type === 'any' ? true
          : step.type === 'mate' ? isMateAfter(fen, u)
            : step.type === 'choose' ? step.accept.includes(u)
              : u === step.solution[0] || isMateAfter(fen, u);
      if (!ok) {
        const g = new Chess(next);
        wrong(from, to, next, step.type === 'mate' && g.isStalemate() ? 'That\'s stalemate: a draw! Find the checkmate.' : step.type === 'mate' ? 'That isn\'t checkmate. Try again!' : undefined);
        return true;
      }
      setFen(next);
      setLastMove([from, to]);
      setMarkers([{ sq: to, kind: 'correct' }]);
      succeed(step.success);
      return true;
    }
    if (step.type === 'play') {
      const g = game.current;
      const mv = g.move(parseUci(u));
      setFen(g.fen());
      setLastMove([from, to]);
      const used = moves + 1;
      setMoves(used);
      busy.current = true;
      if (g.isCheckmate()) {
        busy.current = false;
        if (step.goal === 'mate') succeed(step.success);
        else lose('Checkmate, but that wasn\'t the goal here.');
        return true;
      }
      if (g.isGameOver()) {
        if (step.goal === 'draw') { busy.current = false; succeed(step.success); }
        else lose(g.isStalemate() ? 'Stalemate! The game is a draw. Try again.' : 'The game is a draw. Try again.');
        return true;
      }
      if (step.goal === 'promote' && mv.promotion) {
        const after = g.fen();
        void engine.analyse(after, { depth: 12 }).then(([l]) => {
          if (!alive.current) return;
          busy.current = false;
          // Score is from the opponent's side here.
          const safe = l && ((l.mate != null && l.mate < 0) || (l.cp != null && l.cp < -400));
          if (safe) succeed(step.success);
          else lose('Your new queen isn\'t safe. Try again!');
        });
        return true;
      }
      if (step.maxMoves && used >= step.maxMoves) {
        if (step.goal === 'draw') { busy.current = false; succeed(step.success); }
        else lose(`Out of moves! You had ${step.maxMoves}. Try again.`);
        return true;
      }
      void engineReply(g.fen());
      return true;
    }
    return false;
  };

  const hint = () => {
    let u: string | undefined;
    if (step.type === 'line') u = step.solution[0];
    else if (step.type === 'choose') u = step.accept[0];
    else if (step.type === 'mate') u = new Chess(fen).moves({ verbose: true }).find((m) => isMateAfter(fen, m.lan))?.lan;
    else if (step.type === 'play') {
      void engine.analyse(fen, { depth: 14 }).then(([l]) => {
        if (l && alive.current) setHl({ [l.move.slice(0, 2)]: 'rgba(93,155,232,.75)', [l.move.slice(2, 4)]: 'rgba(93,155,232,.45)' });
      });
      return;
    }
    if (u) setHl({ [u.slice(0, 2)]: 'rgba(93,155,232,.75)' });
  };

  const reset = () => {
    engine.stop();
    busy.current = false;
    gen.current++;
    if (step.type === 'play') game.current = new Chess(step.fen);
    setFen(step.fen);
    setLastMove(null);
    setMarkers([]);
    setHl({});
    setMoves(0);
    setStatus('idle');
    setMessage(null);
    setThinking(false);
    if (step.type === 'reach') setRemaining(step.targets);
  };

  const highlights = useMemo(() => {
    const h: Record<string, string> = { ...hl };
    if (step.type === 'info') for (const s of step.highlights ?? []) h[s] = 'rgba(255, 213, 79, .55)';
    if (step.type === 'reach') {
      const occupied = new Set(fen.split(' ')[0].split('/').flatMap((row, r) => {
        let f = 0; const out: string[] = [];
        for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { out.push('abcdefgh'[f] + (8 - r)); f++; } }
        return out;
      }));
      for (const t of remaining) if (occupied.has(t)) h[t] = 'rgba(247,198,49,.6)';
    }
    return h;
  }, [hl, step, remaining, fen]);

  const emptyTargets = step.type === 'reach' ? remaining.filter((t) => !highlights[t]) : [];
  const interactive = step.type !== 'info' && status !== 'done' && status !== 'failed';
  const playing = step.type === 'play';
  const movesLeft = playing && step.maxMoves ? step.maxMoves - moves : null;

  return (
    <div className="play">
      <div className="play-board">
        <Board
          fen={fen}
          orientation={orientation}
          movable={interactive && !thinking ? (step.type === 'reach' ? 'w' : player) : null}
          onMove={onMove}
          lastMove={lastMove}
          arrows={step.type === 'info' ? step.arrows : []}
          highlights={highlights}
          markers={markers}
          targets={emptyTargets}
          freeMove={step.type === 'reach'}
          coordinates
        />
      </div>
      <div className="side">
        {header}
        <div className="side-body">
          <div className="coach fade-in">
            <div className="coach-avatar"><img src="pieces/wN.svg" alt="" /></div>
            <div className="bubble lesson-text"><Rich text={step.text} /></div>
          </div>
          {message && (
            <div className={`status ${status === 'done' ? 'ok' : 'bad'} fade-in`}>
              <span className="dot">{status === 'done' ? '✓' : '✕'}</span>
              <div>{message}</div>
            </div>
          )}
          {playing && status !== 'done' && status !== 'failed' && (
            <div className="status info">
              <span className="dot">{thinking ? '…' : '♟'}</span>
              <div>
                {thinking ? 'Computer is thinking…' : 'Your move'}
                {movesLeft != null && <small>{movesLeft} moves left</small>}
              </div>
            </div>
          )}
        </div>
        <div className="side-foot">
          {status === 'done' ? (
            <button className="btn block" onClick={onDone}>{step.type === 'info' ? (isLast ? 'Finish' : 'Next') : isLast ? 'Finish lesson' : 'Continue'}</button>
          ) : status === 'failed' ? (
            <button className="btn block" onClick={reset}>Try again</button>
          ) : (
            <button className="btn block" disabled>{step.type === 'reach' ? `${remaining.length} star${remaining.length === 1 ? '' : 's'} left` : 'Your move'}</button>
          )}
          <div className="row">
            <button className="icon-btn" title="Previous step" disabled={!onBack} onClick={onBack}>‹</button>
            <button className="icon-btn" title="Reset" onClick={reset}>↺</button>
            {step.type !== 'info' && step.type !== 'reach' && step.type !== 'any' && status !== 'done' && (
              <button className="btn grey sm" style={{ flex: 1 }} onClick={hint}>💡 Hint</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function countPawns(fen: string, color: 'w' | 'b') {
  const ch = color === 'w' ? 'P' : 'p';
  return [...fen.split(' ')[0]].filter((c) => c === ch).length;
}
