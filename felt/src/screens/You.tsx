import { useMemo, type ReactNode } from 'react';
import { useGroup, type GroupData } from '../data';
import { useSession } from '../session';
import { entryProfit, gameTotals, leaderboard } from '../lib/stats';
import { simplifyDebts } from '../lib/settle';
import { formatPence } from '../lib/money';
import { needsMe } from '../lib/payments';
import { Avatar, Banner, Empty, Money, SectionTitle, formatDate, formatDateTime } from '../ui';
import { AccountCard } from './Groups';

/** Things in this group waiting on the signed-in person. Used for the tab badge too. */
export function pendingActions(g: GroupData) {
  const viewer = { userId: g.me.userId, isAdmin: g.me.isAdmin, claimedBy: (id: string) => g.playersById.get(id)?.claimed_by ?? null };
  const myPayments = g.payments.filter((p) => needsMe(p, viewer));
  const draftsToFinalise = g.me.isAdmin ? g.games.filter((x) => x.status === 'draft') : [];
  const liveGames = g.games.filter((x) => x.status === 'live');
  const claim = !g.me.player;
  return { myPayments, draftsToFinalise, liveGames, claim, count: myPayments.length + draftsToFinalise.length + (claim ? 1 : 0) };
}

const icons = {
  stats: <path d="M5 20V11M10 20V5M15 20v-7M20 20v-4M3 20h18" />,
  pending: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12h6M9 16h4" />
    </>
  ),
  settle: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  group: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.6.8 2.7 2.6 3 5.2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

function Icon({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="menu-icon" style={{ color }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </span>
  );
}

function MenuCard({ href, icon, color, title, subtitle, badge }: { href: string; icon: ReactNode; color: string; title: string; subtitle: string; badge?: number }) {
  return (
    <a className="menu-card" href={href}>
      <Icon color={color}>{icon}</Icon>
      <span className="grow">
        <b>{title}</b>
        <span className="muted small" style={{ display: 'block' }}>
          {subtitle}
        </span>
      </span>
      {!!badge && <span className="count-badge">{badge}</span>}
      <span className="chevron">›</span>
    </a>
  );
}

function BackLink({ base }: { base: string }) {
  return (
    <a href={`${base}/you`} className="small">
      ‹ You
    </a>
  );
}

export function You({ section }: { section?: string }) {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  if (section === 'stats') return <MyStats />;
  if (section === 'pending') return <PendingActions />;
  if (section === 'settlements') return <Settlements />;
  if (section === 'account')
    return (
      <div className="stack-lg narrow">
        <BackLink base={base} />
        <h1>Account settings</h1>
        <AccountCard />
      </div>
    );
  return <YouHome />;
}

function YouHome() {
  const g = useGroup();
  const { displayName, avatarUrl } = useSession();
  const base = `#/g/${g.group.id}`;
  const pending = pendingActions(g);
  const balance = g.me.player ? g.balances.find((b) => b.player_id === g.me.player!.id)?.balance_pence ?? 0 : 0;
  return (
    <div className="stack-lg narrow">
      <div className="row-between">
        <h1 style={{ fontSize: '2.1rem' }}>You</h1>
        <a className="icon-btn" href={`${base}/you/account`} aria-label="Account settings">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icons.gear}
          </svg>
        </a>
      </div>

      <a className="card row" href={`${base}/you/account`} style={{ color: 'inherit', gap: 16 }}>
        <Avatar name={displayName || '?'} src={avatarUrl} size={64} />
        <span className="grow">
          <b style={{ fontSize: '1.15rem' }}>{displayName || 'Your name'}</b>
          <span className="small muted" style={{ display: 'block' }}>
            {g.me.player ? `Plays as ${g.me.player.name}` : 'No player claimed yet'} · {g.me.isAdmin ? 'Admin' : 'Member'}
          </span>
          <span className="small lime">{avatarUrl ? 'Change photo or name' : 'Add a profile picture'}</span>
        </span>
      </a>

      <div className="stack">
        <MenuCard href={`${base}/you/stats`} icon={icons.stats} color="#e8c15a" title="Stats" subtitle="Your performance and statistics" />
        <MenuCard
          href={`${base}/you/pending`}
          icon={icons.pending}
          color="#f0a35a"
          title="Pending actions"
          subtitle="Payments to confirm, games to finalise, live games"
          badge={pending.count + pending.liveGames.length}
        />
        <MenuCard
          href={`${base}/you/settlements`}
          icon={icons.settle}
          color="#6fbf8e"
          title="Settlements"
          subtitle={
            !g.me.player ? 'Your payments' : balance === 0 ? "You're all square" : balance < 0 ? `You owe ${formatPence(-balance)}` : `You're owed ${formatPence(balance)}`
          }
        />
        <MenuCard href={`${base}/group`} icon={icons.group} color="#8fb6ff" title="Group & invites" subtitle="Players, members, invite link, backups" />
      </div>
    </div>
  );
}

