# The Binder

A tutoring agency portal — a public marketing site with an enquiry form, plus
three role-scoped dashboards for the agency admin, its tutors, and its students.

Built with **Next.js (App Router) + TypeScript**, **Supabase** (auth, Postgres,
storage) and **Tailwind CSS**. Deploys to Vercel.

---

## What's in it

**Public homepage** (`/`) — hero, subjects and levels, how it works, tutor cards
pulled from the database, testimonials, and an enquiry form that writes to the
`enquiries` table for the admin to pick up.

**Login** (`/login`) — teacher/student toggle, email and password. The agency
admin signs in separately at `/login/admin`. There is **no self-signup**: the
admin creates every account.

**Teacher dashboard** (`/teacher`)
- Overview — student count, open questions, amount owed
- My students — the current roster
- Sessions & notes — past and upcoming lessons, plus note uploads (file +
  title + summary) tied to a student and optionally a session
- Questions — threaded Q&A, reply and edit
- Calendar — schedule, reschedule and cancel sessions; paste a Zoom link per
  session
- Earnings — sessions taught, hours, amount owed, payout status
- Refer a friend — their referral code and share link, referrals logged, and
  commission earned
- My profile — specialty, headline, bio and years tutoring

**Student dashboard** (`/student`)
- Overview — tutor, unread replies, amount due, next lesson
- My tutor — their assigned tutor's profile
- Lesson notes — read-only feed, most recent first, with signed download links
- Ask a question — post a question, optionally tied to a lesson; see the reply
- Upcoming sessions — "Join on Zoom" when the link is shared, otherwise
  "Link not shared yet"
- Invoices — charges and payment status
- Refer a friend — their referral code and share link, referrals logged, and
  commission earned

**Admin dashboard** (`/admin`)
- Overview — tutors, students, students needing a match, outstanding balance
- Connections — the core action: assign or reassign a tutor from a dropdown,
  saved instantly, with search and a "needs a match only" filter
- Accounts — create teacher and student accounts (this is the signup path)
- All sessions — read-only across every tutor/student pair
- Question activity — read-only across every thread, flagging ones unanswered
  for more than 48 hours
- Billing — raise invoices, set invoice and payout status
- Enquiries — homepage submissions, with status, an internal note, and any
  referral attribution
- Referrals — every referral, its commission, and payout status; record
  word-of-mouth referrals by hand, link one to the student it became, or
  override an amount

---

## Running it locally

### 1. Create a Supabase project

