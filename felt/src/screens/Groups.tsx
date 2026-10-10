import { useEffect, useState } from 'react';
import { supabase, rpc, select } from '../supabase';
import { navigate } from '../router';
import { useSession } from '../session';
import { setCachedAvatar, useOptionalGroupState } from '../data';
import { Avatar, Banner, Empty, ErrorBanner, PageLoading, SectionTitle, Skeleton, photoToAvatar, useToast } from '../ui';
import { errorMessage } from '../errors';
import type { Group, Role } from '../types';

const PENDING_INVITE = 'felt.pendingInvite';
export const LAST_GROUP = 'felt.lastGroup';

export function rememberInvite(code: string | null) {
  try {
    if (code) localStorage.setItem(PENDING_INVITE, code);
    else localStorage.removeItem(PENDING_INVITE);
  } catch {
    /* storage unavailable */
  }
}
function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE);
  } catch {
    return null;
  }
}

type MyGroup = { role: Role; groups: Group };

export function GroupsScreen() {
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { session } = useSession();

  const load = async () => {
    setError(null);
    try {
      const rows = await select<MyGroup[]>(
        supabase.from('group_members').select('role, groups(*)').eq('user_id', session!.user.id),
      );
      const real = rows.filter((r) => r.groups && !r.groups.is_sample);
      // Arriving fresh with exactly one group: go straight to it.
      if (window.location.hash.includes('?auto') && real.length === 1) {
        navigate(`/g/${real[0].groups.id}`, true);
        return;
      }
      setGroups(rows.filter((r) => r.groups).sort((a, b) => Number(a.groups.is_sample) - Number(b.groups.is_sample) || a.groups.name.localeCompare(b.groups.name)));
    } catch (e) {
      setError(e);
    }
  };

  useEffect(() => {
    const code = pendingInvite();
    if (code) {
      navigate(`/join/${code}`, true);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack-lg narrow" style={{ margin: '0 auto' }}>
      <div className="stack-sm">
        <h1>Your groups</h1>
        <p className="muted">Each group keeps its own players, games and payments. Only members can see them.</p>
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {!groups && !error && <Skeleton count={2} />}
      {groups && groups.length === 0 && (
        <Empty title="No groups yet">Create a group for your poker night, or open the invite link a friend sent you.</Empty>
      )}
      {groups && groups.length > 0 && (
        <ul className="list card flush">
          {groups.map(({ role, groups: g }) => (
            <li key={g.id}>
              <a className="list-item" href={`#/g/${g.id}`}>
                <span className="avatar" aria-hidden>
                  {g.is_sample ? '★' : '♠'}
                </span>
                <span className="grow">
                  <span className="row" style={{ gap: 8 }}>
                    <b className="ellipsis">{g.name}</b>
                    {g.is_sample && <span className="badge sample">Sample</span>}
                  </span>
                  <span className="small muted">{role === 'admin' ? 'Admin' : 'Member'}</span>
                </span>
                <span className="chevron">›</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <a className="btn primary" href="#/new">
          Create a group
        </a>
      </div>
      <JoinByCode />
      {groups && !groups.some((g) => g.groups.is_sample) && <SampleGroup />}
      <AccountCard />
    </div>
  );
}

function JoinByCode() {
  const [code, setCode] = useState('');
  return (
    <details className="card">
      <summary>Have an invite code instead of a link?</summary>
      <form
        className="row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().split('/').pop() ?? '';
          if (c) navigate(`/join/${c}`);
        }}
      >
        <input className="input grow" placeholder="Paste the link or code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Invite code" />
        <button className="btn">Open</button>
      </form>
    </details>
  );
}

function SampleGroup() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="card stack-sm">
      <h3>Just looking?</h3>
      <p className="small muted">
        Create a separate sample group filled with made-up demo games. It is labelled <span className="badge sample">Sample</span> everywhere and never mixes with
        real groups. You can delete it any time.
      </p>
      <button
        className="btn small"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const id = await rpc<string>('create_sample_group');
            navigate(`/g/${id}`);
          } catch (e) {
            toast.show(errorMessage(e), 'error');
            setBusy(false);
          }
        }}
      >
        {busy ? <span className="spinner" /> : 'Explore a sample group'}
      </button>
    </div>
  );
}

