-- =====================================================================
-- The Binder - referrals and first-lesson commission
-- =====================================================================

do $$ begin
  create type public.referral_status as enum ('pending', 'payable', 'paid', 'void');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- referral codes

alter table public.users add column if not exists referral_code text;

do $$ begin
  alter table public.users add constraint users_referral_code_key unique (referral_code);
exception when duplicate_object then null; end $$;

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
