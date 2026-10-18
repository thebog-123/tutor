// Which finished games still have money outstanding.
//
// Payments aren't tied to a particular game, because balances carry over, so each
// player's history is replayed in time order (games when finalised, payments
// when fully confirmed):
//  - a game that moves a player's running balance away from zero opens a debt
//    or credit for that game;
//  - a later game or payment that brings the balance back to zero (or past it)
//    closes everything that was open, oldest first;
//  - a game that only reduces an existing balance is settled straight away,
//    because its money cancelled out something older.
// A game is settled once every player in it is settled for that game.
import { entryProfit, type EntryLike } from './stats';

interface GameIn {
  id: string;
  status: string;
  finalised_at: string | null;
  updated_at: string;
  entries: EntryLike[];
}
interface PaymentIn {
  from_player: string;
  to_player: string;
  amount_pence: number;
  status: string;
  confirmed_at: string | null;
}

export interface GameSettlement {
  settled: boolean;
  outstanding: string[]; // player ids not yet squared up for this game
}

type Event = { t: string; order: number; player: string; delta: number; gameId: string | null };

export function settlementByGame(games: GameIn[], payments: PaymentIn[]): Map<string, GameSettlement> {
  const events: Event[] = [];
  for (const g of games) {
    if (g.status !== 'final') continue;
    for (const e of g.entries) events.push({ t: g.finalised_at ?? g.updated_at, order: 0, player: e.player_id, delta: entryProfit(e), gameId: g.id });
  }
  for (const p of payments) {
    if (p.status !== 'confirmed' || !p.confirmed_at) continue;
    events.push({ t: p.confirmed_at, order: 1, player: p.from_player, delta: p.amount_pence, gameId: null });
    events.push({ t: p.confirmed_at, order: 1, player: p.to_player, delta: -p.amount_pence, gameId: null });
  }
  events.sort((a, b) => a.t.localeCompare(b.t) || a.order - b.order);

  const open = new Map<string, Set<string>>(); // player -> games still open for them
  const balance = new Map<string, number>();
  const unsettled = new Map<string, Set<string>>(); // game -> players not settled
  for (const g of games) if (g.status === 'final') unsettled.set(g.id, new Set());

  for (const ev of events) {
    const before = balance.get(ev.player) ?? 0;
    const after = before + ev.delta;
    balance.set(ev.player, after);
    const mine = open.get(ev.player) ?? new Set<string>();
    open.set(ev.player, mine);
    const closeAll = () => {
      for (const id of mine) unsettled.get(id)?.delete(ev.player);
      mine.clear();
    };
    if (after === 0) {
      closeAll();
      continue;
    }
    if (!ev.gameId || ev.delta === 0) continue;
    const crossed = before !== 0 && Math.sign(after) !== Math.sign(before);
    const away = before === 0 || (Math.sign(ev.delta) === Math.sign(before) && !crossed);
    if (crossed) closeAll();
    if (crossed || away) {
      mine.add(ev.gameId);
      unsettled.get(ev.gameId)?.add(ev.player);
    }
    // otherwise the game only reduced an older balance: settled for this player
  }

  const result = new Map<string, GameSettlement>();
  for (const [id, players] of unsettled) result.set(id, { settled: players.size === 0, outstanding: [...players] });
  return result;
}
