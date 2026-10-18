import type { Arrow } from '../components/Board';
import { calcLessons } from './calc';

export type Level = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type Category = 'Basics' | 'Openings' | 'Tactics' | 'Checkmates' | 'Endgames' | 'Strategy';

type Base = { fen: string; text: string; orientation?: 'w' | 'b' };

export type Step =
  /** Read-only: explain an idea on the board. */
  | (Base & { type: 'info'; arrows?: Arrow[]; highlights?: string[] })
  /** Walk a piece around the board (moves ignore turns) to collect every star. */
  | (Base & { type: 'reach'; targets: string[] })
  /** Play an exact line. Even indexes are your moves, odd indexes the reply. */
  | (Base & { type: 'line'; solution: string[]; success?: string })
  /** Any one of several moves is right. */
  | (Base & { type: 'choose'; accept: string[]; success?: string })
  /** Deliver checkmate in one, with any mating move. */
  | (Base & { type: 'mate'; success?: string })
  /** Any legal move (for "get out of check"). */
  | (Base & { type: 'any'; success?: string })
  /** Play it out against the computer. */
  | (Base & { type: 'play'; goal: 'mate' | 'promote' | 'draw'; maxMoves?: number; success?: string });

export type Lesson = { id: string; title: string; summary: string; steps: Step[] };
export type Course = {
  id: string;
  title: string;
  level: Level;
  category: Category;
  icon: string;
  color: string;
  description: string;
  lessons: Lesson[];
};

