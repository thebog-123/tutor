# Felt ♠

A website for tracking in-person home poker games: results, a leaderboard, and
who owes whom. It is built for a small group of friends (around eight), each
with their own login, opening it on their phone or computer. Felt never moves
money. It only records what happened.

- **Accounts and groups.** Everyone signs up with their own email and password.
  Create private groups, invite friends with a link, and claim your player so
  your past and future results stay attached to you.
- **Record games.** Each game has a name, date, players, buy-ins, any number of
  rebuys, and cash-outs. Amounts are stored as whole pennies. A live check shows
  whether cash-outs equal buy-ins plus rebuys, plus each player's profit or loss
  before you submit. Any member can submit a draft; only an admin can finalise it.
- **Live games.** Start a game at the table and everyone follows it on their own
  phone, updating in real time: join, rebuy, or cash out early when you leave. Each
  tap changes only one player's row, so phones updating together never overwrite each
  other. When the game ends it becomes a draft, or is finalised straight away if
  an admin ends it and the numbers balance.
- **Leaderboard.** Each group has its own leaderboard: a podium with medals for the
  top three, then everyone ranked. Sort by profit, average per game, win %, wins
  or games played, in either direction, for all time, this year or this month.
  It only counts finalised games, so paying a debt never changes the rankings.
- **You.** Your profile picture, your stats (rank, streaks, best and worst night,
  a running-profit chart, rivalries with your arch nemesis and best friend, and
  head-to-head records, game by game), pending actions with a badge count, and
  your settlements.
- **Who owes whom.** Shows balances from finalised games and confirmed payments,
  and suggests the fewest transfers to settle up ("Dev pays Alice £20"). Partial
  payments are allowed. A payment counts only once **both** people confirm it:
  the one who paid and the one who was paid. Recording it confirms your own side.
  Admins aren't needed, except to confirm for a player who hasn't joined Felt yet.
  Every payment shows who recorded and confirmed it, and when.
- **Safeguards.** All permissions are enforced in the database, not just by
  hiding buttons. Repeated taps and retries can't create duplicates. If two
  people edit at once, the second is told to reload rather than silently
  overwriting. Corrections and voids need a reason and are kept in an activity
  log that can't be edited. Admins can export a CSV of results, export a JSON
  backup, and restore a backup after it has been checked.
- **Sample data** can be created as its own group, labelled *Sample* everywhere,
  and never mixed into a real group.

## How it's built

