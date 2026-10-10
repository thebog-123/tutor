import { useEffect, useMemo, useState } from 'react';
import { supabase, rpc, select } from '../supabase';
import { useGroup } from '../data';
import { navigate } from '../router';
import { entryProfit, gameTotals, totalIn } from '../lib/stats';
import { formatPence } from '../lib/money';
import { Banner, Confirm, Empty, ErrorBanner, Money, SectionTitle, Skeleton, formatDate, formatDateTime, useToast } from '../ui';
import type { AuditRow, Game } from '../types';
import { LiveGame } from './LiveGame';

export function StatusBadge({ status }: { status: Game['status'] }) {
  if (status === 'final') return <span className="badge green">Final</span>;
  if (status === 'draft') return <span className="badge warn">Draft</span>;
  if (status === 'live') return <span className="badge live">● Live</span>;
  return <span className="badge red">Void</span>;
}

export function GamesList() {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  const [showVoid, setShowVoid] = useState(false);
  const games = g.games
    .filter((x) => showVoid || x.status !== 'void')
    .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'));
  const voidCount = g.games.length - g.games.filter((x) => x.status !== 'void').length;
  return (
    <div className="stack-lg">
      <div className="row-between">
        <h1>Games</h1>
      </div>
      <div className="btn-row">
        <a className="btn primary" href={`${base}/games/live`}>
          ● Start live game
        </a>
        <a className="btn" href={`${base}/games/new`}>
          Record a finished game
        </a>
      </div>
      {games.length === 0 ? (
        <Empty title="No games recorded" action={<a className="btn" href={`${base}/games/new`}>Record a game</a>}>
          Anyone in the group can submit a game as a draft. An admin checks it and finalises it.
        </Empty>
      ) : (
        <ul className="list card flush">
          {games.map((game) => {
            const { totalIn: pot } = gameTotals(game.entries);
            const top = [...game.entries].sort((a, b) => entryProfit(b) - entryProfit(a))[0];
            return (
              <li key={game.id}>
                <a className="list-item" href={`${base}/games/${game.id}`}>
                  <span className="grow">
                    <span className="row" style={{ gap: 8 }}>
                      <b className="ellipsis">{game.name}</b>
                      {game.status !== 'final' && <StatusBadge status={game.status} />}
                    </span>
                    <span className="small muted">
                      {formatDate(game.played_on)} · {game.entries.length} players · pot {formatPence(pot)}
                      {top && game.status === 'final' && entryProfit(top) > 0 && ` · ${g.playerName(top.player_id)} won`}
                    </span>
                  </span>
                  <span className="chevron">›</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {voidCount > 0 && (
        <button className="btn ghost" onClick={() => setShowVoid(!showVoid)}>
          {showVoid ? 'Hide voided games' : `Show ${voidCount} voided game${voidCount > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

export function GameDetail({ gameId }: { gameId: string }) {
  const g = useGroup();
  const toast = useToast();
  const base = `#/g/${g.group.id}`;
  const game = g.games.find((x) => x.id === gameId);
  const [dialog, setDialog] = useState<'finalise' | 'delete' | 'void' | null>(null);
  const [history, setHistory] = useState<AuditRow[] | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);

  useEffect(() => {
    select<AuditRow[]>(supabase.from('audit_log').select('*').eq('entity_id', gameId).order('created_at', { ascending: false }))
      .then(setHistory)
      .catch(setHistoryError);
  }, [gameId, game?.version, game?.status]);

  const rows = useMemo(() => (game ? [...game.entries].sort((a, b) => entryProfit(b) - entryProfit(a)) : []), [game]);
  // Opened from a link to a game this screen hasn't loaded yet (e.g. a live game just started): fetch once.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!game && !checked) void g.reload().finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, checked]);
  if (game?.status === 'live') return <LiveGame game={game} />;
  if (!game && !checked) return <Skeleton count={3} height={60} />;
  if (!game) {
    return (
      <Empty title="Game not found" action={<a className="btn" href={`${base}/games`}>Back to games</a>}>
        It may have been deleted.
      </Empty>
    );
  }
  const totals = gameTotals(game.entries);
  const balanced = totals.difference === 0;
  const canEditDraft = game.status === 'draft' && (g.me.isAdmin || game.created_by === g.me.userId);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <a href={`${base}/games`} className="small">
          ‹ Games
        </a>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h1>{game.name}</h1>
          <StatusBadge status={game.status} />
        </div>
        <p className="muted small">
          {formatDate(game.played_on, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {game.entries.length} players
        </p>
        {game.notes && <p className="small">{game.notes}</p>}
      </div>

      {game.status === 'void' && (
        <Banner tone="error">
          This game was voided{game.voided_by ? ` by ${g.personName(game.voided_by)}` : ''}
          {game.voided_at ? ` on ${formatDate(game.voided_at)}` : ''}: {game.void_reason}. It doesn't count towards the leaderboard or balances.
        </Banner>
      )}
      {game.status === 'draft' && (
        <Banner tone={balanced ? 'info' : 'warn'}>
          This is a draft and doesn't count yet.{' '}
          {balanced ? (g.me.isAdmin ? 'Check the numbers and finalise it.' : 'An admin needs to finalise it.') : `It doesn't balance: cash-outs are ${formatPence(Math.abs(totals.difference))} ${totals.difference > 0 ? 'more' : 'less'} than buy-ins plus rebuys.`}
        </Banner>
      )}

      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>In</th>
              <th>Out</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.player_id}>
                <td>
                  {g.playerName(e.player_id)}
                  {e.rebuys_pence.length > 0 && (
                    <div className="tiny faint">
                      {formatPence(e.buy_in_pence)} + {e.rebuys_pence.length} rebuy{e.rebuys_pence.length > 1 ? 's' : ''}
                    </div>
                  )}
                </td>
                <td>{formatPence(totalIn(e))}</td>
                <td>{formatPence(e.cash_out_pence ?? 0)}</td>
                <td>
                  <b>
                    <Money pence={entryProfit(e)} sign />
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{formatPence(totals.totalIn)}</td>
              <td>{formatPence(totals.totalOut)}</td>
              <td className={balanced ? 'pos' : 'neg'}>{balanced ? '✓' : formatPence(totals.difference, { sign: true })}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="stack">
        {game.status === 'draft' && g.me.isAdmin && (
          <button className="btn primary block" disabled={!balanced} onClick={() => setDialog('finalise')}>
            Finalise game
          </button>
        )}
        {canEditDraft && (
          <div className="btn-row">
            <a className="btn" href={`${base}/games/${game.id}/edit`}>
              Edit draft
            </a>
            <button className="btn danger" onClick={() => setDialog('delete')}>
              Delete draft
            </button>
          </div>
        )}
        {game.status === 'final' && g.me.isAdmin && (
          <div className="btn-row">
            <a className="btn" href={`${base}/games/${game.id}/edit`}>
              Correct results
            </a>
            <button className="btn danger" onClick={() => setDialog('void')}>
              Void game
            </button>
          </div>
        )}
      </div>

      <div className="stack-sm">
        <SectionTitle title="History" />
        <ErrorBanner error={historyError} />
        {!history && !historyError && <Skeleton count={1} height={48} />}
        {history && (
          <ul className="list card flush">
            {history.map((h) => (
              <li key={h.id} className="list-item" style={{ minHeight: 0, alignItems: 'flex-start' }}>
                <span className="grow small">
                  <b>{describeGameAction(h.action)}</b> by {h.actor_name ?? 'someone'}
                  {h.reason && <span className="muted"> · “{h.reason}”</span>}
                  <div className="faint tiny">{formatDateTime(h.created_at)}</div>
                </span>
              </li>
            ))}
            {history.length === 0 && <li className="list-item small muted">No history recorded.</li>}
          </ul>
        )}
      </div>

      {dialog === 'finalise' && (
        <Confirm
          title="Finalise this game?"
          confirmLabel="Finalise"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await rpc('finalise_game', { p_game: game.id, p_expected_version: game.version });
            await g.reload();
            toast.show('Game finalised. Leaderboard and balances updated.');
          }}
        >
          <p className="muted">
            Results will count towards the leaderboard and who-owes-whom. Pot: <b>{formatPence(totals.totalIn)}</b>. After this, only admins can correct it, and
            every correction is logged.
          </p>
        </Confirm>
      )}
      {dialog === 'delete' && (
        <Confirm
          title="Delete this draft?"
          confirmLabel="Delete draft"
          tone="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await rpc('delete_draft', { p_game: game.id, p_expected_version: game.version });
            await g.reload();
            toast.show('Draft deleted');
            navigate(`/g/${g.group.id}/games`, true);
          }}
        >
          <p className="muted">The draft and its numbers will be removed. This can't be undone.</p>
        </Confirm>
      )}
      {dialog === 'void' && (
        <Confirm
          title="Void this game?"
          confirmLabel="Void game"
          tone="danger"
          reasonLabel="Reason (kept in the history)"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await rpc('void_game', { p_game: game.id, p_expected_version: game.version, p_reason: reason });
            await g.reload();
            toast.show('Game voided');
          }}
        >
          <p className="muted">
            The game will stay visible but stop counting towards the leaderboard and balances. Use this for duplicates or games entered by mistake.
          </p>
        </Confirm>
      )}
    </div>
  );
}

export function describeGameAction(action: string) {
  return (
    {
      'game.draft_created': 'Draft submitted',
      'game.finalised': 'Finalised',
      'game.corrected': 'Corrected',
      'game.voided': 'Voided',
      'game.draft_deleted': 'Draft deleted',
      'game.live_started': 'Live game started',
      'game.live_ended': 'Live game ended',
      'game.live_player_removed': 'Player removed from live game',
    }[action] ?? action
  );
}
