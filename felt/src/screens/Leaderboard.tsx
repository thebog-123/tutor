import { useMemo, useState } from 'react';
import { useGroup } from '../data';
import { leaderboard, type Range } from '../lib/stats';
import { Empty, Money } from '../ui';

const RANGES: [Range, string][] = [
  ['all', 'All time'],
  ['year', 'This year'],
  ['month', 'This month'],
];

export function Leaderboard() {
  const g = useGroup();
  const [range, setRange] = useState<Range>(() => {
    try {
      return (sessionStorage.getItem('felt.range') as Range) || 'all';
    } catch {
      return 'all';
    }
  });
  const rows = useMemo(() => leaderboard(g.games, g.players, range), [g.games, g.players, range]);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Leaderboard</h1>
        <p className="small muted">Ranked by total profit from finalised games. Paying off a debt never changes the rankings.</p>
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
              try {
                sessionStorage.setItem('felt.range', value);
              } catch {
                /* ignore */
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title={range === 'all' ? 'No finalised games yet' : `No finalised games ${range === 'year' ? 'this year' : 'this month'}`}>
          Rankings appear once an admin finalises a game.
        </Empty>
      ) : (
        <ol className="list card flush" aria-label="Rankings">
          {rows.map((r) => {
            const mine = g.me.player?.id === r.playerId;
            return (
              <li key={r.playerId} className="list-item" style={mine ? { background: 'rgba(195,227,95,0.06)' } : undefined}>
                <span className={`chip r${r.rank <= 3 ? r.rank : 'n'}`} aria-label={`Rank ${r.rank}`}>
                  {r.rank}
                </span>
                <span className="grow">
                  <span className="row" style={{ gap: 6 }}>
                    <b className="ellipsis">{r.name}</b>
                    {mine && <span className="badge lime">You</span>}
                  </span>
                  <span className="small muted num">
                    {r.games} {r.games === 1 ? 'game' : 'games'} · {r.wins} won ({r.winPct}%) · avg <Money pence={r.average} sign />
                  </span>
                </span>
                <b style={{ fontSize: '1.1rem' }}>
                  <Money pence={r.profit} sign />
                </b>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > 0 && (
        <p className="tiny faint center">
          A winning session is one where a player cashed out more than they put in. Average is profit per game played.
        </p>
      )}
    </div>
  );
}
