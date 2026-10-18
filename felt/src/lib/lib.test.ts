import { describe, expect, it } from 'vitest';
import { formatPence, parsePounds, penceToInput } from './money';
import { simplifyDebts, type Balance } from './settle';
import { entryProfit, gameTotals, leaderboard, sortLeaderboard, type GameLike } from './stats';
import { toCSV, penceToDecimal } from './csv';
import { validateBackup } from './backup';

describe('money', () => {
  it('parses pounds and pence into integer pennies', () => {
    expect(parsePounds('25')).toBe(2500);
    expect(parsePounds('£25.5')).toBe(2550);
    expect(parsePounds('25.05')).toBe(2505);
    expect(parsePounds('1,000.99')).toBe(100099);
    expect(parsePounds('.5')).toBe(50);
    expect(parsePounds('0.1')).toBe(10);
    expect(parsePounds('0.29')).toBe(29); // 0.29 * 100 = 28.999… in floating point
    expect(parsePounds('0')).toBe(0);
  });
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1.2.3', '£', '1e3', '99999999']) expect(parsePounds(bad)).toBeNull();
  });
  it('formats pennies', () => {
    expect(formatPence(2500)).toBe('£25');
    expect(formatPence(2550)).toBe('£25.50');
    expect(formatPence(5)).toBe('£0.05');
    expect(formatPence(-320)).toBe('-£3.20');
    expect(formatPence(2500, { sign: true })).toBe('+£25');
    expect(formatPence(123456789)).toBe('£1,234,567.89');
    expect(penceToInput(2550)).toBe('25.50');
    expect(penceToInput(2500)).toBe('25');
  });
  it('adds many small amounts with no rounding drift', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += parsePounds('0.10')!;
    expect(total).toBe(10000);
  });
});

const b = (id: string, balance: number): Balance => ({ id, name: id, balance });

function applyTransfers(balances: Balance[], transfers: ReturnType<typeof simplifyDebts>) {
  const m = new Map(balances.map((x) => [x.id, x.balance]));
  for (const t of transfers) {
    expect(t.amount).toBeGreaterThan(0);
    expect(Number.isInteger(t.amount)).toBe(true);
    m.set(t.from, m.get(t.from)! + t.amount);
    m.set(t.to, m.get(t.to)! - t.amount);
  }
  return [...m.values()];
}

describe('simplifyDebts', () => {
  it('returns nothing when everyone is square', () => {
    expect(simplifyDebts([b('a', 0), b('b', 0)])).toEqual([]);
  });
  it('handles one debtor and one creditor', () => {
    expect(simplifyDebts([b('Alex', -2500), b('Ben', 2500)])).toEqual([{ from: 'Alex', to: 'Ben', amount: 2500 }]);
  });
  it('finds matched pairs instead of chaining payments', () => {
    // Greedy-by-size would need 3 payments here; the exact search needs 2.
    const balances = [b('a', -600), b('b', -400), b('c', 400), b('d', 600)];
    const t = simplifyDebts(balances);
    expect(t).toHaveLength(2);
    expect(applyTransfers(balances, t).every((x) => x === 0)).toBe(true);
  });
  it('uses at most n-1 payments and always clears every balance', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 300; round++) {
      const n = 2 + Math.floor(rand() * 14); // includes > 12 to exercise the greedy fallback
      const vals = Array.from({ length: n - 1 }, () => Math.round((rand() - 0.5) * 20000));
      vals.push(-vals.reduce((x, y) => x + y, 0));
      const balances = vals.map((v, i) => b(`p${i}`, v));
      const t = simplifyDebts(balances);
      const nonZero = vals.filter((v) => v !== 0).length;
      expect(t.length).toBeLessThanOrEqual(Math.max(nonZero - 1, 0));
      expect(applyTransfers(balances, t).every((x) => x === 0)).toBe(true);
    }
  });
  it('refuses balances that do not add up', () => {
    expect(() => simplifyDebts([b('a', -100), b('b', 99)])).toThrow(/zero/);
  });
});

