// Glicko-style puzzle rating: big swings while the rating is new, smaller once it settles.
export type PuzzleRating = { rating: number; rd: number; games: number };

export const START: PuzzleRating = { rating: 800, rd: 300, games: 0 };

export function expected(r: number, opp: number) {
  return 1 / (1 + Math.pow(10, (opp - r) / 400));
}

export function update(me: PuzzleRating, puzzleRating: number, won: boolean): { next: PuzzleRating; delta: number } {
  const k = Math.max(8, Math.min(64, me.rd / 4.5));
  const delta = Math.round(k * ((won ? 1 : 0) - expected(me.rating, puzzleRating)));
  const rating = Math.max(100, me.rating + delta);
  const rd = Math.max(60, me.rd * 0.94);
  return { next: { rating, rd, games: me.games + 1 }, delta: rating - me.rating };
}
