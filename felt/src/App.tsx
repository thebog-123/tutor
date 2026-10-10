import { useEffect, type ReactNode } from 'react';
import { isConfigured } from './config';
import { useRoute, navigate } from './router';
import { useSession } from './session';
import { GroupProvider, useGroupState } from './data';
import { AuthScreen, NewPasswordScreen } from './screens/Auth';
import { CreateGroupScreen, GroupsScreen, JoinScreen, LAST_GROUP, rememberInvite } from './screens/Groups';
import { Overview } from './screens/Overview';
import { Leaderboard } from './screens/Leaderboard';
import { GameDetail, GamesList } from './screens/Games';
import { GameEditor } from './screens/GameEditor';
import { Payments } from './screens/Payments';
import { GroupSettings } from './screens/GroupSettings';
import { StartLiveGame } from './screens/LiveGame';
import { You, pendingActions } from './screens/You';
import { InviteScreen } from './screens/Invite';
import { Avatar } from './ui';
import { Banner, ErrorBanner, PageLoading, Skeleton } from './ui';
import { toFeltError } from './errors';

function lastGroup(): string | null {
  try {
    return localStorage.getItem(LAST_GROUP);
  } catch {
    return null;
  }
}

export function App() {
  const route = useRoute();
  const { session, recovering } = useSession();

  if (!isConfigured) return <SetupNeeded />;
  if (session === undefined) return <PageLoading label="Opening Felt…" />;
  if (recovering && session) return <NewPasswordScreen />;
  if (!session) {
    if (route[0] === 'join' && route[1]) rememberInvite(route.slice(1, 3).join('/'));
    return <AuthScreen invited={route[0] === 'join'} />;
  }

  const [section, id, ...rest] = route;
  if (section === 'g' && id) {
    return (
      <GroupProvider groupId={id} key={id}>
        <GroupShell groupId={id} rest={rest} />
      </GroupProvider>
    );
  }
  let body: ReactNode;
  if (section === 'join' && id) body = <JoinScreen code={id} gameId={rest[0]} />;
  else if (section === 'new') body = <CreateGroupScreen />;
  else if (section === 'groups') body = <GroupsScreen />;
  else body = <Redirect to={lastGroup() ? `/g/${lastGroup()}` : '/groups?auto'} />;
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/groups">
          <span className="suit">♠</span>Felt
        </a>
      </header>
      <main className="content no-tabs">{body}</main>
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]);
  return null;
}

const TABS: { key: string; label: string; icon: ReactNode }[] = [
  { key: '', label: 'Home', icon: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { key: 'leaderboard', label: 'Leaderboard', icon: <path d="M4 20V11h4v9M10 20V5h4v15M16 20v-6h4v6" /> },
  {
    key: 'games',
    label: 'Games',
    icon: (
      <>
        <rect x="4" y="3" width="12" height="16" rx="2" />
        <path d="M18 7l2 .5-3 13-7-1.7" />
        <path d="M10 8.5c-1.5 1.2-2.5 2-2.5 3.2a1.4 1.4 0 0 0 2.5.8 1.4 1.4 0 0 0 2.5-.8c0-1.2-1-2-2.5-3.2z" />
      </>
    ),
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: (
      <>
        <path d="M4 8h13l-3-3M20 16H7l3 3" />
      </>
    ),
  },
  {
    key: 'you',
    label: 'You',
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.8" />
        <path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" />
      </>
    ),
  },
];

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function GroupShell({ groupId, rest }: { groupId: string; rest: string[] }) {
  const { data, loading, error, reload } = useGroupState();
  const tab = rest[0] ?? '';
  const base = `#/g/${groupId}`;

  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem(LAST_GROUP, groupId);
      } catch {
        /* ignore */
      }
    }
  }, [data, groupId]);

  const notFound = error && toFeltError(error).code === 'FT404';
  useEffect(() => {
    if (notFound && lastGroup() === groupId) {
      try {
        localStorage.removeItem(LAST_GROUP);
      } catch {
        /* ignore */
      }
    }
  }, [notFound, groupId]);

  const attention = data ? pendingActions(data).count : 0;
  const { displayName, avatarUrl } = useSession();

  let body: ReactNode;
  if (loading && !data) body = <Skeleton count={4} height={88} />;
  else if (notFound)
    body = (
      <Banner tone="error">
        <div className="stack-sm">
          <span>This group doesn't exist or you're not a member. Ask a member for an invite link.</span>
          <a className="btn small" href="#/groups" style={{ alignSelf: 'flex-start' }}>
            Your groups
          </a>
        </div>
      </Banner>
    );
  else if (!data) body = <ErrorBanner error={error} onRetry={reload} />;
  else {
    if (tab === '') body = <Overview />;
    else if (tab === 'leaderboard') body = <Leaderboard />;
    else if (tab === 'games' && rest[1] === 'new') body = <GameEditor key="new" />;
    else if (tab === 'games' && rest[1] === 'live') body = <StartLiveGame />;
    else if (tab === 'games' && rest[1] && rest[2] === 'edit') body = <GameEditor key={`edit-${rest[1]}`} gameId={rest[1]} />;
    else if (tab === 'games' && rest[1]) body = <GameDetail gameId={rest[1]} />;
    else if (tab === 'games') body = <GamesList />;
    else if (tab === 'payments') body = <Payments />;
    else if (tab === 'group') body = <GroupSettings />;
    else if (tab === 'you') body = <You section={rest[1]} />;
    else if (tab === 'invite') body = <InviteScreen />;
    else body = <Redirect to={`/g/${groupId}`} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={base} aria-label="Felt home">
          <span className="suit">♠</span>
          <span className="desktop-only">Felt</span>
        </a>
        <a className="group-switch" href="#/groups" aria-label="Switch group">
          <span className="ellipsis">{data?.group.name ?? 'Loading…'}</span>
          {data?.group.is_sample && <span className="badge sample">Sample</span>}
          <span className="chev">▾</span>
        </a>
        <nav className="topnav" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.key} href={t.key ? `${base}/${t.key}` : base} className={tab === t.key || (t.key === 'you' && tab === 'group') ? 'active' : ''}>
              {t.label}
              {t.key === 'you' && attention > 0 ? ` (${attention})` : ''}
            </a>
          ))}
        </nav>
      </header>
      {data?.group.is_sample && (
        <div className="sample-strip">Sample group: everything here is made-up demo data, kept apart from your real groups.</div>
      )}
      <main className="content">{body}</main>
      <nav className="tabbar" aria-label="Sections">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <a key={t.key} href={t.key ? `${base}/${t.key}` : base} className={`tab ${tab === t.key || (t.key === 'you' && tab === 'group') ? 'active' : ''}`} aria-current={tab === t.key ? 'page' : undefined}>
              {t.key === 'you' && avatarUrl ? <Avatar name={displayName} src={avatarUrl} size={26} /> : <TabIcon>{t.icon}</TabIcon>}
              {t.key === 'you' && attention > 0 && <span className="count-dot" aria-label={`${attention} items need attention`}>{attention}</span>}
              {t.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="auth-wrap">
      <div className="hero-mark">
        <span className="suit">♠</span>Felt
      </div>
      <Banner tone="warn">
        <div className="stack-sm">
          <b>Felt isn't connected to a database yet.</b>
          <span>
            Whoever is setting up Felt needs to add the Supabase project URL and anon key to <code>config.js</code> (or the GitHub repository variables) and
            redeploy. See <code>felt/README.md</code>.
          </span>
        </div>
      </Banner>
    </div>
  );
}
