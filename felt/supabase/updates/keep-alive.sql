-- Update: keep-alive ping (10 Oct 2026). Safe to run more than once.
-- Everything here is also in ../schema.sql.
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

notify pgrst, 'reload schema';