const game = (id: string, played_on: string, entries: [string, number, number[], number][], status: GameLike['status'] = 'final'): GameLike => ({
  id,
  played_on,
  status,
  entries: entries.map(([player_id, buy_in_pence, rebuys_pence, cash_out_pence]) => ({ player_id, buy_in_pence, rebuys_pence, cash_out_pence })),
});

describe('stats', () => {
  const players = [
    { id: 'a', name: 'Alex' },
    { id: 'b', name: 'Ben' },
    { id: 'c', name: 'Chloe' },
  ];
  const today = new Date(2026, 9, 10); // 10 Oct 2026
  const games = [
    game('g1', '2026-10-02', [['a', 2000, [], 4500], ['b', 2000, [1000], 500], ['c', 2000, [], 1000]]),
    game('g2', '2026-03-01', [['a', 1000, [], 0], ['b', 1000, [], 2000]]),
    game('g3', '2025-12-31', [['a', 1000, [], 500], ['c', 1000, [], 1500]]),
    game('g4', '2026-10-05', [['a', 5000, [], 0], ['c', 5000, [], 10000]], 'draft'),
    game('g5', '2026-10-06', [['a', 5000, [], 0], ['c', 5000, [], 10000]], 'void'),
  ];
  it('computes per-entry profit and game totals', () => {
    expect(entryProfit(games[0].entries[1])).toBe(-2500);
    expect(gameTotals(games[0].entries)).toEqual({ totalIn: 7000, totalOut: 6000, difference: -1000 });
  });
  it('ranks all-time results from finalised games only', () => {
    const rows = leaderboard(games, players, 'all', today);
    expect(rows.map((r) => [r.name, r.profit, r.games, r.wins, r.winPct, r.average, r.rank])).toEqual([
      ['Alex', 1000, 3, 1, 33, 333, 1],
      ['Chloe', -500, 2, 1, 50, -250, 2],
      ['Ben', -1500, 2, 1, 50, -750, 3],
    ]);
  });
  it('filters by this year and this month', () => {
    expect(leaderboard(games, players, 'year', today).map((r) => [r.name, r.profit])).toEqual([
      ['Alex', 1500],
      ['Chloe', -1000],
      ['Ben', -1500],
    ]);
    expect(leaderboard(games, players, 'month', today).map((r) => [r.name, r.games])).toEqual([
      ['Alex', 1],
      ['Chloe', 1],
      ['Ben', 1],
    ]);
  });
  it('sorts by any column in either direction, re-ranking by that column', () => {
    const rows = leaderboard(games, players, 'all', today);
    expect(sortLeaderboard(rows, 'winPct').map((r) => [r.name, r.winPct, r.rank])).toEqual([
      ['Chloe', 50, 1], // tie on 50%: higher profit first
      ['Ben', 50, 1],
      ['Alex', 33, 3],
    ]);
    expect(sortLeaderboard(rows, 'games').map((r) => [r.name, r.rank])).toEqual([
      ['Alex', 1],
      ['Chloe', 2],
      ['Ben', 2],
    ]);
    expect(sortLeaderboard(rows, 'average', 'asc').map((r) => r.name)).toEqual(['Ben', 'Chloe', 'Alex']);
    expect(sortLeaderboard(rows, 'profit', 'asc').map((r) => [r.name, r.rank])).toEqual([
      ['Ben', 1],
      ['Chloe', 2],
      ['Alex', 3],
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Alex', 'Chloe', 'Ben']); // input untouched
  });
  it('gives tied players the same rank', () => {
    const rows = leaderboard([game('x', '2026-01-01', [['a', 100, [], 100], ['b', 100, [], 100]])], players, 'all', today);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe('csv', () => {
  it('escapes quotes, commas and formula-looking text but not numbers', () => {
    const csv = toCSV(['Game', 'Profit'], [['Fri, "big" game', penceToDecimal(-550)], ['=HYPERLINK("x")', penceToDecimal(5)]]);
    expect(csv).toBe('Game,Profit\r\n"Fri, ""big"" game",-5.50\r\n"\'=HYPERLINK(""x"")",0.05\r\n');
  });
});

describe('validateBackup', () => {
  const good = {
    format: 'felt-backup',
    version: 1,
    exported_at: '2026-10-10T00:00:00Z',
    group: { name: 'Friday' },
    players: [
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Ben' },
    ],
    games: [{ name: 'G', played_on: '2026-10-01', status: 'final', entries: [
      { player_id: 'p1', buy_in_pence: 1000, rebuys_pence: [500], cash_out_pence: 0 },
      { player_id: 'p2', buy_in_pence: 1000, rebuys_pence: [], cash_out_pence: 2500 },
    ] }],
    payments: [{ from_player: 'p1', to_player: 'p2', amount_pence: 1500, status: 'confirmed' }],
  };
  it('accepts a valid backup', () => {
    const r = validateBackup(good);
    expect(r.ok && r.summary).toMatchObject({ groupName: 'Friday', players: 2, games: 1, finalGames: 1, payments: 1 });
  });
  it('rejects wrong files, unbalanced games and dangling players', () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    const unbalanced = structuredClone(good);
    unbalanced.games[0].entries[1].cash_out_pence = 2400;
    expect(validateBackup(unbalanced)).toMatchObject({ ok: false, errors: [expect.stringMatching(/does not balance/)] });
    const dangling = structuredClone(good);
    dangling.payments[0].to_player = 'nope';
    expect(validateBackup(dangling).ok).toBe(false);
    const fractional = structuredClone(good);
    fractional.games[0].entries[0].buy_in_pence = 10.5;
    expect(validateBackup(fractional).ok).toBe(false);
  });
});

import { canReject, confirmableSides, needsMe } from './payments';

describe('payment confirmation sides', () => {
  const owners: Record<string, string | null> = { ben: 'u-bob', alex: 'u-alice', dev: null };
  const viewer = (userId: string, isAdmin = false) => ({ userId, isAdmin, claimedBy: (id: string) => owners[id] ?? null });
  const pay = (from: string, to: string, payer: boolean, payee: boolean, recorded_by = 'u-bob') => ({
    from_player: from,
    to_player: to,
    status: 'pending',
    recorded_by,
    payer_confirmed_at: payer ? 'x' : null,
    payee_confirmed_at: payee ? 'x' : null,
  });
  it('asks only the players involved, for the side not yet confirmed', () => {
    const p = pay('ben', 'alex', true, false);
    expect(confirmableSides(p, viewer('u-alice'))).toEqual({ payer: false, payee: true });
    expect(needsMe(p, viewer('u-bob'))).toBe(false);
    expect(needsMe(p, viewer('u-carol', true))).toBe(false); // admin can't vouch for claimed players
  });
  it('lets an admin cover players nobody has claimed', () => {
    expect(confirmableSides(pay('dev', 'alex', false, false), viewer('u-carol', true))).toEqual({ payer: true, payee: false });
  });
  it('lets the players, the recorder or an admin reject', () => {
    const p = pay('ben', 'alex', true, false, 'u-zed');
    expect(canReject(p, viewer('u-alice'))).toBe(true);
    expect(canReject(p, viewer('u-zed'))).toBe(true);
    expect(canReject(p, viewer('u-carol'))).toBe(false);
    expect(canReject(p, viewer('u-carol', true))).toBe(true);
  });
});

import { headToHead, profitSeries, rivalries } from './rivals';

describe('rivalries and performance', () => {
  const fg = (id: string, played_on: string, rows: [string, number, number][], status: GameLike['status'] = 'final') => ({
    id,
    name: id,
    played_on,
    status,
    entries: rows.map(([player_id, buy, out]) => ({ player_id, buy_in_pence: buy, rebuys_pence: [], cash_out_pence: out })),
  });
  const games = [
    fg('g1', '2026-01-05', [['me', 1000, 0], ['ann', 1000, 2500], ['bob', 1000, 500]]),
    fg('g2', '2026-02-05', [['me', 1000, 3000], ['ann', 1000, 0], ['bob', 1000, 0]]),
    fg('g3', '2026-03-05', [['me', 1000, 500], ['ann', 1000, 2500], ['bob', 1000, 0]]),
    fg('g4', '2026-03-06', [['me', 1000, 1000], ['bob', 1000, 1000]]),
    fg('x', '2026-03-07', [['me', 1000, 0], ['bob', 1000, 2000]], 'draft'),
  ];
  it('scores each shared night as a win, loss or tie', () => {
    const r = headToHead(games, 'me');
    expect(r.find((x) => x.playerId === 'ann')).toEqual({ playerId: 'ann', games: 3, wins: 1, losses: 2, ties: 0 });
    expect(r.find((x) => x.playerId === 'bob')).toEqual({ playerId: 'bob', games: 4, wins: 2, losses: 1, ties: 1 });
  });
  it('picks the arch nemesis and the best friend, or nobody', () => {
    const { nemesis, bestFriend } = rivalries(headToHead(games, 'me'));
    expect(nemesis?.playerId).toBe('ann');
    expect(bestFriend?.playerId).toBe('bob');
    expect(rivalries([])).toEqual({ nemesis: null, bestFriend: null });
    expect(headToHead(games, 'me', (id) => id !== 'bob').map((r) => r.playerId)).toEqual(['ann']);
  });
  it('builds a running total from £0, oldest first, finalised games only', () => {
    expect(profitSeries(games, 'me').map((p) => [p.label, p.profit, p.total])).toEqual([
      ['Start', 0, 0],
      ['g1', -1000, -1000],
      ['g2', 2000, 1000],
      ['g3', -500, 500],
      ['g4', 0, 500],
    ]);
    expect(profitSeries(games, 'me', '2026-03-01').map((p) => p.total)).toEqual([0, -500, -500]);
    expect(profitSeries(games, 'nobody')).toEqual([]);
  });
});

import { settlementByGame } from './settlement';

describe('settlementByGame', () => {
  const game = (id: string, t: string, rows: [string, number][]) => ({
    id,
    status: 'final',
    finalised_at: t,
    updated_at: t,
    entries: rows.map(([player_id, profit]) => ({ player_id, buy_in_pence: 1000, rebuys_pence: [], cash_out_pence: 1000 + profit })),
  });
  const pay = (from: string, to: string, amount: number, t: string, status = 'confirmed') => ({
    from_player: from, to_player: to, amount_pence: amount, status, confirmed_at: status === 'confirmed' ? t : null,
  });
  const g1 = game('g1', '2026-10-01', [['a', 500], ['b', -500]]);
  const g2 = game('g2', '2026-10-08', [['a', -300], ['b', 300]]);

  it('is outstanding until the money moves, and pending payments do not count', () => {
    const s = settlementByGame([g1], [pay('b', 'a', 500, '2026-10-02', 'pending')]);
    expect(s.get('g1')).toEqual({ settled: false, outstanding: ['a', 'b'] });
  });
  it('is settled when the confirmed payment squares everyone up', () => {
    expect(settlementByGame([g1], [pay('b', 'a', 500, '2026-10-02')]).get('g1')!.settled).toBe(true);
  });
  it('stays outstanding after a part payment', () => {
    expect(settlementByGame([g1], [pay('b', 'a', 200, '2026-10-02')]).get('g1')!.settled).toBe(false);
  });
  it('counts winnings in a later game against an older debt', () => {
    // b owes 5 from g1, wins 3 in g2 (now owes 2): g2 is square for b, g1 is not.
    const s = settlementByGame([g1, g2], []);
    expect(s.get('g1')).toEqual({ settled: false, outstanding: ['a', 'b'] });
    expect(s.get('g2')).toEqual({ settled: true, outstanding: [] });
    // b pays the remaining 2: everything settles.
    const done = settlementByGame([g1, g2], [pay('b', 'a', 200, '2026-10-09')]);
    expect([done.get('g1')!.settled, done.get('g2')!.settled]).toEqual([true, true]);
  });
  it('closes older games and opens the new one when a balance flips', () => {
    const g3 = game('g3', '2026-10-15', [['a', -800], ['b', 800]]); // a: +5 -> -3, b: -5 -> +3
    const s = settlementByGame([g1, g3], []);
    expect(s.get('g1')!.settled).toBe(true);
    expect(s.get('g3')).toEqual({ settled: false, outstanding: ['a', 'b'] });
  });
  it('treats a break-even night as settled for that player', () => {
    const g = game('g', '2026-10-01', [['a', 0], ['b', 0]]);
    expect(settlementByGame([g], []).get('g')!.settled).toBe(true);
  });
});
