-- =====================================================================
-- The Binder — complete database setup
--
-- This is every migration in supabase/migrations/ concatenated in order,
-- for pasting into the Supabase SQL Editor in one go. Run it once on a new
-- project. It is safe to re-run: everything is written to be idempotent.
--
-- (The numbered files in supabase/migrations/ remain the source of truth
-- for anyone using the Supabase CLI.)
-- =====================================================================


-- ============================ 0001_schema.sql ============================

-- =====================================================================
-- The Binder - core schema
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------ enum types

do $$ begin
  create type public.user_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('scheduled', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_status as enum ('open', 'answered');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'due', 'paid', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum ('pending', 'processing', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enquiry_role as enum ('parent_student', 'prospective_tutor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enquiry_status as enum ('new', 'contacted', 'converted', 'closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables

-- Application-level mirror of auth.users. Accounts are only ever created by
-- an admin (there is no self-signup), so rows here are inserted server-side
-- with the service-role key.
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        public.user_role not null,
  phone       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.teachers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.users (id) on delete cascade,
  subject_specialty text,
  headline          text,
  bio               text,
  years_experience  integer,
  hourly_rate       numeric(10, 2),
  avatar_url        text,
  -- controls whether the tutor appears on the public marketing homepage
  is_published      boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.users (id) on delete cascade,
  year_group     text,
  subject        text,
  -- the agency connection. null means "needs a match" on the admin dashboard.
  teacher_id     uuid references public.teachers (id) on delete set null,
  guardian_name  text,
  guardian_email text,
  admin_notes    text,
  created_at     timestamptz not null default now()
);

create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  topic            text,
  zoom_link        text,
  status           public.session_status not null default 'scheduled',
  created_at       timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.sessions (id) on delete set null,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  title       text not null,
  summary     text,
  -- storage object path inside the private `lesson-notes` bucket
  file_path   text,
  file_name   text,
  file_type   text,
  file_size   integer,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.questions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  session_id       uuid references public.sessions (id) on delete set null,
  question_text    text not null,
  answer_text      text,
  status           public.question_status not null default 'open',
  -- drives the "unread replies" counter on the student overview
  read_by_student  boolean not null default false,
  created_at       timestamptz not null default now(),
  answered_at      timestamptz
);

-- Invoices are tracked manually for now. The provider_* columns exist so a
-- Stripe or GoCardless integration can be layered on without a migration.
create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students (id) on delete cascade,
  teacher_id            uuid not null references public.teachers (id) on delete cascade,
  description           text,
  hours                 numeric(6, 2) not null default 0,
  amount                numeric(10, 2) not null default 0,
  currency              char(3) not null default 'GBP',
  status                public.invoice_status not null default 'due',
  issued_at             date not null default current_date,
  due_date              date,
  paid_at               timestamptz,
  period_start          date,
  period_end            date,
  -- what the agency owes the tutor for the work on this invoice
  teacher_payout_amount numeric(10, 2) not null default 0,
  payout_status         public.payout_status not null default 'pending',
  payout_paid_at        timestamptz,
  -- payment-provider hooks, unused today
  provider              text,
  provider_customer_id  text,
  provider_invoice_id   text,
  provider_payment_id   text,
  provider_metadata     jsonb,
  created_at            timestamptz not null default now()
);

create table if not exists public.enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  role       public.enquiry_role not null,
  subject    text,
  message    text not null,
  status     public.enquiry_status not null default 'new',
  admin_note text,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- indexes

create index if not exists students_teacher_id_idx  on public.students (teacher_id);
create index if not exists sessions_teacher_idx     on public.sessions (teacher_id, scheduled_at);
create index if not exists sessions_student_idx     on public.sessions (student_id, scheduled_at);
create index if not exists notes_student_idx        on public.notes (student_id, uploaded_at desc);
create index if not exists notes_teacher_idx        on public.notes (teacher_id, uploaded_at desc);
create index if not exists questions_teacher_idx    on public.questions (teacher_id, created_at desc);
create index if not exists questions_student_idx    on public.questions (student_id, created_at desc);
create index if not exists invoices_student_idx     on public.invoices (student_id, issued_at desc);
create index if not exists invoices_teacher_idx     on public.invoices (teacher_id, issued_at desc);
create index if not exists enquiries_created_idx    on public.enquiries (created_at desc);

-- ============================ 0002_rls.sql ============================

