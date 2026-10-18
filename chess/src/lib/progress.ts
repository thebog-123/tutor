import { load, save } from './storage';
import { START, type PuzzleRating } from './rating';

export type PuzzleResult = { id: string; won: boolean; delta: number; rating: number; at: number };

export const progress = {
  lessonsDone(): Record<string, number> { return load('lessons', {}); },
  markLesson(key: string) {
    const d = progress.lessonsDone();
    if (!d[key]) { d[key] = Date.now(); save('lessons', d); }
  },
  rating(): PuzzleRating { return load('puzzleRating', START); },
  setRating(r: PuzzleRating) { save('puzzleRating', r); },
  history(): PuzzleResult[] { return load('puzzleHistory', []); },
  addResult(r: PuzzleResult) {
    const h = [r, ...progress.history()].slice(0, 200);
    save('puzzleHistory', h);
  },
  seen(): string[] { return load('puzzleSeen', []); },
  markSeen(id: string) {
    const s = progress.seen();
    if (!s.includes(id)) save('puzzleSeen', [...s, id].slice(-3000));
  },
  rushBest(mode: string): number { return load<Record<string, number>>('rushBest', {})[mode] ?? 0; },
  setRushBest(mode: string, score: number) {
    const all = load<Record<string, number>>('rushBest', {});
    if (score > (all[mode] ?? 0)) { all[mode] = score; save('rushBest', all); return true; }
    return false;
  },
  rushHistory(): { mode: string; score: number; at: number }[] { return load('rushHistory', []); },
  addRush(mode: string, score: number) {
    save('rushHistory', [{ mode, score, at: Date.now() }, ...progress.rushHistory()].slice(0, 50));
  },
  visionBest(color: string): number { return load<Record<string, number>>('visionBest', {})[color] ?? 0; },
  setVisionBest(color: string, score: number) {
    const all = load<Record<string, number>>('visionBest', {});
    if (score > (all[color] ?? 0)) { all[color] = score; save('visionBest', all); }
  },
  drillsDone(): Record<string, number> { return load('drills', {}); },
  markDrill(id: string) {
    const d = progress.drillsDone();
    if (!d[id]) { d[id] = Date.now(); save('drills', d); }
  },
};
