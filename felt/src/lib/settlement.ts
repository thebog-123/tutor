// Who owes whom, game by game.
//
// Each finished game's own results are split into the fewest "X owes Y" lines
// for that game. Debts are then tracked between pairs of players:
//  - a confirmed payment from X to Y pays off X's lines to Y, oldest game first;
//  - debts never cancel out: if X owes Y from one game and Y owes X from
//    another, both are still paid separately.
// A game is settled once all its lines are paid. Each player's overall balance
// is still the sum of their results and payments, so it agrees with these lines.
import { entryProfit, type EntryLike } from './stats';
import { matchTransfers, simplifyDebts } from './settle';

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

export interface DebtLine {
  gameId: string;
  from: string;
  to: string;
  amount: number; // pennies owed from this game
  paid: number; // covered by payments from `from` to `to`
  left: number; // still to pay
}

export interface PairDebt {
  from: string;
  to: string;
  amount: number; // what `from` still owes `to`, all games together
  games: { gameId: string; amount: number }[]; // which games it comes from, oldest first
}

export interface Allocation {
  gameId: string;
  amount: number; // pennies of a payment that went towards this game
}

export interface Settlement {
  lines: Map<string, DebtLine[]>; // by game
  settled: Map<string, boolean>; // by game
  pairs: PairDebt[]; // who still owes whom, largest first
  allocations: Map<string, Allocation[]>; // by payment id
}

const when = (g: GameIn) => g.finalised_at ?? g.updated_at;

export function settle(games: GameIn[], payments: PaymentIn[]): Settlement {
  const finals = games.filter((g) => g.status === 'final').sort((a, b) => when(a).localeCompare(when(b)));
  const lines = new Map<string, DebtLine[]>();
  const byPair = new Map<string, DebtLine[]>(); // "from|to" -> lines, oldest first
  for (const g of finals) {
    const balances = g.entries.map((e) => ({ id: e.player_id, name: e.player_id, balance: entryProfit(e) }));
    let transfers;
    try {
      transfers = simplifyDebts(balances);
    } catch {
      transfers = matchTransfers(balances); // only if a game somehow doesn't balance
    }
    const list = transfers.map((t) => ({ gameId: g.id, from: t.from, to: t.to, amount: t.amount, paid: 0, left: t.amount }));
    lines.set(g.id, list);
    for (const l of list) {
      const key = `${l.from}|${l.to}`;
      byPair.set(key, [...(byPair.get(key) ?? []), l]);
    }
  }

  // Payments pay off the payer's lines to that person, oldest game first.
  const confirmed = payments
    .map((p, i) => ({ ...p, id: p.id ?? `#${i}` }))
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (a.confirmed_at ?? '').localeCompare(b.confirmed_at ?? ''));
  const allocations = new Map<string, Allocation[]>();
  const paidTotal = new Map<string, number>(); // "from|to" -> all confirmed payments
  for (const p of confirmed) {
    const key = `${p.from_player}|${p.to_player}`;
    paidTotal.set(key, (paidTotal.get(key) ?? 0) + p.amount_pence);
    let left = p.amount_pence;
    for (const l of byPair.get(key) ?? []) {
      if (left === 0) break;
      const use = Math.min(l.left, left);
      if (use === 0) continue;
      l.paid += use;
      l.left -= use;
      left -= use;
      allocations.set(p.id, [...(allocations.get(p.id) ?? []), { gameId: l.gameId, amount: use }]);
    }
  }

  // What each person still owes each other person, one direction at a time.
  // (A payment beyond what's owed counts as the other person owing it back.)
  const people = new Set<string>();
  for (const key of byPair.keys()) key.split('|').forEach((x) => people.add(x));
  for (const p of confirmed) [p.from_player, p.to_player].forEach((x) => people.add(x));
  const pairs: PairDebt[] = [];
  for (const from of people) {
    for (const to of people) {
      if (from === to) continue;
      const side = byPair.get(`${from}|${to}`) ?? [];
      const owed = sum(side.map((l) => l.left));
      const overpaid = Math.max(0, (paidTotal.get(`${to}|${from}`) ?? 0) - sum((byPair.get(`${to}|${from}`) ?? []).map((l) => l.amount)));
      const amount = owed + overpaid;
      if (amount === 0) continue;
      pairs.push({ from, to, amount, games: side.filter((l) => l.left > 0).map((l) => ({ gameId: l.gameId, amount: l.left })) });
    }
  }
  pairs.sort((x, y) => y.amount - x.amount || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));

  const settled = new Map<string, boolean>();
  for (const [id, list] of lines) settled.set(id, list.every((l) => l.left === 0));
  return { lines, settled, pairs, allocations };
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
