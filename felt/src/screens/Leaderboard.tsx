import { useMemo, useState } from 'react';
import { useGroup } from '../data';
import { leaderboard, sortLeaderboard, type LeaderRow, type Range, type SortKey } from '../lib/stats';
import { Avatar, Empty, Money } from '../ui';

const RANGES: [Range, string][] = [
  ['all', 'All time'],
  ['year', 'This year'],
  ['month', 'This month'],
];

const SORTS: { key: SortKey; label: string; column: string }[] = [
  { key: 'profit', label: 'Profit', column: 'Profit' },
  { key: 'average', label: 'Avg / game', column: 'Avg / game' },
  { key: 'winPct', label: 'Win %', column: 'Win %' },
  { key: 'wins', label: 'Wins', column: 'Wins' },
  { key: 'games', label: 'Games', column: 'Games' },
];

type Dir = 'desc' | 'asc';

function stored<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const v = sessionStorage.getItem(key);
    return v && allowed.includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function statText(r: LeaderRow, key: SortKey) {
  switch (key) {
    case 'profit':
      return <Money pence={r.profit} sign />;
    case 'average':
      return <Money pence={r.average} sign />;
    case 'winPct':
      return `${r.winPct}%`;
    case 'wins':
      return `${r.wins} ${r.wins === 1 ? 'win' : 'wins'}`;
    case 'games':
      return `${r.games} ${r.games === 1 ? 'game' : 'games'}`;
  }
}

