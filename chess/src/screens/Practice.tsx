import type { Step } from '../data/lessons';
import { progress } from '../lib/progress';
import { go } from '../lib/router';
import { SimpleStep } from './LessonPlayer';

type Drill = { id: string; group: string; title: string; level: string; step: Extract<Step, { type: 'play' }> };

const DRILLS: Drill[] = [
  { id: 'kq', group: 'Basic Checkmates', title: 'Queen and King', level: 'Beginner', step: { type: 'play', goal: 'mate', maxMoves: 30, fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', text: 'Checkmate with king and queen within 30 moves.', success: 'Checkmate!' } },
  { id: 'kr', group: 'Basic Checkmates', title: 'Rook and King', level: 'Beginner', step: { type: 'play', goal: 'mate', maxMoves: 40, fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', text: 'Checkmate with king and rook within 40 moves.', success: 'Checkmate!' } },
  { id: 'krr', group: 'Basic Checkmates', title: 'Two Rooks', level: 'Beginner', step: { type: 'play', goal: 'mate', maxMoves: 20, fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1', text: 'Use the ladder: the rooks take turns giving check. Mate within 20 moves.', success: 'Checkmate!' } },
  { id: 'kbb', group: 'Basic Checkmates', title: 'Two Bishops', level: 'Intermediate', step: { type: 'play', goal: 'mate', maxMoves: 40, fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', text: 'Side by side, the bishops build a wall. Drive the king to a corner and mate within 40 moves.', success: 'Checkmate!' } },
  { id: 'kbn', group: 'Basic Checkmates', title: 'Bishop and Knight', level: 'Expert', step: { type: 'play', goal: 'mate', maxMoves: 50, fen: '8/8/8/4k3/8/8/8/1N2KB2 w - - 0 1', text: 'The hardest basic mate. You can only mate in a corner of your bishop\'s colour. 50 moves.', success: 'Checkmate! That\'s a real achievement.' } },
  { id: 'kp-opp', group: 'Pawn Endgames', title: 'Take the Opposition', level: 'Intermediate', step: { type: 'play', goal: 'promote', maxMoves: 25, fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', text: 'Win the opposition, escort the pawn and promote safely.', success: 'Promoted!' } },
  { id: 'kp-def', group: 'Pawn Endgames', title: 'Hold the Draw', level: 'Intermediate', step: { type: 'play', goal: 'draw', maxMoves: 25, fen: '4k3/8/8/4P3/4K3/8/8/8 b - - 0 1', orientation: 'b', text: 'You are Black. Keep your king in front of the pawn and use the opposition. Survive 25 moves or reach a draw.', success: 'Draw secured!' } },
  { id: 'kp-race', group: 'Pawn Endgames', title: 'Outside Passed Pawn', level: 'Advanced', step: { type: 'play', goal: 'promote', maxMoves: 40, fen: '8/5kp1/8/8/8/P7/5KP1/8 w - - 0 1', text: 'Your a-pawn drags the enemy king away. Use it, then win on the other side.', success: 'Well played!' } },
  { id: 'lucena', group: 'Rook Endgames', title: 'Lucena Position', level: 'Advanced', step: { type: 'play', goal: 'promote', maxMoves: 30, fen: '2K5/2P1k3/8/8/8/8/1r6/3R4 w - - 0 1', text: 'Build a bridge and promote.', success: 'Lucena mastered!' } },
  { id: 'q-vs-p', group: 'Queen Endgames', title: 'Queen vs Pawn', level: 'Advanced', step: { type: 'play', goal: 'mate', maxMoves: 40, fen: '8/8/8/8/8/1K6/4pk2/7Q w - - 0 1', text: 'Stop the pawn by forcing the king in front of it, bring your king closer, then mate.', success: 'Checkmate!' } },
];

export default function Practice({ drill }: { drill?: string }) {
  const done = progress.drillsDone();
  const d = DRILLS.find((x) => x.id === drill);
  if (d) {
    const idx = DRILLS.indexOf(d);
    const nextDrill = DRILLS[idx + 1];
    const header = (
      <div className="side-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <a href="#/learn/practice" className="muted" style={{ fontSize: 14 }}>← Practice</a>
        <div>{d.title}</div>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{d.group} · {d.level}</div>
      </div>
    );
    return (
      <SimpleStep
        key={d.id}
        step={d.step}
        header={header}
        isLast
        onDone={() => { progress.markDrill(d.id); go(nextDrill ? `learn/practice/${nextDrill.id}` : 'learn/practice'); }}
      />
    );
  }
  const groups = [...new Set(DRILLS.map((x) => x.group))];
  return (
    <div className="page fade-in">
      <div className="page-title"><span className="icon">🎯</span>Practice</div>
      <p className="muted" style={{ marginTop: -8 }}>Play essential positions against the computer until you can win them every time.</p>
      {groups.map((g) => (
        <div key={g}>
          <div className="section-title">{g}</div>
          <div className="lesson-list">
            {DRILLS.filter((x) => x.group === g).map((x) => (
              <a key={x.id} className="lesson-row" href={`#/learn/practice/${x.id}`}>
                <div className={`lesson-num ${done[x.id] ? 'done' : ''}`}>{done[x.id] ? '✓' : '♟'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{x.title}</div>
                  <div className="muted" style={{ fontSize: 14 }}>{x.step.text}</div>
                </div>
                <span className="tag">{x.level}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { DRILLS };
