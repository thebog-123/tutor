-- Update: game settle status, rename games, name ownership, creator stays admin (18 Oct 2026).

-- Safe to run more than once. Everything here is also in ../schema.sql.

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

revoke execute on function public.rename_game(uuid, text) from public, anon;
grant execute on function public.rename_game(uuid, text) to authenticated;

notify pgrst, 'reload schema';
