import type { Lesson, Step } from './lessons';
import { puzzles, type Puzzle } from './puzzles';
import { applyUci, turnOf } from '../lib/chess';

// The Expert course is built from the hardest generated puzzles of each theme.
const GROUPS: { id: string; title: string; summary: string; intro: string; pick: (p: Puzzle) => boolean; hint: string }[] = [
  {
    id: 'sacrifices',
    title: 'Sacrifices',
    summary: 'Give material to get more back.',
    intro: 'Strong players are not afraid to **give up material** when they have calculated that they get more back. In each position, look for a capture or check that looks like it loses material at first.',
    pick: (p) => p.themes.includes('sacrifice'),
    hint: 'The best move gives something away.',
  },
  {
    id: 'quiet-moves',
    title: 'Quiet Moves',
    summary: 'No check, no capture, but deadly.',
    intro: 'Not every winning move is a check or a capture. A **quiet move** creates a threat the opponent cannot meet. These are the hardest moves to spot: look at what your opponent can\'t defend.',
    pick: (p) => p.themes.includes('quietMove') && !p.themes.includes('mate'),
    hint: 'The winning move is neither a check nor a capture.',
  },
  {
    id: 'mating-attacks',
    title: 'Mating Attacks',
    summary: 'Forced checkmates in two or more.',
    intro: 'When the enemy king is exposed, look for **forcing moves**: checks first, then captures, then threats. Each of these positions ends in checkmate.',
    pick: (p) => p.themes.some((t) => t === 'mateIn2' || t === 'mateIn3' || t === 'mateIn4'),
    hint: 'There is a forced checkmate.',
  },
  {
    id: 'long-combinations',
    title: 'Long Combinations',
    summary: 'Three moves deep and beyond.',
    intro: 'These combinations take **three or more moves**. Before you touch a piece, try to see the whole line: your move, the best reply, and your follow-up.',
    pick: (p) => p.themes.includes('long') || p.themes.includes('veryLong'),
    hint: 'Calculate the whole line before you move.',
  },
];

function toStep(p: Puzzle, hint: string): Step | null {
  const fen = applyUci(p.fen, p.moves[0]);
  if (!fen) return null;
  const side = turnOf(fen) === 'w' ? 'White' : 'Black';
  return { type: 'line', fen, solution: p.moves.slice(1), text: `${side} to move. ${hint} *(Rating ${p.rating})*`, success: 'Well calculated!' };
}

export const calcLessons: Lesson[] = GROUPS.map((g) => {
  const pool = puzzles.filter(g.pick).sort((a, b) => b.rating - a.rating).slice(0, 5).reverse();
  const steps = pool.map((p) => toStep(p, g.hint)).filter((s): s is Step => !!s);
  return {
    id: g.id,
    title: g.title,
    summary: g.summary,
    steps: steps.length ? [{ type: 'info', fen: steps[0].fen, text: g.intro, orientation: steps[0].orientation ?? turnOf(steps[0].fen) }, ...steps] : [],
  } satisfies Lesson;
}).filter((l) => l.steps.length > 1);