-- =====================================================================
-- The Binder - identity helpers, guards, and row level security
-- =====================================================================

-- Every helper is SECURITY DEFINER so that a policy on one table can look at
-- another without re-entering that table's own policies (which would recurse).

create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- teachers.id for the signed-in teacher (null for everyone else)
create or replace function public.current_teacher_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select t.id from public.teachers t where t.user_id = auth.uid();
$$;

-- students.id for the signed-in student (null for everyone else)
create or replace function public.current_student_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.students s where s.user_id = auth.uid();
$$;

-- teachers.id of the signed-in student's assigned tutor
create or replace function public.my_tutor_teacher_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select s.teacher_id from public.students s where s.user_id = auth.uid();
$$;

-- auth user ids of everyone the signed-in user is allowed to see a name for:
-- a teacher's assigned students, or a student's assigned tutor.
create or replace function public.connected_user_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.id
  from public.users u
  join public.students s on s.user_id = u.id
  where s.teacher_id = public.current_teacher_id()
  union
  select u.id
  from public.users u
  join public.teachers t on t.user_id = u.id
  where t.id = public.my_tutor_teacher_id();
$$;

grant execute on function public.current_role, public.is_admin,
  public.current_teacher_id, public.current_student_id,
  public.my_tutor_teacher_id, public.connected_user_ids
  to anon, authenticated;

-- ---------------------------------------------------------------- guards

-- Nobody may promote themselves. Only an admin (or the service role, which
-- bypasses RLS and runs as a superuser-ish role) can change role or email.
create or replace function public.guard_user_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- service role / seed script
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an admin may change a user role';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Only an admin may change a user email';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_user_privileges on public.users;
create trigger guard_user_privileges
  before update on public.users
  for each row execute function public.guard_user_privileges();

-- The teacher-student connection is an admin-only action, even though
-- teachers and students may edit other fields on the student row.
create or replace function public.guard_student_connection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.teacher_id is distinct from old.teacher_id and not public.is_admin() then
    raise exception 'Only an admin may change a student''s assigned teacher';
  end if;
  return new;
end $$;

drop trigger if exists guard_student_connection on public.students;
create trigger guard_student_connection
  before update on public.students
  for each row execute function public.guard_student_connection();

-- A student may edit or withdraw their own question, but may not write the
-- answer, flip the status, or reassign the thread.
create or replace function public.guard_question_answer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if public.current_student_id() is not null
     and old.student_id = public.current_student_id() then
    if new.answer_text is distinct from old.answer_text
       or new.status is distinct from old.status
       or new.teacher_id is distinct from old.teacher_id
       or new.student_id is distinct from old.student_id then
      raise exception 'A student may only edit their own question text';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_question_answer on public.questions;
create trigger guard_question_answer
  before update on public.questions
  for each row execute function public.guard_question_answer();

-- Keep answered_at / status in step with the answer itself.
create or replace function public.sync_question_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.answer_text is not null and length(btrim(new.answer_text)) > 0 then
    new.status := 'answered';
    if new.answered_at is null then
      new.answered_at := now();
    end if;
  else
    new.status := 'open';
    new.answered_at := null;
  end if;
  return new;
end $$;

drop trigger if exists sync_question_status on public.questions;
create trigger sync_question_status
  before insert or update on public.questions
  for each row execute function public.sync_question_status();

-- ------------------------------------------------------------------ RLS

alter table public.users     enable row level security;
alter table public.teachers  enable row level security;
alter table public.students  enable row level security;
alter table public.sessions  enable row level security;
alter table public.notes     enable row level security;
alter table public.questions enable row level security;
alter table public.invoices  enable row level security;
alter table public.enquiries enable row level security;

-- users ---------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or id in (select public.connected_user_ids())
  );

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for insert to authenticated
  with check (public.is_admin());

drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users for delete to authenticated
  using (public.is_admin());

-- teachers ------------------------------------------------------------
drop policy if exists teachers_select on public.teachers;
create policy teachers_select on public.teachers for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or id = public.my_tutor_teacher_id()
  );

drop policy if exists teachers_update_self on public.teachers;
create policy teachers_update_self on public.teachers for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists teachers_admin_insert on public.teachers;
create policy teachers_admin_insert on public.teachers for insert to authenticated
  with check (public.is_admin());

drop policy if exists teachers_admin_delete on public.teachers;
create policy teachers_admin_delete on public.teachers for delete to authenticated
  using (public.is_admin());

