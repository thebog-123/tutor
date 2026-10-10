import { useMemo } from 'react';
import { useGroup } from '../data';
import { leaderboard, entryProfit } from '../lib/stats';
import { simplifyDebts } from '../lib/settle';
import { formatPence } from '../lib/money';
import { Banner, Empty, Money, SectionTitle, formatDate } from '../ui';

export function Overview() {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  const myPlayer = g.me.player;
  const myBalance = myPlayer ? g.balances.find((b) => b.player_id === myPlayer.id) : undefined;
  const allTime = useMemo(() => leaderboard(g.games, g.players, 'all'), [g.games, g.players]);
  const myRow = myPlayer ? allTime.find((r) => r.playerId === myPlayer.id) : undefined;
  const finals = g.games.filter((x) => x.status === 'final');
  const lastGame = finals[0];
  const drafts = g.games.filter((x) => x.status === 'draft');
  const pending = g.payments.filter((p) => p.status === 'pending');
  const myTransfers = useMemo(() => {
    if (!myPlayer) return [];
    try {
      return simplifyDebts(g.balances.map((b) => ({ id: b.player_id, name: g.playerName(b.player_id), balance: b.balance_pence }))).filter(
        (t) => t.from === myPlayer.id || t.to === myPlayer.id,
      );
    } catch {
      return [];
    }
  }, [g, myPlayer]);

  return (
    <div className="stack-lg">
      {!myPlayer && (
        <Banner tone="warn">
          <div className="stack-sm">
            <span>
              <b>Which player are you?</b> Claim your player so your results and balance show up here.
            </span>
            <a className="btn small" style={{ alignSelf: 'flex-start' }} href={`${base}/group`}>
              Claim my player
            </a>
          </div>
        </Banner>
      )}

      {myPlayer && (
        <div className="card felt stack">
          <div className="row-between">
            <span className="small" style={{ opacity: 0.85 }}>
              {myPlayer.name}
            </span>
            <span className="small" style={{ opacity: 0.85 }}>
              ♠ ♥ ♣ ♦
            </span>
          </div>
          <div>
            <div className="small" style={{ opacity: 0.85 }}>
              All-time poker result
            </div>
            <div className="big-money">{myRow ? <MoneyOnFelt pence={myRow.profit} /> : '£0'}</div>
            <div className="small" style={{ opacity: 0.85 }}>
              {myRow ? `${myRow.games} ${myRow.games === 1 ? 'game' : 'games'} · ${myRow.wins} won · rank #${myRow.rank} of ${allTime.length}` : 'No finalised games yet'}
            </div>
          </div>
          <div className="divider" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <div className="row-between">
            <span>
              {!myBalance || myBalance.balance_pence === 0
                ? 'You are all square'
                : myBalance.balance_pence < 0
                  ? 'You owe'
                  : 'You are owed'}
            </span>
            {myBalance && myBalance.balance_pence !== 0 && (
              <b className="num" style={{ fontSize: '1.2rem' }}>
                <Money pence={Math.abs(myBalance.balance_pence)} />
              </b>
            )}
          </div>
          {myTransfers.length > 0 && (
            <ul className="list" style={{ fontSize: '0.92rem' }}>
              {myTransfers.map((t, i) => (
                <li key={i} style={{ borderColor: 'rgba(255,255,255,0.12)', padding: '6px 0' }}>
                  {t.from === myPlayer.id ? (
                    <>
                      Pay <b>{g.playerName(t.to)}</b> <Money pence={t.amount} />
                    </>
                  ) : (
                    <>
                      <b>{g.playerName(t.from)}</b> pays you <Money pence={t.amount} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="btn-row">
        <a className="btn primary" href={`${base}/games/new`}>
          + Record a game
        </a>
        <a className="btn" href={`${base}/payments`}>
          Settle up
        </a>
      </div>

      {g.me.isAdmin && (drafts.length > 0 || pending.length > 0) && (
        <div className="stack-sm">
          <SectionTitle title="Waiting for an admin" />
          <ul className="list card flush">
            {drafts.map((d) => (
              <li key={d.id}>
                <a className="list-item" href={`${base}/games/${d.id}`}>
                  <span className="badge warn">Draft</span>
                  <span className="grow ellipsis">{d.name}</span>
                  <span className="chevron">Review ›</span>
                </a>
              </li>
            ))}
            {pending.length > 0 && (
              <li>
                <a className="list-item" href={`${base}/payments`}>
                  <span className="badge warn">Payments</span>
                  <span className="grow">
                    {pending.length} payment{pending.length > 1 ? 's' : ''} to confirm
                  </span>
                  <span className="chevron">›</span>
                </a>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="two-col stack-lg">
        <div className="stack-sm">
          <SectionTitle title="Leaderboard" action={<a href={`${base}/leaderboard`} className="small">See all</a>} />
          {allTime.length === 0 ? (
            <Empty title="No results yet">Once an admin finalises your first game, rankings appear here.</Empty>
          ) : (
            <ul className="list card flush">
              {allTime.slice(0, 3).map((r) => (
                <li key={r.playerId} className="list-item">
                  <span className={`chip r${r.rank <= 3 ? r.rank : 'n'}`}>{r.rank}</span>
                  <span className="grow ellipsis">{r.name}</span>
                  <Money pence={r.profit} sign />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="stack-sm">
          <SectionTitle title="Last game" action={<a href={`${base}/games`} className="small">All games</a>} />
          {!lastGame ? (
            <Empty title="No games yet" action={<a className="btn small" href={`${base}/games/new`}>Record your first game</a>}>
              Record a game after your next poker night.
            </Empty>
          ) : (
            <a className="card stack-sm" href={`${base}/games/${lastGame.id}`} style={{ color: 'inherit' }}>
              <div className="row-between">
                <b>{lastGame.name}</b>
                <span className="small muted">{formatDate(lastGame.played_on)}</span>
              </div>
              {[...lastGame.entries]
                .sort((a, b) => entryProfit(b) - entryProfit(a))
                .slice(0, 4)
                .map((e) => (
                  <div className="row-between small" key={e.player_id}>
                    <span>{g.playerName(e.player_id)}</span>
                    <Money pence={entryProfit(e)} sign />
                  </div>
                ))}
              {lastGame.entries.length > 4 && <span className="small faint">+ {lastGame.entries.length - 4} more</span>}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MoneyOnFelt({ pence }: { pence: number }) {
  return (
    <span className="num" style={{ color: pence > 0 ? 'var(--lime)' : pence < 0 ? '#ffc2bb' : undefined }}>
      {formatPence(pence, { sign: true })}
    </span>
  );
}