export function AccountCard() {
  const { session, displayName, avatarUrl, refreshProfile } = useSession();
  const [photoBusy, setPhotoBusy] = useState(false);
  const groupState = useOptionalGroupState();
  const refreshAll = async () => {
    await refreshProfile();
    await groupState?.reload();
  };
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => setName(displayName), [displayName]);
  return (
    <div className="stack-sm">
      <SectionTitle title="Your account" />
      <div className="card stack">
        <div className="row" style={{ gap: 16 }}>
          <Avatar name={displayName || '?'} src={avatarUrl} size={72} />
          <div className="stack-sm grow">
            <label className="btn small" style={{ alignSelf: 'flex-start' }}>
              {photoBusy ? <span className="spinner" /> : avatarUrl ? 'Change photo' : 'Add a profile picture'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoBusy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setPhotoBusy(true);
                  try {
                    const image = await photoToAvatar(file);
                    await rpc('update_my_avatar', { p_image: image });
                    setCachedAvatar(session!.user.id, image);
                    await refreshAll();
                    toast.show('Profile picture updated');
                  } catch (err) {
                    toast.show(errorMessage(err), 'error');
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
            </label>
            {avatarUrl && (
              <button
                className="btn ghost small"
                style={{ alignSelf: 'flex-start' }}
                disabled={photoBusy}
                onClick={async () => {
                  setPhotoBusy(true);
                  try {
                    await rpc('update_my_avatar', { p_image: null });
                    setCachedAvatar(session!.user.id, null);
                    await refreshAll();
                  } catch (err) {
                    toast.show(errorMessage(err), 'error');
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              >
                Remove photo
              </button>
            )}
            <span className="tiny faint">Only people in your groups can see it.</span>
          </div>
        </div>
        <p className="small muted">Signed in as {session?.user.email}</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await rpc('update_my_profile', { p_display_name: name });
              await refreshAll();
              toast.show('Name updated');
            } catch (err) {
              toast.show(errorMessage(err), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field grow">
            <label htmlFor="display-name">Your name</label>
            <input id="display-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn" style={{ alignSelf: 'flex-end' }} disabled={busy || !name.trim() || name.trim() === displayName}>
            Save
          </button>
        </form>
        <button
          className="btn danger"
          onClick={async () => {
            await supabase.auth.signOut();
            try {
              localStorage.removeItem(LAST_GROUP);
            } catch {
              /* ignore */
            }
            navigate('/groups', true);
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}



export function CreateGroupScreen() {
  const { displayName } = useSession();
  const [name, setName] = useState('');
  const [players, setPlayers] = useState<string[]>(['']);
  const [claim, setClaim] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (displayName && players[0] === '') setPlayers((p) => [displayName, ...p.slice(1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const trimmed = players.map((p) => p.trim());
  const dupes = trimmed.filter((p, i) => p && trimmed.findIndex((q) => q.toLowerCase() === p.toLowerCase()) !== i);

  return (
    <form
      className="stack-lg narrow"
      style={{ margin: '0 auto' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError('');
        const names = trimmed.filter(Boolean);
        if (!name.trim()) return setError('Give your group a name.');
        if (names.length < 1) return setError('Add yourself as a player.');
        if (dupes.length) return setError(`Two players are called "${dupes[0]}". Names must be different.`);
        setBusy(true);
        try {
          const claimName = trimmed[claim];
          const claimIndex = claimName ? names.indexOf(claimName) + 1 : null;
          const id = await rpc<string>('create_group', { p_name: name, p_player_names: names, p_claim_index: claimIndex });
          navigate(`/g/${id}/invite`, true);
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <div className="stack-sm">
        <a href="#/groups" className="small">
          ‹ Your groups
        </a>
        <h1>Create a group</h1>
        <p className="muted">You'll be the group's admin. You can rename players, add more and invite friends afterwards.</p>
      </div>
      <div className="field">
        <label htmlFor="gname">Group name</label>
        <input id="gname" className="input" placeholder="e.g. Thursday Night Poker" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="stack">
        <SectionTitle title="Players" />
        <p className="small muted">
          Just you is fine. Friends add themselves when they join with your invite link, or you can add their names now. The ♠ marks your own player.
        </p>
        {players.map((p, i) => (
          <div className="row" key={i}>
            <button
              type="button"
              className={`icon-btn`}
              style={{ color: claim === i ? 'var(--lime)' : undefined, border: '1px solid var(--border)' }}
              aria-pressed={claim === i}
              aria-label={`This is me: ${p || `player ${i + 1}`}`}
              onClick={() => setClaim(claim === i ? -1 : i)}
            >
              {claim === i ? '♠' : '♤'}
            </button>
            <input
              className={`input grow ${dupes.includes(p.trim()) ? 'invalid' : ''}`}
              aria-label={`Player ${i + 1} name`}
              maxLength={40}
              value={p}
              onChange={(e) => setPlayers(players.map((q, j) => (j === i ? e.target.value : q)))}
            />
            {players.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${p}`}
                onClick={() => {
                  setPlayers(players.filter((_, j) => j !== i));
                  if (claim === i) setClaim(-1);
                  else if (claim > i) setClaim(claim - 1);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setPlayers([...players, ''])}>
          + Add player
        </button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <button className="btn primary block" disabled={busy}>
        {busy ? <span className="spinner" /> : 'Create group'}
      </button>
    </form>
  );
}

type Preview = { group_id: string; name: string; member_count: number; is_sample: boolean; already_member: boolean };

export function JoinScreen({ code, gameId }: { code: string; gameId?: string }) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rememberInvite(null);
    rpc<Preview[]>('preview_invite', { p_code: code })
      .then((rows) => setPreview(rows[0] ?? null))
      .catch(setError);
  }, [code]);

  if (error) return <ErrorBanner error={error} />;
  if (preview === undefined) return <PageLoading label="Checking invite…" />;
  if (preview === null)
    return (
      <Empty title="Invite link not valid" action={<a className="btn" href="#/groups">Go to your groups</a>}>
        The link may have been replaced by a newer one. Ask a group admin to send the current invite link.
      </Empty>
    );
  return (
    <div className="stack-lg narrow" style={{ margin: '0 auto' }}>
      <div className="card felt stack center" style={{ padding: 28 }}>
        <div style={{ fontSize: '2rem' }} aria-hidden>
          ♠
        </div>
        <p className="small" style={{ opacity: 0.85 }}>
          You're invited to join
        </p>
        <h1>{preview.name}</h1>
        <p className="small" style={{ opacity: 0.85 }}>
          {preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
          {preview.is_sample && ' · sample group'}
        </p>
      </div>
      {preview.already_member ? (
        <a className="btn primary block" href={gameId ? `#/g/${preview.group_id}/games/${gameId}` : `#/g/${preview.group_id}`}>
          You're already a member. Open group
        </a>
      ) : (
        <button
          className="btn primary block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const id = await rpc<string>('join_group', { p_code: code });
              navigate(gameId ? `/g/${id}/games/${gameId}` : `/g/${id}/group?claim`, true);
            } catch (e) {
              setError(e);
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="spinner" /> : 'Join group'}
        </button>
      )}
      <a className="btn ghost" href="#/groups">
        Not now
      </a>
    </div>
  );
}
