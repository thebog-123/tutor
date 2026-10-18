import raw from './puzzles.json';

export type Puzzle = {
  id: string;
  /** Position before the opponent's last move; moves[0] is that move, then the solution. */
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
};

type Raw = [id: string, fen: string, moves: string, rating: number, themes: string];

export const puzzles: Puzzle[] = (raw as Raw[]).map(([id, fen, moves, rating, themes]) => ({
  id,
  fen,
  moves: moves.split(' '),
  rating,
  themes: themes.split(' '),
}));

export const THEMES: Record<string, { name: string; description: string }> = {
  mate: { name: 'Checkmate', description: 'Win the game with style.' },
  mateIn1: { name: 'Mate in 1', description: 'Deliver checkmate in one move.' },
  mateIn2: { name: 'Mate in 2', description: 'Deliver checkmate in two moves.' },
  mateIn3: { name: 'Mate in 3', description: 'Deliver checkmate in three moves.' },
  mateIn4: { name: 'Mate in 4', description: 'Deliver checkmate in four moves.' },
  backRankMate: { name: 'Back Rank Mate', description: 'Checkmate the king on its home rank, trapped by its own pieces.' },
  knightMate: { name: 'Knight Mate', description: 'The final blow is delivered by a knight.' },
  fork: { name: 'Fork', description: 'A move where one piece attacks two or more enemy pieces at once.' },
  hangingPiece: { name: 'Hanging Piece', description: 'An enemy piece is undefended or poorly defended: take it.' },
  sacrifice: { name: 'Sacrifice', description: 'Give up material now to gain more later.' },
  quietMove: { name: 'Quiet Move', description: 'A move without check or capture that sets up an unstoppable threat.' },
  promotion: { name: 'Promotion', description: 'Promote a pawn, or threaten to.' },
  enPassant: { name: 'En Passant', description: 'A tactic involving the en passant rule.' },
  opening: { name: 'Opening', description: 'A tactic during the first phase of the game.' },
  middlegame: { name: 'Middlegame', description: 'A tactic during the second phase of the game.' },
  endgame: { name: 'Endgame', description: 'A tactic during the last phase of the game.' },
  oneMove: { name: 'One-Move Puzzle', description: 'A puzzle that is only one move long.' },
  short: { name: 'Short Puzzle', description: 'Two moves to win.' },
  long: { name: 'Long Puzzle', description: 'Three moves to win.' },
  veryLong: { name: 'Very Long Puzzle', description: 'Four moves or more to win.' },
};
