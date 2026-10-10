// Client-side check of a Felt backup file before it is sent to the server.
// The server repeats every check inside one transaction; this just gives
// clear messages before anything is touched.

export interface BackupSummary {
  groupName: string;
  exportedAt: string;
  players: number;
  games: number;
  finalGames: number;
  payments: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPence = (v: unknown, allowZero: boolean) =>
  typeof v === 'number' && Number.isInteger(v) && v <= 100_000_000 && (allowZero ? v >= 0 : v > 0);
const isText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;

export function validateBackup(data: unknown): { ok: true; summary: BackupSummary } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(data) || data.format !== 'felt-backup') return { ok: false, errors: ['This file is not a Felt backup.'] };
  if (data.version !== 1) return { ok: false, errors: ['This backup version is not supported.'] };
  const { players, games, payments } = data;
  if (!Array.isArray(players) || !Array.isArray(games) || !Array.isArray(payments)) {
    return { ok: false, errors: ['The backup is missing players, games or payments.'] };
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  players.forEach((p, i) => {
    if (!isObj(p) || typeof p.id !== 'string' || !isText(p.name, 40)) {
      errors.push(`Player ${i + 1} is missing an id or name.`);
      return;
    }
    const key = (p.name as string).trim().toLowerCase();
    if (names.has(key)) errors.push(`Two players are called "${p.name}".`);
    names.add(key);
    ids.add(p.id);
  });

  let finalGames = 0;
  games.forEach((g, i) => {
    const label = isObj(g) && typeof g.name === 'string' ? `"${g.name}"` : `Game ${i + 1}`;
    if (!isObj(g)) return errors.push(`${label} is not valid.`);
    if (!isText(g.name, 80)) errors.push(`${label} has no name.`);
    if (typeof g.played_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.played_on)) errors.push(`${label} has an invalid date.`);
    if (!['draft', 'final', 'void'].includes(g.status as string)) errors.push(`${label} has an unknown status.`);
    if (!Array.isArray(g.entries) || g.entries.length < 2) return errors.push(`${label} needs at least two players.`);
    let tIn = 0;
    let tOut = 0;
    const seen = new Set<string>();
    for (const e of g.entries) {
      if (!isObj(e) || typeof e.player_id !== 'string' || !ids.has(e.player_id)) {
        errors.push(`${label} refers to a missing player.`);
        return;
      }
      if (seen.has(e.player_id)) errors.push(`${label} lists a player twice.`);
      seen.add(e.player_id);
      const rebuys = e.rebuys_pence ?? [];
      if (!isPence(e.buy_in_pence, false) || !isPence(e.cash_out_pence, true) || !Array.isArray(rebuys) || !rebuys.every((r) => isPence(r, false))) {
        errors.push(`${label} has an invalid amount.`);
        return;
      }
      tIn += (e.buy_in_pence as number) + (rebuys as number[]).reduce((a, b) => a + b, 0);
      tOut += e.cash_out_pence as number;
    }
    if (g.status === 'final') {
      finalGames++;
      if (tIn !== tOut) errors.push(`${label} does not balance (cash-outs must equal buy-ins plus rebuys).`);
    }
  });

  payments.forEach((p, i) => {
    if (!isObj(p) || !ids.has(p.from_player as string) || !ids.has(p.to_player as string) || p.from_player === p.to_player) {
      errors.push(`Payment ${i + 1} refers to a missing player.`);
    } else if (!isPence(p.amount_pence, false)) {
      errors.push(`Payment ${i + 1} has an invalid amount.`);
    } else if (!['pending', 'confirmed', 'rejected', 'void'].includes(p.status as string)) {
      errors.push(`Payment ${i + 1} has an unknown status.`);
    }
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  const group = isObj(data.group) ? data.group : {};
  return {
    ok: true,
    summary: {
      groupName: typeof group.name === 'string' ? group.name : 'Unknown group',
      exportedAt: typeof data.exported_at === 'string' ? data.exported_at : '',
      players: players.length,
      games: games.length,
      finalGames,
      payments: payments.length,
    },
  };
}