export function Leaderboard() {
  const g = useGroup();
  const [range, setRange] = useState<Range>(() => stored('felt.range', 'all', ['all', 'year', 'month']));
  const [sort, setSort] = useState<SortKey>(() => stored('felt.sort', 'profit', SORTS.map((s) => s.key)));
  const [dir, setDir] = useState<Dir>(() => stored('felt.sortDir', 'desc', ['desc', 'asc']));
  const [showGuests, setShowGuests] = useState(false);
  const hasGuests = g.players.some((p) => p.is_guest);
  const rows = useMemo(
    () => sortLeaderboard(leaderboard(g.games, g.players.filter((p) => showGuests || !p.is_guest), range), sort, dir),
    [g.games, g.players, range, sort, dir, showGuests],
  );
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;

  const chooseSort = (key: SortKey) => {
    // Picking the current column again flips the direction.
    const nextDir: Dir = key === sort ? (dir === 'desc' ? 'asc' : 'desc') : 'desc';
    setSort(key);
    setDir(nextDir);
    store('felt.sort', key);
    store('felt.sortDir', nextDir);
  };
  const flip = () => {
    const nextDir: Dir = dir === 'desc' ? 'asc' : 'desc';
    setDir(nextDir);
    store('felt.sortDir', nextDir);
  };

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Leaderboard</h1>
        <p className="small muted">
          {g.group.name} only: finalised games played in this group. Paying off a debt never changes the rankings.
        </p>
      </div>
      <div className="segmented" role="tablist" aria-label="Time period">
        {RANGES.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={range === value}
            className={range === value ? 'on' : ''}
            onClick={() => {
              setRange(value);
              store('felt.range', value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stack-sm mobile-only">
        <div className="row-between">
          <span className="label-text">Sort by</span>
          <button className="btn ghost small" onClick={flip} aria-label={`Order: ${dir === 'desc' ? 'highest first' : 'lowest first'}. Tap to reverse.`}>
            {dir === 'desc' ? '↓ Highest first' : '↑ Lowest first'}
          </button>
        </div>
        <div className="pill-toggle" role="group" aria-label="Sort by">
          {SORTS.map((s) => (
            <button key={s.key} className={sort === s.key ? 'on' : ''} aria-pressed={sort === s.key} onClick={() => chooseSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {hasGuests && (
        <label className="row small muted" style={{ minHeight: 40 }}>
          <input type="checkbox" checked={showGuests} onChange={(e) => setShowGuests(e.target.checked)} style={{ width: 20, height: 20 }} />
          Show guests
        </label>
      )}
      {rows.length === 0 ? (
        <Empty title={range === 'all' ? 'No finalised games yet' : `No finalised games ${range === 'year' ? 'this year' : 'this month'}`}>
          Rankings appear once an admin finalises a game.
        </Empty>
      ) : (
        <>
          {rows.length >= 2 && dir === 'desc' && <Podium rows={rows} sort={sort} />}
          <ol className="list card flush mobile-only" aria-label={`Rankings by ${sortLabel}`}>
            {rows.map((r) => {
              const mine = g.me.player?.id === r.playerId;
              return (
                <li key={r.playerId} className="list-item" style={mine ? { background: 'rgba(195,227,95,0.06)' } : undefined}>
                  <span className={`chip r${r.rank <= 3 ? r.rank : 'n'}`} aria-label={`Rank ${r.rank}`}>
                    {r.rank}
                  </span>
                  <Avatar name={r.name} src={g.avatarForPlayer(r.playerId)} />
                  <span className="grow">
                    <span className="row" style={{ gap: 6 }}>
                      <b className="ellipsis">{r.name}</b>
                      {mine && <span className="badge lime">You</span>}
                      {g.playersById.get(r.playerId)?.is_guest && <span className="badge">Guest</span>}
                    </span>
                    <span className="small muted num">
                      {sort !== 'profit' && (
                        <>
                          <Money pence={r.profit} sign /> ·{' '}
                        </>
                      )}
                      {r.games} {r.games === 1 ? 'game' : 'games'} · {r.wins} won ({r.winPct}%)
                      {sort !== 'average' && (
                        <>
                          {' '}
                          · avg <Money pence={r.average} sign />
                        </>
                      )}
                    </span>
                  </span>
                  <b style={{ fontSize: '1.1rem' }} className="num">
                    {statText(r, sort)}
                  </b>
                </li>
              );
            })}
          </ol>

          <div className="card flush desktop-only-block" style={{ overflowX: 'auto' }}>
            <table className="table leaderboard-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>#</th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  {SORTS.map((s) => (
                    <th key={s.key} aria-sort={sort === s.key ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
                      <button className={`th-sort ${sort === s.key ? 'on' : ''}`} onClick={() => chooseSort(s.key)}>
                        {s.column}
                        <span aria-hidden>{sort === s.key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mine = g.me.player?.id === r.playerId;
                  return (
                    <tr key={r.playerId} style={mine ? { background: 'rgba(195,227,95,0.06)' } : undefined}>
                      <td>
                        <span className={`chip r${r.rank <= 3 ? r.rank : 'n'}`} style={{ width: 30, height: 30, fontSize: '0.8rem' }}>
                          {r.rank}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="row" style={{ gap: 10 }}>
                          <Avatar name={r.name} src={g.avatarForPlayer(r.playerId)} size={32} />
                          <b>{r.name}</b> {mine && <span className="badge lime">You</span>}
                        </span>
                      </td>
                      <td className={sort === 'profit' ? 'sorted' : ''}>
                        <Money pence={r.profit} sign />
                      </td>
                      <td className={sort === 'average' ? 'sorted' : ''}>
                        <Money pence={r.average} sign />
                      </td>
                      <td className={sort === 'winPct' ? 'sorted' : ''}>{r.winPct}%</td>
                      <td className={sort === 'wins' ? 'sorted' : ''}>{r.wins}</td>
                      <td className={sort === 'games' ? 'sorted' : ''}>{r.games}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {rows.length > 0 && (
        <p className="tiny faint center">
          A winning session is one where a player cashed out more than they put in. Average is profit per game played. Players level on the
          chosen column share a rank.
        </p>
      )}
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Top three on a podium: 2nd, 1st, 3rd, with medals above. Follows the chosen sort. */
function Podium({ rows, sort }: { rows: LeaderRow[]; sort: SortKey }) {
  const g = useGroup();
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  return (
    <div className="card podium" aria-label="Top three">
      {order.map((r, i) => {
        if (!r) return <div key={i} />;
        const place = i === 1 ? 1 : i === 0 ? 2 : 3;
        const medal = MEDALS[Math.min(r.rank, 3) - 1];
        return (
          <div key={r.playerId} className={`podium-spot ${place === 1 ? 'first' : ''}`}>
            <span className="medal" aria-label={`Rank ${r.rank}`}>
              {medal}
            </span>
            <Avatar name={r.name} src={g.avatarForPlayer(r.playerId)} />
            <span className="who">{r.name}</span>
            <span className="stat num">{statText(r, sort)}</span>
            <div className={`podium-block p${place}`} aria-hidden>
              {r.rank}
            </div>
          </div>
        );
      })}
    </div>
  );
}
