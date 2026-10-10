// Poker results (the leaderboard) are worked out from finalised games only.
// Payments never appear here: settling a debt does not change who is winning.

export type Range = 'all' | 'year' | 'month';

export interface EntryLike {
  player_id: string;
  buy_in_pence: number;
  rebuys_pence: number[];
  cash_out_pence: number;
}

export interface GameLike {
  id: string;
  status: 'draft' | 'final' | 'void';
  played_on: string; // YYYY-MM-DD
  entries: EntryLike[];
}

export interface LeaderRow {
  playerId: string;
  name: string;
  profit: number;
  games: number;
  wins: number;
  winPct: number; // 0–100, rounded
  average: number; // pennies, rounded to the nearest penny
  rank: number;
}

export function totalIn(e: Pick<EntryLike, 'buy_in_pence' | 'rebuys_pence'>): number {
  return e.buy_in_pence + e.rebuys_pence.reduce((a, b) => a + b, 0);
}

export function entryProfit(e: EntryLike): number {
  return e.cash_out_pence - totalIn(e);
}

export function gameTotals(entries: EntryLike[]): { totalIn: number; totalOut: number; difference: number } {
  const tIn = entries.reduce((a, e) => a + totalIn(e), 0);
  const tOut = entries.reduce((a, e) => a + e.cash_out_pence, 0);
  return { totalIn: tIn, totalOut: tOut, difference: tOut - tIn };
}

export function inRange(playedOn: string, range: Range, today = new Date()): boolean {
  if (range === 'all') return true;
  const [y, m] = playedOn.split('-').map(Number);
  if (y !== today.getFullYear()) return false;
  return range === 'year' || m === today.getMonth() + 1;
}

export function leaderboard(
  games: GameLike[],
  players: { id: string; name: string }[],
  range: Range,
  today = new Date(),
): LeaderRow[] {
  const acc = new Map<string, { profit: number; games: number; wins: number }>();
  for (const g of games) {
    if (g.status !== 'final' || !inRange(g.played_on, range, today)) continue;
    for (const e of g.entries) {
      const row = acc.get(e.player_id) ?? { profit: 0, games: 0, wins: 0 };
      const p = entryProfit(e);
      row.profit += p;
      row.games += 1;
      if (p > 0) row.wins += 1;
      acc.set(e.player_id, row);
    }
  }
  const names = new Map(players.map((p) => [p.id, p.name]));
  const rows = [...acc.entries()].map(([playerId, r]) => ({
    playerId,
    name: names.get(playerId) ?? 'Unknown player',
    profit: r.profit,
    games: r.games,
    wins: r.wins,
    winPct: Math.round((r.wins / r.games) * 100),
    average: Math.round(r.profit / r.games),
    rank: 0,
  }));
  rows.sort((a, b) => b.profit - a.profit || b.average - a.average || a.name.localeCompare(b.name));
  // Equal profit shares a rank ("1, 2, 2, 4").
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].profit === r.profit ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
