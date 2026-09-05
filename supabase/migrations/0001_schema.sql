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
