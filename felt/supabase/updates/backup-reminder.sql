-- Update for projects set up before the backup reminder (10 Oct 2026).
-- Safe to run more than once. Everything here is also in ../schema.sql.

alter table public.groups add column if not exists last_backup_at timestamptz;
alter table public.groups add column if not exists last_backup_by uuid references auth.users (id) on delete set null;

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

create or replace function public.export_backup(p_group uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin(p_group);
  update groups set last_backup_at = now(), last_backup_by = auth.uid() where id = p_group;
  return _backup_json(p_group);
end $$;

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

revoke execute on function public._backup_json(uuid) from public, anon, authenticated;
grant execute on function public.export_backup(uuid), public.restore_backup(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
