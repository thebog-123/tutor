-- =============================================================================
-- Felt: poker night tracker. Database schema for Supabase (Postgres 15+).
--
-- Paste this whole file into the Supabase SQL editor and run it once. It is
-- safe to run again: tables are created only if missing, and functions,
-- policies and grants are replaced.
--
-- Security model
--   * Every table has row-level security. Signed-in users can only SELECT rows
--     belonging to groups they are a member of.
--   * Nobody can INSERT/UPDATE/DELETE tables directly. All writes go through
--     the SECURITY DEFINER functions below, which check membership and admin
--     rights on the server before touching anything.
--   * Money is stored as integer pennies everywhere.
--
-- Error codes raised by the functions (read by the app as error.code):
--   FT401 not signed in       FT403 not allowed      FT404 not found
--   FT409 changed by someone else / duplicate        FT422 invalid input
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Profile picture: a small square JPEG/WebP/PNG made in the browser, stored
-- inline as a data URL (about 10-30 KB). Visible only to people who share a group.
alter table public.profiles add column if not exists avatar_url text
  check (avatar_url is null or (char_length(avatar_url) <= 200000 and avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique,
  is_sample   boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.groups enable row level security;
alter table public.groups add column if not exists last_backup_at timestamptz;
alter table public.groups add column if not exists last_backup_by uuid references auth.users (id) on delete set null;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  active     boolean not null default true,
  claimed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, claimed_by)
);
alter table public.players enable row level security;
create unique index if not exists players_group_name_idx on public.players (group_id, lower(btrim(name)));
-- Guests play in a game without being part of the group. They count towards
-- balances (they can win or owe money) but are left off the leaderboard.
alter table public.players add column if not exists is_guest boolean not null default false;

create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  played_on    date not null,
  notes        text not null default '' check (char_length(notes) <= 500),
  status       text not null default 'draft',
  version      integer not null default 1,
  client_token uuid unique,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  finalised_by uuid references auth.users (id) on delete set null,
  finalised_at timestamptz,
  voided_by    uuid references auth.users (id) on delete set null,
  voided_at    timestamptz,
  void_reason  text
);
alter table public.games enable row level security;
create index if not exists games_group_idx on public.games (group_id, played_on desc);

create table if not exists public.game_entries (
  game_id        uuid not null references public.games (id) on delete cascade,
  group_id       uuid not null references public.groups (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete restrict,
  buy_in_pence   integer not null check (buy_in_pence > 0 and buy_in_pence <= 10000000),
  rebuys_pence   integer[] not null default '{}'
                 check (cardinality(rebuys_pence) <= 50 and 0 < all (rebuys_pence) and 10000000 >= all (rebuys_pence)),
  cash_out_pence integer check (cash_out_pence >= 0 and cash_out_pence <= 100000000),
  primary key (game_id, player_id)
);
alter table public.game_entries enable row level security;
create index if not exists game_entries_group_idx on public.game_entries (group_id);
create index if not exists game_entries_player_idx on public.game_entries (player_id);

-- Live games: status 'live' while the game is being played. Players join,
-- rebuy and cash out (possibly early) from their own phones; cash_out_pence
-- stays empty until a player leaves the table.
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check check (status in ('live', 'draft', 'final', 'void'));
alter table public.games add column if not exists standard_buy_in_pence integer
  check (standard_buy_in_pence is null or (standard_buy_in_pence > 0 and standard_buy_in_pence <= 10000000));
alter table public.game_entries alter column cash_out_pence drop not null;
alter table public.game_entries add column if not exists joined_at timestamptz not null default now();
alter table public.game_entries add column if not exists cashed_out_at timestamptz;
-- Outside a live game, every player must have a cash-out.
create or replace function public._entries_complete() returns trigger
language plpgsql as $$
begin
  if new.status in ('draft', 'final') and exists (select 1 from game_entries where game_id = new.id and cash_out_pence is null) then
    raise exception using errcode = 'FT422', message = 'Every player needs a cash-out before the game can end.';
  end if;
  return new;
end $$;
drop trigger if exists games_entries_complete on public.games;
create trigger games_entries_complete before update of status on public.games
  for each row when (old.status = 'live') execute function public._entries_complete();

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_player  uuid not null references public.players (id) on delete restrict,
  to_player    uuid not null references public.players (id) on delete restrict,
  amount_pence integer not null check (amount_pence > 0 and amount_pence <= 100000000),
  note         text not null default '' check (char_length(note) <= 200),
  status       text not null check (status in ('pending', 'confirmed', 'rejected', 'void')),
  version      integer not null default 1,
  client_token uuid unique,
  recorded_by  uuid references auth.users (id) on delete set null,
  recorded_at  timestamptz not null default now(),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  closed_by    uuid references auth.users (id) on delete set null,
  closed_at    timestamptz,
  close_reason text,
  check (from_player <> to_player)
);
alter table public.payments enable row level security;
create index if not exists payments_group_idx on public.payments (group_id, recorded_at desc);
-- Both sides confirm a payment: the payer ("I paid") and the payee ("I received it").
alter table public.payments add column if not exists payer_confirmed_by uuid references auth.users (id) on delete set null;
alter table public.payments add column if not exists payer_confirmed_at timestamptz;
alter table public.payments add column if not exists payee_confirmed_by uuid references auth.users (id) on delete set null;
alter table public.payments add column if not exists payee_confirmed_at timestamptz;

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  actor      uuid references auth.users (id) on delete set null,
  actor_name text,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  reason     text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index if not exists audit_log_group_idx on public.audit_log (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by app users)
-- ---------------------------------------------------------------------------

create or replace function public._fail(p_code text, p_message text) returns void
language plpgsql volatile as $$
begin
  raise exception using errcode = p_code, message = p_message;
end $$;

create or replace function public._uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then perform public._fail('FT401', 'Please sign in again.'); end if;
  return v;
end $$;

create or replace function public._is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function public._is_admin(p_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public._shares_group(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

create or replace function public._require_member(p_group uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _uid();
  if not _is_member(p_group) then perform _fail('FT403', 'You are not a member of this group.'); end if;
end $$;

create or replace function public._require_admin(p_group uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _require_member(p_group);
  if not _is_admin(p_group) then perform _fail('FT403', 'Only a group admin can do that.'); end if;
end $$;

-- Serialise money-changing writes within one group.
create or replace function public._lock_group(p_group uuid) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended(p_group::text, 7)); $$;

create or replace function public._money(p bigint) returns text
language sql immutable as $$
  select case when p < 0 then '-' else '' end || '£' || to_char(abs(p) / 100.0, 'FM999,999,990.00');
$$;

create or replace function public._rebuy_total(p integer[]) returns bigint
language sql immutable as $$ select coalesce(sum(x), 0)::bigint from unnest(p) x; $$;

create or replace function public._uuid(p text, p_label text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  perform _fail('FT422', p_label || ' is not a valid id.');
  return null;
end $$;

create or replace function public._pence(j jsonb, p_label text, p_allow_zero boolean) returns integer
language plpgsql immutable as $$
declare v numeric;
begin
  if j is null or jsonb_typeof(j) <> 'number' then
    perform _fail('FT422', p_label || ' must be an amount in pence.');
  end if;
  v := (j #>> '{}')::numeric;
  if v <> trunc(v) then perform _fail('FT422', p_label || ' must be a whole number of pence.'); end if;
  if v < 0 or (v = 0 and not p_allow_zero) then perform _fail('FT422', p_label || ' must be more than £0.00.'); end if;
  if v > 100000000 then perform _fail('FT422', p_label || ' is too large.'); end if;
  return v::integer;
end $$;

create or replace function public._clean_text(p text, p_label text, p_max int, p_required boolean) returns text
language plpgsql immutable as $$
declare v text := btrim(coalesce(p, ''));
begin
  if p_required and v = '' then perform _fail('FT422', p_label || ' is required.'); end if;
  if char_length(v) > p_max then perform _fail('FT422', p_label || ' must be ' || p_max || ' characters or fewer.'); end if;
  return v;
end $$;

create or replace function public._actor_name() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select display_name from profiles where id = auth.uid();
$$;

create or replace function public._audit(p_group uuid, p_action text, p_entity text, p_entity_id uuid,
                                         p_detail jsonb default '{}'::jsonb, p_reason text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into audit_log (group_id, actor, actor_name, action, entity, entity_id, detail, reason)
  values (p_group, auth.uid(), _actor_name(), p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb), p_reason);
$$;

-- 12 characters from an unambiguous alphabet. Uses only built-in functions
-- (gen_random_uuid is core Postgres), so it doesn't depend on extensions.
create or replace function public._new_invite_code() returns text
language sql volatile set search_path = public, pg_temp as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(b, i) % 31) + 1, 1), '' order by i)
  from (select decode(md5(gen_random_uuid()::text || gen_random_uuid()::text), 'hex') as b) r,
       generate_series(0, 11) i;
$$;

-- A JSON snapshot of a game and its entries, used for the audit trail and backups.
create or replace function public._game_json(p_game uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'played_on', g.played_on, 'notes', g.notes, 'status', g.status,
    'version', g.version, 'created_at', g.created_at, 'finalised_at', g.finalised_at,
    'void_reason', g.void_reason,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', e.player_id, 'player_name', p.name, 'buy_in_pence', e.buy_in_pence,
        'rebuys_pence', to_jsonb(e.rebuys_pence), 'cash_out_pence', e.cash_out_pence) order by p.name)
      from game_entries e join players p on p.id = e.player_id where e.game_id = g.id), '[]'::jsonb))
  from games g where g.id = p_game;
