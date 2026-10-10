import { useEffect, useState } from 'react';
import { supabase, rpc, select } from '../supabase';
import { useGroup } from '../data';
import { navigate } from '../router';
import { errorMessage } from '../errors';
import { toCSV, penceToDecimal } from '../lib/csv';
import { validateBackup, type BackupSummary } from '../lib/backup';
import { entryProfit, totalIn } from '../lib/stats';
import { Banner, Confirm, ErrorBanner, SectionTitle, Sheet, Skeleton, Avatar, download, formatDate, formatDateTime, todayISO, useToast } from '../ui';
import { AccountCard } from './Groups';
import { InviteCard, inviteLink } from './Invite';
import { AddMeButton } from './Overview';
import type { AuditRow, Member, Player } from '../types';

export function GroupSettings() {
  const g = useGroup();
  const wantsClaim = window.location.hash.includes('?claim');
  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <h1 className="grow">{g.group.name}</h1>
          {g.group.is_sample && <span className="badge sample">Sample</span>}
        </div>
        <p className="small muted">You are {g.me.isAdmin ? 'an admin' : 'a member'} of this group.</p>
      </div>
      {g.group.is_sample && (
        <Banner tone="warn">This is a sample group with made-up demo data. It's kept separate from your real groups. Delete it below when you're done.</Banner>
      )}
      {wantsClaim && !g.me.player && <Banner tone="ok">Welcome! Find your name below and tap “This is me” so your results are linked to you.</Banner>}
      <div className="two-col stack-lg">
        <div className="stack-lg">
          <PlayersSection />
        </div>
        <div className="stack-lg">
          <InviteSection />
          <MembersSection />
        </div>
      </div>
      {g.me.isAdmin && <AdminTools />}
      <ActivitySection />
      <LeaveSection />
      <AccountCard />
    </div>
  );
}

function InviteSection() {
  const g = useGroup();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack-sm">
      <SectionTitle title="Invite friends" />
      <div className="card stack">
        <p className="small muted">Send this link to your friends. They create their own account, join, then claim or add their player.</p>
        <InviteCard link={inviteLink(g.group.invite_code)} message={`Join our poker group "${g.group.name}" on Felt`} showQr={false} />
        {g.me.isAdmin && (
          <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>
            Replace link (stops the old one working)
          </button>
        )}
      </div>
      {confirm && (
        <Confirm
          title="Replace the invite link?"
          confirmLabel="Replace link"
          tone="danger"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await rpc('regenerate_invite', { p_group: g.group.id });
            await g.reload();
            toast.show('New invite link created');
          }}
        >
          <p className="muted">Anyone with the old link won't be able to join. Existing members are not affected.</p>
        </Confirm>
      )}
    </div>
  );
}

