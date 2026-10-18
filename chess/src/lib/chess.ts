import { Chess } from 'chess.js';

export type Uci = string;

export function parseUci(u: Uci) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as string | undefined };
}

export function toUci(from: string, to: string, promotion?: string) {
  return from + to + (promotion ?? '');
}

/** Apply a UCI move, returning the new FEN, or null if illegal. */
export function applyUci(fen: string, u: Uci): string | null {
  try {
    const c = new Chess(fen);
    c.move(parseUci(u));
    return c.fen();
  } catch {
    return null;
  }
}

export function sanOf(fen: string, u: Uci): string {
  try {
    const c = new Chess(fen);
    return c.move(parseUci(u)).san;
  } catch {
    return u;
  }
}

export function turnOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function isMateAfter(fen: string, u: Uci): boolean {
  try {
    const c = new Chess(fen);
    c.move(parseUci(u));
    return c.isCheckmate();
  } catch {
    return false;
  }
}
