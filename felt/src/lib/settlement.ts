// Which finished games still have money outstanding, and how much.
//
// Payments aren't tied to a particular game, because balances carry over, so each
// player's history is replayed in time order (games when finalised, payments
// when fully confirmed), first in, first out:
//  - a game result opens a "lot" for that game (money the player owes, or is owed);
//  - a later payment, or a later game going the other way, pays off the player's
//    oldest open lots first;
//  - whatever a game result has left after paying off older lots becomes its own lot.
// A player is square for a game once that game's lot is used up; a game is
// settled once every player in it is square.
import { entryProfit, type EntryLike } from './stats';

interface GameIn {
  id: string;
  status: string;
  finalised_at: string | null;
  updated_at: string;
  entries: EntryLike[];
}
interface PaymentIn {
  id?: string;
  from_player: string;
  to_player: string;
  amount_pence: number;
  status: string;
  confirmed_at: string | null;
}

export interface PlayerInGame {
  result: number; // profit (+) or loss (-) that night
  remaining: number; // still outstanding for this game: negative = owes, positive = is owed
  paid: number; // settled by payments (pennies, always >= 0)
  offset: number; // settled by results in other games (pennies, always >= 0)
}

export interface GameSettlement {
  settled: boolean;
  outstanding: string[]; // player ids not yet square for this game
  players: Map<string, PlayerInGame>;
}

export interface Allocation {
  gameId: string;
  amount: number; // pennies of the payment that went towards this game
}

type Event = { t: string; order: number; player: string; delta: number; gameId: string | null; paymentId: string | null; payer: boolean };
type Lot = { gameId: string; amount: number };

export function settlementDetails(
  games: GameIn[],
  payments: PaymentIn[],
): { byGame: Map<string, GameSettlement>; allocations: Map<string, Allocation[]> } {
  const events: Event[] = [];
  const byGame = new Map<string, GameSettlement>();
  for (const g of games) {
    if (g.status !== 'final') continue;
    const players = new Map<string, PlayerInGame>();
    for (const e of g.entries) {
      const result = entryProfit(e);
      players.set(e.player_id, { result, remaining: 0, paid: 0, offset: 0 });
      events.push({ t: g.finalised_at ?? g.updated_at, order: 0, player: e.player_id, delta: result, gameId: g.id, paymentId: null, payer: false });
    }
    byGame.set(g.id, { settled: true, outstanding: [], players });
  }
  payments.forEach((p, i) => {
    if (p.status !== 'confirmed' || !p.confirmed_at) return;
    const id = p.id ?? `#${i}`;
    events.push({ t: p.confirmed_at, order: 1, player: p.from_player, delta: p.amount_pence, gameId: null, paymentId: id, payer: true });
    events.push({ t: p.confirmed_at, order: 1, player: p.to_player, delta: -p.amount_pence, gameId: null, paymentId: id, payer: false });
  });
  events.sort((a, b) => a.t.localeCompare(b.t) || a.order - b.order);

  const lots = new Map<string, Lot[]>();
  const allocations = new Map<string, Allocation[]>();
  for (const ev of events) {
    const queue = lots.get(ev.player) ?? [];
    lots.set(ev.player, queue);
    let left = ev.delta;
    // Pay off the oldest open lots that go the other way.
    while (left !== 0 && queue.length && Math.sign(queue[0].amount) !== Math.sign(left)) {
      const lot = queue[0];
      const used = Math.min(Math.abs(lot.amount), Math.abs(left));
      lot.amount += Math.sign(left) * used;
      left -= Math.sign(left) * used;
      const info = byGame.get(lot.gameId)?.players.get(ev.player);
      if (info) {
        if (ev.gameId) info.offset += used;
        else info.paid += used;
      }
      if (ev.paymentId && ev.payer) {
        const list = allocations.get(ev.paymentId) ?? [];
        list.push({ gameId: lot.gameId, amount: used });
        allocations.set(ev.paymentId, list);
      }
      if (lot.amount === 0) queue.shift();
    }
    // A game's leftover becomes its own lot (a payment can't overpay, so it has none).
    if (left !== 0 && ev.gameId) queue.push({ gameId: ev.gameId, amount: left });
  }

  for (const [player, queue] of lots) {
    for (const lot of queue) {
      const g = byGame.get(lot.gameId);
      const info = g?.players.get(player);
      if (g && info) {
        info.remaining = lot.amount;
        if (lot.amount !== 0) g.outstanding.push(player);
      }
    }
  }
  for (const g of byGame.values()) g.settled = g.outstanding.length === 0;
  return { byGame, allocations };
}

export function settlementByGame(games: GameIn[], payments: PaymentIn[]): Map<string, GameSettlement> {
  return settlementDetails(games, payments).byGame;
}
