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
