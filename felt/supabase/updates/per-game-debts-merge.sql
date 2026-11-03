-- Update: debts tracked game by game; no overall-balance limit on payments; merge players (3 Nov 2026).

-- Safe to run more than once. Everything here is also in ../schema.sql.

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
    update payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), version = version + 1
    where id = p_payment;
    perform _audit(v_p.group_id, 'payment.confirmed', 'payment', p_payment,
      jsonb_build_object('from', v_p.from_player, 'to', v_p.to_player, 'amount_pence', v_p.amount_pence));
  end if;
  return v_did;
end $$;

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
  -- No "can't owe that much overall" check: debts are game by game between pairs of
  -- players, and both people confirming the payment is the safeguard against mistakes.
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

-- Admin: fold one player into another (e.g. a guest someone had to create because
-- their name was claimed by the wrong account).
create or replace function public.merge_players(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_a players%rowtype; v_b players%rowtype;
begin
  select * into v_a from players where id = p_from;
  select * into v_b from players where id = p_into;
  if v_a.id is null or v_b.id is null then perform _fail('FT404', 'Player not found.'); end if;
  if v_a.group_id <> v_b.group_id then perform _fail('FT422', 'Both players must be in the same group.'); end if;
  if p_from = p_into then perform _fail('FT422', 'Pick two different players.'); end if;
  perform _require_admin(v_a.group_id);
  perform _lock_group(v_a.group_id);
  if v_a.claimed_by is not null and v_b.claimed_by is not null then
    perform _fail('FT409', 'Both players are claimed by different accounts. Unclaim one of them first.');
  end if;
  if exists (select 1 from game_entries a join game_entries b on a.game_id = b.game_id
             where a.player_id = p_from and b.player_id = p_into) then
    perform _fail('FT409', v_a.name || ' and ' || v_b.name || ' both played in the same game, so they can''t be merged.');
  end if;
  if exists (select 1 from payments where status in ('pending', 'confirmed')
             and ((from_player = p_from and to_player = p_into) or (from_player = p_into and to_player = p_from))) then
    perform _fail('FT409', 'There are payments between ' || v_a.name || ' and ' || v_b.name || '. Void or reject them first.');
  end if;
  -- Rejected/voided payments between the two would become payments to themselves: drop them.
  delete from payments where (from_player = p_from and to_player = p_into) or (from_player = p_into and to_player = p_from);
  update game_entries set player_id = p_into where player_id = p_from;
  update payments set from_player = p_into where from_player = p_from;
  update payments set to_player = p_into where to_player = p_from;
  if v_a.claimed_by is not null then
    update players set claimed_by = null where id = p_from;
    update players set claimed_by = v_a.claimed_by, is_guest = false where id = p_into;
  end if;
  if not v_a.is_guest then update players set is_guest = false where id = p_into; end if;
  delete from players where id = p_from;
  perform _audit(v_a.group_id, 'player.merged', 'player', p_into, jsonb_build_object('from', v_a.name, 'into', v_b.name));
end $$;

revoke execute on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
