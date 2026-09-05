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
