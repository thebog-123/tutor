import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc } from '../supabase';
import { useGroup } from '../data';
import { navigate } from '../router';
import { toFeltError } from '../errors';
import { formatPence } from '../lib/money';
import { Banner, Empty, ErrorBanner, Money, MoneyInput, SectionTitle, Sheet, todayISO, useToast } from '../ui';
import type { Game } from '../types';

interface RowState {
  player_id: string;
  buy_in: number | null;
  rebuys: number[];
  cash_out: number | null;
}

interface EditorState {
  name: string;
  played_on: string;
  notes: string;
  standard: number | null;
  rows: RowState[];
  token: string;
}

const storageKey = (groupId: string) => `felt.newGame.${groupId}`;

function loadSaved(groupId: string): EditorState | null {
  try {
    const raw = localStorage.getItem(storageKey(groupId));
    return raw ? (JSON.parse(raw) as EditorState) : null;
  } catch {
    return null;
  }
}

function fromGame(game: Game): EditorState {
  return {
    name: game.name,
    played_on: game.played_on,
    notes: game.notes,
    standard: game.entries[0]?.buy_in_pence ?? 2000,
    rows: game.entries.map((e) => ({ player_id: e.player_id, buy_in: e.buy_in_pence, rebuys: [...e.rebuys_pence], cash_out: e.cash_out_pence })),
    token: crypto.randomUUID(),
  };
}

const rowIn = (r: RowState) => (r.buy_in ?? 0) + r.rebuys.reduce((a, b) => a + b, 0);

