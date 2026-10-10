import { useMemo, useState } from 'react';
import { rpc } from '../supabase';
import { useGroup } from '../data';
import { simplifyDebts, type Transfer } from '../lib/settle';
import { formatPence } from '../lib/money';
import { Avatar, Banner, Confirm, Empty, ErrorBanner, Money, MoneyInput, SectionTitle, Sheet, formatDateTime, useToast } from '../ui';
import type { Payment } from '../types';
import { canReject, confirmableSides, needsMe, type Viewer } from '../lib/payments';

export function Payments() {
  const g = useGroup();
  const toast = useToast();
  const [recording, setRecording] = useState<{ from?: string; to?: string; amount?: number } | null>(null);
  const [action, setAction] = useState<{ kind: 'confirm' | 'reject' | 'void' | 'withdraw'; payment: Payment } | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');

  const { transfers, transferError } = useMemo(() => {
    try {
      return {
        transfers: simplifyDebts(g.balances.map((b) => ({ id: b.player_id, name: g.playerName(b.player_id), balance: b.balance_pence }))),
        transferError: null,
      };
    } catch (e) {
      return { transfers: [] as Transfer[], transferError: e };
    }
  }, [g]);

  const owing = g.balances.filter((b) => b.balance_pence !== 0).sort((a, b) => a.balance_pence - b.balance_pence);
  const maxAbs = Math.max(1, ...owing.map((b) => Math.abs(b.balance_pence)));
  const viewer: Viewer = { userId: g.me.userId, isAdmin: g.me.isAdmin, claimedBy: (id) => g.playersById.get(id)?.claimed_by ?? null };
  const pending = g.payments.filter((p) => p.status === 'pending').sort((a, b) => Number(needsMe(b, viewer)) - Number(needsMe(a, viewer)));
  const myPlayerId = g.me.player?.id;
  const history = g.payments.filter(
    (p) => p.status !== 'pending' && (historyFilter === 'all' || p.from_player === myPlayerId || p.to_player === myPlayerId),
  );

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Payments</h1>
        <p className="small muted">
          Felt doesn't move money. Pay each other by bank transfer or cash, then record it here. A payment only counts once both people confirm it: the one who paid and the one who was paid.
        </p>
      </div>

      <div className="two-col stack-lg">
        <div className="stack-sm">
          <SectionTitle title="Who owes whom" />
          <ErrorBanner error={transferError} />
          {transfers.length === 0 && !transferError ? (
            <Empty title="Everyone is square">Nobody owes anything from finalised games. Nice.</Empty>
          ) : (
            <ul className="list card flush">
              {transfers.map((t, i) => {
                const mine = t.from === myPlayerId || t.to === myPlayerId;
                return (
                  <li key={i} className="transfer" style={mine ? { background: 'rgba(195,227,95,0.05)' } : undefined}>
                    <span className="grow who">
                      <b>{g.playerName(t.from)}</b> pays <b>{g.playerName(t.to)}</b> <span className="amt">{formatPence(t.amount)}</span>
                    </span>
                    <button className="btn small" onClick={() => setRecording({ from: t.from, to: t.to, amount: t.amount })}>
                      {t.from === myPlayerId ? "I've paid" : t.to === myPlayerId ? "I've been paid" : 'Record'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {transfers.length > 1 && (
            <p className="tiny faint">
              The fewest payments that settle every balance. Paying a different person or a part amount is fine too: record what actually happened.
            </p>
          )}
        </div>

        <div className="stack-sm">
          <SectionTitle title="Balances" />
          {owing.length === 0 ? (
            <div className="card small muted">All balances are zero.</div>
          ) : (
            <ul className="list card flush">
              {owing.map((b) => (
                <li key={b.player_id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row-between">
                    <span className="row" style={{ gap: 10 }}>
                      <Avatar name={g.playerName(b.player_id)} src={g.avatarForPlayer(b.player_id)} size={28} />
                      {g.playerName(b.player_id)}
                      {b.player_id === myPlayerId && <span className="badge lime" style={{ marginLeft: 6 }}>You</span>}
                    </span>
                    <span className="small">
                      {b.balance_pence < 0 ? <span className="neg">owes {formatPence(-b.balance_pence)}</span> : <span className="pos">is owed {formatPence(b.balance_pence)}</span>}
                    </span>
                  </div>
                  <div className="balance-bar" aria-hidden>
                    <span style={{ width: `${(Math.abs(b.balance_pence) / maxAbs) * 100}%`, background: b.balance_pence < 0 ? 'var(--loss)' : 'var(--green)', opacity: 0.7 }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button className="btn block" onClick={() => setRecording({})}>
        Record a different payment
      </button>

      {pending.length > 0 && (
        <div className="stack-sm">
          <SectionTitle title={`Waiting for confirmation (${pending.length})`} />
          <ul className="list card flush">
            {pending.map((p) => {
              const sides = confirmableSides(p, viewer);
              const fromName = g.playerName(p.from_player);
              const toName = g.playerName(p.to_player);
              const unclaimed = (id: string) => !g.playersById.get(id)?.claimed_by;
              let confirmLabel = '';
              if (sides.payer && sides.payee) confirmLabel = `Confirm for ${fromName} and ${toName}`;
              else if (sides.payer) confirmLabel = unclaimed(p.from_player) ? `Confirm for ${fromName}` : 'Yes, I paid this';
              else if (sides.payee) confirmLabel = unclaimed(p.to_player) ? `Confirm for ${toName}` : 'Yes, I received this';
              return (
                <li key={p.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <PaymentLine p={p} />
                  {(confirmLabel || canReject(p, viewer)) && (
                    <div className="btn-row">
                      {confirmLabel && (
                        <button className="btn green small" onClick={() => setAction({ kind: 'confirm', payment: p })}>
                          {confirmLabel}
                        </button>
                      )}
                      {canReject(p, viewer) && (
                        <button className="btn danger small" onClick={() => setAction({ kind: 'reject', payment: p })}>
                          {p.recorded_by === g.me.userId ? 'Withdraw' : 'Reject'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="tiny faint">
            If a player hasn't joined Felt yet, a group admin can confirm for them.
          </p>
        </div>
      )}

      <div className="stack-sm">
        <SectionTitle
          title="Payment history"
          action={
            myPlayerId && (
              <div className="segmented" style={{ width: 180 }}>
                <button className={historyFilter === 'all' ? 'on' : ''} onClick={() => setHistoryFilter('all')}>
                  All
                </button>
                <button className={historyFilter === 'mine' ? 'on' : ''} onClick={() => setHistoryFilter('mine')}>
                  Mine
                </button>
              </div>
            )
          }
        />
        {history.length === 0 ? (
          <div className="card small muted">No payments recorded yet.</div>
        ) : (
          <ul className="list card flush">
            {history.map((p) => (
              <li key={p.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <PaymentLine p={p} />
                {p.status === 'confirmed' && g.me.isAdmin && (
                  <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setAction({ kind: 'void', payment: p })}>
                    Void this payment
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {recording && (
        <RecordPayment
          initial={recording}
          onClose={() => setRecording(null)}
          onDone={(confirmed) => {
            setRecording(null);
            toast.show(confirmed ? 'Payment confirmed. Balances updated.' : 'Recorded. It counts once the other person confirms it.');
          }}
        />
      )}

      {action && (
        <Confirm
          title={
            { confirm: 'Confirm this payment?', reject: 'Reject this payment?', withdraw: 'Withdraw this payment?', void: 'Void this payment?' }[action.kind]
          }
          confirmLabel={{ confirm: 'Confirm', reject: 'Reject', withdraw: 'Withdraw', void: 'Void payment' }[action.kind]}
          tone={action.kind === 'confirm' ? 'green' : 'danger'}
          reasonLabel={action.kind === 'void' ? 'Reason (kept in the history)' : undefined}
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            if (action.kind === 'confirm') await rpc('confirm_payment', { p_payment: action.payment.id });
            else await rpc('cancel_payment', { p_payment: action.payment.id, p_reason: reason });
            await g.reload();
            toast.show('Done');
          }}
        >
          <div className="card">
            <PaymentLine p={action.payment} />
          </div>
          {action.kind === 'confirm' && (
            <p className="muted small">
              Only confirm what really happened. Once both sides have confirmed, balances update (the leaderboard doesn't change).
            </p>
          )}
          {action.kind === 'void' && <p className="muted small">Use this if the payment was recorded by mistake or the transfer bounced. Balances will go back up.</p>}
        </Confirm>
      )}
    </div>
  );
}

function PaymentLine({ p }: { p: Payment }) {
  const g = useGroup();
  const status = {
    pending: <span className="badge warn">Pending</span>,
    confirmed: <span className="badge green">Confirmed</span>,
    rejected: <span className="badge">Rejected</span>,
    void: <span className="badge red">Void</span>,
  }[p.status];
  return (
    <div className="stack-sm" style={{ width: '100%' }}>
      <div className="row-between">
        <span style={p.status === 'rejected' || p.status === 'void' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
          <b>{g.playerName(p.from_player)}</b> paid <b>{g.playerName(p.to_player)}</b> <Money pence={p.amount_pence} className="lime" />
        </span>
        {status}
      </div>
      {p.note && <span className="small">“{p.note}”</span>}
      {(p.status === 'pending' || p.payer_confirmed_at) && (
        <span className="tiny">
          <span className={p.payer_confirmed_at ? 'pos' : 'faint'}>
            {p.payer_confirmed_at ? '✓' : '○'} {g.playerName(p.from_player)} paid
          </span>
          {'   '}
          <span className={p.payee_confirmed_at ? 'pos' : 'faint'}>
            {p.payee_confirmed_at ? '✓' : '○'} {g.playerName(p.to_player)} received
          </span>
        </span>
      )}
      <span className="tiny faint">
        Recorded by {g.personName(p.recorded_by)} · {formatDateTime(p.recorded_at)}
        {p.confirmed_at && p.confirmed_by && (
          <>
            <br />
            Fully confirmed · {formatDateTime(p.confirmed_at)}
          </>
        )}
        {p.closed_at && (
          <>
            <br />
            {p.status === 'void' ? 'Voided' : 'Closed'} by {g.personName(p.closed_by)} · {formatDateTime(p.closed_at)}
            {p.close_reason && ` · “${p.close_reason}”`}
          </>
        )}
      </span>
    </div>
  );
}

function RecordPayment({
  initial,
  onClose,
  onDone,
}: {
  initial: { from?: string; to?: string; amount?: number };
  onClose: () => void;
  onDone: (confirmed: boolean) => void;
}) {
  const g = useGroup();
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [amount, setAmount] = useState<number | null>(initial.amount ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [token] = useState(() => crypto.randomUUID());
  const fromBal = g.balances.find((b) => b.player_id === from)?.balance_pence ?? 0;
  const toBal = g.balances.find((b) => b.player_id === to)?.balance_pence ?? 0;
  const maxFits = Math.min(Math.max(-fromBal, 0), Math.max(toBal, 0));
  const tooMuch = amount !== null && from && to && amount > maxFits;
  const partial = initial.amount && amount !== null && amount < initial.amount && amount > 0;
  const options = [...g.players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sheet title="Record a payment" onClose={busy ? () => undefined : onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await rpc('record_payment', { p_group: g.group.id, p_from: from, p_to: to, p_amount_pence: amount, p_note: note, p_client_token: token });
            await g.reload();
            onDone(false);
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        <div className="entry-grid">
          <div className="field">
            <label htmlFor="pay-from">Who paid</label>
            <select id="pay-from" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pay-to">Who received it</label>
            <select id="pay-to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose…</option>
              {options
                .filter((p) => p.id !== from)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <MoneyInput id="pay-amt" label="Amount" value={amount} onChange={setAmount} />
        {from && to && (
          <p className="hint">
            {g.playerName(from)} owes {formatPence(Math.max(-fromBal, 0))}; {g.playerName(to)} is owed {formatPence(Math.max(toBal, 0))}.
            {partial && ' This is a part payment; the rest stays outstanding.'}
          </p>
        )}
        {tooMuch && <Banner tone="warn">That's more than is outstanding between them ({formatPence(maxFits)} at most), so it would be refused.</Banner>}
        <div className="field">
          <label htmlFor="pay-note">Note (optional)</label>
          <input id="pay-note" className="input" maxLength={200} value={note} placeholder="e.g. bank transfer, cash" onChange={(e) => setNote(e.target.value)} />
        </div>
        {from && to && (
          <Banner tone="info">
            This counts once both {g.playerName(from)} and {g.playerName(to)} confirm it.
            {(g.playersById.get(from)?.claimed_by === g.me.userId || g.playersById.get(to)?.claimed_by === g.me.userId) &&
              ' Recording it confirms your side.'}
          </Banner>
        )}
        <ErrorBanner error={error} />
        <button className="btn primary block" disabled={busy || !from || !to || !amount || from === to}>
          {busy ? <span className="spinner" /> : 'Record payment'}
        </button>
      </form>
    </Sheet>
  );
}