Go to [supabase.com/dashboard](https://supabase.com/dashboard), create a
project, and wait for it to finish provisioning.

### 2. Run the migrations

In the Supabase dashboard, open **SQL Editor** and run the three files in
`supabase/migrations/` **in order**:

Or paste **`supabase/setup.sql`** — all four concatenated in order — into the
SQL Editor in one go. It is safe to re-run.

1. `0001_schema.sql` — tables, enums, indexes
2. `0002_rls.sql` — identity helpers, guard triggers, row level security,
   and the public tutor view
3. `0003_storage.sql` — the private `lesson-notes` bucket and its policies
4. `0004_referrals.sql` — referral codes, the `referrals` table, and the
   commission accrual trigger
5. `0005_question_defaults.sql` — coerces explicit NULLs on question inserts
   (see the note below on PostgREST bulk inserts)

If you use the Supabase CLI instead:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Set environment variables

```bash
cp .env.example .env.local
```

Fill in the three values from **Project Settings → API**:

| Variable | Where to find it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | Safe in the browser; RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` key | **Server only.** Bypasses RLS. Never prefix it with `NEXT_PUBLIC_` |

### 4. Install and seed

```bash
npm install
npm run seed
```

The seed script creates one admin, three tutors, five students (one
deliberately left unassigned so the Connections page has something to do),
plus sessions, lesson notes, questions, invoices and enquiries.

It prints the demo logins when it finishes. All of them share one password
(`binder-demo-2024` by default — override with `SEED_PASSWORD`):

| Role | Login page | Email |
| --- | --- | --- |
| Admin | `/login/admin` | `admin@thebinder.test` |
| Teacher | `/login` | `alice.nwosu@thebinder.test` |
| Student | `/login` | `jonah.price@thebinder.test` |

The seed is idempotent — re-running it reuses accounts by email and replaces
the demo sessions, notes, questions, invoices and enquiries.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### A note on bulk inserts

PostgREST unifies the columns across a bulk insert and sends an explicit
`NULL` for any key a given row omits — it does **not** fall back to the
column's default. So a `NOT NULL DEFAULT` column is rejected rather than
defaulted whenever some rows in the batch set it and others don't.

The seed script keeps every row in a batch on the same key set, and
`sync_question_status` coerces those columns defensively before the NOT NULL
check runs. Worth remembering if you add bulk inserts of your own.

### Running it on Replit instead

The repo carries a `.replit` config, so importing it gives you a working
workspace without installing anything locally.

1. On [replit.com](https://replit.com): **Create Repl → Import from GitHub**,
   and connect your GitHub account so it can see the private repo.
2. Open the **Shell** tab and run `npm install`.
3. Open the **Secrets** tab (padlock icon) and add the three variables from
   the table above. Secrets are the Replit equivalent of `.env.local` — put
   `SUPABASE_SERVICE_ROLE_KEY` here, never in a committed file.
4. Back in the Shell, run `npm run seed`.
5. Press **Run**. Replit serves the dev server on the webview URL.

Two Replit-specific details are already handled: `npm run dev:replit` binds to
`0.0.0.0` so Replit's proxy can reach it, and `allowedDevOrigins` in
`next.config.mjs` stops Next refusing the proxied cross-origin dev requests.

Note that a running Repl is reachable by anyone with the URL, so treat a
seeded instance as a demo rather than somewhere to put real student data.

### Other scripts

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run dev:replit   # dev server bound to 0.0.0.0:3000 (Replit and containers)
npm run start:replit # production server bound to 0.0.0.0:3000
```

---

## Data model

```
users      (id → auth.users, email, full_name, role, phone)
teachers   (id, user_id, subject_specialty, headline, bio,
            years_experience, hourly_rate, avatar_url, is_published)
students   (id, user_id, year_group, subject, teacher_id → teachers,
            guardian_name, guardian_email, admin_notes)
sessions   (id, teacher_id, student_id, scheduled_at, duration_minutes,
            topic, zoom_link, status)
notes      (id, session_id, teacher_id, student_id, title, summary,
            file_path, file_name, file_type, file_size, uploaded_at)
questions  (id, student_id, teacher_id, session_id, question_text,
            answer_text, status, read_by_student, answered_at)
invoices   (id, student_id, teacher_id, description, hours, amount, currency,
            status, issued_at, due_date, paid_at, period_start, period_end,
            teacher_payout_amount, payout_status, payout_paid_at,
            provider, provider_customer_id, provider_invoice_id,
            provider_payment_id, provider_metadata)
enquiries  (id, name, email, role, subject, message, status, admin_note,
            referral_code, referrer_name)
referrals  (id, referrer_user_id, referrer_name, referrer_email,
            referred_name, referred_email, student_id, enquiry_id, note,
            commission_rate, commission_amount, commission_amount_override,
            currency, source_invoice_id, status, paid_at, admin_note)
```

`users.referral_code` is a unique six-character code (no O/0/I/1, so it
survives being read out loud) generated by a trigger for every account.

`students.teacher_id` **is** the teacher–student connection. It is nullable:
null means "needs a match", which is what the admin dashboard counts.

### Access rules

Row level security is on for every table. Policies call `SECURITY DEFINER`
helper functions (`is_admin()`, `current_teacher_id()`, `current_student_id()`,
`my_tutor_teacher_id()`) so a policy on one table can look at another without
recursing into that table's own policies.

| | Teacher | Student | Admin |
| --- | --- | --- | --- |
| Students | read/edit own assigned only | own row only | everything |
| Sessions | read/write own | read own | everything |
| Notes | read/write own | read own | everything |
| Questions | read own, write the answer | read own, write the question | everything |
| Invoices | read own (payouts) | read own | read/write everything |
| Enquiries | — | — | read/write everything |
| Referrals | read own, log own | read own, log own | read/write everything |

Three guard triggers back the policies up:

- `guard_user_privileges` — only an admin can change a `role` or `email`, so
  nobody can promote themselves
- `guard_student_connection` — only an admin can change `students.teacher_id`,
  even though teachers and students may edit other fields on that row
- `guard_question_answer` — a student may edit their own question text but not
  write the answer, flip the status, or reassign the thread

`sync_question_status` keeps `status` and `answered_at` consistent with
`answer_text` rather than trusting the client.

Two deliberate departures from a literal reading of the brief, both in the
direction of least surprise:

- **Students cannot edit sessions.** The brief lists sessions among what a
  student can "see/edit"; in practice a student editing the lesson schedule or
  the Zoom link is not something an agency wants. Sessions are teacher-writable
  and student-readable. The student's writable surface is questions.
- **Teachers cannot edit invoices.** Invoices are raised and settled by the
  agency; teachers see their payout rows read-only.

### File storage

Lesson note attachments live in a **private** `lesson-notes` bucket, keyed
`<student_id>/<session_id|general>/<uuid>-<filename>`. The storage policies read
the student id out of the first path segment, so only that student's assigned
tutor can write there and only that student, their tutor, or an admin can read.

Files are uploaded straight from the browser to Supabase Storage — that keeps
large uploads off the serverless request path, where Vercel caps request bodies
at 4.5 MB. Downloads go through `/api/notes/[id]/download`, which looks the note
up through the caller's own session (so RLS decides whether they can see it at
all) and then mints a 60-second signed URL.

---

## Referrals

Anyone can refer a student, and the referrer earns **10% of that student's
first paid invoice**.