function MembersSection() {
  const g = useGroup();
  const toast = useToast();
  const [action, setAction] = useState<{ kind: 'promote' | 'demote' | 'remove'; member: Member } | null>(null);
  const members = [...g.members].sort((a, b) => (a.role === b.role ? g.personName(a.user_id).localeCompare(g.personName(b.user_id)) : a.role === 'admin' ? -1 : 1));
  return (
    <div className="stack-sm">
      <SectionTitle title={`Members (${members.length})`} />
      <ul className="list card flush">
        {members.map((m) => {
          const name = g.personName(m.user_id);
          const player = g.players.find((p) => p.claimed_by === m.user_id);
          const me = m.user_id === g.me.userId;
          return (
            <li key={m.user_id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <Avatar name={name} src={g.avatarForUser(m.user_id)} />
              <span className="grow">
                <span className="row" style={{ gap: 6 }}>
                  <b className="ellipsis">{name}</b>
                  {me && <span className="badge lime">You</span>}
                  {m.role === 'admin' && <span className="badge green">Admin</span>}
                </span>
                <span className="small muted">{player ? `Plays as ${player.name}` : 'Has not claimed a player'}</span>
              </span>
              {g.me.isAdmin && !me && (
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn small" onClick={() => setAction({ kind: m.role === 'admin' ? 'demote' : 'promote', member: m })}>
                    {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button className="icon-btn" aria-label={`Remove ${name} from group`} onClick={() => setAction({ kind: 'remove', member: m })}>
                    ✕
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {action && (
        <Confirm
          title={
            action.kind === 'promote'
              ? `Make ${g.personName(action.member.user_id)} an admin?`
              : action.kind === 'demote'
                ? `Remove ${g.personName(action.member.user_id)}'s admin rights?`
                : `Remove ${g.personName(action.member.user_id)} from the group?`
          }
          confirmLabel={action.kind === 'promote' ? 'Make admin' : action.kind === 'demote' ? 'Remove admin' : 'Remove'}
          tone={action.kind === 'promote' ? 'primary' : 'danger'}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            if (action.kind === 'remove') await rpc('remove_member', { p_group: g.group.id, p_user: action.member.user_id });
            else await rpc('set_member_role', { p_group: g.group.id, p_user: action.member.user_id, p_role: action.kind === 'promote' ? 'admin' : 'member' });
            await g.reload();
            toast.show('Done');
          }}
        >
          <p className="muted">
            {action.kind === 'promote' && 'Admins can finalise and correct games, confirm payments, manage members and restore backups.'}
            {action.kind === 'demote' && 'They will stay in the group as a member.'}
            {action.kind === 'remove' && 'They lose access to this group. Their player and past results stay, and the player becomes unclaimed.'}
          </p>
        </Confirm>
      )}
    </div>
  );
}

function PlayersSection() {
  const g = useGroup();
  const toast = useToast();
  const [editing, setEditing] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [claiming, setClaiming] = useState<Player | null>(null);
  const [unclaiming, setUnclaiming] = useState<Player | null>(null);
  const players = [...g.players].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <div className="stack-sm">
      <SectionTitle title={`Players (${g.players.length})`} action={<button className="btn ghost small" onClick={() => setAdding(true)}>+ Add</button>} />
      <ul className="list card flush">
        {players.map((p) => {
          const mine = p.claimed_by === g.me.userId;
          const canEdit = g.me.isAdmin || mine;
          return (
            <li key={p.id} className="list-item" style={{ opacity: p.active ? 1 : 0.55 }}>
              <Avatar name={p.name} src={g.avatarForPlayer(p.id)} />
              <span className="grow">
                <span className="row" style={{ gap: 6 }}>
                  <b className="ellipsis">{p.name}</b>
                  {mine && <span className="badge lime">You</span>}
                  {!p.active && <span className="badge">Archived</span>}
                  {p.is_guest && <span className="badge">Guest</span>}
                </span>
                <span className="small muted">{p.claimed_by ? (mine ? 'Claimed by you' : `Claimed by ${g.personName(p.claimed_by)}`) : 'Not claimed yet'}</span>
              </span>
              {!p.claimed_by && !g.me.player && (
                <button className="btn primary small" onClick={() => setClaiming(p)}>
                  This is me
                </button>
              )}
              {p.claimed_by && (mine || g.me.isAdmin) && (
                <button className="btn ghost small" onClick={() => setUnclaiming(p)}>
                  Unclaim
                </button>
              )}
              {canEdit && (
                <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                  ✎
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!g.me.player && (
        <div className="card stack-sm">
          <b>Not on the list?</b>
          <span className="small muted">Add yourself as a new player, or tap “This is me” next to your name above.</span>
          <div>
            <AddMeButton />
          </div>
        </div>
      )}
      <p className="tiny faint">
        Anyone can add a player. Guests play in games without being part of the group and are left off the leaderboard; if they join later they can
        claim their guest player. Archived players stay in past results but are hidden when recording new games.
      </p>

      {adding && <PlayerSheet onClose={() => setAdding(false)} />}
      {editing && <PlayerSheet player={editing} onClose={() => setEditing(null)} />}
      {claiming && (
        <Confirm
          title={`Are you ${claiming.name}?`}
          confirmLabel="Yes, that's me"
          onClose={() => setClaiming(null)}
          onConfirm={async () => {
            await rpc('claim_player', { p_player: claiming.id });
            await g.reload();
            toast.show(`You're now linked to ${claiming.name}`);
          }}
        >
          <p className="muted">All of {claiming.name}'s past and future results will be linked to your account.</p>
        </Confirm>
      )}
      {unclaiming && (
        <Confirm
          title={`Unclaim ${unclaiming.name}?`}
          confirmLabel="Unclaim"
          tone="danger"
          onClose={() => setUnclaiming(null)}
          onConfirm={async () => {
            await rpc('unclaim_player', { p_player: unclaiming.id });
            await g.reload();
          }}
        >
          <p className="muted">The player and their results stay. They're just no longer linked to an account, so someone else can claim them.</p>
        </Confirm>
      )}
    </div>
  );
}

function PlayerSheet({ player, onClose }: { player?: Player; onClose: () => void }) {
  const g = useGroup();
  const toast = useToast();
  const [name, setName] = useState(player?.name ?? '');
  const [active, setActive] = useState(player?.active ?? true);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet title={player ? `Edit ${player.name}` : 'Add a player'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            if (player) await rpc('update_player', { p_player: player.id, p_name: name, p_active: g.me.isAdmin ? active : null });
            else await rpc('add_player', { p_group: g.group.id, p_name: name, p_guest: guest });
            await g.reload();
            toast.show(player ? 'Player updated' : `${name.trim()} added`);
            onClose();
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="player-name">Name</label>
          <input id="player-name" className="input" maxLength={40} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!player && (
          <label className="row" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={guest} onChange={(e) => setGuest(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span>Guest: just playing, not part of the group (left off the leaderboard)</span>
          </label>
        )}
        {player && g.me.isAdmin && (
          <label className="row" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} style={{ width: 22, height: 22 }} />
            <span>Archive (hide from new games; results are kept)</span>
          </label>
        )}
        <ErrorBanner error={error} />
        <button className="btn primary block" disabled={busy || !name.trim()}>
          {busy ? <span className="spinner" /> : player ? 'Save' : 'Add player'}
        </button>
      </form>
    </Sheet>
  );
}

function AdminTools() {
  const g = useGroup();
  const toast = useToast();
  const [restore, setRestore] = useState<{ data: unknown; summary: BackupSummary } | null>(null);
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const slug = g.group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'felt';

  function exportCSV() {
    const rows = g.games
      .filter((x) => x.status === 'final')
      .slice()
      .reverse()
      .flatMap((game) =>
        game.entries.map((e) => [
          game.played_on,
          game.name,
          g.playerName(e.player_id),
          penceToDecimal(e.buy_in_pence),
          penceToDecimal(totalIn(e) - e.buy_in_pence),
          e.rebuys_pence.length,
          penceToDecimal(totalIn(e)),
          penceToDecimal(e.cash_out_pence ?? 0),
          penceToDecimal(entryProfit(e)),
        ]),
      );
    const csv = toCSV(['Date', 'Game', 'Player', 'Buy-in (£)', 'Rebuys (£)', 'Rebuy count', 'Total in (£)', 'Cash-out (£)', 'Profit (£)'], rows);
    download(`${slug}-results-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function exportJSON() {
    setBusy(true);
    try {
      const backup = await rpc('export_backup', { p_group: g.group.id });
      download(`${slug}-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <SectionTitle title="Admin tools" />
      <div className="card stack">
        <div className="stack-sm">
          <b>Export</b>
          <p className="small muted">A CSV of every finalised result for spreadsheets, or a full JSON backup of players, games and payments.</p>
          <div className="btn-row">
            <button className="btn" onClick={exportCSV}>
              Results CSV
            </button>
            <button className="btn" onClick={exportJSON} disabled={busy}>
              {busy ? <span className="spinner" /> : 'JSON backup'}
            </button>
          </div>
        </div>
        <div className="divider" />
        <div className="stack-sm">
          <b>Restore from a backup</b>
          <p className="small muted">
            Replaces this group's players, games and payments with a Felt JSON backup. Members and the activity log are kept. The file is checked first and
            nothing changes if anything is wrong.
          </p>
          <label className="btn" style={{ alignSelf: 'flex-start' }}>
            Choose backup file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setRestoreErrors([]);
                try {
                  if (file.size > 5_000_000) throw new Error('That file is too large to be a Felt backup.');
                  const data = JSON.parse(await file.text());
                  const check = validateBackup(data);
                  if (check.ok) setRestore({ data, summary: check.summary });
                  else setRestoreErrors(check.errors);
                } catch (err) {
                  setRestoreErrors([err instanceof SyntaxError ? "That file isn't valid JSON." : errorMessage(err)]);
                }
              }}
            />
          </label>
          {restoreErrors.length > 0 && (
            <Banner tone="error">
              <b>This backup can't be restored:</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {restoreErrors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Banner>
          )}
        </div>
        {g.group.is_sample && (
          <>
            <div className="divider" />
            <DeleteSample />
          </>
        )}
      </div>
      {restore && (
        <Confirm
          title="Restore this backup?"
          confirmLabel="Restore"
          tone="danger"
          requireText="RESTORE"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            await rpc('restore_backup', { p_group: g.group.id, p_backup: restore.data });
            await g.reload();
            toast.show('Backup restored');
          }}
        >
          <div className="card stack-sm small">
            <span>
              From <b>{restore.summary.groupName}</b>
              {restore.summary.exportedAt && `, saved ${formatDateTime(restore.summary.exportedAt)}`}
            </span>
            <span className="muted">
              {restore.summary.players} players · {restore.summary.games} games ({restore.summary.finalGames} final) · {restore.summary.payments} payments
            </span>
          </div>
          <Banner tone="warn">
            Everything currently in <b>{g.group.name}</b> will be replaced. Download a JSON backup first if you might want it back. People will need to re-claim
            players whose accounts aren't in this group.
          </Banner>
        </Confirm>
      )}
    </div>
  );
}

function DeleteSample() {
  const g = useGroup();
  const [open, setOpen] = useState(false);
  return (
    <div className="stack-sm">
      <b>Delete sample group</b>
      <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Delete sample group
      </button>
      {open && (
        <Confirm
          title="Delete the sample group?"
          confirmLabel="Delete"
          tone="danger"
          onClose={() => setOpen(false)}
          onConfirm={async () => {
            await rpc('delete_sample_group', { p_group: g.group.id });
            navigate('/groups', true);
          }}
        >
          <p className="muted">All the demo data goes. Your real groups are not affected.</p>
        </Confirm>
      )}
    </div>
  );
}

const ACTIONS: Record<string, string> = {
  'group.created': 'created the group',
  'group.renamed': 'renamed the group',
  'member.joined': 'joined',
  'member.left': 'left the group',
  'member.removed': 'removed a member',
  'member.role_changed': 'changed a member’s role',
  'invite.regenerated': 'replaced the invite link',
  'player.added': 'added a player',
  'player.updated': 'edited a player',
  'player.claimed': 'claimed a player',
  'player.unclaimed': 'unclaimed a player',
  'game.draft_created': 'submitted a draft game',
  'game.draft_deleted': 'deleted a draft',
  'game.finalised': 'finalised a game',
  'game.corrected': 'corrected a finalised game',
  'game.voided': 'voided a game',
  'payment.recorded_pending': 'recorded a payment',
  'payment.recorded_confirmed': 'recorded and confirmed a payment',
  'payment.confirmed': 'completed confirming a payment',
  'payment.rejected': 'rejected a payment',
  'payment.voided': 'voided a payment',
  'backup.restore_started': 'started a restore (previous data saved)',
  'backup.restored': 'restored a backup',
  'sample.created': 'created the sample data',
};

function describe(row: AuditRow, playerName: (id: string) => string): string {
  const d = row.detail as Record<string, unknown>;
  const verb = ACTIONS[row.action] ?? row.action;
  const name = (d.name as string) ?? ((d.after as { name?: string })?.name || (d.before as { name?: string })?.name);
  if (row.action.startsWith('payment.') && typeof d.amount_pence === 'number') {
    const amt = `£${(d.amount_pence / 100).toFixed(2)}`;
    return d.from && d.to ? `${verb}: ${playerName(d.from as string)} → ${playerName(d.to as string)} ${amt}` : `${verb} of ${amt}`;
  }
  if (row.action === 'player.updated' && d.from !== d.to) return `${verb}: ${d.from} → ${d.to}`;
  return name ? `${verb}: ${name}` : verb;
}

function ActivitySection() {
  const g = useGroup();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [limit, setLimit] = useState(25);
  useEffect(() => {
    select<AuditRow[]>(
      supabase.from('audit_log').select('*').eq('group_id', g.group.id).neq('action', 'backup.restore_started').order('created_at', { ascending: false }).limit(limit),
    )
      .then(setRows)
      .catch(setError);
  }, [g.group.id, limit, g.games, g.payments]);
  return (
    <div className="stack-sm">
      <SectionTitle title="Activity log" />
      <p className="tiny faint">Every change to games, payments and membership is recorded here and can't be edited.</p>
      <ErrorBanner error={error} />
      {!rows && !error && <Skeleton count={3} height={44} />}
      {rows && (
        <ul className="list card flush">
          {rows.map((r) => (
            <li key={r.id} className="list-item small" style={{ minHeight: 0, alignItems: 'flex-start' }}>
              <span className="grow">
                <b>{r.actor_name ?? 'Someone'}</b> {describe(r, g.playerName)}
                {r.reason && <span className="muted"> · “{r.reason}”</span>}
                <div className="tiny faint">{formatDateTime(r.created_at)}</div>
              </span>
              {r.entity === 'game' && r.entity_id && g.games.some((x) => x.id === r.entity_id) && (
                <a href={`#/g/${g.group.id}/games/${r.entity_id}`} className="small">
                  View
                </a>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="list-item muted">Nothing yet.</li>}
        </ul>
      )}
      {rows && rows.length >= limit && (
        <button className="btn ghost" onClick={() => setLimit(limit + 50)}>
          Show more
        </button>
      )}
      <p className="tiny faint center">Group created {formatDate(g.group.created_at)}</p>
    </div>
  );
}

function LeaveSection() {
  const g = useGroup();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(g.group.name);
  const toast = useToast();
  return (
    <div className="stack-sm">
      <SectionTitle title="This group" />
      <div className="card stack">
        {g.me.isAdmin && (
          <button className="btn" onClick={() => setRenaming(true)}>
            Rename group
          </button>
        )}
        <button className="btn danger" onClick={() => setOpen(true)}>
          Leave group
        </button>
        {g.me.isAdmin && !g.group.is_sample && (
          <button className="btn danger" onClick={() => setDeleting(true)}>
            Delete group
          </button>
        )}
      </div>
      {deleting && (
        <Confirm
          title={`Delete ${g.group.name}?`}
          confirmLabel="Delete group"
          tone="danger"
          requireText="DELETE"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await rpc('delete_group', { p_group: g.group.id, p_confirm: 'DELETE' });
            try {
              localStorage.removeItem('felt.lastGroup');
            } catch {
              /* ignore */
            }
            navigate('/groups', true);
          }}
        >
          <Banner tone="error">
            This permanently deletes the group for everyone: all players, games, payments and the activity log. It can't be undone.
          </Banner>
          <p className="muted small">
            Want a copy first? Close this and use <b>Admin tools → JSON backup</b> above.
          </p>
        </Confirm>
      )}
      {renaming && (
        <Sheet title="Rename group" onClose={() => setRenaming(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await rpc('rename_group', { p_group: g.group.id, p_name: name });
                await g.reload();
                setRenaming(false);
              } catch (err) {
                toast.show(errorMessage(err), 'error');
              }
            }}
          >
            <input className="input" aria-label="Group name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn primary block" disabled={!name.trim()}>
              Save
            </button>
          </form>
        </Sheet>
      )}
      {open && (
        <Confirm
          title={`Leave ${g.group.name}?`}
          confirmLabel="Leave"
          tone="danger"
          onClose={() => setOpen(false)}
          onConfirm={async () => {
            await rpc('remove_member', { p_group: g.group.id, p_user: g.me.userId });
            navigate('/groups', true);
          }}
        >
          <p className="muted">You'll lose access until someone sends you an invite link again. Your results stay in the group.</p>
        </Confirm>
      )}
    </div>
  );
}
