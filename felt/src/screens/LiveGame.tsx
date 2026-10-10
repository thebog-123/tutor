import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc, supabase } from '../supabase';
import { useGroup } from '../data';
import { navigate } from '../router';
import { formatPence } from '../lib/money';
import { entryProfit, gameTotals, totalIn } from '../lib/stats';
import { Avatar, Banner, Confirm, ErrorBanner, Money, MoneyInput, SectionTitle, Sheet, todayISO, useToast } from '../ui';
import type { Entry, Game } from '../types';
import { useSession } from '../session';
import { addMeAsPlayer } from '../lib/me';
import { InviteCard, inviteLink } from './Invite';

/** Start a game that's played live: players join, rebuy and cash out from their own phones. */
export function StartLiveGame() {
  const g = useGroup();
  const [name, setName] = useState('Poker night');
  const [date, setDate] = useState(todayISO());
  const lastStandard = g.games.find((x) => x.standard_buy_in_pence)?.standard_buy_in_pence ?? g.games.find((x) => x.status === 'final')?.entries[0]?.buy_in_pence;
  const [buyIn, setBuyIn] = useState<number | null>(lastStandard ?? 2000);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(g.me.player ? [g.me.player.id] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [token] = useState(() => crypto.randomUUID());
  const active = g.players.filter((p) => p.active);

  return (
    <form
      className="stack-lg narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          const id = await rpc<string>('start_live_game', {
            p_group: g.group.id, p_name: name, p_played_on: date, p_standard_buy_in: buyIn, p_players: [...picked], p_client_token: token,
          });
          await g.reload();
          navigate(`/g/${g.group.id}/games/${id}`, true);
        } catch (err) {
          setError(err);
          setBusy(false);
        }
      }}
    >
      <div className="stack-sm">
        <a href={`#/g/${g.group.id}/games`} className="small">
          ‹ Games
        </a>
        <h1>Start a live game</h1>
        <p className="muted small">
          Everyone in the group can follow along and update it from their own phone: join, rebuy, and cash out when they leave. When you're done, end the game
          and an admin finalises it.
        </p>
      </div>
      <div className="card stack">
        <div className="field">
          <label htmlFor="live-name">Game name</label>
          <input id="live-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="entry-grid">
          <div className="field">
            <label htmlFor="live-date">Date</label>
            <input id="live-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <MoneyInput id="live-buyin" label="Buy-in" value={buyIn} onChange={setBuyIn} />
        </div>
      </div>
      <div className="stack-sm">
        <SectionTitle title={`Who's playing now? (${picked.size})`} />
        <p className="small muted">Pick anyone who's already at the table. Others can join later.</p>
        <div className="pill-toggle" role="group" aria-label="Players">
          {active.map((p) => (
            <button
              key={p.id}
              type="button"
              className={picked.has(p.id) ? 'on' : ''}
              aria-pressed={picked.has(p.id)}
              onClick={() => {
                const next = new Set(picked);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                setPicked(next);
              }}
            >
              {picked.has(p.id) ? '✓ ' : ''}
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <ErrorBanner error={error} />
      <button className="btn primary block" disabled={busy || !name.trim() || !buyIn}>
        {busy ? <span className="spinner" /> : '● Start live game'}
      </button>
    </form>
  );
}

type Dialog =
  | { kind: 'join' }
  | { kind: 'rebuy'; entry: Entry }
  | { kind: 'cashout'; entry: Entry }
  | { kind: 'remove'; entry: Entry }
  | { kind: 'end' }
  | { kind: 'delete' }
  | { kind: 'invite' }
  | { kind: 'guest' };

export function LiveGame({ game }: { game: Game }) {
  const g = useGroup();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyPlayer, setBusyPlayer] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const standard = game.standard_buy_in_pence ?? 2000;
  const canEnd = g.me.isAdmin || game.created_by === g.me.userId;
  const { displayName } = useSession();

  // Realtime pushes changes instantly. As a safety net (if that connection drops),
  // check every 8s whether the game changed (a few bytes) and only then reload.
  const versionRef = useRef(game.version);
  versionRef.current = game.version;
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('games').select('version, status').eq('id', game.id).maybeSingle();
      if (!data || data.version !== versionRef.current || data.status !== 'live') void g.reload();
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const playing = game.entries.filter((e) => e.cash_out_pence === null);
  const done = game.entries.filter((e) => e.cash_out_pence !== null);
  const sortByName = (a: Entry, b: Entry) => g.playerName(a.player_id).localeCompare(g.playerName(b.player_id));
  const totals = gameTotals(game.entries);
  const onTable = totals.totalIn - totals.totalOut;
  const inGame = new Set(game.entries.map((e) => e.player_id));
  const meIn = g.me.player && inGame.has(g.me.player.id);

  async function act(playerId: string | null, fn: () => Promise<unknown>, message?: string) {
    setBusyPlayer(playerId);
    setError(null);
    try {
      await fn();
      await g.reload();
      if (message) toast.show(message);
    } catch (e) {
      setError(e);
    } finally {
      setBusyPlayer(null);
    }
  }

  const card = (e: Entry) => {
    const name = g.playerName(e.player_id);
    const out = e.cash_out_pence !== null;
    const busy = busyPlayer === e.player_id;
    return (
      <div className="entry-card" key={e.player_id} style={out ? { opacity: 0.85 } : undefined}>
        <div className="row">
          <Avatar name={name} src={g.avatarForPlayer(e.player_id)} />
          <div className="grow">
            <b>{name}</b>
            {g.me.player?.id === e.player_id && <span className="badge lime" style={{ marginLeft: 6 }}>You</span>}
            <div className="small muted num">
              In {formatPence(totalIn(e))}
              {e.rebuys_pence.length > 0 && ` (${e.rebuys_pence.length} rebuy${e.rebuys_pence.length > 1 ? 's' : ''})`}
            </div>
          </div>
          {out ? (
            <div style={{ textAlign: 'right' }}>
              <div className="small muted">Cashed out {formatPence(e.cash_out_pence!)}</div>
              <b>
                <Money pence={entryProfit(e)} sign />
              </b>
            </div>
          ) : (
            <span className="badge green">Playing</span>
          )}
        </div>
        <div className="btn-row">
          {!out ? (
            <>
              <button className="btn small" disabled={busy} onClick={() => act(e.player_id, () => rpc('live_rebuy', { p_game: game.id, p_player: e.player_id, p_amount: standard }), `${name} rebought ${formatPence(standard)}`)}>
                + Rebuy {formatPence(standard)}
              </button>
              <button className="btn green small" disabled={busy} onClick={() => setDialog({ kind: 'cashout', entry: e })}>
                Cash out
              </button>
            </>
          ) : (
            <>
              <button className="btn small" disabled={busy} onClick={() => setDialog({ kind: 'cashout', entry: e })}>
                Edit cash-out
              </button>
              <button className="btn small" disabled={busy} onClick={() => act(e.player_id, () => rpc('live_cash_out', { p_game: game.id, p_player: e.player_id, p_amount: null }), `${name} is back in`)}>
                Back in the game
              </button>
            </>
          )}
        </div>
        {!out && (
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button className="btn ghost small" onClick={() => setDialog({ kind: 'rebuy', entry: e })}>
              Other rebuy amount
            </button>
            {e.rebuys_pence.length > 0 && (
              <button className="btn ghost small" disabled={busy} onClick={() => act(e.player_id, () => rpc('live_undo_rebuy', { p_game: game.id, p_player: e.player_id }), 'Last rebuy removed')}>
                Undo last rebuy
              </button>
            )}
            <button className="btn ghost small" style={{ color: 'var(--text-faint)' }} onClick={() => setDialog({ kind: 'remove', entry: e })}>
              Remove
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <a href={`#/g/${g.group.id}/games`} className="small">
          ‹ Games
        </a>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h1>{game.name}</h1>
          <span className="badge live">● Live</span>
        </div>
        <p className="small muted">
          Started by {g.personName(game.created_by)} · updates on everyone's phone as it happens
        </p>
      </div>

      <div className="card felt">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div>
            <div className="small" style={{ opacity: 0.8 }}>Pot</div>
            <div className="big-money" style={{ fontSize: '1.5rem' }}>{formatPence(totals.totalIn)}</div>
          </div>
          <div>
            <div className="small" style={{ opacity: 0.8 }}>On the table</div>
            <div className="big-money" style={{ fontSize: '1.5rem' }}>{formatPence(Math.max(onTable, 0))}</div>
          </div>
          <div>
            <div className="small" style={{ opacity: 0.8 }}>Playing</div>
            <div className="big-money" style={{ fontSize: '1.5rem' }}>
              {playing.length}/{game.entries.length}
            </div>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="btn-row">
        {!g.me.player && (
          <button
            className="btn primary"
            disabled={busyPlayer === 'me'}
            onClick={() =>
              act(
                'me',
                async () => {
                  const id = await addMeAsPlayer(g.group.id, displayName);
                  await rpc('live_join', { p_game: game.id, p_player: id, p_buy_in: standard });
                },
                `You're in for ${formatPence(standard)}`,
              )
            }
          >
            Join for {formatPence(standard)}
          </button>
        )}
        {g.me.player && !meIn && (
          <button className="btn primary" disabled={busyPlayer === 'me'} onClick={() => act('me', () => rpc('live_join', { p_game: game.id, p_player: g.me.player!.id, p_buy_in: standard }), `You're in for ${formatPence(standard)}`)}>
            Join for {formatPence(standard)}
          </button>
        )}
        <button className="btn" onClick={() => setDialog({ kind: 'join' })}>
          + Add player
        </button>
        <button className="btn" onClick={() => setDialog({ kind: 'guest' })}>
          + Add guest
        </button>
      </div>
      <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setDialog({ kind: 'invite' })}>
        Invite someone to this game
      </button>

      <div className="stack-sm">
        <SectionTitle title={`Playing (${playing.length})`} />
        {playing.length === 0 ? (
          <div className="card small muted">Nobody is playing right now.</div>
        ) : (
          <div className="entry-list stack">{[...playing].sort(sortByName).map(card)}</div>
        )}
      </div>

      {done.length > 0 && (
        <div className="stack-sm">
          <SectionTitle title={`Cashed out (${done.length})`} />
          <div className="entry-list stack">{[...done].sort((a, b) => (b.cashed_out_at ?? '').localeCompare(a.cashed_out_at ?? '')).map(card)}</div>
        </div>
      )}

      <div className="stack-sm">
        {canEnd ? (
          <button className="btn primary block" onClick={() => setDialog({ kind: 'end' })}>
            End game
          </button>
        ) : (
          <p className="small muted center">{g.personName(game.created_by)} or an admin ends the game when everyone has cashed out.</p>
        )}
        {canEnd && (
          <button className="btn ghost" onClick={() => setDialog({ kind: 'delete' })}>
            Delete this live game
          </button>
        )}
      </div>

      {dialog?.kind === 'join' && <JoinSheet game={game} standard={standard} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'guest' && <GuestSheet game={game} standard={standard} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'invite' && (
        <Sheet title="Invite to this game" onClose={() => setDialog(null)}>
          <div className="stack">
            <p className="small muted">
              They create an account (or sign in), join {g.group.name}, and land on this game. For someone who's only here tonight, use{' '}
              <b>+ Add guest</b> instead. They don't need an account.
            </p>
            <InviteCard link={inviteLink(g.group.invite_code, game.id)} message={`Join our poker game "${game.name}" on Felt`} />
          </div>
        </Sheet>
      )}
      {dialog?.kind === 'rebuy' && (
        <AmountSheet
          title={`Rebuy for ${g.playerName(dialog.entry.player_id)}`}
          label="Rebuy amount"
          initial={standard}
          onClose={() => setDialog(null)}
          onSave={async (amt) => {
            await rpc('live_rebuy', { p_game: game.id, p_player: dialog.entry.player_id, p_amount: amt });
            await g.reload();
          }}
        />
      )}
      {dialog?.kind === 'cashout' && (
        <AmountSheet
          title={`Cash out ${g.playerName(dialog.entry.player_id)}`}
          label="Chips they're leaving with"
          initial={dialog.entry.cash_out_pence}
          allowZero
          hint={`They put in ${formatPence(totalIn(dialog.entry))}. Enter 0 if they lost everything.`}
          onClose={() => setDialog(null)}
          onSave={async (amt) => {
            await rpc('live_cash_out', { p_game: game.id, p_player: dialog.entry.player_id, p_amount: amt });
            await g.reload();
            toast.show(`${g.playerName(dialog.entry.player_id)} cashed out ${formatPence(amt)}`);
          }}
        />
      )}
      {dialog?.kind === 'remove' && (
        <Confirm
          title={`Remove ${g.playerName(dialog.entry.player_id)}?`}
          confirmLabel="Remove"
          tone="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await rpc('live_remove', { p_game: game.id, p_player: dialog.entry.player_id });
            await g.reload();
          }}
        >
          <p className="muted">Only for someone added by mistake. If they played and left, use Cash out instead.</p>
        </Confirm>
      )}
      {dialog?.kind === 'end' && (
        <Confirm
          title="End the game?"
          confirmLabel={playing.length ? 'End game' : 'End game'}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const version = await rpc<number>('end_live_game', { p_game: game.id });
            if (g.me.isAdmin && totals.difference === 0) await rpc('finalise_game', { p_game: game.id, p_expected_version: version });
            await g.reload();
            toast.show(g.me.isAdmin && totals.difference === 0 ? 'Game ended and finalised' : 'Game ended. An admin will check and finalise it.');
          }}
        >
          {playing.length > 0 ? (
            <Banner tone="warn">
              {playing.length} {playing.length === 1 ? 'player is' : 'players are'} still playing ({playing.map((e) => g.playerName(e.player_id)).join(', ')}). Cash
              everyone out first.
            </Banner>
          ) : totals.difference === 0 ? (
            <Banner tone="ok">
              Balanced: {formatPence(totals.totalIn)} in, {formatPence(totals.totalOut)} out.
              {g.me.isAdmin ? ' Ending will finalise it straight away.' : ' An admin will finalise it.'}
            </Banner>
          ) : (
            <Banner tone="warn">
              Cash-outs are {formatPence(Math.abs(totals.difference))} {totals.difference > 0 ? 'more' : 'less'} than the pot. The game will be saved as a draft
              so someone can fix the numbers before an admin finalises it.
            </Banner>
          )}
        </Confirm>
      )}
      {dialog?.kind === 'delete' && (
        <Confirm
          title="Delete this live game?"
          confirmLabel="Delete"
          tone="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await rpc('delete_draft', { p_game: game.id, p_expected_version: game.version });
            await g.reload();
            navigate(`/g/${g.group.id}/games`, true);
          }}
        >
          <p className="muted">Everything recorded for this game is removed. Use this only if it was started by mistake.</p>
        </Confirm>
      )}
    </div>
  );
}