**How a referral gets on file** — three ways, all landing in the same table:

1. A student or tutor logs one from their **Refer a friend** page ("I've told
   my friend about you"). The row starts `pending` with no money on it.
2. Someone enquires through the homepage and enters a **referral code** or the
   name of whoever sent them. The admin sees this on the enquiry, and entering
   the code when creating the account records the referral automatically.
3. The admin records one by hand on the **Referrals** page — for word-of-mouth
   from someone with no portal account at all.

**How the commission accrues.** A database trigger watches invoices. When an
invoice for a referred student is marked `paid`, any `pending` referral for
that student flips to `payable` with `commission_amount` set to 10% of that
invoice. Because only a `pending` referral is picked up, the student's second
and later invoices change nothing — that is what makes it *the first lesson*
rather than every lesson. Each referral also has a
`commission_amount_override` the admin can set when a particular case needs a
different figure; the override wins over the 10%.

Putting this in a trigger rather than in application code means it holds
however the invoice was settled — through the admin UI, a SQL fix-up, or a
payment webhook added later.

**Statuses**: `pending` (referred, first invoice not yet paid) → `payable`
(commission earned, not yet paid out) → `paid`. `void` is for a referral that
isn't going anywhere.

**What a referrer can and can't do.** Row level security lets a signed-in user
insert a referral crediting *themselves* only, with the status, the student
link, and every money column forced to their defaults — so nobody can
self-award a commission or mark their own referral paid. They can read only
their own referrals. The referred person's name is denormalised onto the
referral row, so a referrer never needs access to the students table to see
their own list.

---

## Billing

Payment processing is **not** wired up. Invoices are tracked manually:
`draft → due → paid`, with `overdue` for anything past its due date, and a
separate `pending → processing → paid` payout status for what the agency owes
the tutor.

The table already carries `provider`, `provider_customer_id`,
`provider_invoice_id`, `provider_payment_id` and a `provider_metadata` jsonb
column, plus `currency`. Adding Stripe or GoCardless later means writing a
webhook handler that fills those in and flips `status` — no schema change.

---

## Deploying to Vercel

1. Push this repository to GitHub and import it at
   [vercel.com/new](https://vercel.com/new). The framework preset is detected
   automatically.
2. Add the three environment variables from `.env.local` under
   **Settings → Environment Variables**. `SUPABASE_SERVICE_ROLE_KEY` must not be
   prefixed with `NEXT_PUBLIC_`.
3. Deploy.
4. In Supabase, add your deployment URL under
   **Authentication → URL Configuration → Site URL / Redirect URLs**.

---

## Design

Warm paper background, navy ink text, sage green and mustard accents, with a
muted clay used only for overdue and destructive states. Headings are IBM Plex
Serif, body copy IBM Plex Sans, both loaded through `next/font`. Tokens live in
`tailwind.config.ts`; shared primitives (`Card`, `Button`, `Badge`, `Stat`,
`EmptyState`) in `src/components/ui`.

The layout is responsive to mobile throughout: the portal sidebar collapses to
a top bar with a Menu toggle, stat grids and card grids reflow to one column,
and wide tables scroll horizontally inside their own container rather than
forcing the page sideways.

Every list has an empty state written for the situation it actually describes —
"No students assigned yet" for a new tutor, "We're finding you a tutor" for an
unmatched student, "Everyone is matched" on the admin overview.

---

## Project layout

```
src/
  app/
    page.tsx                 public homepage
    login/                   login + agency admin login
    teacher/                 teacher dashboard + server actions
    student/                 student dashboard + server actions
    admin/                   admin dashboard + server actions
    api/notes/[id]/download  signed URL redirect for note attachments
    actions/enquiries.ts     public enquiry form action
    actions/referrals.ts     referrer-facing referral action
  components/
    ui/                      design system primitives
    portal/                  shared dashboard components
    marketing/               homepage components
    PortalShell.tsx          responsive dashboard chrome
  lib/
    supabase/                browser, server, admin clients + middleware
    queries/                 per-role data access
    auth.ts                  role guards
    format.ts                dates, money, hours, file sizes
supabase/migrations/         schema, RLS, storage
scripts/seed.ts              demo data
```

## Known gaps

- No password reset or "change your password" flow. The admin sets a temporary
  password, shown once at creation; wiring up Supabase's password recovery
  email is the natural next step.
- No email notifications. Enquiries, new replies and issued invoices are all
  visible in the portal only.
- The admin can create accounts but not edit or deactivate them; that means
  going through the Supabase dashboard for now.
- Tutor avatars have a column (`teachers.avatar_url`) but no upload UI — the
  homepage and profiles fall back to initials.
- Referral commissions are recorded, not paid. There's no payout run and no
  notification when one becomes payable — the admin marks them paid by hand,
  the same as invoices.
- A referral only links to a student when the admin enters the code at account
  creation or links it afterwards on the Referrals page. Nothing matches a
  referral to a student by email automatically.