| Part | Choice | Why |
|---|---|---|
| Website | React + TypeScript, built with Vite into static files (`felt/`) | Runs on any free static host. Hash URLs (`#/g/…`) need no server config. |
| Database and logins | [Supabase](https://supabase.com) (Postgres + Auth) | A real shared database with built-in email/password accounts and a free tier. |
| Hosting | GitHub Pages, deployed by `.github/workflows/felt-pages.yml` | Free for public repositories. |

All database rules are in [`supabase/schema.sql`](supabase/schema.sql):

- Row-level security means people can only *read* the rows of groups they belong to.
- Nobody can write to tables directly. Every change goes through a database
  function that checks membership and admin rights, validates amounts, uses a
  version number to catch simultaneous edits, and writes the activity log.

## Costs and limits (checked October 2026)

Everything below is free. No card is needed and no paid plan is turned on.

**Supabase Free plan** (per their pricing and third-party summaries; check
[supabase.com/pricing](https://supabase.com/pricing) for current figures):
- 2 free projects, a 500 MB database, 50,000 monthly active users, and 5 GB of
  data transfer. Eight friends will use a tiny fraction of this.
- **A project pauses after 7 days with no activity.** Your data is kept, but the
  site shows a "couldn't reach the server" message until someone signs in at
  [supabase.com/dashboard](https://supabase.com/dashboard) and clicks
  **Restore project** (it takes a minute or two). If your group plays less than
  weekly, expect to do this sometimes. The paid Pro plan ($25/month) removes
  pausing; it isn't needed for Felt.
- Supabase's built-in email sender only allows a few emails per hour. That is why
  the setup below turns off email confirmation. Password-reset emails still
  work, just not many in a short time.
- Supabase account: sign up with GitHub or email.

**GitHub Pages:** free for public repositories (this one is public). The soft
limit is 100 GB of bandwidth a month. Note that the *code* is public; your
*data* is not, because it lives in Supabase behind logins.

## Deploy (one-time, about 15 minutes)

These steps need your own accounts, so you have to do them yourself.

### 1. Create the database

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. **New project** → name it `felt` → pick a region near you (e.g. *West EU
   (London)*) → set a database password (save it somewhere) → **Create**.
   Wait for it to finish setting up.
3. Open **SQL Editor** → **New query** → paste the whole of
   [`felt/supabase/schema.sql`](supabase/schema.sql) → **Run**. You should
   see "Success. No rows returned". It's safe to run again later.

### 2. Configure logins

1. **Authentication → Sign In / Providers → Email**: make sure Email is enabled,
   then switch **Confirm email** *off* and save. (If you leave it on, each new
   signup needs a confirmation email, and the free email limit can block several
   friends signing up on the same evening.)
2. **Authentication → URL Configuration**:
   - **Site URL:** `https://thebog-123.github.io/tutor/`
   - **Redirect URLs:** add `https://thebog-123.github.io/tutor/`

   This is where password-reset links send people.
3. **Project Settings → API Keys** (or **Data API**): copy the **Project URL**
   (`https://xxxx.supabase.co`) and the **anon / publishable** key. Do **not**
   use the `service_role` / secret key anywhere.

### 3. Publish the website

1. The project URL and publishable key are already in
   [`felt/public/config.js`](public/config.js). To use a different Supabase
   project, edit that file, or in GitHub open **thebog-123/tutor → Settings →
   Secrets and variables → Actions → Variables** and add two *repository
   variables* (these override the file):
   - `FELT_SUPABASE_URL` = the Project URL
   - `FELT_SUPABASE_ANON_KEY` = the anon / publishable key
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. **Settings → Environments → github-pages → Deployment branches and tags:**
   add `claude/youthful-lamport-64uutg` (GitHub only lets the default branch
   deploy until you do). Alternatively, merge this branch into your default
   branch.
4. **Actions → Felt website →** open the most recent run → **Re-run all jobs**.
   (The workflow also runs by itself whenever anything in `felt/` is pushed. The
   **Run workflow** button only appears once the workflow is on your default
   branch.) When both jobs are green, the site is live at
   **https://thebog-123.github.io/tutor/**.

If the site says "Felt isn't connected to a database yet", one of the two
variables is missing or misspelled. Fix it and run the workflow again.

## Set up your group

1. Open the site, tap **Create account**, and sign up with your name, email and
   a password.
2. Tap **Create a group** and give it a name. Just you is fine; you can add
   friends' names too. Tap **Create group**. You're the admin.
3. You land on **Invite friends**: tap **Share link**, **Copy**, or let friends
   scan the QR code. (It's also under **You → Group & invites**, and **+ Invite
   friends** on Home.)
4. Each friend opens the link, creates their own account, taps **Join group**,
   then taps **This is me** next to their name, or **Add me as a new player**.

**Guests:** someone playing just one night can be added with **+ Add guest**
(game form) or **Add player or guest** (live game). They need no account, their
money counts towards settling up, and they're left off the leaderboard unless you
tick **Show guests**. If they join the group later, they can claim their guest
player and keep their results.
5. Optional: on the Group tab, make one or two others admins with **Make admin**.

**After a game:** anyone taps **Record a game**, picks who played, and enters
buy-ins, rebuys and cash-outs until the bar says *Balanced*. Then they tap
**Review** and **Submit draft**. An admin opens the draft and taps **Finalise**.

**Live:** tap **● Start live game**. Friends open it from Home or Games and tap
**Join**, **+ Rebuy** or **Cash out** as the night goes on. The person who started
it, or an admin, taps **End game** once everyone has cashed out.

**Settling up:** the **Payments** tab lists who pays whom. Pay each other by
bank transfer or cash. Then the payer taps **I've paid** and the person paid
taps **Yes, I received this** (or the other way round).

To stop new people joining, an admin can tap **Replace link** on the Group page.

To delete a group (for example a test one), an admin opens **You → Group & invites**,
scrolls to **This group**, taps **Delete group** and types `DELETE`. This removes it
for everyone and can't be undone, so download a JSON backup first if you might want it.

## Development

```bash
cd felt
npm install
npm run test:unit                    # money, settle-up, leaderboard, CSV and backup checks

# Full database tests need Postgres 16 binaries and Docker (Linux):
npm run stack:start                  # local Auth + PostgREST + Postgres on :54321
npm run test:db                      # permissions, balances, payments, live games, races, backups
npm run stack:stop

# Run the site locally against Supabase (hosted or local)
echo 'VITE_SUPABASE_URL=https://xxxx.supabase.co' >> .env.local
echo 'VITE_SUPABASE_ANON_KEY=...'              >> .env.local
npm run dev
```

`e2e/flow.mjs` is a browser walkthrough (two people sign up, join, record and
finalise a game, then make and confirm a part payment). It runs against a
`vite preview` of the build with `dist/config.js` pointing at the local stack.

## Updating the database after a Felt update

When a new version of Felt changes `supabase/schema.sql`, open Supabase → **SQL
Editor** → **New query**, paste the whole file and **Run**. It's written to be run
again safely: existing groups, games and payments are kept.

## Keeping the database awake

`.github/workflows/felt-keepalive.yml` makes one tiny request a day
(`public.ping`, which reads no data), so the free project never sits idle for the
7 days that trigger a pause. Two GitHub rules apply:

- Scheduled workflows only run from the repository's **default branch**.
- GitHub switches them off after **60 days with no commits** to the repository,
  and emails you first. Re-enable it under **Actions → Felt keep-alive**.

If a run fails (for example because the project was already paused), GitHub
emails the repository owner.

## Restoring a paused project, backups

- **Paused project:** at supabase.com/dashboard → your project → **Restore**.
- **Backups:** the free plan has no automatic backups you can download, so an
  admin should tap **Group → Admin tools → JSON backup** now and then and keep
  the file. **Restore from a backup** checks the file (every finalised game
  must balance, every payment must point at a real player) before replacing
  anything. The data from before the restore is kept in the activity log.