function MyStats() {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  const me = g.me.player;
  const data = useMemo(() => {
    if (!me) return null;
    const mine = g.games
      .filter((x) => x.status === 'final')
      .map((game) => ({ game, entry: game.entries.find((e) => e.player_id === me.id) }))
      .filter((x): x is { game: typeof x.game; entry: NonNullable<typeof x.entry> } => !!x.entry)
      .sort((a, b) => b.game.played_on.localeCompare(a.game.played_on));
    const all = leaderboard(g.games, g.players, 'all').find((r) => r.playerId === me.id);
    const year = leaderboard(g.games, g.players, 'year').find((r) => r.playerId === me.id);
    const month = leaderboard(g.games, g.players, 'month').find((r) => r.playerId === me.id);
    const results = mine.map((x) => entryProfit(x.entry));
    const best = mine.reduce<(typeof mine)[number] | null>((a, x) => (!a || entryProfit(x.entry) > entryProfit(a.entry) ? x : a), null);
    const worst = mine.reduce<(typeof mine)[number] | null>((a, x) => (!a || entryProfit(x.entry) < entryProfit(a.entry) ? x : a), null);
    let streak = 0;
    for (const r of results) {
      if (streak >= 0 && r > 0) streak++;
      else if (streak <= 0 && r < 0) streak--;
      else break;
    }
    const rebuys = mine.reduce((a, x) => a + x.entry.rebuys_pence.length, 0);
    return { mine, all, year, month, best, worst, streak, rebuys, players: leaderboard(g.games, g.players, 'all').length };
  }, [g.games, g.players, me]);

  if (!me || !data)
    return (
      <div className="stack-lg narrow">
        <BackLink base={base} />
        <Empty title="Claim your player first" action={<a className="btn" href={`${base}/group`}>Claim my player</a>}>
          Your stats are worked out from the player you've claimed in this group.
        </Empty>
      </div>
    );
  const a = data.all;
  return (
    <div className="stack-lg narrow">
      <BackLink base={base} />
      <div className="stack-sm">
        <h1>Your stats</h1>
        <p className="small muted">
          {me.name} in {g.group.name}, from finalised games.
        </p>
      </div>
      {!a ? (
        <Empty title="No finalised games yet">Play a game and get it finalised to see your stats.</Empty>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="All-time profit" value={<Money pence={a.profit} sign />} />
            <Stat label="Rank" value={`#${a.rank} of ${data.players}`} />
            <Stat label="Games played" value={a.games} />
            <Stat label="Winning sessions" value={`${a.wins} (${a.winPct}%)`} />
            <Stat label="Average per game" value={<Money pence={a.average} sign />} />
            <Stat
              label="Current streak"
              value={data.streak === 0 ? '—' : `${Math.abs(data.streak)} ${data.streak > 0 ? 'win' : 'loss'}${Math.abs(data.streak) > 1 ? (data.streak > 0 ? 's' : 'es') : ''}`}
            />
            <Stat label="This year" value={data.year ? <Money pence={data.year.profit} sign /> : '£0'} />
            <Stat label="This month" value={data.month ? <Money pence={data.month.profit} sign /> : '£0'} />
            <Stat label="Best night" value={data.best ? <Money pence={entryProfit(data.best.entry)} sign /> : '—'} />
            <Stat label="Worst night" value={data.worst ? <Money pence={entryProfit(data.worst.entry)} sign /> : '—'} />
            <Stat label="Rebuys" value={data.rebuys} />
            <Stat label="Total bought in" value={formatPence(data.mine.reduce((s, x) => s + x.entry.buy_in_pence + x.entry.rebuys_pence.reduce((p, q) => p + q, 0), 0))} />
          </div>
          <div className="stack-sm">
            <SectionTitle title="Game by game" />
            <ul className="list card flush">
              {data.mine.map(({ game, entry }) => (
                <li key={game.id}>
                  <a className="list-item" href={`${base}/games/${game.id}`}>
                    <span className="grow">
                      <b className="ellipsis">{game.name}</b>
                      <span className="small muted" style={{ display: 'block' }}>
                        {formatDate(game.played_on)} · pot {formatPence(gameTotals(game.entries).totalIn)}
                      </span>
                    </span>
                    <b>
                      <Money pence={entryProfit(entry)} sign />
                    </b>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function PendingActions() {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  const p = pendingActions(g);
  const nothing = p.count === 0 && p.liveGames.length === 0;
  return (
    <div className="stack-lg narrow">
      <BackLink base={base} />
      <h1>Pending actions</h1>
      {nothing && <Empty title="You're all caught up">Nothing needs you right now.</Empty>}
      {p.claim && (
        <Banner tone="warn">
          <div className="stack-sm">
            <span>You haven't claimed your player in this group yet.</span>
            <a className="btn small" style={{ alignSelf: 'flex-start' }} href={`${base}/group`}>
              Claim my player
            </a>
          </div>
        </Banner>
      )}
      {p.liveGames.length > 0 && (
        <div className="stack-sm">
          <SectionTitle title="Live now" />
          <ul className="list card flush">
            {p.liveGames.map((game) => (
              <li key={game.id}>
                <a className="list-item" href={`${base}/games/${game.id}`}>
                  <span className="badge live">● Live</span>
                  <span className="grow ellipsis">{game.name}</span>
                  <span className="chevron">Open ›</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.myPayments.length > 0 && (
        <div className="stack-sm">
          <SectionTitle title="Payments to confirm" />
          <ul className="list card flush">
            {p.myPayments.map((pay) => (
              <li key={pay.id}>
                <a className="list-item" href={`${base}/payments`}>
                  <span className="grow">
                    <b>{g.playerName(pay.from_player)}</b> paid <b>{g.playerName(pay.to_player)}</b> <Money pence={pay.amount_pence} className="lime" />
                    <span className="tiny faint" style={{ display: 'block' }}>
                      Recorded {formatDateTime(pay.recorded_at)}
                    </span>
                  </span>
                  <span className="chevron">Confirm ›</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.draftsToFinalise.length > 0 && (
        <div className="stack-sm">
          <SectionTitle title="Games to finalise" />
          <ul className="list card flush">
            {p.draftsToFinalise.map((d) => (
              <li key={d.id}>
                <a className="list-item" href={`${base}/games/${d.id}`}>
                  <span className="badge warn">Draft</span>
                  <span className="grow ellipsis">{d.name}</span>
                  <span className="chevron">Review ›</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Settlements() {
  const g = useGroup();
  const base = `#/g/${g.group.id}`;
  const me = g.me.player;
  const mine = useMemo(() => {
    if (!me) return { transfers: [], payments: [] };
    let transfers: ReturnType<typeof simplifyDebts> = [];
    try {
      transfers = simplifyDebts(g.balances.map((b) => ({ id: b.player_id, name: g.playerName(b.player_id), balance: b.balance_pence }))).filter(
        (t) => t.from === me.id || t.to === me.id,
      );
    } catch {
      /* shown on the Payments page */
    }
    return { transfers, payments: g.payments.filter((p) => p.from_player === me.id || p.to_player === me.id) };
  }, [g, me]);
  const balance = me ? g.balances.find((b) => b.player_id === me.id)?.balance_pence ?? 0 : 0;
  const status = { pending: 'Waiting for confirmation', confirmed: 'Confirmed', rejected: 'Rejected', void: 'Voided' };
  return (
    <div className="stack-lg narrow">
      <BackLink base={base} />
      <h1>Settlements</h1>
      {!me ? (
        <Empty title="Claim your player first" action={<a className="btn" href={`${base}/group`}>Claim my player</a>} />
      ) : (
        <>
          <div className="card felt">
            <div className="small" style={{ opacity: 0.85 }}>
              {balance === 0 ? 'You are all square' : balance < 0 ? 'You owe' : 'You are owed'}
            </div>
            <div className="big-money">{formatPence(Math.abs(balance))}</div>
          </div>
          {mine.transfers.length > 0 && (
            <div className="stack-sm">
              <SectionTitle title="To settle up" />
              <ul className="list card flush">
                {mine.transfers.map((t, i) => (
                  <li key={i} className="transfer">
                    <span className="grow who">
                      {t.from === me.id ? (
                        <>
                          You pay <b>{g.playerName(t.to)}</b>
                        </>
                      ) : (
                        <>
                          <b>{g.playerName(t.from)}</b> pays you
                        </>
                      )}{' '}
                      <span className="amt">{formatPence(t.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <a className="btn" href={`${base}/payments`}>
                Record or confirm a payment
              </a>
            </div>
          )}
          <div className="stack-sm">
            <SectionTitle title="Your payments" />
            {mine.payments.length === 0 ? (
              <div className="card small muted">No payments yet.</div>
            ) : (
              <ul className="list card flush">
                {mine.payments.map((p) => (
                  <li key={p.id} className="list-item">
                    <span className="grow">
                      {p.from_player === me.id ? (
                        <>
                          You paid <b>{g.playerName(p.to_player)}</b>
                        </>
                      ) : (
                        <>
                          <b>{g.playerName(p.from_player)}</b> paid you
                        </>
                      )}{' '}
                      <Money pence={p.amount_pence} className="lime" />
                      <span className="tiny faint" style={{ display: 'block' }}>
                        {status[p.status]} · {formatDate(p.recorded_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