-- students ------------------------------------------------------------
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or teacher_id = public.current_teacher_id()
  );

-- teacher_id changes are blocked by guard_student_connection above
drop policy if exists students_update on public.students;
create policy students_update on public.students for update to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or teacher_id = public.current_teacher_id()
  )
  with check (
    public.is_admin()
    or user_id = auth.uid()
    or teacher_id = public.current_teacher_id()
  );

drop policy if exists students_admin_insert on public.students;
create policy students_admin_insert on public.students for insert to authenticated
  with check (public.is_admin());

drop policy if exists students_admin_delete on public.students;
create policy students_admin_delete on public.students for delete to authenticated
  using (public.is_admin());

-- sessions ------------------------------------------------------------
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  );

drop policy if exists sessions_teacher_insert on public.sessions;
create policy sessions_teacher_insert on public.sessions for insert to authenticated
  with check (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists sessions_teacher_update on public.sessions;
create policy sessions_teacher_update on public.sessions for update to authenticated
  using (public.is_admin() or teacher_id = public.current_teacher_id())
  with check (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists sessions_teacher_delete on public.sessions;
create policy sessions_teacher_delete on public.sessions for delete to authenticated
  using (public.is_admin() or teacher_id = public.current_teacher_id());

-- notes ---------------------------------------------------------------
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  );

drop policy if exists notes_teacher_insert on public.notes;
create policy notes_teacher_insert on public.notes for insert to authenticated
  with check (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists notes_teacher_update on public.notes;
create policy notes_teacher_update on public.notes for update to authenticated
  using (public.is_admin() or teacher_id = public.current_teacher_id())
  with check (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists notes_teacher_delete on public.notes;
create policy notes_teacher_delete on public.notes for delete to authenticated
  using (public.is_admin() or teacher_id = public.current_teacher_id());

-- questions -----------------------------------------------------------
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select to authenticated
  using (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  );

-- a student may only open a thread with their own assigned tutor
drop policy if exists questions_student_insert on public.questions;
create policy questions_student_insert on public.questions for insert to authenticated
  with check (
    public.is_admin()
    or (
      student_id = public.current_student_id()
      and teacher_id = public.my_tutor_teacher_id()
    )
  );

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions for update to authenticated
  using (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  )
  with check (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  );

drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete to authenticated
  using (
    public.is_admin()
    or (student_id = public.current_student_id() and status = 'open')
  );

-- invoices ------------------------------------------------------------
-- read-only for teachers and students; the agency raises and settles them
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using (
    public.is_admin()
    or teacher_id = public.current_teacher_id()
    or student_id = public.current_student_id()
  );

drop policy if exists invoices_admin_insert on public.invoices;
create policy invoices_admin_insert on public.invoices for insert to authenticated
  with check (public.is_admin());

drop policy if exists invoices_admin_update on public.invoices;
create policy invoices_admin_update on public.invoices for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists invoices_admin_delete on public.invoices;
create policy invoices_admin_delete on public.invoices for delete to authenticated
  using (public.is_admin());

-- enquiries -----------------------------------------------------------
-- the homepage form posts as an anonymous visitor; only admins can read them
drop policy if exists enquiries_public_insert on public.enquiries;
create policy enquiries_public_insert on public.enquiries for insert to anon, authenticated
  with check (
    length(btrim(name)) between 1 and 120
    and length(btrim(email)) between 3 and 200
    and length(btrim(message)) between 1 and 4000
    and status = 'new'
    and admin_note is null
  );

drop policy if exists enquiries_admin_select on public.enquiries;
create policy enquiries_admin_select on public.enquiries for select to authenticated
  using (public.is_admin());

drop policy if exists enquiries_admin_update on public.enquiries;
create policy enquiries_admin_update on public.enquiries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists enquiries_admin_delete on public.enquiries;
create policy enquiries_admin_delete on public.enquiries for delete to authenticated
  using (public.is_admin());

-- ------------------------------------------------- public marketing view

-- The homepage needs tutor cards without a login. This view runs with the
-- definer's rights and exposes only the columns a visitor should see.
drop view if exists public.public_tutors;
create view public.public_tutors
  with (security_invoker = false) as
  select
    t.id,
    u.full_name,
    t.subject_specialty,
    t.headline,
    t.bio,
    t.years_experience,
    t.avatar_url
  from public.teachers t
  join public.users u on u.id = t.user_id
  where t.is_published;

revoke all on public.public_tutors from public;
grant select on public.public_tutors to anon, authenticated;

-- ============================ 0003_storage.sql ============================

-- =====================================================================
-- The Binder - lesson notes storage bucket
-- =====================================================================

-- Private bucket. Files are read through short-lived signed URLs minted
-- server-side on behalf of the signed-in user, so the policies below decide
-- who can mint a link as well as who can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-notes',
  'lesson-notes',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object paths are `<student_id>/<session_id|general>/<uuid>-<filename>`.
-- The first folder segment is the owning student, which is what the policies
-- below key off. Parsing is wrapped so a malformed path fails closed instead
-- of raising an invalid-uuid error mid-policy.
create or replace function public.storage_note_student_id(object_name text)
returns uuid
language plpgsql immutable set search_path = public as $$
declare
  segment text;
begin
  segment := split_part(object_name, '/', 1);
  return segment::uuid;
exception when others then
  return null;
end $$;

grant execute on function public.storage_note_student_id(text) to anon, authenticated;

-- Teacher of the owning student, or the student themselves, or an admin.
drop policy if exists lesson_notes_select on storage.objects;
create policy lesson_notes_select on storage.objects for select to authenticated
  using (
    bucket_id = 'lesson-notes'
    and (
      public.is_admin()
      or public.storage_note_student_id(name) = public.current_student_id()
      or exists (
        select 1 from public.students s
        where s.id = public.storage_note_student_id(name)
          and s.teacher_id = public.current_teacher_id()
      )
    )
  );

-- Only the assigned teacher (or an admin) may write into a student's folder.
drop policy if exists lesson_notes_insert on storage.objects;
create policy lesson_notes_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lesson-notes'
    and (
      public.is_admin()
      or exists (
        select 1 from public.students s
        where s.id = public.storage_note_student_id(name)
          and s.teacher_id = public.current_teacher_id()
      )
    )
  );

drop policy if exists lesson_notes_update on storage.objects;
create policy lesson_notes_update on storage.objects for update to authenticated
  using (
    bucket_id = 'lesson-notes'
    and (
      public.is_admin()
      or exists (
        select 1 from public.students s
        where s.id = public.storage_note_student_id(name)
          and s.teacher_id = public.current_teacher_id()
      )
    )
  );

drop policy if exists lesson_notes_delete on storage.objects;
create policy lesson_notes_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'lesson-notes'
    and (
      public.is_admin()
      or exists (
        select 1 from public.students s
        where s.id = public.storage_note_student_id(name)
          and s.teacher_id = public.current_teacher_id()
      )
    )
  );

-- ============================ 0004_referrals.sql ============================

-- =====================================================================
-- The Binder - referrals and first-lesson commission
-- =====================================================================

do $$ begin
  create type public.referral_status as enum ('pending', 'payable', 'paid', 'void');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- referral codes

alter table public.users add column if not exists referral_code text;

-- Adding a unique constraint creates an index of the same name, so a re-run
-- raises duplicate_table rather than duplicate_object. Check for it instead.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.users'::regclass
       and conname = 'users_referral_code_key'
  ) then
    alter table public.users add constraint users_referral_code_key unique (referral_code);
  end if;