$$;

-- Replace a game's entries from a JSON array, validating every field.
-- Each entry: {"player_id": uuid, "buy_in_pence": int, "rebuys_pence": [int], "cash_out_pence": int}
create or replace function public._apply_entries(p_game uuid, p_group uuid, p_entries jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e jsonb; r jsonb; v_player uuid; v_name text; v_rebuys integer[];
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    perform _fail('FT422', 'Player results must be a list.');
  end if;
  if jsonb_array_length(p_entries) < 2 then perform _fail('FT422', 'A game needs at least two players.'); end if;
  if jsonb_array_length(p_entries) > 40 then perform _fail('FT422', 'A game can have at most 40 players.'); end if;

  delete from game_entries where game_id = p_game;
  for e in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' then perform _fail('FT422', 'Each player result must be an object.'); end if;
    v_player := _uuid(e ->> 'player_id', 'Player');
    select name into v_name from players where id = v_player and group_id = p_group;
    if v_name is null then perform _fail('FT422', 'One of the players is not in this group.'); end if;
    v_rebuys := '{}';
    if e ? 'rebuys_pence' and jsonb_typeof(e -> 'rebuys_pence') <> 'null' then
      if jsonb_typeof(e -> 'rebuys_pence') <> 'array' then
        perform _fail('FT422', 'Rebuys for ' || v_name || ' must be a list.');
      end if;
      for r in select value from jsonb_array_elements(e -> 'rebuys_pence') loop
        v_rebuys := v_rebuys || _pence(r, 'Each rebuy for ' || v_name, false);
      end loop;
      if cardinality(v_rebuys) > 50 then perform _fail('FT422', v_name || ' has too many rebuys.'); end if;
    end if;
    begin
      insert into game_entries (game_id, group_id, player_id, buy_in_pence, rebuys_pence, cash_out_pence)
      values (p_game, p_group, v_player,
              _pence(e -> 'buy_in_pence', 'Buy-in for ' || v_name, false),
              v_rebuys,
              _pence(e -> 'cash_out_pence', 'Cash-out for ' || v_name, true));
    exception when unique_violation then
      perform _fail('FT422', v_name || ' is listed twice.');
    end;
  end loop;
end $$;

create or replace function public._require_balanced(p_game uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_in bigint; v_out bigint; v_n int;
begin
  select coalesce(sum(buy_in_pence + _rebuy_total(rebuys_pence)), 0), coalesce(sum(cash_out_pence), 0), count(*)
    into v_in, v_out, v_n from game_entries where game_id = p_game;
  if v_n < 2 then perform _fail('FT422', 'A game needs at least two players.'); end if;
  if v_in <> v_out then
    perform _fail('FT422', 'Cash-outs (' || _money(v_out) || ') must equal buy-ins plus rebuys (' || _money(v_in)
      || '). Difference: ' || _money(v_out - v_in) || '.');
  end if;
end $$;

-- Outstanding balance per player: poker profit from finalised games, adjusted
-- by confirmed payments. Positive = is owed money; negative = owes money.
create or replace function public._balances(p_group uuid)
returns table (player_id uuid, profit_pence bigint, paid_pence bigint, received_pence bigint, balance_pence bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with profit as (
    select e.player_id, sum(e.cash_out_pence - e.buy_in_pence - _rebuy_total(e.rebuys_pence))::bigint as amt
    from game_entries e join games g on g.id = e.game_id
    where g.group_id = p_group and g.status = 'final' group by e.player_id),
  paid as (
    select from_player as pid, sum(amount_pence)::bigint as amt from payments
    where group_id = p_group and status = 'confirmed' group by from_player),
  recv as (
    select to_player as pid, sum(amount_pence)::bigint as amt from payments
    where group_id = p_group and status = 'confirmed' group by to_player)
  select p.id, coalesce(profit.amt, 0), coalesce(paid.amt, 0), coalesce(recv.amt, 0),
         coalesce(profit.amt, 0) + coalesce(paid.amt, 0) - coalesce(recv.amt, 0)
  from players p
  left join profit on profit.player_id = p.id
  left join paid on paid.pid = p.id
  left join recv on recv.pid = p.id
  where p.group_id = p_group;
$$;

-- A confirmed payment must not overpay: the payer must owe at least the amount
-- and the receiver must be owed at least the amount.
create or replace function public._check_payment_fits(p_group uuid, p_from uuid, p_to uuid, p_amount integer) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from bigint; v_to bigint; v_from_name text; v_to_name text;
begin
  select balance_pence into v_from from _balances(p_group) where player_id = p_from;
  select balance_pence into v_to from _balances(p_group) where player_id = p_to;
  select name into v_from_name from players where id = p_from;
  select name into v_to_name from players where id = p_to;
  if coalesce(v_from, 0) > -p_amount then
    perform _fail('FT422', v_from_name || ' only owes ' || _money(greatest(-coalesce(v_from, 0), 0))
      || ', so a payment of ' || _money(p_amount) || ' would overpay.');
  end if;
  if coalesce(v_to, 0) < p_amount then
    perform _fail('FT422', v_to_name || ' is only owed ' || _money(greatest(coalesce(v_to, 0), 0))
      || ', so a payment of ' || _money(p_amount) || ' would overpay.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                                split_part(coalesce(new.email, 'Player'), '@', 1)), 40))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_my_profile(p_display_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid();
begin
  insert into profiles (id, display_name) values (v_uid, _clean_text(p_display_name, 'Name', 40, true))
  on conflict (id) do update set display_name = excluded.display_name;
end $$;

create or replace function public.update_my_avatar(p_image text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid();
begin
  if p_image is not null and (char_length(p_image) > 200000
      or p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then
    perform _fail('FT422', 'That picture could not be used. Try a different photo.');
  end if;
  insert into profiles (id, display_name, avatar_url) values (v_uid, 'Player', p_image)
  on conflict (id) do update set avatar_url = excluded.avatar_url;
end $$;

-- ---------------------------------------------------------------------------
-- Groups and membership
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text, p_player_names text[], p_claim_index integer default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_group uuid; v_name text; v_player uuid; i int := 0;
begin
  if (select count(*) from group_members where user_id = v_uid) >= 20 then
    perform _fail('FT422', 'You can be in at most 20 groups.');
  end if;
  if p_player_names is null or cardinality(p_player_names) < 1 then
    perform _fail('FT422', 'Add at least one player (you).');
  end if;
  if cardinality(p_player_names) > 40 then perform _fail('FT422', 'A group can start with at most 40 players.'); end if;
  insert into profiles (id, display_name) values (v_uid, 'Player') on conflict (id) do nothing;

  insert into groups (name, invite_code, created_by)
  values (_clean_text(p_name, 'Group name', 60, true), _new_invite_code(), v_uid) returning id into v_group;
  insert into group_members (group_id, user_id, role) values (v_group, v_uid, 'admin');

  foreach v_name in array p_player_names loop
    i := i + 1;
    begin
      insert into players (group_id, name, claimed_by)
      values (v_group, _clean_text(v_name, 'Player name', 40, true),
              case when p_claim_index = i then v_uid end)
      returning id into v_player;
    exception when unique_violation then
      perform _fail('FT422', 'Two players are called "' || btrim(v_name) || '". Player names must be different.');
    end;
  end loop;
  perform _audit(v_group, 'group.created', 'group', v_group, jsonb_build_object('name', p_name));
  return v_group;
end $$;

create or replace function public.rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text;
begin
  perform _require_admin(p_group);
  select name into v_old from groups where id = p_group;
  update groups set name = _clean_text(p_name, 'Group name', 60, true) where id = p_group;
  perform _audit(p_group, 'group.renamed', 'group', p_group, jsonb_build_object('from', v_old, 'to', btrim(p_name)));
end $$;

-- What someone sees before accepting an invite. Reveals only the group name and size.
create or replace function public.preview_invite(p_code text)
returns table (group_id uuid, name text, member_count bigint, is_sample boolean, already_member boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _uid();
  return query
    select g.id, g.name, (select count(*) from group_members m where m.group_id = g.id), g.is_sample, _is_member(g.id)
    from groups g where g.invite_code = lower(btrim(p_code));
end $$;

create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_group uuid;
begin
  select id into v_group from groups where invite_code = lower(btrim(p_code));
  if v_group is null then perform _fail('FT404', 'That invite link is not valid. Ask an admin for a new one.'); end if;
  if _is_member(v_group) then return v_group; end if;
  if (select count(*) from group_members where group_id = v_group) >= 50 then
    perform _fail('FT422', 'This group is full.');
  end if;
  insert into profiles (id, display_name) values (v_uid, 'Player') on conflict (id) do nothing;
  insert into group_members (group_id, user_id, role) values (v_group, v_uid, 'member') on conflict do nothing;
  perform _audit(v_group, 'member.joined', 'member', v_uid);
  return v_group;
end $$;

create or replace function public.regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text := _new_invite_code();
begin
  perform _require_admin(p_group);
  update groups set invite_code = v_code where id = p_group;
  perform _audit(p_group, 'invite.regenerated', 'group', p_group);
  return v_code;
end $$;

create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin(p_group);
  if p_role not in ('admin', 'member') then perform _fail('FT422', 'Role must be admin or member.'); end if;
  perform _lock_group(p_group);
  if not exists (select 1 from group_members where group_id = p_group and user_id = p_user) then
    perform _fail('FT404', 'That person is not in this group.');
  end if;
  if p_role = 'member' and (select count(*) from group_members where group_id = p_group and role = 'admin' and user_id <> p_user) = 0 then
    perform _fail('FT422', 'A group needs at least one admin.');
  end if;
  if p_role = 'member' and p_user = (select created_by from groups where id = p_group) then
    perform _fail('FT403', 'The person who created the group always stays an admin.');
  end if;
  update group_members set role = p_role where group_id = p_group and user_id = p_user;
  perform _audit(p_group, 'member.role_changed', 'member', p_user, jsonb_build_object('role', p_role));
end $$;

-- Admins can remove anyone; anyone can remove themselves (leave).
create or replace function public.remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid();
begin
  if p_user = v_uid then perform _require_member(p_group); else perform _require_admin(p_group); end if;
  if p_user <> v_uid and p_user = (select created_by from groups where id = p_group) then
    perform _fail('FT403', 'The person who created the group can''t be removed.');
  end if;
  perform _lock_group(p_group);
  if exists (select 1 from group_members where group_id = p_group and user_id = p_user and role = 'admin')
     and (select count(*) from group_members where group_id = p_group and role = 'admin') = 1 then
    perform _fail('FT422', 'Make someone else an admin first. A group needs at least one admin.');
  end if;
  update players set claimed_by = null where group_id = p_group and claimed_by = p_user;
  delete from group_members where group_id = p_group and user_id = p_user;
  perform _audit(p_group, case when p_user = v_uid then 'member.left' else 'member.removed' end, 'member', p_user);
end $$;

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

drop function if exists public.add_player(uuid, text);
create or replace function public.add_player(p_group uuid, p_name text, p_guest boolean default false) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := _clean_text(p_name, 'Player name', 40, true);
begin
  perform _require_member(p_group);
  if (select count(*) from players where group_id = p_group) >= 100 then
    perform _fail('FT422', 'A group can have at most 100 players.');
  end if;
  begin
    insert into players (group_id, name, is_guest) values (p_group, v_name, coalesce(p_guest, false)) returning id into v_id;
  exception when unique_violation then
    perform _fail('FT409', 'There is already a player called "' || v_name || '".');
  end;
  perform _audit(p_group, case when p_guest then 'player.guest_added' else 'player.added' end, 'player', v_id, jsonb_build_object('name', v_name));
  return v_id;
end $$;

-- Admins can rename anyone; a member can rename the player they have claimed.
create or replace function public.update_player(p_player uuid, p_name text, p_active boolean default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p players%rowtype; v_name text := _clean_text(p_name, 'Player name', 40, true);
begin
  select * into v_p from players where id = p_player;
  if v_p.id is null then perform _fail('FT404', 'Player not found.'); end if;
  perform _require_member(v_p.group_id);
  if not _is_admin(v_p.group_id) and (v_p.claimed_by is distinct from auth.uid() or p_active is not null) then
    perform _fail('FT403', 'Only an admin can edit other players.');
  end if;
  -- A claimed player's name belongs to the person who claimed it: not even an
  -- admin can change it (admins can still archive, and rename unclaimed players).
  if v_p.claimed_by is not null and v_p.claimed_by is distinct from auth.uid() and v_name is distinct from v_p.name then
    perform _fail('FT403', 'Only ' || coalesce((select display_name from profiles where id = v_p.claimed_by), 'the player') || ' can change their own name.');
  end if;
  begin
    update players set name = v_name, active = coalesce(p_active, active) where id = p_player;
  exception when unique_violation then
    perform _fail('FT409', 'There is already a player called "' || v_name || '".');
  end;
  perform _audit(v_p.group_id, 'player.updated', 'player', p_player,
    jsonb_build_object('from', v_p.name, 'to', v_name, 'active', coalesce(p_active, v_p.active)));
end $$;

-- For someone who has joined but isn't on the player list yet: add a player
-- with their name and claim it in one step.
create or replace function public.add_me_as_player(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_id uuid; v_name text := _clean_text(p_name, 'Your name', 40, true);
begin
  perform _require_member(p_group);
  if exists (select 1 from players where group_id = p_group and claimed_by = v_uid) then
    perform _fail('FT409', 'You already have a player in this group.');
  end if;
  if (select count(*) from players where group_id = p_group) >= 100 then
    perform _fail('FT422', 'A group can have at most 100 players.');
  end if;
  begin
    insert into players (group_id, name, claimed_by) values (p_group, v_name, v_uid) returning id into v_id;
  exception when unique_violation then
    perform _fail('FT409', 'There is already a player called "' || v_name || '". If that''s you, tap "This is me" next to it.');
  end;
  perform _audit(p_group, 'player.added', 'player', v_id, jsonb_build_object('name', v_name));
  perform _audit(p_group, 'player.claimed', 'player', v_id, jsonb_build_object('name', v_name));
  return v_id;
end $$;

create or replace function public.claim_player(p_player uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_p players%rowtype;
begin
  select * into v_p from players where id = p_player for update;
  if v_p.id is null then perform _fail('FT404', 'Player not found.'); end if;
  perform _require_member(v_p.group_id);
  if v_p.claimed_by = v_uid then return; end if;
  if v_p.claimed_by is not null then perform _fail('FT409', v_p.name || ' has already been claimed by someone else.'); end if;
  if exists (select 1 from players where group_id = v_p.group_id and claimed_by = v_uid) then
    perform _fail('FT409', 'You have already claimed a player in this group. Unclaim it first.');
  end if;
  update players set claimed_by = v_uid, is_guest = false where id = p_player;
  perform _audit(v_p.group_id, 'player.claimed', 'player', p_player, jsonb_build_object('name', v_p.name));
end $$;

-- The claimant can release their own player; an admin can release anyone's.
create or replace function public.unclaim_player(p_player uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p players%rowtype;
begin
  select * into v_p from players where id = p_player for update;
  if v_p.id is null then perform _fail('FT404', 'Player not found.'); end if;
  perform _require_member(v_p.group_id);
  if v_p.claimed_by is distinct from auth.uid() and not _is_admin(v_p.group_id) then
    perform _fail('FT403', 'Only an admin can unclaim someone else''s player.');
  end if;
  update players set claimed_by = null where id = p_player;
  perform _audit(v_p.group_id, 'player.unclaimed', 'player', p_player, jsonb_build_object('name', v_p.name));
end $$;

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------

-- Create (p_game null) or update a draft. Any member can create a draft; the
-- creator or an admin can edit it. p_client_token makes creation idempotent:
-- retrying a submission returns the game that was already created.
create or replace function public.save_game_draft(
  p_group uuid, p_game uuid, p_expected_version integer, p_name text, p_played_on date,
  p_notes text, p_entries jsonb, p_client_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_g games%rowtype; v_id uuid;
begin
  perform _require_member(p_group);
  if p_played_on is null then perform _fail('FT422', 'Pick the date the game was played.'); end if;
  if p_played_on > current_date + 1 then perform _fail('FT422', 'The game date cannot be in the future.'); end if;
  if p_played_on < date '2000-01-01' then perform _fail('FT422', 'That date looks wrong.'); end if;

  if p_game is null then
    if p_client_token is not null then
      select * into v_g from games where client_token = p_client_token;
      if v_g.id is not null then
        if v_g.group_id <> p_group then perform _fail('FT409', 'Duplicate submission.'); end if;
        return jsonb_build_object('id', v_g.id, 'version', v_g.version, 'duplicate', true);
      end if;
    end if;
    insert into games (group_id, name, played_on, notes, client_token, created_by, updated_by)
    values (p_group, _clean_text(p_name, 'Game name', 80, true), p_played_on,
            _clean_text(p_notes, 'Notes', 500, false), p_client_token, v_uid, v_uid)
    returning id into v_id;
    perform _apply_entries(v_id, p_group, p_entries);
    perform _audit(p_group, 'game.draft_created', 'game', v_id, jsonb_build_object('name', btrim(p_name)));
    return jsonb_build_object('id', v_id, 'version', 1, 'duplicate', false);
  end if;

  select * into v_g from games where id = p_game for update;
  if v_g.id is null or v_g.group_id <> p_group then perform _fail('FT404', 'Game not found.'); end if;
  if v_g.status <> 'draft' then perform _fail('FT409', 'This game has already been finalised. Reload to see the latest version.'); end if;
  if v_g.created_by is distinct from v_uid and not _is_admin(p_group) then
    perform _fail('FT403', 'Only the person who started this draft or an admin can edit it.');
  end if;
  if v_g.version <> p_expected_version then
    perform _fail('FT409', 'Someone else changed this game while you were editing. Reload to see their changes.');
  end if;
  update games set name = _clean_text(p_name, 'Game name', 80, true), played_on = p_played_on,
    notes = _clean_text(p_notes, 'Notes', 500, false), version = version + 1, updated_by = v_uid, updated_at = now()
  where id = p_game;
  perform _apply_entries(p_game, p_group, p_entries);
  return jsonb_build_object('id', p_game, 'version', v_g.version + 1, 'duplicate', false);
end $$;

create or replace function public.delete_draft(p_game uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype;
begin
  select * into v_g from games where id = p_game for update;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_member(v_g.group_id);
  if v_g.status not in ('draft', 'live') then perform _fail('FT409', 'Only drafts and live games can be deleted. Admins can void finalised games.'); end if;
  if v_g.created_by is distinct from auth.uid() and not _is_admin(v_g.group_id) then
    perform _fail('FT403', 'Only the person who started this draft or an admin can delete it.');
  end if;
  if v_g.version <> p_expected_version then perform _fail('FT409', 'This draft changed since you opened it. Reload and try again.'); end if;
  perform _audit(v_g.group_id, 'game.draft_deleted', 'game', p_game, jsonb_build_object('before', _game_json(p_game)));
  delete from games where id = p_game;
end $$;

create or replace function public.finalise_game(p_game uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype;
begin
  select * into v_g from games where id = p_game;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_admin(v_g.group_id);
  perform _lock_group(v_g.group_id);
  select * into v_g from games where id = p_game for update;
  if v_g.status = 'final' and v_g.version = p_expected_version then return; end if;  -- double tap
  if v_g.status <> 'draft' then perform _fail('FT409', 'This game is no longer a draft.'); end if;
  if v_g.version <> p_expected_version then
    perform _fail('FT409', 'This draft changed since you opened it. Check the latest numbers before finalising.');
  end if;
  perform _require_balanced(p_game);
  update games set status = 'final', finalised_by = auth.uid(), finalised_at = now(), updated_at = now() where id = p_game;
  perform _audit(v_g.group_id, 'game.finalised', 'game', p_game, jsonb_build_object('after', _game_json(p_game)));
end $$;

-- Admin-only correction of a finalised game. Keeps a before/after copy in the audit log.
create or replace function public.correct_game(
  p_game uuid, p_expected_version integer, p_name text, p_played_on date, p_notes text,
  p_entries jsonb, p_reason text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype; v_before jsonb; v_reason text := _clean_text(p_reason, 'Reason for the correction', 200, true);
begin
  select * into v_g from games where id = p_game;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_admin(v_g.group_id);
  perform _lock_group(v_g.group_id);
  select * into v_g from games where id = p_game for update;
  if v_g.status <> 'final' then perform _fail('FT409', 'Only finalised games can be corrected.'); end if;
  if v_g.version <> p_expected_version then
    perform _fail('FT409', 'Someone else changed this game while you were editing. Reload to see their changes.');
  end if;
  if p_played_on is null or p_played_on > current_date + 1 then perform _fail('FT422', 'Pick a valid date.'); end if;
  v_before := _game_json(p_game);
  update games set name = _clean_text(p_name, 'Game name', 80, true), played_on = p_played_on,
    notes = _clean_text(p_notes, 'Notes', 500, false), version = version + 1,
    updated_by = auth.uid(), updated_at = now()
  where id = p_game;
  perform _apply_entries(p_game, v_g.group_id, p_entries);
  perform _require_balanced(p_game);
  perform _audit(v_g.group_id, 'game.corrected', 'game', p_game,
    jsonb_build_object('before', v_before, 'after', _game_json(p_game)), v_reason);
  return v_g.version + 1;
end $$;

-- Rename a game at any stage (not voided). The person who recorded it or an admin.
create or replace function public.rename_game(p_game uuid, p_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype; v_name text := _clean_text(p_name, 'Game name', 80, true);
begin
  select * into v_g from games where id = p_game;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_member(v_g.group_id);
  if v_g.created_by is distinct from auth.uid() and not _is_admin(v_g.group_id) then
    perform _fail('FT403', 'Only the person who recorded this game or an admin can rename it.');
  end if;
  if v_g.status = 'void' then perform _fail('FT409', 'Voided games can''t be renamed.'); end if;
  if v_name = v_g.name then return; end if;
  update games set name = v_name, version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_game;
  perform _audit(v_g.group_id, 'game.renamed', 'game', p_game, jsonb_build_object('from', v_g.name, 'to', v_name));
end $$;

create or replace function public.void_game(p_game uuid, p_expected_version integer, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype; v_reason text := _clean_text(p_reason, 'Reason', 200, true);
begin
  select * into v_g from games where id = p_game;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_admin(v_g.group_id);
  perform _lock_group(v_g.group_id);
  select * into v_g from games where id = p_game for update;
  if v_g.status <> 'final' then perform _fail('FT409', 'Only finalised games can be voided.'); end if;
  if v_g.version <> p_expected_version then perform _fail('FT409', 'This game changed since you opened it. Reload and try again.'); end if;
  update games set status = 'void', version = version + 1, voided_by = auth.uid(), voided_at = now(),
    void_reason = v_reason, updated_at = now() where id = p_game;
  perform _audit(v_g.group_id, 'game.voided', 'game', p_game, jsonb_build_object('before', _game_json(p_game)), v_reason);
end $$;

-- ---------------------------------------------------------------------------
-- Live games. Each action changes one player's row, so phones updating at the
-- same time never overwrite each other. Any member can run the table; every
-- action bumps the game's version so other screens refresh.
-- ---------------------------------------------------------------------------

create or replace function public._live_game(p_game uuid) returns games
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games%rowtype;
begin
  select * into v_g from games where id = p_game;
  if v_g.id is null then perform _fail('FT404', 'Game not found.'); end if;
  perform _require_member(v_g.group_id);
  select * into v_g from games where id = p_game for update;
  if v_g.status <> 'live' then perform _fail('FT409', 'This game has already ended. Reload to see the latest.'); end if;
  update games set version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_game;
  return v_g;
end $$;

create or replace function public._entry_name(p_player uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select name from players where id = p_player;
$$;

create or replace function public.start_live_game(
  p_group uuid, p_name text, p_played_on date, p_standard_buy_in integer, p_players uuid[], p_client_token uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_id uuid; v_player uuid;
begin
  perform _require_member(p_group);
  if p_client_token is not null then
    select id into v_id from games where client_token = p_client_token and group_id = p_group;
    if v_id is not null then return v_id; end if;
  end if;
  if p_played_on is null or p_played_on > current_date + 1 then perform _fail('FT422', 'Pick a valid date.'); end if;
  if p_standard_buy_in is null or p_standard_buy_in <= 0 or p_standard_buy_in > 10000000 then
    perform _fail('FT422', 'Set the buy-in amount.');
  end if;
  insert into games (group_id, name, played_on, status, standard_buy_in_pence, client_token, created_by, updated_by)
  values (p_group, _clean_text(p_name, 'Game name', 80, true), p_played_on, 'live', p_standard_buy_in, p_client_token, v_uid, v_uid)
  returning id into v_id;
  foreach v_player in array coalesce(p_players, '{}') loop
    if not exists (select 1 from players where id = v_player and group_id = p_group) then
      perform _fail('FT422', 'One of the players is not in this group.');
    end if;
    insert into game_entries (game_id, group_id, player_id, buy_in_pence) values (v_id, p_group, v_player, p_standard_buy_in)
    on conflict do nothing;
  end loop;
  perform _audit(p_group, 'game.live_started', 'game', v_id, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

create or replace function public.live_join(p_game uuid, p_player uuid, p_buy_in integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games;
begin
  v_g := _live_game(p_game);
  if not exists (select 1 from players where id = p_player and group_id = v_g.group_id) then
    perform _fail('FT422', 'That player is not in this group.');
  end if;
  if p_buy_in is null or p_buy_in <= 0 or p_buy_in > 10000000 then perform _fail('FT422', 'Enter a buy-in more than £0.00.'); end if;
  if (select count(*) from game_entries where game_id = p_game) >= 40 then perform _fail('FT422', 'A game can have at most 40 players.'); end if;
  insert into game_entries (game_id, group_id, player_id, buy_in_pence) values (p_game, v_g.group_id, p_player, p_buy_in)
  on conflict do nothing;
  if not found then perform _fail('FT409', _entry_name(p_player) || ' is already in this game.'); end if;
end $$;

create or replace function public.live_rebuy(p_game uuid, p_player uuid, p_amount integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games; v_e game_entries%rowtype;
begin
  v_g := _live_game(p_game);
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then perform _fail('FT422', 'Enter a rebuy more than £0.00.'); end if;
  select * into v_e from game_entries where game_id = p_game and player_id = p_player for update;
  if v_e.game_id is null then perform _fail('FT404', 'That player is not in this game.'); end if;
  if v_e.cash_out_pence is not null then perform _fail('FT409', _entry_name(p_player) || ' has cashed out. Undo the cash-out first.'); end if;
  if cardinality(v_e.rebuys_pence) >= 50 then perform _fail('FT422', 'Too many rebuys.'); end if;
  update game_entries set rebuys_pence = rebuys_pence || p_amount where game_id = p_game and player_id = p_player;
end $$;

create or replace function public.live_undo_rebuy(p_game uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games; v_e game_entries%rowtype;
begin
  v_g := _live_game(p_game);
  select * into v_e from game_entries where game_id = p_game and player_id = p_player for update;
  if v_e.game_id is null then perform _fail('FT404', 'That player is not in this game.'); end if;
  if cardinality(v_e.rebuys_pence) = 0 then return; end if;
  update game_entries set rebuys_pence = rebuys_pence[1:cardinality(rebuys_pence) - 1] where game_id = p_game and player_id = p_player;
end $$;

-- Set (or with null, undo) a player's cash-out, e.g. when they leave early.
create or replace function public.live_cash_out(p_game uuid, p_player uuid, p_amount integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games;
begin
  v_g := _live_game(p_game);
  if p_amount is not null and (p_amount < 0 or p_amount > 100000000) then perform _fail('FT422', 'Enter a cash-out of £0.00 or more.'); end if;
  update game_entries set cash_out_pence = p_amount, cashed_out_at = case when p_amount is null then null else now() end
  where game_id = p_game and player_id = p_player;
  if not found then perform _fail('FT404', 'That player is not in this game.'); end if;
end $$;

create or replace function public.live_remove(p_game uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games;
begin
  v_g := _live_game(p_game);
  delete from game_entries where game_id = p_game and player_id = p_player;
  perform _audit(v_g.group_id, 'game.live_player_removed', 'game', p_game, jsonb_build_object('name', _entry_name(p_player)));
end $$;

-- End the game: everyone must have cashed out. It becomes a draft for an
-- admin to check and finalise (the person who started it, or an admin, can end it).
create or replace function public.end_live_game(p_game uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_g games; v_left int;
begin
  v_g := _live_game(p_game);
  if v_g.created_by is distinct from auth.uid() and not _is_admin(v_g.group_id) then
    perform _fail('FT403', 'Only the person who started the game or an admin can end it.');
  end if;
  if (select count(*) from game_entries where game_id = p_game) < 2 then perform _fail('FT422', 'A game needs at least two players.'); end if;
  select count(*) into v_left from game_entries where game_id = p_game and cash_out_pence is null;
  if v_left > 0 then
    perform _fail('FT422', v_left || case when v_left = 1 then ' player is' else ' players are' end || ' still playing. Cash everyone out first.');
  end if;
  update games set status = 'draft', version = version + 1, updated_at = now() where id = p_game;
  perform _audit(v_g.group_id, 'game.live_ended', 'game', p_game, jsonb_build_object('name', v_g.name));
  return v_g.version + 2;
end $$;

-- ---------------------------------------------------------------------------
-- Balances and payments
-- ---------------------------------------------------------------------------

create or replace function public.get_balances(p_group uuid)
returns table (player_id uuid, profit_pence bigint, paid_pence bigint, received_pence bigint, balance_pence bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _require_member(p_group);
  return query select * from _balances(p_group);
end $$;

-- A payment counts only once BOTH sides have confirmed it: the person who
-- paid and the person who was paid (whoever has claimed each player). No
-- admin is needed. If a player hasn't been claimed by anyone yet, a group
-- admin may confirm that player's side so the payment isn't stuck forever.

-- Which sides of a payment the current user may confirm.
create or replace function public._payment_sides(v_p payments, out can_payer boolean, out can_payee boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from uuid; v_to uuid; v_admin boolean := _is_admin(v_p.group_id);
begin
  select claimed_by into v_from from players where id = v_p.from_player;
  select claimed_by into v_to from players where id = v_p.to_player;
  can_payer := coalesce(v_from = auth.uid(), false) or (v_from is null and v_admin);
  can_payee := coalesce(v_to = auth.uid(), false) or (v_to is null and v_admin);
end $$;

-- Mark the sides the current user can vouch for; if both are now confirmed,
-- the payment becomes "confirmed" and starts counting towards balances.
create or replace function public._confirm_sides(p_payment uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p payments%rowtype; v_sides record; v_did boolean := false;
begin
  select * into v_p from payments where id = p_payment for update;
  select * into v_sides from _payment_sides(v_p);
  if v_p.payer_confirmed_at is null and v_sides.can_payer then
    update payments set payer_confirmed_by = auth.uid(), payer_confirmed_at = now() where id = p_payment;
    v_did := true;
  end if;
  if v_p.payee_confirmed_at is null and v_sides.can_payee then
    update payments set payee_confirmed_by = auth.uid(), payee_confirmed_at = now() where id = p_payment;
    v_did := true;
  end if;
  select * into v_p from payments where id = p_payment;
  if v_p.payer_confirmed_at is not null and v_p.payee_confirmed_at is not null then
    perform _check_payment_fits(v_p.group_id, v_p.from_player, v_p.to_player, v_p.amount_pence);
    update payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), version = version + 1
    where id = p_payment;
    perform _audit(v_p.group_id, 'payment.confirmed', 'payment', p_payment,
      jsonb_build_object('from', v_p.from_player, 'to', v_p.to_player, 'amount_pence', v_p.amount_pence));
  end if;
  return v_did;
end $$;

-- Any member can record a payment. The recorder's own side (if they are the
-- payer or the payee) is confirmed straight away. p_client_token prevents
-- duplicates from double taps or retries.
create or replace function public.record_payment(
  p_group uuid, p_from uuid, p_to uuid, p_amount_pence integer, p_note text, p_client_token uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := _uid(); v_id uuid;
begin
  perform _require_member(p_group);
  if p_client_token is not null then
    select id into v_id from payments where client_token = p_client_token;
    if v_id is not null then return v_id; end if;
  end if;
  if p_from = p_to then perform _fail('FT422', 'Pick two different players.'); end if;
  if (select count(*) from players where id in (p_from, p_to) and group_id = p_group) <> 2 then
    perform _fail('FT422', 'Both players must be in this group.');
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 then perform _fail('FT422', 'Enter an amount more than £0.00.'); end if;
  perform _lock_group(p_group);
  perform _check_payment_fits(p_group, p_from, p_to, p_amount_pence);
  insert into payments (group_id, from_player, to_player, amount_pence, note, status, client_token, recorded_by)
  values (p_group, p_from, p_to, p_amount_pence, _clean_text(p_note, 'Note', 200, false), 'pending', p_client_token, v_uid)
  returning id into v_id;
  perform _audit(p_group, 'payment.recorded_pending', 'payment', v_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'amount_pence', p_amount_pence));
  -- The recorder vouches for their own side only (an admin recording on behalf
  -- of others still needs the players themselves to confirm).
  if exists (select 1 from players where id in (p_from, p_to) and claimed_by = v_uid) then
    update payments set
      payer_confirmed_by = case when (select claimed_by from players where id = p_from) = v_uid then v_uid end,
      payer_confirmed_at = case when (select claimed_by from players where id = p_from) = v_uid then now() end,
      payee_confirmed_by = case when (select claimed_by from players where id = p_to) = v_uid then v_uid end,
      payee_confirmed_at = case when (select claimed_by from players where id = p_to) = v_uid then now() end
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.confirm_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p payments%rowtype; v_sides record; v_from text; v_to text;
begin
  select * into v_p from payments where id = p_payment;
  if v_p.id is null then perform _fail('FT404', 'Payment not found.'); end if;
  perform _require_member(v_p.group_id);
  perform _lock_group(v_p.group_id);
  select * into v_p from payments where id = p_payment for update;
  if v_p.status = 'confirmed' then return; end if;
  if v_p.status <> 'pending' then perform _fail('FT409', 'This payment is no longer pending.'); end if;
  select * into v_sides from _payment_sides(v_p);
  if not (v_sides.can_payer or v_sides.can_payee) then
    select name into v_from from players where id = v_p.from_player;
    select name into v_to from players where id = v_p.to_player;
    perform _fail('FT403', 'Only ' || v_from || ' (who paid) and ' || v_to || ' (who was paid) can confirm this payment.');
  end if;
  perform _confirm_sides(p_payment);  -- a repeat tap on an already-confirmed side does nothing
end $$;

-- Pending payments: the recorder, either side, or an admin can reject it.
-- Confirmed payments: only an admin can void, with a reason.
create or replace function public.cancel_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p payments%rowtype; v_reason text := _clean_text(p_reason, 'Reason', 200, false); v_involved boolean;
begin
  select * into v_p from payments where id = p_payment;
  if v_p.id is null then perform _fail('FT404', 'Payment not found.'); end if;
  perform _require_member(v_p.group_id);
  perform _lock_group(v_p.group_id);
  select * into v_p from payments where id = p_payment for update;
  if v_p.status = 'pending' then
    v_involved := v_p.recorded_by = auth.uid() or _is_admin(v_p.group_id)
      or exists (select 1 from players where id in (v_p.from_player, v_p.to_player) and claimed_by = auth.uid());
    if not v_involved then
      perform _fail('FT403', 'Only the two players involved, the person who recorded it, or an admin can reject this payment.');
    end if;
    update payments set status = 'rejected', closed_by = auth.uid(), closed_at = now(),
      close_reason = nullif(v_reason, ''), version = version + 1 where id = p_payment;
    perform _audit(v_p.group_id, 'payment.rejected', 'payment', p_payment,
      jsonb_build_object('amount_pence', v_p.amount_pence), nullif(v_reason, ''));
  elsif v_p.status = 'confirmed' then
    if not _is_admin(v_p.group_id) then perform _fail('FT403', 'Only an admin can void a confirmed payment.'); end if;
    if v_reason = '' then perform _fail('FT422', 'Give a reason for voiding this payment.'); end if;
    update payments set status = 'void', closed_by = auth.uid(), closed_at = now(),
      close_reason = v_reason, version = version + 1 where id = p_payment;
    perform _audit(v_p.group_id, 'payment.voided', 'payment', p_payment,
      jsonb_build_object('amount_pence', v_p.amount_pence, 'from', v_p.from_player, 'to', v_p.to_player), v_reason);
  else
    perform _fail('FT409', 'This payment has already been cancelled.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Backup and restore
-- ---------------------------------------------------------------------------

create or replace function public._backup_json(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'format', 'felt-backup', 'version', 1, 'exported_at', now(),
    'group', (select jsonb_build_object('id', id, 'name', name, 'is_sample', is_sample) from groups where id = p_group),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active, 'is_guest', is_guest,
                          'claimed_by', claimed_by) order by created_at, name) from players where group_id = p_group), '[]'::jsonb),
    -- Live games are still being played, so they're left out of backups.
    'games', coalesce((select jsonb_agg(_game_json(id) order by played_on, created_at) from games where group_id = p_group and status <> 'live'), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'from_player', from_player, 'to_player', to_player, 'amount_pence', amount_pence,
                  'note', note, 'status', status, 'recorded_at', recorded_at, 'confirmed_at', confirmed_at,
                  'close_reason', close_reason) order by recorded_at) from payments where group_id = p_group), '[]'::jsonb));
end $$;

-- An admin downloads a backup. Records when, so the app can remind admins.
create or replace function public.export_backup(p_group uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin(p_group);
  update groups set last_backup_at = now(), last_backup_by = auth.uid() where id = p_group;
  return _backup_json(p_group);
end $$;

-- Replace this group's players, games and payments with the contents of a
-- backup. Membership and the audit log are kept. Everything is validated and
-- runs in one transaction: any error leaves the group untouched.
create or replace function public.restore_backup(p_group uuid, p_backup jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_map jsonb := '{}'::jsonb; v_item jsonb; v_new uuid; v_status text; v_game uuid;
  v_players int := 0; v_games int := 0; v_payments int := 0; v_claim uuid; v_date date;
begin
  perform _require_admin(p_group);
  if p_backup is null or jsonb_typeof(p_backup) <> 'object' or p_backup ->> 'format' <> 'felt-backup' then
    perform _fail('FT422', 'This file is not a Felt backup.');
  end if;
  if (p_backup ->> 'version') is distinct from '1' then perform _fail('FT422', 'This backup version is not supported.'); end if;
  if jsonb_typeof(p_backup -> 'players') <> 'array' or jsonb_typeof(p_backup -> 'games') <> 'array'
     or jsonb_typeof(p_backup -> 'payments') <> 'array' then
    perform _fail('FT422', 'The backup is missing players, games or payments.');
  end if;
  if jsonb_array_length(p_backup -> 'players') > 100 or jsonb_array_length(p_backup -> 'games') > 5000
     or jsonb_array_length(p_backup -> 'payments') > 10000 then
    perform _fail('FT422', 'The backup is too large.');
  end if;
  perform _lock_group(p_group);

  perform _audit(p_group, 'backup.restore_started', 'group', p_group,
    jsonb_build_object('previous', _backup_json(p_group)));

  delete from payments where group_id = p_group;
  delete from games where group_id = p_group;
  delete from players where group_id = p_group;

  for v_item in select value from jsonb_array_elements(p_backup -> 'players') loop
    v_claim := null;
    if nullif(v_item ->> 'claimed_by', '') is not null then
      v_claim := _uuid(v_item ->> 'claimed_by', 'Claimed by');
      if not exists (select 1 from group_members where group_id = p_group and user_id = v_claim) then v_claim := null; end if;
    end if;
    begin
      insert into players (group_id, name, active, is_guest, claimed_by)
      values (p_group, _clean_text(v_item ->> 'name', 'Player name', 40, true),
              coalesce((v_item ->> 'active')::boolean, true), coalesce((v_item ->> 'is_guest')::boolean, false) and v_claim is null, v_claim)
      returning id into v_new;
    exception when unique_violation then
      perform _fail('FT422', 'The backup has two players called "' || (v_item ->> 'name') || '", or a player is claimed twice.');
    end;
    v_map := v_map || jsonb_build_object(_uuid(v_item ->> 'id', 'Player')::text, v_new);
    v_players := v_players + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'games') loop
    v_status := v_item ->> 'status';
    if v_status not in ('draft', 'final', 'void') then perform _fail('FT422', 'A game in the backup has an unknown status.'); end if;
    begin v_date := (v_item ->> 'played_on')::date;
    exception when others then perform _fail('FT422', 'A game in the backup has an invalid date.'); end;
    if v_date is null then perform _fail('FT422', 'A game in the backup has no date.'); end if;
    insert into games (group_id, name, played_on, notes, status, created_by, updated_by, finalised_at, void_reason)
    values (p_group, _clean_text(v_item ->> 'name', 'Game name', 80, true), v_date,
            _clean_text(v_item ->> 'notes', 'Notes', 500, false), v_status, auth.uid(), auth.uid(),
            case when v_status <> 'draft' then coalesce((v_item ->> 'finalised_at')::timestamptz, now()) end,
            case when v_status = 'void' then coalesce(v_item ->> 'void_reason', 'Restored from backup') end)
    returning id into v_game;
    perform _apply_entries(v_game, p_group, coalesce((
      select jsonb_agg(e || jsonb_build_object('player_id', v_map ->> (e ->> 'player_id')))
      from jsonb_array_elements(v_item -> 'entries') e), '[]'::jsonb));
    if v_status = 'final' then perform _require_balanced(v_game); end if;
    v_games := v_games + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'payments') loop
    v_status := v_item ->> 'status';
    if v_status not in ('pending', 'confirmed', 'rejected', 'void') then
      perform _fail('FT422', 'A payment in the backup has an unknown status.');
    end if;
    if v_map ->> (v_item ->> 'from_player') is null or v_map ->> (v_item ->> 'to_player') is null then
      perform _fail('FT422', 'A payment in the backup refers to a missing player.');
    end if;
    insert into payments (group_id, from_player, to_player, amount_pence, note, status, recorded_by, recorded_at,
                          confirmed_by, confirmed_at, close_reason,
                          payer_confirmed_by, payer_confirmed_at, payee_confirmed_by, payee_confirmed_at)
    values (p_group, (v_map ->> (v_item ->> 'from_player'))::uuid, (v_map ->> (v_item ->> 'to_player'))::uuid,
            _pence(v_item -> 'amount_pence', 'Payment amount', false),
            _clean_text(v_item ->> 'note', 'Note', 200, false), v_status, auth.uid(),
            coalesce((v_item ->> 'recorded_at')::timestamptz, now()),
            case when v_status <> 'pending' then auth.uid() end,
            case when v_status <> 'pending' then coalesce((v_item ->> 'confirmed_at')::timestamptz, now()) end,
            v_item ->> 'close_reason',
            case when v_status <> 'pending' then auth.uid() end,
            case when v_status <> 'pending' then coalesce((v_item ->> 'confirmed_at')::timestamptz, now()) end,
            case when v_status <> 'pending' then auth.uid() end,
            case when v_status <> 'pending' then coalesce((v_item ->> 'confirmed_at')::timestamptz, now()) end);
    v_payments := v_payments + 1;
  end loop;

  perform _audit(p_group, 'backup.restored', 'group', p_group,
    jsonb_build_object('players', v_players, 'games', v_games, 'payments', v_payments));
  return jsonb_build_object('players', v_players, 'games', v_games, 'payments', v_payments);
end $$;

-- ---------------------------------------------------------------------------
-- Sample data: always a separate group, flagged is_sample and shown with a
-- SAMPLE badge in the app. It never mixes with a real group's records.
-- ---------------------------------------------------------------------------

create or replace function public.create_sample_group() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := _uid(); v_group uuid; v_ids uuid[] := '{}'; v_id uuid; v_game uuid;
  v_names text[] := array['Alex', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hari'];
  i int;
begin
  if exists (select 1 from groups g join group_members m on m.group_id = g.id where m.user_id = v_uid and g.is_sample) then
    perform _fail('FT409', 'You already have a sample group. Delete it from its Group tab first.');
  end if;
  insert into profiles (id, display_name) values (v_uid, 'Player') on conflict (id) do nothing;
  insert into groups (name, invite_code, is_sample, created_by)
  values ('Sample group (demo data)', _new_invite_code(), true, v_uid) returning id into v_group;
  insert into group_members (group_id, user_id, role) values (v_group, v_uid, 'admin');
  for i in 1..8 loop
    insert into players (group_id, name) values (v_group, v_names[i]) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  insert into games (group_id, name, played_on, status, created_by, finalised_by, finalised_at)
  values (v_group, 'Sample: Friday night', current_date - 21, 'final', v_uid, v_uid, now()) returning id into v_game;
  insert into game_entries (game_id, group_id, player_id, buy_in_pence, rebuys_pence, cash_out_pence) values
    (v_game, v_group, v_ids[1], 2000, '{}', 4500), (v_game, v_group, v_ids[2], 2000, '{1000}', 500),
    (v_game, v_group, v_ids[3], 2000, '{}', 3000), (v_game, v_group, v_ids[4], 2000, '{1000}', 0),
    (v_game, v_group, v_ids[5], 2000, '{}', 5000), (v_game, v_group, v_ids[6], 2000, '{}', 1000);
  perform _require_balanced(v_game);

  insert into games (group_id, name, played_on, status, created_by, finalised_by, finalised_at)
  values (v_group, 'Sample: Birthday game', current_date - 7, 'final', v_uid, v_uid, now()) returning id into v_game;
  insert into game_entries (game_id, group_id, player_id, buy_in_pence, rebuys_pence, cash_out_pence) values
    (v_game, v_group, v_ids[1], 1000, '{}', 0), (v_game, v_group, v_ids[2], 1000, '{}', 2850),
    (v_game, v_group, v_ids[3], 1000, '{500}', 1250), (v_game, v_group, v_ids[7], 1000, '{}', 1400),
    (v_game, v_group, v_ids[8], 1000, '{}', 0);
  perform _require_balanced(v_game);

  insert into games (group_id, name, played_on, status, created_by)
  values (v_group, 'Sample: Next week (draft)', current_date, 'draft', v_uid) returning id into v_game;
  insert into game_entries (game_id, group_id, player_id, buy_in_pence, rebuys_pence, cash_out_pence) values
    (v_game, v_group, v_ids[1], 2000, '{}', 2500), (v_game, v_group, v_ids[2], 2000, '{}', 1500);

  insert into payments (group_id, from_player, to_player, amount_pence, note, status, recorded_by, confirmed_by, confirmed_at,
                        payer_confirmed_by, payer_confirmed_at, payee_confirmed_by, payee_confirmed_at)
  values (v_group, v_ids[4], v_ids[1], 1000, 'Sample: bank transfer', 'confirmed', v_uid, v_uid, now(), v_uid, now(), v_uid, now());
  insert into payments (group_id, from_player, to_player, amount_pence, note, status, recorded_by, payer_confirmed_by, payer_confirmed_at)
  values (v_group, v_ids[6], v_ids[3], 500, 'Sample: paid, waiting for Chloe to confirm', 'pending', v_uid, v_uid, now());

  perform _audit(v_group, 'sample.created', 'group', v_group);
  return v_group;
end $$;

-- An admin can delete a whole group and everything in it. The app asks them
-- to type DELETE first; the server checks that too.
create or replace function public.delete_group(p_group uuid, p_confirm text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin(p_group);
  if exists (select 1 from groups g join group_members m on m.group_id = g.id and m.user_id = g.created_by where g.id = p_group)
     and (select created_by from groups where id = p_group) <> auth.uid() then
    perform _fail('FT403', 'Only the person who created the group can delete it.');
  end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'DELETE' then
    perform _fail('FT422', 'Type DELETE to confirm.');
  end if;
  perform _lock_group(p_group);
  delete from payments where group_id = p_group;
  delete from game_entries where group_id = p_group;
  delete from games where group_id = p_group;
  delete from players where group_id = p_group;
  delete from groups where id = p_group;  -- members and the activity log go with it
end $$;

-- Sample groups can be deleted without typing anything.
create or replace function public.delete_sample_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin(p_group);
  if not (select is_sample from groups where id = p_group) then
    perform _fail('FT403', 'Only sample groups can be deleted.');
  end if;
  delete from payments where group_id = p_group;
  delete from game_entries where group_id = p_group;
  delete from games where group_id = p_group;
  delete from players where group_id = p_group;
  delete from groups where id = p_group;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security: members can read their groups' rows; nobody writes directly.
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.players       enable row level security;
alter table public.games         enable row level security;
alter table public.game_entries  enable row level security;
alter table public.payments      enable row level security;
alter table public.audit_log     enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (_shares_group(id));
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using (_is_member(id));
drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select to authenticated using (_is_member(group_id));
drop policy if exists players_read on public.players;
create policy players_read on public.players for select to authenticated using (_is_member(group_id));
drop policy if exists games_read on public.games;
create policy games_read on public.games for select to authenticated using (_is_member(group_id));
drop policy if exists entries_read on public.game_entries;
create policy entries_read on public.game_entries for select to authenticated using (_is_member(group_id));
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated using (_is_member(group_id));
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (_is_member(group_id));

-- Explicit grants (Supabase no longer grants Data API access to new tables by default).
revoke all on public.profiles, public.groups, public.group_members, public.players, public.games,
              public.game_entries, public.payments, public.audit_log from anon, authenticated;
grant select on public.profiles, public.groups, public.group_members, public.players, public.games,
                public.game_entries, public.payments, public.audit_log to authenticated;

-- Functions: helpers are private; the app-facing API is granted to signed-in users only.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public._is_member(uuid), public._is_admin(uuid), public._shares_group(uuid),
  public.update_my_profile(text), public.update_my_avatar(text),
  public.create_group(text, text[], integer), public.rename_group(uuid, text),
  public.preview_invite(text), public.join_group(text), public.regenerate_invite(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.add_player(uuid, text, boolean), public.update_player(uuid, text, boolean),
  public.claim_player(uuid), public.unclaim_player(uuid), public.add_me_as_player(uuid, text),
  public.save_game_draft(uuid, uuid, integer, text, date, text, jsonb, uuid),
  public.delete_draft(uuid, integer), public.finalise_game(uuid, integer),
  public.start_live_game(uuid, text, date, integer, uuid[], uuid), public.live_join(uuid, uuid, integer),
  public.live_rebuy(uuid, uuid, integer), public.live_undo_rebuy(uuid, uuid), public.live_cash_out(uuid, uuid, integer),
  public.live_remove(uuid, uuid), public.end_live_game(uuid),
  public.correct_game(uuid, integer, text, date, text, jsonb, text), public.void_game(uuid, integer, text), public.rename_game(uuid, text),
  public.get_balances(uuid), public.record_payment(uuid, uuid, uuid, integer, text, uuid),
  public.confirm_payment(uuid), public.cancel_payment(uuid, text),
  public.export_backup(uuid), public.restore_backup(uuid, jsonb),
  public.create_sample_group(), public.delete_sample_group(uuid), public.delete_group(uuid, text)
to authenticated;
-- RLS policies call these helpers as the signed-in user.
grant execute on function public._is_member(uuid), public._is_admin(uuid), public._shares_group(uuid) to authenticated;

-- Live updates (Supabase Realtime) for the tables the app watches.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['games', 'game_entries', 'payments', 'players', 'group_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Keep-alive: a do-nothing call a daily GitHub job makes so the free project
-- never counts as inactive (Supabase pauses free projects after 7 idle days).
-- It reads no data, so it's safe for anyone to call.
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- Tell the Data API (PostgREST) to pick up new and changed functions straight away.
notify pgrst, 'reload schema';
