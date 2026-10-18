import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { playSound } from '../lib/sound';

export type Color = 'w' | 'b';
export type Arrow = { from: string; to: string; color?: string };
export type Marker = { sq: string; kind: 'correct' | 'wrong' | 'best' | 'hint' | 'star' | 'mate' };

type Props = {
  fen: string;
  orientation?: Color;
  /** Which side the user may move; null for a static board. */
  movable?: Color | 'both' | null;
  /** Return false to reject (the piece snaps back). */
  onMove?: (from: string, to: string, promotion?: string) => boolean | void;
  lastMove?: [string, string] | null;
  arrows?: Arrow[];
  highlights?: Record<string, string>;
  markers?: Marker[];
  /** Extra squares to draw as targets (used by Vision and "reach the square" lessons). */
  targets?: string[];
  onSquareClick?: (sq: string) => void;
  coordinates?: boolean;
  /** Ignore whose turn it is in the FEN (lessons where one piece walks around alone). */
  freeMove?: boolean;
  sound?: boolean;
};

const FILES = 'abcdefgh';
type PieceOnBoard = { id: number; sq: string; p: string };

let nextId = 1;

function parse(fen: string): { sq: string; p: string }[] {
  const out: { sq: string; p: string }[] = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        out.push({ sq: FILES[f] + (8 - r), p: color + ch.toUpperCase() });
        f++;
      }
    }
  });
  return out;
}

function dist(a: string, b: string) {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(+a[1] - +b[1]);
}

/** Keep piece identities across positions so moves animate instead of popping. */
function reconcile(prev: PieceOnBoard[], next: { sq: string; p: string }[]): PieceOnBoard[] {
  const left = [...prev];
  const result: (PieceOnBoard | null)[] = next.map(() => null);
  next.forEach((n, i) => {
    const k = left.findIndex((o) => o.sq === n.sq && o.p === n.p);
    if (k >= 0) { result[i] = left[k]; left.splice(k, 1); }
  });
  next.forEach((n, i) => {
    if (result[i]) return;
    let best = -1;
    left.forEach((o, k) => {
      if (o.p === n.p && (best < 0 || dist(o.sq, n.sq) < dist(left[best].sq, n.sq))) best = k;
    });
    if (best >= 0) { result[i] = { ...left[best], sq: n.sq }; left.splice(best, 1); }
    else result[i] = { id: nextId++, sq: n.sq, p: n.p };
  });
  return result as PieceOnBoard[];
}

/** Make a FEN whose side to move is `color`, so chess.js generates that side's moves. */
function withTurn(fen: string, color: Color) {
  const parts = fen.split(' ');
  if (parts[1] === color) return fen;
  parts[1] = color;
  parts[3] = '-';
  return parts.join(' ');
}