export function GameEditor({ gameId }: { gameId?: string }) {
  const g = useGroup();
  const toast = useToast();
  const groupId = g.group.id;
  const existing = gameId ? g.games.find((x) => x.id === gameId) : undefined;
  const mode: 'new' | 'draft' | 'correct' = !gameId ? 'new' : existing?.status === 'final' ? 'correct' : 'draft';

  const [state, setState] = useState<EditorState>(() => {
    if (existing) return fromGame(existing);
    const lastFinal = g.games.find((x) => x.status === 'final');
    return (
      loadSaved(groupId) ?? {
        name: 'Poker night',
        played_on: todayISO(),
        notes: '',
        standard: lastFinal?.entries[0]?.buy_in_pence ?? 2000,
        rows: [],
        token: crypto.randomUUID(),
      }
    );
  });
  const [version] = useState(existing?.version ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState(false);
  const [rebuyFor, setRebuyFor] = useState<string | null>(null);
  const restored = useRef(mode === 'new' && loadSaved(groupId) !== null);

  // Keep an unsent new game on this device so a refresh or lost signal doesn't lose it.
  useEffect(() => {
    if (mode !== 'new') return;
    try {
      localStorage.setItem(storageKey(groupId), JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state, mode, groupId]);

  const set = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));
  const setRow = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.player_id === id ? { ...r, ...patch } : r)) }));

  const selected = new Set(state.rows.map((r) => r.player_id));
  const available = g.players.filter((p) => p.active || selected.has(p.id));
  const totals = useMemo(() => {
    const tIn = state.rows.reduce((a, r) => a + rowIn(r), 0);
    const tOut = state.rows.reduce((a, r) => a + (r.cash_out ?? 0), 0);
    return { tIn, tOut, diff: tOut - tIn };
  }, [state.rows]);

  const problems: string[] = [];
  if (!state.name.trim()) problems.push('Give the game a name.');
  if (!state.played_on) problems.push('Pick the date.');
  else if (state.played_on > todayISO()) problems.push('The date cannot be in the future.');
  if (state.rows.length < 2) problems.push('Pick at least two players.');
  for (const r of state.rows) {
    const name = g.playerName(r.player_id);
    if (!r.buy_in) problems.push(`Enter ${name}'s buy-in.`);
    if (r.cash_out === null) problems.push(`Enter ${name}'s cash-out (use 0 if they lost everything).`);
  }
  const balanced = totals.diff === 0;

  if (gameId && !existing) {
    return <Empty title="Game not found" action={<a className="btn" href={`#/g/${groupId}/games`}>Back to games</a>} />;
  }
  if (mode === 'correct' && !g.me.isAdmin) {
    return <Banner tone="error">Only a group admin can correct a finalised game.</Banner>;
  }
  if (existing?.status === 'void') return <Banner tone="error">Voided games can't be edited.</Banner>;
  if (mode === 'draft' && existing && !g.me.isAdmin && existing.created_by !== g.me.userId) {
    return <Banner tone="error">Only the person who submitted this draft or an admin can edit it.</Banner>;
  }

  function togglePlayer(id: string) {
    if (selected.has(id)) set({ rows: state.rows.filter((r) => r.player_id !== id) });
    else set({ rows: [...state.rows, { player_id: id, buy_in: state.standard, rebuys: [], cash_out: null }] });
  }

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <a href={existing ? `#/g/${groupId}/games/${existing.id}` : `#/g/${groupId}/games`} className="small">
          ‹ {existing ? 'Back to game' : 'Games'}
        </a>
        <h1>{mode === 'new' ? 'Record a game' : mode === 'draft' ? 'Edit draft' : 'Correct results'}</h1>
        {mode === 'correct' && (
          <Banner tone="warn">You're changing a finalised game. The old and new numbers, and your reason, are kept in the history.</Banner>
        )}
        {restored.current && (
          <Banner tone="info">
            <div className="row-between wrap">
              <span>We restored the game you hadn't submitted yet.</span>
              <button
                className="btn small"
                onClick={() => {
                  restored.current = false;
                  set({ name: 'Poker night', played_on: todayISO(), notes: '', rows: [], token: crypto.randomUUID() });
                }}
              >
                Start again
              </button>
            </div>
          </Banner>
        )}
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="game-name">Game name</label>
          <input id="game-name" className="input" maxLength={80} value={state.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="entry-grid">
          <div className="field">
            <label htmlFor="game-date">Date</label>
            <input id="game-date" className="input" type="date" max={todayISO()} value={state.played_on} onChange={(e) => set({ played_on: e.target.value })} />
          </div>
          <MoneyInput id="standard" label="Standard buy-in" value={state.standard} onChange={(v) => set({ standard: v })} />
        </div>
        <div className="field">
          <label htmlFor="game-notes">Notes (optional)</label>
          <input id="game-notes" className="input" maxLength={500} value={state.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. at Ben's, 10p/20p blinds" />
        </div>
      </div>

      <div className="stack-sm">
        <SectionTitle title={`Who played? (${state.rows.length})`} />
        <div className="pill-toggle" role="group" aria-label="Players">
          {available.map((p) => (
            <button key={p.id} type="button" className={selected.has(p.id) ? 'on' : ''} aria-pressed={selected.has(p.id)} onClick={() => togglePlayer(p.id)}>
              {selected.has(p.id) ? '✓ ' : ''}
              {p.name}
            </button>
          ))}
          <a className="btn ghost small" href={`#/g/${groupId}/group`}>
            + Add a player
          </a>
        </div>
      </div>

      {state.rows.length > 0 && (
        <div className="entry-list stack">
          {state.rows.map((r) => {
            const name = g.playerName(r.player_id);
            const profit = r.cash_out === null ? null : r.cash_out - rowIn(r);
            return (
              <div className="entry-card" key={r.player_id}>
                <div className="row-between">
                  <b>{name}</b>
                  <span className="small">
                    {profit === null ? <span className="faint">Result —</span> : <Money pence={profit} sign />}
                  </span>
                </div>
                <div className="entry-grid">
                  <MoneyInput
                    id={`in-${r.player_id}`}
                    label="Buy-in"
                    value={r.buy_in}
                    invalid={showErrors && !r.buy_in}
                    onChange={(v) => setRow(r.player_id, { buy_in: v })}
                  />
                  <MoneyInput
                    id={`out-${r.player_id}`}
                    label="Cash-out"
                    placeholder="0.00"
                    value={r.cash_out}
                    invalid={showErrors && r.cash_out === null}
                    onChange={(v) => setRow(r.player_id, { cash_out: v })}
                  />
                </div>
                <div className="rebuys">
                  <span className="small muted">Rebuys:</span>
                  {r.rebuys.map((amt, i) => (
                    <span className="rebuy-chip" key={i}>
                      {formatPence(amt)}
                      <button
                        type="button"
                        aria-label={`Remove rebuy of ${formatPence(amt)}`}
                        onClick={() => setRow(r.player_id, { rebuys: r.rebuys.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="btn small"
                    disabled={!state.standard}
                    onClick={() => setRow(r.player_id, { rebuys: [...r.rebuys, state.standard!] })}
                  >
                    + {state.standard ? formatPence(state.standard) : 'Rebuy'}
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setRebuyFor(r.player_id)}>
                    Other
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state.rows.length === 0 && (
        <Empty title="Pick the players">Tap the names of everyone who played. Each gets the standard buy-in, which you can change.</Empty>
      )}

      {showErrors && problems.length > 0 && (
        <Banner tone="error">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="sticky-summary stack-sm">
        <div className="row-between small">
          <span className="muted">
            In <b className="num" style={{ color: 'var(--text)' }}>{formatPence(totals.tIn)}</b>
          </span>
          <span className="muted">
            Out <b className="num" style={{ color: 'var(--text)' }}>{formatPence(totals.tOut)}</b>
          </span>
          <span className={balanced ? 'pos' : 'neg'} aria-live="polite">
            <b>{balanced ? (state.rows.length ? '✓ Balanced' : '—') : `${formatPence(Math.abs(totals.diff))} ${totals.diff > 0 ? 'over' : 'short'}`}</b>
          </span>
        </div>
        <button
          className="btn primary block"
          onClick={() => {
            setShowErrors(true);
            if (problems.length === 0) setReview(true);
          }}
        >
          Review
        </button>
      </div>

      {rebuyFor && (
        <RebuySheet
          name={g.playerName(rebuyFor)}
          onClose={() => setRebuyFor(null)}
          onAdd={(amt) => {
            const row = state.rows.find((r) => r.player_id === rebuyFor)!;
            setRow(rebuyFor, { rebuys: [...row.rebuys, amt] });
            setRebuyFor(null);
          }}
        />
      )}

      {review && (
        <ReviewSheet
          mode={mode}
          state={state}
          balanced={balanced}
          diff={totals.diff}
          totalIn={totals.tIn}
          onClose={() => setReview(false)}
          onSubmit={async (finalise, reason) => {
            const entries = state.rows.map((r) => ({
              player_id: r.player_id,
              buy_in_pence: r.buy_in,
              rebuys_pence: r.rebuys,
              cash_out_pence: r.cash_out,
            }));
            let id = existing?.id;
            if (mode === 'correct') {
              await rpc('correct_game', {
                p_game: existing!.id, p_expected_version: version, p_name: state.name, p_played_on: state.played_on,
                p_notes: state.notes, p_entries: entries, p_reason: reason,
              });
            } else {
              const saved = await rpc<{ id: string; version: number }>('save_game_draft', {
                p_group: groupId, p_game: existing?.id ?? null, p_expected_version: version, p_name: state.name,
                p_played_on: state.played_on, p_notes: state.notes, p_entries: entries,
                p_client_token: mode === 'new' ? state.token : null,
              });
              id = saved.id;
              if (mode === 'new') {
                try {
                  localStorage.removeItem(storageKey(groupId));
                } catch {
                  /* ignore */
                }
              }
              if (finalise) await rpc('finalise_game', { p_game: saved.id, p_expected_version: saved.version });
            }
            await g.reload();
            toast.show(mode === 'correct' ? 'Correction saved' : finalise ? 'Game finalised' : 'Draft submitted for an admin to check');
            navigate(`/g/${groupId}/games/${id}`, true);
          }}
          onReload={async () => {
            await g.reload();
            navigate(`/g/${groupId}/games/${existing?.id ?? ''}`, true);
          }}
          playerName={g.playerName}
          isAdmin={g.me.isAdmin}
        />
      )}
    </div>
  );
}

function RebuySheet({ name, onClose, onAdd }: { name: string; onClose: () => void; onAdd: (pence: number) => void }) {
  const [amt, setAmt] = useState<number | null>(null);
  return (
    <Sheet title={`Rebuy for ${name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (amt) onAdd(amt);
        }}
      >
        <MoneyInput id="rebuy-amt" label="Amount" value={amt} onChange={setAmt} autoFocus />
        <button className="btn primary block" disabled={!amt}>
          Add rebuy
        </button>
      </form>
    </Sheet>
  );
}

function ReviewSheet({
  mode,
  state,
  balanced,
  diff,
  totalIn,
  onClose,
  onSubmit,
  onReload,
  playerName,
  isAdmin,
}: {
  mode: 'new' | 'draft' | 'correct';
  state: EditorState;
  balanced: boolean;
  diff: number;
  totalIn: number;
  onClose: () => void;
  onSubmit: (finalise: boolean, reason: string) => Promise<void>;
  onReload: () => Promise<void>;
  playerName: (id: string) => string;
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState<'draft' | 'final' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const rows = [...state.rows].sort((a, b) => (b.cash_out ?? 0) - rowIn(b) - ((a.cash_out ?? 0) - rowIn(a)));
  const conflict = error ? toFeltError(error).isConflict : false;

  const go = async (finalise: boolean) => {
    if (busy) return;
    setBusy(finalise ? 'final' : 'draft');
    setError(null);
    try {
      await onSubmit(finalise, reason.trim());
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };

  return (
    <Sheet title="Check before you submit" onClose={busy ? () => undefined : onClose}>
      <div className="stack">
        <p className="muted small">
          {state.name} · {state.played_on.split('-').reverse().join('/')}
        </p>
        <div className="card flush">
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
              {rows.map((r) => (
                <tr key={r.player_id}>
                  <td>{playerName(r.player_id)}</td>
                  <td>{formatPence(rowIn(r))}</td>
                  <td>{formatPence(r.cash_out ?? 0)}</td>
                  <td>
                    <Money pence={(r.cash_out ?? 0) - rowIn(r)} sign />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{formatPence(totalIn)}</td>
                <td>{formatPence(totalIn + diff)}</td>
                <td className={balanced ? 'pos' : 'neg'}>{balanced ? '✓' : formatPence(diff, { sign: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {balanced ? (
          <Banner tone="ok">Balanced: total cash-outs equal buy-ins plus rebuys.</Banner>
        ) : (
          <Banner tone="warn">
            Cash-outs are {formatPence(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than buy-ins plus rebuys.{' '}
            {mode === 'correct' ? 'Fix this before saving.' : 'You can save it as a draft, but it can only be finalised once it balances.'}
          </Banner>
        )}
        {mode === 'correct' && (
          <div className="field">
            <label htmlFor="reason">Reason for the correction</label>
            <input id="reason" className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dev's cash-out was £10 not £0" />
          </div>
        )}
        <ErrorBanner error={error} />
        {conflict && (
          <button className="btn block" onClick={onReload}>
            Load the latest version
          </button>
        )}
        {mode === 'correct' ? (
          <button className="btn primary block" disabled={!balanced || !reason.trim() || !!busy} onClick={() => go(false)}>
            {busy ? <span className="spinner" /> : 'Save correction'}
          </button>
        ) : (
          <div className="stack-sm">
            {isAdmin && (
              <button className="btn primary block" disabled={!balanced || !!busy} onClick={() => go(true)}>
                {busy === 'final' ? <span className="spinner" /> : 'Save and finalise'}
              </button>
            )}
            <button className={`btn block ${isAdmin ? '' : 'primary'}`} disabled={!!busy} onClick={() => go(false)}>
              {busy === 'draft' ? <span className="spinner" /> : isAdmin ? 'Save as draft' : mode === 'new' ? 'Submit draft' : 'Save draft'}
            </button>
            {!isAdmin && <p className="tiny faint center">A group admin will check and finalise it.</p>}
          </div>
        )}
        <button className="btn ghost" onClick={onClose} disabled={!!busy}>
          Keep editing
        </button>
      </div>
    </Sheet>
  );
}
