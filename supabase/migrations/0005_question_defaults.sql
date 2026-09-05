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