end $$;

-- Six characters, no O/0/I/1, so a code survives being read out loud.
create or replace function public.generate_referral_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i integer;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.users u where u.referral_code = code);
  end loop;
  return code;
end $$;

create or replace function public.set_referral_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end $$;

drop trigger if exists set_referral_code on public.users;
create trigger set_referral_code
  before insert on public.users
  for each row execute function public.set_referral_code();

-- backfill anyone who predates this migration
update public.users
   set referral_code = public.generate_referral_code()
 where referral_code is null;

alter table public.users alter column referral_code set not null;

-- --------------------------------------------------- enquiry attribution

alter table public.enquiries add column if not exists referral_code text;
alter table public.enquiries add column if not exists referrer_name text;

-- ------------------------------------------------------------ referrals

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),

  -- who made the referral. referrer_user_id is null for someone with no
  -- portal account; the name and email are always recorded either way.
  referrer_user_id uuid references public.users (id) on delete set null,
  referrer_name    text not null,
  referrer_email   text,

  -- who was referred. student_id is filled in once the agency turns them
  -- into an account; referred_name is denormalised so a referrer can see
  -- their own list without being granted access to the students table.
  referred_name  text not null,
  referred_email text,
  student_id     uuid references public.students (id) on delete set null,
  enquiry_id     uuid references public.enquiries (id) on delete set null,
  note           text,

  -- 10% of the referred student's first paid invoice, unless overridden
  commission_rate            numeric(5, 4) not null default 0.10,
  commission_amount          numeric(10, 2),
  commission_amount_override numeric(10, 2),
  currency                   char(3) not null default 'GBP',
  source_invoice_id          uuid references public.invoices (id) on delete set null,

  status     public.referral_status not null default 'pending',
  paid_at    timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, created_at desc);