export const courses: Course[] = [
  {
    id: 'the-pieces',
    title: 'The Pieces',
    level: 'Beginner',
    category: 'Basics',
    icon: '♜',
    color: '#4f7a34',
    description: 'Meet the board and learn how every piece moves and captures.',
    lessons: [
      {
        id: 'board',
        title: 'The Chessboard',
        summary: 'Squares, files, ranks and the starting position.',
        steps: [
          {
            type: 'info',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            text: 'Welcome! A chessboard has **64 squares** in an 8×8 grid. Each player starts with 16 pieces: White at the bottom, Black at the top.\n\nTip: there is always a **light square in the bottom-right corner**.',
            highlights: ['h1'],
          },
          {
            type: 'info',
            fen: '8/8/8/8/8/8/8/8 w - - 0 1',
            text: 'Columns are called **files** (a to h) and rows are called **ranks** (1 to 8). Every square is named by its file and rank.\n\nThe highlighted square is **e4**.',
            highlights: ['e4'],
            arrows: [{ from: 'e1', to: 'e8', color: 'rgba(80,140,230,.9)' }, { from: 'a4', to: 'h4', color: 'rgba(80,140,230,.9)' }],
          },
          {
            type: 'info',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            text: 'In the starting position the **queen goes on her own colour**: the white queen on a light square (d1), the black queen on a dark square (d8).\n\nWhite always moves first.',
            highlights: ['d1', 'd8'],
          },
        ],
      },
      {
        id: 'rook',
        title: 'The Rook',
        summary: 'Straight lines along files and ranks.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/3R4/8/8/8 w - - 0 1',
            text: 'The **rook** moves any number of squares in a straight line: up, down, left or right. It cannot jump over pieces.',
            arrows: [{ from: 'd4', to: 'd8' }, { from: 'd4', to: 'd1' }, { from: 'd4', to: 'a4' }, { from: 'd4', to: 'h4' }],
          },
          { type: 'reach', fen: '8/8/8/8/8/8/8/R7 w - - 0 1', targets: ['a5', 'f5', 'f8'], text: 'Move the rook to collect all the stars.' },
          { type: 'reach', fen: '8/8/2p5/8/8/8/8/2R4p w - - 0 1', targets: ['c6', 'h1'], text: 'Pieces capture by moving onto an enemy piece. **Capture both black pawns** with the rook.' },
        ],
      },
      {
        id: 'bishop',
        title: 'The Bishop',
        summary: 'Diagonals, and staying on one colour.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/3B4/8/8/8 w - - 0 1',
            text: 'The **bishop** moves any number of squares diagonally. A bishop that starts on a dark square stays on dark squares for the whole game.',
            arrows: [{ from: 'd4', to: 'h8' }, { from: 'd4', to: 'a7' }, { from: 'd4', to: 'a1' }, { from: 'd4', to: 'g1' }],
          },
          { type: 'reach', fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', targets: ['e3', 'b6', 'd8'], text: 'Collect the stars with the bishop.' },
          { type: 'reach', fen: '8/6p1/8/8/3p4/8/8/5B2 w - - 0 1', targets: ['d3', 'g6'], text: 'Collect the stars. Careful, the pawns are in the way!' },
        ],
      },
      {
        id: 'queen',
        title: 'The Queen',
        summary: 'The most powerful piece: rook plus bishop.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1',
            text: 'The **queen** combines the rook and the bishop: she moves any number of squares in a straight line or diagonally.',
            arrows: [
              { from: 'd4', to: 'd8' }, { from: 'd4', to: 'd1' }, { from: 'd4', to: 'a4' }, { from: 'd4', to: 'h4' },
              { from: 'd4', to: 'h8' }, { from: 'd4', to: 'a7' }, { from: 'd4', to: 'a1' }, { from: 'd4', to: 'g1' },
            ],
          },
          { type: 'reach', fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', targets: ['d6', 'h2', 'b8'], text: 'Collect the stars with the queen.' },
          { type: 'reach', fen: '1p6/8/5p2/8/8/2p5/8/Q7 w - - 0 1', targets: ['c3', 'f6', 'b8'], text: 'Capture all three pawns with the queen.' },
        ],
      },
      {
        id: 'king',
        title: 'The King',
        summary: 'One square at a time, in any direction.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/3K4/8/8/8 w - - 0 1',
            text: 'The **king** moves one square in any direction. He is the most important piece: if your king is trapped, you lose.',
            highlights: ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'],
          },
          { type: 'reach', fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', targets: ['e3', 'g3', 'g1'], text: 'Walk the king to every star.' },
        ],
      },
      {
        id: 'knight',
        title: 'The Knight',
        summary: 'The L-shaped jump.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/3N4/8/8/8 w - - 0 1',
            text: 'The **knight** moves in an "L": two squares in one direction and then one square sideways. It is the only piece that can **jump over** other pieces.',
            highlights: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
          },
          { type: 'reach', fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', targets: ['c3', 'e4', 'f6'], text: 'Hop the knight to every star.' },
          { type: 'reach', fen: '8/8/8/8/8/2PPP3/2PNP3/2PPP3 w - - 0 1', targets: ['f3', 'e5'], text: 'The knight is surrounded, but it can jump! Collect the stars.' },
        ],
      },
      {
        id: 'pawn',
        title: 'The Pawn',
        summary: 'Forward to move, diagonal to capture.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/8/8/8/4P3/8 w - - 0 1',
            text: 'The **pawn** moves straight forward one square. On its very first move it may go **two squares**. Pawns never move backwards.',
            arrows: [{ from: 'e2', to: 'e4' }],
          },
          {
            type: 'info',
            fen: '8/8/8/3p1p2/4P3/8/8/8 w - - 0 1',
            text: 'Pawns **capture diagonally** forward, one square. This pawn can capture on d5 or f5, but it cannot move to e5 if a piece is there.',
            arrows: [{ from: 'e4', to: 'd5' }, { from: 'e4', to: 'f5' }],
          },
          { type: 'reach', fen: '8/8/8/3p4/8/8/4P3/8 w - - 0 1', targets: ['e4', 'd5'], text: 'Move the pawn two squares, then capture the black pawn.' },
        ],
      },
    ],
  },
  {
    id: 'special-moves',
    title: 'Special Moves',
    level: 'Beginner',
    category: 'Basics',
    icon: '♚',
    color: '#5a6fa6',
    description: 'Castling, en passant and pawn promotion.',
    lessons: [
      {
        id: 'castling',
        title: 'Castling',
        summary: 'Tuck your king away and activate a rook in one move.',
        steps: [
          {
            type: 'info',
            fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
            text: '**Castling** moves the king two squares toward a rook, and the rook jumps to the other side of the king. It is the only move where two pieces move at once.\n\nYou can castle only if neither piece has moved, the squares between them are empty, and the king is not in check, does not pass through check, and does not land in check.',
            arrows: [{ from: 'e1', to: 'g1' }, { from: 'e1', to: 'c1' }],
          },
          { type: 'line', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', solution: ['e1g1'], text: 'Castle **kingside**: drag your king two squares to the right.', success: 'Short castling. The rook jumped to f1.' },
          { type: 'line', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', solution: ['e1c1'], text: 'Now castle **queenside**: move your king two squares to the left.', success: 'Long castling. The rook is on d1.' },
          { type: 'line', fen: 'r3k2r/pppppppp/8/8/2b5/8/PPPP1PPP/R3K2R w KQkq - 0 1', solution: ['e1c1'], text: 'The black bishop attacks **f1**, so you cannot castle kingside here. Castle the other way.', success: 'Right: the king may not pass through an attacked square.' },
        ],
      },
      {
        id: 'en-passant',
        title: 'En Passant',
        summary: 'The special pawn capture.',
        steps: [
          {
            type: 'info',
            fen: 'k7/3p4/8/4P3/8/8/8/K7 b - - 0 1',
            text: 'When a pawn moves **two squares** and lands right beside an enemy pawn, that enemy pawn may capture it **as if it had moved only one square**. This is called *en passant* ("in passing").\n\nBlack is about to play d7–d5.',
            arrows: [{ from: 'd7', to: 'd5' }],
          },
          { type: 'line', fen: 'k7/8/8/3pP3/8/8/8/K7 w - d6 0 1', solution: ['e5d6'], text: 'Black just played d7–d5. Capture it **en passant**: move your pawn to d6.', success: 'The black pawn is removed even though you landed behind it.' },
          {
            type: 'info',
            fen: 'k7/8/8/3pP3/8/8/8/K7 w - d6 0 1',
            text: 'En passant is only allowed on the **very next move**. If you wait, the chance is gone.',
          },
        ],
      },
      {
        id: 'promotion',
        title: 'Promotion',
        summary: 'Turn a pawn into a queen.',
        steps: [
          {
            type: 'info',
            fen: 'k7/4P3/8/8/8/8/8/K7 w - - 0 1',
            text: 'When a pawn reaches the far side of the board it **promotes**: you replace it with a queen, rook, bishop or knight. Almost always you choose a queen.',
            arrows: [{ from: 'e7', to: 'e8' }],
          },
          { type: 'line', fen: 'k7/4P3/8/8/8/8/8/K7 w - - 0 1', solution: ['e7e8q'], text: 'Promote the pawn to a **queen**.', success: 'A brand new queen, and it gives check!' },
          { type: 'line', fen: '5k2/1P6/8/8/8/8/8/K7 w - - 0 1', solution: ['b7b8q'], text: 'Promote again: push to the last rank and pick the queen.', success: 'Well done.' },
        ],
      },
    ],
  },
  {
    id: 'check-and-mate',
    title: 'Check and Checkmate',
    level: 'Beginner',
    category: 'Checkmates',
    icon: '♔',
    color: '#a65a3c',
    description: 'How to attack the king, defend against check, and win the game.',
    lessons: [
      {
        id: 'check',
        title: 'Check',
        summary: 'Three ways to get out of check.',
        steps: [
          {
            type: 'info',
            fen: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1',
            text: 'When a king is attacked it is in **check**. You must get out of check right away, in one of three ways:\n\n**1.** Move the king. **2.** Block the attack. **3.** Capture the attacker.',
            arrows: [{ from: 'e8', to: 'e1', color: 'rgba(230,60,50,.9)' }],
          },
          { type: 'any', fen: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1', text: 'Your king is in check from the rook. **Move the king** to safety.', success: 'Safe!' },
          { type: 'line', fen: '4r2k/8/8/8/8/8/3B4/4K3 w - - 0 1', solution: ['d2e3'], text: '**Block** the check with your bishop.', success: 'Blocked.' },
          { type: 'line', fen: '4r2k/8/8/8/B7/8/8/4K3 w - - 0 1', solution: ['a4e8'], text: '**Capture** the piece that is giving check.', success: 'The attacker is gone.' },
        ],
      },
      {
        id: 'checkmate',
        title: 'Checkmate',
        summary: 'Trap the king to win.',
        steps: [
          {
            type: 'info',
            fen: '4R1k1/5ppp/8/8/8/8/8/K7 b - - 0 1',
            text: '**Checkmate** is a check that cannot be escaped: the king cannot move, the check cannot be blocked, and the attacker cannot be captured. Checkmate ends the game.\n\nHere the black king is trapped by its own pawns.',
            arrows: [{ from: 'e8', to: 'g8', color: 'rgba(230,60,50,.9)' }],
          },
          { type: 'mate', fen: '6k1/5ppp/8/8/8/8/8/K3R3 w - - 0 1', text: 'Checkmate in one move.' },
          { type: 'mate', fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', text: 'Use your queen and king together. Checkmate in one.' },
          { type: 'mate', fen: 'k7/7R/8/8/8/8/8/K5R1 w - - 0 1', text: 'Two rooks work well together. Checkmate in one.' },
          { type: 'mate', fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', text: 'Checkmate in one.' },
        ],
      },
      {
        id: 'stalemate',
        title: 'Stalemate',
        summary: 'The draw to avoid when you are winning.',
        steps: [
          {
            type: 'info',
            fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
            text: 'If the player to move is **not in check** but has **no legal moves**, it is **stalemate**, and the game is a draw.\n\nBlack is not in check, but every king move walks into an attack. Draw!',
          },
          { type: 'mate', fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', text: 'Checkmate in one, and **don\'t** stalemate!', success: 'Checkmate, not stalemate. Well done.' },
          { type: 'mate', fen: 'k7/8/1K6/8/8/8/2Q5/8 w - - 0 1', text: 'Careful again: there is a checkmate in one, but also a stalemate.', success: 'Perfect.' },
        ],
      },
    ],
  },
  {
    id: 'opening-principles',
    title: 'Opening Principles',
    level: 'Beginner',
    category: 'Openings',
    icon: '♘',
    color: '#8a6d2f',
    description: 'Control the centre, develop your pieces and keep your king safe.',
    lessons: [
      {
        id: 'center',
        title: 'Control the Centre',
        summary: 'Why e4 and d4 matter.',
        steps: [
          {
            type: 'info',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            text: 'The four squares in the middle (**d4, e4, d5, e5**) are the most important on the board. Pieces in the centre control more squares and can reach either side quickly.',
            highlights: ['d4', 'e4', 'd5', 'e5'],
          },
          { type: 'choose', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', accept: ['e2e4', 'd2d4'], text: 'Make a strong first move: put a pawn **in the centre**, two squares forward.', success: 'A classic start. Your pawn grabs central space and opens lines for your pieces.' },
        ],
      },
      {
        id: 'develop',
        title: 'Develop Your Pieces',
        summary: 'Knights before bishops, toward the centre.',
        steps: [
          { type: 'choose', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', accept: ['g1f3', 'b1c3'], text: 'Both sides played a centre pawn. Now **develop a knight** toward the centre.', success: 'Knights are best on f3 and c3, where they guard the centre.' },
          { type: 'choose', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', accept: ['f1c4', 'f1b5'], text: 'Develop your **light-squared bishop** to an active square.', success: 'Your bishop now aims at the centre and the black king side.' },
          {
            type: 'info',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
            text: 'A quick rule: **move each piece once** in the opening, bring out knights and bishops before the queen and rooks, and don\'t grab pawns while your pieces are still at home.',
          },
        ],
      },
      {
        id: 'castle-early',
        title: 'Castle Early',
        summary: 'King safety first.',
        steps: [
          { type: 'line', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', solution: ['e1g1'], text: 'Your knight and bishop are out of the way. **Castle** to make your king safe.', success: 'Your king is safe behind the pawns and your rook can join the game.' },
          {
            type: 'info',
            fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 1 6',
            text: 'Both kings are castled. Now the rooks can be **connected** by developing the queen and the last minor piece.',
          },
        ],
      },
      {
        id: 'early-queen',
        title: 'Early Queen Attacks',
        summary: 'Beat the four-move checkmate.',
        steps: [
          {
            type: 'info',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
            text: 'White\'s queen and bishop both attack **f7**, the weakest square in Black\'s camp, guarded only by the king. White threatens Qxf7#!',
            arrows: [{ from: 'h5', to: 'f7', color: 'rgba(230,60,50,.9)' }, { from: 'c4', to: 'f7', color: 'rgba(230,60,50,.9)' }],
            orientation: 'b',
          },
          { type: 'choose', orientation: 'b', fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', accept: ['g7g6', 'd8e7', 'd8f6'], text: 'You are Black. **Defend f7**, or block the queen.', success: 'Threat stopped. White\'s queen came out early and will now be chased around.' },
          { type: 'mate', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', text: 'Here Black forgot to defend. Deliver the famous four-move checkmate.', success: 'Checkmate! This is why f7 must be guarded.' },
        ],
      },
    ],
  },
  {
    id: 'tactics-toolbox',
    title: 'Tactics Toolbox',
    level: 'Intermediate',
    category: 'Tactics',
    icon: '⚔',
    color: '#7a3fa0',
    description: 'Forks, pins, skewers and discovered attacks: the patterns that win material.',
    lessons: [
      {
        id: 'forks',
        title: 'Forks',
        summary: 'Attack two things at once.',
        steps: [
          {
            type: 'info',
            fen: '2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1',
            text: 'A **fork** is a single move that attacks two or more pieces. Your opponent can only save one. Knights are famous for forks.',
            arrows: [{ from: 'd5', to: 'e7' }],
          },
          { type: 'line', fen: '2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', solution: ['d5e7', 'g8f8', 'e7c8'], text: 'Find the knight fork that wins the queen.', success: 'Check and attack on the queen at the same time. That\'s a royal fork.' },
          { type: 'line', fen: '4k3/8/2n1n3/8/3P4/8/PP6/4K3 w - - 0 1', solution: ['d4d5', 'e6c5', 'd5c6'], text: 'Even a humble pawn can fork. Attack both knights.', success: 'Only one knight could escape.' },
          { type: 'line', fen: 'r7/5ppk/8/8/8/8/4Q3/6K1 w - - 0 1', solution: ['e2e4', 'g7g6', 'e4a8'], text: 'Queens fork too. Find a check that also attacks the rook.', success: 'The queen forks the king and the rook.' },
        ],
      },
      {
        id: 'pins',
        title: 'Pins',
        summary: 'Freeze a piece in front of a bigger one.',
        steps: [
          {
            type: 'info',
            fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1',
            text: 'A **pin** traps a piece because moving it would expose something more valuable behind it. When the piece behind is the king, the pinned piece **cannot legally move**.',
            arrows: [{ from: 'b5', to: 'e8' }],
          },
          { type: 'line', fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', solution: ['d4d5'], text: 'The knight is pinned. **Attack it** with a pawn: it cannot run away.', success: 'The knight can\'t move, so it will be captured next move. Attack a pinned piece and it often falls.' },
          { type: 'line', fen: '4k3/8/8/4q3/8/8/3K4/R7 w - - 0 1', solution: ['a1e1', 'e5e1', 'd2e1'], text: '**Pin the queen** to the king. Your rook is protected, so she can only escape by trading herself for it.', success: 'A queen for a rook: a great trade.' },
        ],
      },
      {
        id: 'skewers',
        title: 'Skewers',
        summary: 'A pin in reverse.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/3k3q/8/8/8/R5K1 w - - 0 1',
            text: 'A **skewer** attacks a valuable piece that must move, exposing a piece behind it. It is a pin in reverse: the bigger piece is in front.',
            arrows: [{ from: 'a1', to: 'a5' }],
          },
          { type: 'line', fen: '8/8/8/3k3q/8/8/8/R5K1 w - - 0 1', solution: ['a1a5', 'd5e4', 'a5h5'], text: 'Skewer the king and queen.', success: 'The king steps aside and the queen falls.' },
          { type: 'line', fen: '3qk3/8/8/8/8/8/8/R3K2R w - - 0 1', solution: ['h1h8', 'e8f7', 'h8d8'], text: 'Skewer along the back rank: check the king, and win the queen behind it.', success: 'The king stepped aside and the queen fell.' },
        ],
      },
      {
        id: 'discovered',
        title: 'Discovered Attacks',
        summary: 'Move one piece to unleash another.',
        steps: [
          {
            type: 'info',
            fen: '4k3/q7/8/4N3/8/8/8/4R2K w - - 0 1',
            text: 'A **discovered attack** happens when you move a piece out of the way and reveal an attack by the piece behind it. If the revealed attack is a check, the moving piece can go anywhere, even attack something else!',
            arrows: [{ from: 'e1', to: 'e8', color: 'rgba(230,60,50,.9)' }],
          },
          { type: 'line', fen: '4k3/q7/8/4N3/8/8/8/4R2K w - - 0 1', solution: ['e5c6', 'e8f8', 'c6a7'], text: 'Move the knight with **discovered check** and attack the queen at the same time.', success: 'Black had to deal with the check, so the queen was lost.' },
        ],
      },
    ],
  },
  {
    id: 'checkmate-patterns',
    title: 'Checkmate Patterns',
    level: 'Intermediate',
    category: 'Checkmates',
    icon: '♛',
    color: '#b0413e',
    description: 'Back rank, smothered, Arabian and other mates every player should know.',
    lessons: [
      {
        id: 'back-rank',
        title: 'Back Rank Mate',
        summary: 'When the king\'s own pawns are a prison.',
        steps: [
          {
            type: 'info',
            fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
            text: 'A king behind three unmoved pawns has no escape squares. A rook or queen on the **back rank** can deliver mate.\n\nTo protect your own king, make a small "luft" (air) by pushing one pawn, such as h3.',
            arrows: [{ from: 'd1', to: 'd8' }],
          },
          { type: 'mate', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', text: 'Deliver back rank mate.' },
          { type: 'mate', fen: '3r2k1/5ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1', text: 'Black\'s rook guards the back rank, but you have two rooks. Mate in one.' },
        ],
      },
      {
        id: 'smothered',
        title: 'Smothered Mate',
        summary: 'A knight mates a king trapped by its own pieces.',
        steps: [
          { type: 'mate', fen: '6rk/6pp/8/4N3/8/8/8/6K1 w - - 0 1', text: 'The black king is surrounded by its own pieces. One knight move finishes it.', success: 'Smothered mate!' },
          {
            type: 'info',
            fen: '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1',
            text: 'The most beautiful version starts with a **queen sacrifice**: offer the queen on g8 so that the rook is forced to take it and block the king in.',
            arrows: [{ from: 'd5', to: 'g8' }],
          },
          { type: 'line', fen: '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1', solution: ['d5g8', 'f8g8', 'h6f7'], text: 'Mate in two: sacrifice the queen, then smother the king.', success: 'A classic! The rook had to take, and the knight mated.' },
        ],
      },
      {
        id: 'minor-major',
        title: 'Queen, Rook and Minor Piece Mates',
        summary: 'Arabian mate and the g7 battery.',
        steps: [
          { type: 'mate', fen: '7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', text: '**Arabian mate**: rook and knight work together in the corner. Mate in one.', success: 'The knight guards both the rook and g8.' },
          { type: 'mate', fen: '6k1/5p1p/8/8/6Q1/2B5/8/6K1 w - - 0 1', text: 'Your bishop aims at **g7**. Mate in one with the queen.', success: 'Queen and bishop battery: mate on g7.' },
        ],
      },
    ],
  },
  {
    id: 'essential-endgames',
    title: 'Essential Endgames',
    level: 'Advanced',
    category: 'Endgames',
    icon: '♙',
    color: '#2f7a78',
    description: 'Win the basic endgames against the computer: queen, rook, and king and pawn.',
    lessons: [
      {
        id: 'kq-vs-k',
        title: 'Queen Checkmate',
        summary: 'Push the king to the edge with a queen.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
            text: 'With a queen you can force checkmate. The plan:\n\n**1.** Use the queen to **box in** the enemy king (a knight\'s move away works well).\n**2.** Shrink the box until the king is on the edge.\n**3.** Bring your **own king** up to help, then mate.\n\nWatch out for stalemate: always leave the king a square until the final blow.',
          },
          { type: 'play', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', goal: 'mate', maxMoves: 30, text: 'Checkmate the computer within 30 moves.', success: 'Checkmate! You have mastered the queen mate.' },
        ],
      },
      {
        id: 'kr-vs-k',
        title: 'Rook Checkmate',
        summary: 'The box method with a single rook.',
        steps: [
          {
            type: 'info',
            fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
            text: 'A rook alone cannot mate, but rook and king can. Cut the enemy king off with the rook, then walk your king up so the kings face each other (**opposition**) and give check along the edge.\n\nKeep the rook far from the enemy king so it cannot be attacked.',
          },
          { type: 'play', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'mate', maxMoves: 40, text: 'Checkmate within 40 moves.', success: 'Rook mate achieved. Nicely done.' },
        ],
      },
      {
        id: 'king-pawn',
        title: 'King and Pawn',
        summary: 'Opposition and escorting a pawn home.',
        steps: [
          {
            type: 'info',
            fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
            text: 'In king and pawn endings, the **king leads the pawn**. When the kings stand face to face with one square between them, the side that does **not** have to move "has the opposition".\n\nWith your king on the 6th rank in front of the pawn, you win no matter who moves.',
          },
          { type: 'play', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'promote', maxMoves: 20, text: 'Promote the pawn safely against the computer.', success: 'Your new queen is safe. The rest is easy.' },
          { type: 'play', fen: '8/8/3k4/8/8/3K4/3P4/8 w - - 0 1', goal: 'promote', maxMoves: 30, text: 'Harder: your king must get in front of the pawn first. Promote safely.', success: 'Excellent technique.' },
        ],
      },
      {
        id: 'lucena',
        title: 'The Lucena Position',
        summary: 'Building a bridge with your rook.',
        steps: [
          {
            type: 'info',
            fen: '2K5/2P1k3/8/8/8/8/1r6/3R4 w - - 0 1',
            text: 'The **Lucena** is the most important rook ending. Your pawn is on the 7th, your king is in front of it, and the enemy king is cut off.\n\nThe winning idea is **building a bridge**: first drive the enemy king one file further away with a rook check, then put your rook on the **4th rank**. When your king walks out, the rook can block the side checks.',
            arrows: [{ from: 'd1', to: 'd4' }],
          },
          { type: 'play', fen: '2K5/2P1k3/8/8/8/8/1r6/3R4 w - - 0 1', goal: 'promote', maxMoves: 30, text: 'Win the Lucena against the computer: promote and keep the queen.', success: 'Bridge built, pawn promoted. That\'s the Lucena.' },
        ],
      },
    ],
  },
  {
    id: 'strategy-essentials',
    title: 'Strategy Essentials',
    level: 'Advanced',
    category: 'Strategy',
    icon: '♝',
    color: '#4c6a8c',
    description: 'Open files, outposts and passed pawns: how strong players make plans.',
    lessons: [
      {
        id: 'open-files',
        title: 'Rooks on Open Files',
        summary: 'Give your rooks a highway.',
        steps: [
          {
            type: 'info',
            fen: 'r4rk1/pp3ppp/2n2n2/8/8/2N2N2/PP3PPP/R4RK1 w - - 0 1',
            text: 'An **open file** has no pawns on it. Rooks love open files: from there they can invade the 7th rank and attack.\n\nHere the c, d and e files are all open.',
            highlights: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
          },
          { type: 'choose', fen: 'r4rk1/pp3ppp/2n2n2/8/8/2N2N2/PP3PPP/R4RK1 w - - 0 1', accept: ['f1d1', 'a1d1', 'f1e1', 'a1e1', 'a1c1', 'f1c1'], text: 'Put one of your rooks on an **open file**.', success: 'Your rook now controls a whole file.' },
        ],
      },
      {
        id: 'outposts',
        title: 'Knight Outposts',
        summary: 'A square no pawn can attack.',
        steps: [
          {
            type: 'info',
            fen: 'r4rk1/pp3ppp/3p4/4p3/4P3/2N5/PPP2PPP/R4RK1 w - - 0 1',
            text: 'An **outpost** is a square that enemy pawns can never attack. A knight on an outpost in the centre is often as strong as a rook.\n\nBlack\'s pawns on d6 and e5 can never cover **d5**.',
            highlights: ['d5'],
          },
          { type: 'line', fen: 'r4rk1/pp3ppp/3p4/4p3/4P3/2N5/PPP2PPP/R4RK1 w - - 0 1', solution: ['c3d5'], text: 'Plant your knight on the outpost.', success: 'No black pawn can ever chase it away.' },
        ],
      },
      {
        id: 'passed-pawns',
        title: 'Passed Pawns',
        summary: 'Pawns that must be pushed.',
        steps: [
          {
            type: 'info',
            fen: '6k1/5ppp/8/1P6/8/8/5PPP/6K1 w - - 0 1',
            text: 'A **passed pawn** has no enemy pawns in front of it or on the files next to it. Nothing but pieces can stop it. In the words of an old master: *passed pawns must be pushed!*',
            arrows: [{ from: 'b5', to: 'b8' }],
          },
          { type: 'play', fen: '6k1/5ppp/8/1P6/8/8/5PPP/6K1 w - - 0 1', goal: 'promote', maxMoves: 12, text: 'The black king is too far away. Promote your passed pawn.', success: 'The king never caught it.' },
        ],
      },
    ],
  },
  {
    id: 'calculation',
    title: 'Calculation Gym',
    level: 'Expert',
    category: 'Tactics',
    icon: '♕',
    color: '#9a7b1c',
    description: 'Longer combinations from real positions: sacrifices, quiet moves and mates in several moves.',
    lessons: calcLessons,
  },
];

export const allLessons = courses.flatMap((c) => c.lessons.map((l) => ({ course: c, lesson: l })));

export function findCourse(id: string) {
  return courses.find((c) => c.id === id);
}
