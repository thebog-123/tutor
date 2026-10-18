import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { courses } from './lessons';
import { puzzles } from './puzzles';
import { applyUci, isMateAfter } from '../lib/chess';

describe('lessons', () => {
  const ids = new Set<string>();
  for (const course of courses) {
    for (const lesson of course.lessons) {
      it(`${course.id}/${lesson.id}`, () => {
        const key = course.id + '/' + lesson.id;
        expect(ids.has(key)).toBe(false);
        ids.add(key);
        expect(lesson.steps.length).toBeGreaterThan(0);
        lesson.steps.forEach((step, i) => {
          const where = `${key} step ${i + 1}`;
          if (step.type === 'info' || step.type === 'reach') {
            // Teaching boards may omit kings; they only need to parse.
            expect(() => new Chess(step.fen, { skipValidation: true }), where).not.toThrow();
            if (step.type === 'reach') expect(step.targets.length, where).toBeGreaterThan(0);
            return;
          }
          const c = new Chess(step.fen);
          const turn = c.turn();
          if (step.orientation) expect(step.orientation, where).toBe(turn);
          if (step.type === 'line') {
            let fen: string | null = step.fen;
            expect(step.solution.length % 2, where + ' must end on your move').toBe(1);
            for (const u of step.solution) {
              fen = applyUci(fen!, u);
              expect(fen, `${where}: ${u} is illegal`).not.toBeNull();
            }
          }
          if (step.type === 'choose') {
            for (const u of step.accept) expect(applyUci(step.fen, u), `${where}: ${u}`).not.toBeNull();
          }
          if (step.type === 'mate') {
            const mates = c.moves({ verbose: true }).filter((m) => isMateAfter(step.fen, m.lan));
            expect(mates.length, `${where} has no mate in one`).toBeGreaterThan(0);
          }
          if (step.type === 'any') expect(c.moves().length, where).toBeGreaterThan(0);
          if (step.type === 'play') expect(c.isGameOver(), where).toBe(false);
        });
      });
    }
  }
});

describe('puzzles', () => {
  it('are all legal and end on the solver\'s move', () => {
    expect(puzzles.length).toBeGreaterThan(100);
    const seen = new Set<string>();
    for (const p of puzzles) {
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
      expect(p.moves.length % 2, p.id).toBe(0);
      let fen: string | null = p.fen;
      for (const u of p.moves) {
        fen = applyUci(fen!, u);
        expect(fen, `${p.id}: ${u}`).not.toBeNull();
      }
      if (p.themes.includes('mate')) expect(new Chess(fen!).isCheckmate(), p.id).toBe(true);
    }
  });
});