export default function Board({
  fen, orientation = 'w', movable = null, onMove, lastMove, arrows = [], highlights = {},
  markers = [], targets = [], onSquareClick, coordinates = true, freeMove = false, sound = true,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<PieceOnBoard[]>(() => parse(fen).map((x) => ({ ...x, id: nextId++ })));
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ sq: string; x: number; y: number; started: boolean } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [userArrows, setUserArrows] = useState<Arrow[]>([]);
  const [userMarks, setUserMarks] = useState<string[]>([]);
  const rightStart = useRef<string | null>(null);
  const prevFen = useRef(fen);
  const downOnSelected = useRef(false);

  useEffect(() => {
    if (prevFen.current === fen) return;
    const before = parse(prevFen.current);
    const after = parse(fen);
    prevFen.current = fen;
    setPieces((p) => reconcile(p, after));
    setSelected(null);
    setPromo(null);
    setUserArrows([]);
    setUserMarks([]);
    if (sound) {
      const turn = fen.split(' ')[1] as Color;
      let check = false;
      try { check = new Chess(fen).inCheck(); } catch { /* lesson FENs may be partial */ }
      if (check) playSound('check');
      else if (after.length < before.length) playSound('capture');
      else playSound(turn === 'w' ? 'move-opp' : 'move');
    }
  }, [fen, sound]);

  const game = useMemo(() => {
    try { return new Chess(fen, { skipValidation: true }); } catch { return null; }
  }, [fen]);

  const canMoveColor = (c: Color) => {
    if (!movable || !game) return false;
    if (movable !== 'both' && movable !== c) return false;
    return freeMove || game.turn() === c;
  };

  const legalFrom = (sq: string): { to: string; promotion?: string; captured?: string }[] => {
    if (!game) return [];
    const piece = game.get(sq as Square);
    if (!piece || !canMoveColor(piece.color)) return [];
    try {
      const g = freeMove ? new Chess(withTurn(fen, piece.color), { skipValidation: true }) : game;
      return g.moves({ square: sq as Square, verbose: true }).map((m) => ({ to: m.to, promotion: m.promotion, captured: m.captured }));
    } catch {
      return [];
    }
  };

  const legal = selected ? legalFrom(selected) : [];

  const squareFromPoint = (x: number, y: number): string | null => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return null;
    const fx = Math.floor(((x - r.left) / r.width) * 8);
    const fy = Math.floor(((y - r.top) / r.height) * 8);
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
    return orientation === 'w' ? FILES[fx] + (8 - fy) : FILES[7 - fx] + (fy + 1);
  };

  const tryMove = (from: string, to: string) => {
    const moves = legalFrom(from).filter((m) => m.to === to);
    if (!moves.length) return false;
    if (moves.some((m) => m.promotion)) {
      setPromo({ from, to });
      return true;
    }
    finish(from, to);
    return true;
  };

  const finish = (from: string, to: string, promotion?: string) => {
    setSelected(null);
    setPromo(null);
    const ok = onMove?.(from, to, promotion);
    if (ok === false) {
      // Snap back: re-render pieces from the unchanged FEN.
      setPieces((p) => reconcile(p, parse(fen)));
    } else {
      // Optimistically show the move until the parent passes the new FEN.
      setPieces((p) => {
        const moving = p.find((x) => x.sq === from);
        if (!moving) return p;
        return p.filter((x) => x.sq !== to).map((x) => (x.id === moving.id ? { ...x, sq: to, p: promotion ? x.p[0] + promotion.toUpperCase() : x.p } : x));
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) { rightStart.current = sq; return; }
    if (e.button !== 0) return;
    setUserArrows([]);
    setUserMarks([]);
    onSquareClick?.(sq);
    if (promo) { setPromo(null); return; }
    if (selected && selected !== sq && legal.some((m) => m.to === sq)) {
      tryMove(selected, sq);
      return;
    }
    const piece = game?.get(sq as Square);
    if (piece && canMoveColor(piece.color)) {
      downOnSelected.current = selected === sq;
      setSelected(sq);
      setDrag({ sq, x: e.clientX, y: e.clientY, started: false });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.started || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, started: moved });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.button === 2) {
      const end = squareFromPoint(e.clientX, e.clientY);
      const start = rightStart.current;
      rightStart.current = null;
      if (!start || !end) return;
      if (start === end) setUserMarks((m) => (m.includes(end) ? m.filter((x) => x !== end) : [...m, end]));
      else setUserArrows((a) => (a.some((x) => x.from === start && x.to === end) ? a.filter((x) => !(x.from === start && x.to === end)) : [...a, { from: start, to: end }]));
      return;
    }
    if (!drag) return;
    const d = drag;
    setDrag(null);
    const target = squareFromPoint(e.clientX, e.clientY);
    if (d.started) {
      if (target && target !== d.sq && tryMove(d.sq, target)) return;
      if (target !== d.sq) setSelected(null);
    } else if (downOnSelected.current && target === d.sq) {
      setSelected(null);
    }
  };

  const pos = (sq: string) => {
    const f = sq.charCodeAt(0) - 97;
    const r = +sq[1] - 1;
    return orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  };

  const checkSq = useMemo(() => {
    if (!game) return null;
    try {
      if (!game.inCheck()) return null;
      const t = game.turn();
      return parse(fen).find((x) => x.p === t + 'K')?.sq ?? null;
    } catch { return null; }
  }, [fen, game]);

  const boardRect = boardRef.current?.getBoundingClientRect();
  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
      const light = (x + y) % 2 === 0;
      const hl = highlights[sq] ?? (userMarks.includes(sq) ? 'var(--hl-user)' : null);
      const isLast = lastMove && (lastMove[0] === sq || lastMove[1] === sq);
      squares.push(
        <div key={sq} className={`sq ${light ? 'light' : 'dark'}`} style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%` }}>
          {isLast && <div className="sq-fill" style={{ background: 'var(--hl-last)' }} />}
          {selected === sq && <div className="sq-fill" style={{ background: 'var(--hl-last)' }} />}
          {hl && <div className="sq-fill" style={{ background: hl }} />}
          {checkSq === sq && <div className="sq-check" />}
          {coordinates && x === 0 && <span className={`coord rank ${light ? 'on-light' : 'on-dark'}`}>{sq[1]}</span>}
          {coordinates && y === 7 && <span className={`coord file ${light ? 'on-light' : 'on-dark'}`}>{sq[0]}</span>}
        </div>,
      );
    }
  }

  const allArrows = [...arrows, ...userArrows];

  return (
    <div
      ref={boardRef}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {squares}
      {targets.map((sq) => {
        const p = pos(sq);
        return <div key={'t' + sq} className="target-star" style={{ left: `${p.x * 12.5}%`, top: `${p.y * 12.5}%` }}>★</div>;
      })}
      {pieces.map((pc) => {
        const p = pos(pc.sq);
        const dragging = drag?.started && drag.sq === pc.sq && boardRect;
        const style: React.CSSProperties = dragging
          ? {
              transform: `translate(${drag.x - boardRect.left - boardRect.width / 16}px, ${drag.y - boardRect.top - boardRect.height / 16}px) scale(1.08)`,
              transition: 'none', zIndex: 20, cursor: 'grabbing',
            }
          : { transform: `translate(${p.x * 100}%, ${p.y * 100}%)` };
        return <img key={pc.id} className="piece" draggable={false} src={`pieces/${pc.p}.svg`} alt={pc.p} style={style} />;
      })}
      {legal.map((m) => {
        const p = pos(m.to);
        const occupied = pieces.some((x) => x.sq === m.to) || m.captured;
        return <div key={'l' + m.to + (m.promotion ?? '')} className={occupied ? 'hint-capture' : 'hint-dot'} style={{ left: `${p.x * 12.5}%`, top: `${p.y * 12.5}%` }} />;
      })}
      {markers.map((mk) => {
        const p = pos(mk.sq);
        const icon = { correct: '✓', wrong: '✕', best: '★', hint: '?', star: '★', mate: '#' }[mk.kind];
        return (
          <div key={'m' + mk.sq + mk.kind} className={`marker marker-${mk.kind}`} style={{ left: `calc(${(p.x + 1) * 12.5}% - 4%)`, top: `calc(${p.y * 12.5}% + 0.4%)` }}>
            {icon}
          </div>
        );
      })}
      {allArrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 800 800">
          {allArrows.map((a, i) => <ArrowShape key={i} a={a} pos={pos} />)}
        </svg>
      )}
      {promo && (
        <PromotionPicker
          color={pieces.find((x) => x.sq === promo.from)?.p[0] as Color}
          at={pos(promo.to)}
          onPick={(p) => finish(promo.from, promo.to, p)}
        />
      )}
    </div>
  );
}

function ArrowShape({ a, pos }: { a: Arrow; pos: (s: string) => { x: number; y: number } }) {
  const s = pos(a.from), t = pos(a.to);
  const c = (v: number) => v * 100 + 50;
  const color = a.color ?? 'var(--arrow)';
  const dx = t.x - s.x, dy = t.y - s.y;
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  const pts: [number, number][] = knight
    ? [[c(s.x), c(s.y)], Math.abs(dy) === 2 ? [c(s.x), c(t.y)] : [c(t.x), c(s.y)], [c(t.x), c(t.y)]]
    : [[c(s.x), c(s.y)], [c(t.x), c(t.y)]];
  // Pull the start off the piece centre and stop the shaft short of the head.
  const [p0, p1] = [pts[0], pts[1]];
  const l0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  pts[0] = [p0[0] + ((p1[0] - p0[0]) / l0) * 22, p0[1] + ((p1[1] - p0[1]) / l0) * 22];
  const q0 = pts[pts.length - 2], q1 = pts[pts.length - 1];
  const l1 = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
  const ux = (q1[0] - q0[0]) / l1, uy = (q1[1] - q0[1]) / l1;
  const head = 38;
  const tip: [number, number] = [q1[0] - ux * 8, q1[1] - uy * 8];
  const base: [number, number] = [tip[0] - ux * head, tip[1] - uy * head];
  pts[pts.length - 1] = base;
  const nx = -uy, ny = ux;
  return (
    <g opacity={0.8}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={17} strokeLinejoin="miter" />
      <polygon points={`${tip.join(',')} ${base[0] + nx * 22},${base[1] + ny * 22} ${base[0] - nx * 22},${base[1] - ny * 22}`} fill={color} />
    </g>
  );
}

function PromotionPicker({ color, at, onPick }: { color: Color; at: { x: number; y: number }; onPick: (p: string) => void }) {
  const down = at.y === 0;
  const list = ['q', 'n', 'r', 'b'];
  return (
    <div className="promo" style={{ left: `${at.x * 12.5}%`, top: down ? 0 : `${(at.y - 3) * 12.5}%`, flexDirection: down ? 'column' : 'column-reverse' }} onPointerDown={(e) => e.stopPropagation()}>
      {list.map((p) => (
        <button key={p} onClick={() => onPick(p)}><img src={`pieces/${color}${p.toUpperCase()}.svg`} alt={p} draggable={false} /></button>
      ))}
    </div>
  );
}
