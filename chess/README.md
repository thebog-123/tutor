# Chess Learn ♞

A personal chess training site modelled on the *Learn* and *Puzzles* sections of the big
chess sites: the same dark layout and green board, with all lesson content, puzzles and code
written for this project. There is no server and no account. Progress is saved in your
browser (localStorage).

## What's in it

**Learn**
- **Lessons**: 9 courses (31 lessons) from Beginner to Expert, filterable by level and topic.
  Each lesson mixes explanations on the board (arrows, highlighted squares) with
  interactive challenges:
  - collect the stars (learn how each piece moves)
  - play the right move or line (castling, forks, pins, skewers, smothered mate…)
  - mate in one (any mating move counts; stalemate is caught and explained)
  - play it out against the computer (queen/rook mates, king and pawn, Lucena)
- **Practice**: 10 key endgame drills against Stockfish (two bishops, bishop and knight,
  opposition, holding the draw, queen vs pawn…).
- **Vision**: click the named square as fast as you can in 30 seconds, as White or Black.
- **Analysis**: an analysis board with Stockfish (eval bar, top 3 lines, move list, FEN loading).

**Puzzles**
- **Rated puzzles**: a puzzle rating that moves like Glicko (big swings while provisional),
  the opponent's last move is animated, wrong moves are shown and taken back,
  hint / retry / solution / analyse, and a history of recent results.
- **Puzzle Rush**: 3 min, 5 min or Survival. Puzzles get harder as you go, three strikes and
  you're out, personal bests saved.
- **Themes**: practise one theme at a time (mate in 2, forks, sacrifices, quiet moves, endgames…).

The board supports click-to-move and drag-and-drop, legal-move dots, animated moves,
promotion picker, check highlight, right-click to mark squares and right-drag to draw arrows,
and synthesized move/capture sounds (toggle in the sidebar).

## Running it

```bash
cd chess
npm install
npm run dev        # http://localhost:5173
npm test           # checks every lesson position/line and every puzzle is legal
npm run build      # static site in dist/ (works from any sub-path; it uses hash routes)
```

## Where the puzzles come from

The puzzles in `src/data/puzzles.json` were generated for this project with Stockfish. The
generator plays engine games, tries the plausible mistakes in each position, and keeps
positions where the reply is the **only** winning move. It then extends the line while the
winning side keeps having a single best move. Mates must end in checkmate, and other puzzles
must win at least two points of material. Each puzzle's difficulty comes from how deep the
engine must search to find the first move and how long the solution is. These scores are
then spread over a 400–2800 rating scale.

To make more (this takes a while, about 2 puzzles a minute per process):

```bash
cd chess
npm install --no-save stockfish@19.0.1
node scripts/puzzle-gen/gen.mjs out1.jsonl 200 1 &   # run one per CPU core with different seeds
node scripts/puzzle-gen/gen.mjs out2.jsonl 200 2 &
node scripts/build-puzzles.mjs out*.jsonl            # writes src/data/puzzles.json
```

## Credits

- Chess rules: [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause).
- Engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js) lite single-threaded build in
  `public/engine/` (GPLv3, see `public/engine/COPYING.txt`).
- Pieces: the "cburnett" set by Colin M.L. Burnett (GPLv2+), as used by Lichess.
