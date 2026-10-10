import { describe, expect, it } from 'vitest';
import { formatPence, parsePounds, penceToInput } from './money';
import { simplifyDebts, type Balance } from './settle';
import { entryProfit, gameTotals, leaderboard, type GameLike } from './stats';
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