create index if not exists referrals_student_idx  on public.referrals (student_id);
create index if not exists referrals_status_idx   on public.referrals (status);

-- --------------------------------------------------- commission accrual

/*
 * A referral earns its commission the moment the referred student's first
 * invoice is actually paid. Only a `pending` referral is picked up, so the
 * second and later invoices for that student change nothing — that is what
 * makes this "the first lesson" rather than every lesson.
 *
 * Living in a trigger rather than in the app means it holds however the
 * invoice was settled: the admin UI, a SQL fix-up, or a payment webhook later.
 */
create or replace function public.accrue_referral_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.referrals r
       set status            = 'payable',
           source_invoice_id = new.id,
           currency          = new.currency,
           commission_amount = coalesce(
             r.commission_amount_override,
             round(new.amount * r.commission_rate, 2)
           )
     where r.student_id = new.student_id
       and r.status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists accrue_referral_commission on public.invoices;
create trigger accrue_referral_commission
  after insert or update of status on public.invoices
  for each row execute function public.accrue_referral_commission();

-- ------------------------------------------------------------------ RLS

alter table public.referrals enable row level security;

-- A referrer sees their own referrals; the agency sees everything.
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
  using (public.is_admin() or referrer_user_id = auth.uid());

-- A signed-in user may log a referral for themselves, but cannot pre-set the
-- money, the conversion, or the status — those are the agency's to fill in.
drop policy if exists referrals_insert on public.referrals;
create policy referrals_insert on public.referrals for insert to authenticated
  with check (
    public.is_admin()
    or (
      referrer_user_id = auth.uid()
      and status = 'pending'
      and student_id is null
      and enquiry_id is null
      and source_invoice_id is null
      and commission_amount is null
      and commission_amount_override is null
      and paid_at is null
      and admin_note is null
      and commission_rate = 0.10
      and length(btrim(referred_name)) between 1 and 120
    )
  );

drop policy if exists referrals_admin_update on public.referrals;
create policy referrals_admin_update on public.referrals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists referrals_admin_delete on public.referrals;
create policy referrals_admin_delete on public.referrals for delete to authenticated
  using (public.is_admin());

-- The homepage form now posts two more fields as an anonymous visitor, so the
-- insert policy is restated to bound them.
drop policy if exists enquiries_public_insert on public.enquiries;
create policy enquiries_public_insert on public.enquiries for insert to anon, authenticated
  with check (
    length(btrim(name)) between 1 and 120
    and length(btrim(email)) between 3 and 200
    and length(btrim(message)) between 1 and 4000
    and status = 'new'
    and admin_note is null
    and (referral_code is null or length(btrim(referral_code)) <= 32)
    and (referrer_name is null or length(btrim(referrer_name)) <= 120)
  );

-- ============================ 0005_question_defaults.sql ============================

-- =====================================================================
-- The Binder - harden question inserts against explicit NULLs
-- =====================================================================

/*
 * A PostgREST bulk insert unifies the keys across every row it is given and
 * sends an explicit NULL for any key a particular row omits -- so a column
 * with a NOT NULL constraint and a default is *not* filled in from that
 * default, it is rejected. Coerce those columns here, in the BEFORE INSERT
 * trigger that already exists, since a BEFORE trigger runs ahead of the
 * NOT NULL check.
 */
create or replace function public.sync_question_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.read_by_student is null then
    new.read_by_student := false;
  end if;
  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.answer_text is not null and length(btrim(new.answer_text)) > 0 then
    new.status := 'answered';
    if new.answered_at is null then
      new.answered_at := now();
    end if;
  else
    new.status := 'open';
    new.answered_at := null;
  end if;
  return new;
end $$;

drop trigger if exists sync_question_status on public.questions;
create trigger sync_question_status
  before insert or update on public.questions
  for each row execute function public.sync_question_status();