function JoinSheet({ game, standard, onClose }: { game: Game; standard: number; onClose: () => void }) {
  const g = useGroup();
  const [player, setPlayer] = useState('');
  const [buyIn, setBuyIn] = useState<number | null>(standard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inGame = new Set(game.entries.map((e) => e.player_id));
  const options = useMemo(() => g.players.filter((p) => p.active && !inGame.has(p.id)), [g.players, inGame]);
  return (
    <Sheet title="Add a player" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await rpc('live_join', { p_game: game.id, p_player: player, p_buy_in: buyIn });
            await g.reload();
            onClose();
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        {options.length === 0 ? (
          <Banner tone="info">Everyone in the group is already in this game. For someone who isn't in the group, use + Add guest.</Banner>
        ) : (
          <div className="pill-toggle" role="group" aria-label="Player">
            {options.map((p) => (
              <button type="button" key={p.id} className={player === p.id ? 'on' : ''} aria-pressed={player === p.id} onClick={() => setPlayer(p.id)}>
                {p.name}
                {p.is_guest ? ' (guest)' : ''}
              </button>
            ))}
          </div>
        )}
        <MoneyInput id="join-buyin" label="Buy-in" value={buyIn} onChange={setBuyIn} />
        <ErrorBanner error={error} />
        <button className="btn primary block" disabled={busy || !player || !buyIn}>
          {busy ? <span className="spinner" /> : 'Add to game'}
        </button>
      </form>
    </Sheet>
  );
}

function GuestSheet({ game, standard, onClose }: { game: Game; standard: number; onClose: () => void }) {
  const g = useGroup();
  const toast = useToast();
  const [name, setName] = useState('');
  const [buyIn, setBuyIn] = useState<number | null>(standard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet title="Add a guest" onClose={busy ? () => undefined : onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !buyIn || busy) return;
          setBusy(true);
          setError(null);
          try {
            const id = await rpc<string>('add_player', { p_group: g.group.id, p_name: name, p_guest: true });
            await rpc('live_join', { p_game: game.id, p_player: id, p_buy_in: buyIn });
            await g.reload();
            toast.show(`${name.trim()} joined as a guest`);
            onClose();
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="guest-name">Guest's name</label>
          <input id="guest-name" className="input" maxLength={40} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam (Ben's cousin)" />
          <span className="hint">For someone playing tonight who isn't part of the group. No account needed. Their money still counts, but they're left off the leaderboard.</span>
        </div>
        <MoneyInput id="guest-buyin" label="Buy-in" value={buyIn} onChange={setBuyIn} />
        <ErrorBanner error={error} />
        <button className="btn primary block" disabled={busy || !name.trim() || !buyIn}>
          {busy ? <span className="spinner" /> : name.trim() ? `Add ${name.trim()}` : 'Add guest'}
        </button>
      </form>
    </Sheet>
  );
}

function AmountSheet({
  title,
  label,
  initial,
  hint,
  allowZero,
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  initial: number | null;
  hint?: string;
  allowZero?: boolean;
  onClose: () => void;
  onSave: (pence: number) => Promise<void>;
}) {
  const [amt, setAmt] = useState<number | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = amt !== null && (allowZero ? amt >= 0 : amt > 0);
  return (
    <Sheet title={title} onClose={busy ? () => undefined : onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          try {
            await onSave(amt!);
            onClose();
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        <MoneyInput id="amount-sheet" label={label} value={amt} onChange={setAmt} autoFocus />
        {hint && <p className="hint">{hint}</p>}
        <ErrorBanner error={error} />
        <button className="btn primary block" disabled={busy || !valid}>
          {busy ? <span className="spinner" /> : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}
