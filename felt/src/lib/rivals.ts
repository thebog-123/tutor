// Head-to-head records: in every finalised game two players both played, whoever
// made more profit that night "wins" that meeting. Draws count as ties.
import { entryProfit, type GameLike } from './stats';

export interface Rival {
  playerId: string;
  games: number;
  wins: number; // nights I finished above them
  losses: number; // nights they finished above me
  ties: number;
}

export function headToHead(games: GameLike[], me: string, include: (playerId: string) => boolean = () => true): Rival[] {
  const map = new Map<string, Rival>();
  for (const g of games) {
    if (g.status !== 'final') continue;
    const mine = g.entries.find((e) => e.player_id === me);
    if (!mine) continue;
    const p = entryProfit(mine);
    for (const e of g.entries) {
      if (e.player_id === me || !include(e.player_id)) continue;
      const r = map.get(e.player_id) ?? { playerId: e.player_id, games: 0, wins: 0, losses: 0, ties: 0 };
      const q = entryProfit(e);
      r.games++;
      if (p > q) r.wins++;
      else if (p < q) r.losses++;
      else r.ties++;
      map.set(e.player_id, r);
    }
  }
  return [...map.values()].sort((a, b) => b.games - a.games || b.wins - b.losses - (a.wins - a.losses));
}

/** The opponent who beats you most (net), and the one you beat most. */
export function rivalries(rivals: Rival[]): { nemesis: Rival | null; bestFriend: Rival | null } {
  const net = (r: Rival) => r.wins - r.losses;
  const nemesis = rivals.filter((r) => net(r) < 0).sort((a, b) => net(a) - net(b) || b.losses - a.losses || b.games - a.games)[0] ?? null;
  const bestFriend = rivals.filter((r) => net(r) > 0).sort((a, b) => net(b) - net(a) || b.wins - a.wins || b.games - a.games)[0] ?? null;
  return { nemesis, bestFriend };
}

export interface ProfitPoint {
  date: string; // YYYY-MM-DD
  gameId: string | null;
  label: string;
  profit: number; // that game's result
  total: number; // running total after it
}

/** Running profit over finalised games, oldest first, starting from £0. */
export function profitSeries(games: (GameLike & { name: string; created_at?: string })[], me: string, fromDate?: string): ProfitPoint[] {
  const mine = games
    .filter((g) => g.status === 'final' && (!fromDate || g.played_on >= fromDate))
    .map((g) => ({ g, e: g.entries.find((x) => x.player_id === me) }))
    .filter((x): x is { g: (typeof games)[number]; e: NonNullable<typeof x.e> } => !!x.e)
    .sort((a, b) => a.g.played_on.localeCompare(b.g.played_on) || (a.g.created_at ?? '').localeCompare(b.g.created_at ?? ''));
  let total = 0;
  const points: ProfitPoint[] = [];
  if (mine.length) points.push({ date: mine[0].g.played_on, gameId: null, label: 'Start', profit: 0, total: 0 });
  for (const { g, e } of mine) {
    const p = entryProfit(e);
    total += p;
    points.push({ date: g.played_on, gameId: g.id, label: g.name, profit: p, total });
  }
  return points;
}
