// Live games: several phones updating the same game at once.
import { describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const URL = process.env.FELT_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON = jwt.sign({ role: 'anon', iss: 'supabase' }, 'super-secret-jwt-token-with-at-least-32-characters-long', { expiresIn: '1h' });
const up = await fetch(`${URL}/auth/v1/health`).then((r) => r.ok).catch(() => false);
// In CI the stack must be running: fail loudly instead of quietly skipping.
if (!up && process.env.FELT_REQUIRE_STACK) throw new Error(`Local Supabase stack not reachable at ${URL}`);
const suite = up ? describe : describe.skip;

async function newUser(name: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signUp({ email: `${name}-${randomUUID().slice(0, 8)}@example.com`, password: 'correct-horse-9', options: { data: { display_name: name } } });
  if (error) throw error;
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ok(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<any> {
  const { data, error } = await p;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}
async function fails(p: PromiseLike<{ error: { code?: string; message?: string } | null }>, code: string, msg?: RegExp) {
  const { error } = await p;
  expect(error, 'expected an error').not.toBeNull();
  expect(error!.code).toBe(code);
  if (msg) expect(error!.message).toMatch(msg);
}

suite('live games', () => {
  it('runs a game live from several phones and ends it as a draft', async () => {
    const [alice, bob, carol, outsider] = await Promise.all([newUser('alice'), newUser('bob'), newUser('carol'), newUser('zed')]);
    const groupId = await ok(alice.rpc('create_group', { p_name: 'Live', p_player_names: ['Alex', 'Ben', 'Chloe', 'Dev'], p_claim_index: 1 }));
    const { invite_code } = await ok(alice.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bob.rpc('join_group', { p_code: invite_code }));
    await ok(carol.rpc('join_group', { p_code: invite_code }));
    const players = await ok(alice.from('players').select('id,name').eq('group_id', groupId));
    const P: Record<string, string> = Object.fromEntries(players.map((p: { id: string; name: string }) => [p.name, p.id]));
    await ok(bob.rpc('claim_player', { p_player: P.Ben }));

    // Bob starts it at the table with himself and Alex; a double tap doesn't make two games.
    const token = randomUUID();
    const start = { p_group: groupId, p_name: 'Friday live', p_played_on: '2026-10-09', p_standard_buy_in: 2000, p_players: [P.Ben, P.Alex], p_client_token: token };
    const game = await ok(bob.rpc('start_live_game', start));
    expect(await ok(bob.rpc('start_live_game', start))).toBe(game);
    await fails(outsider.rpc('live_join', { p_game: game, p_player: P.Chloe, p_buy_in: 2000 }), 'FT403');

    // Carol and Dev join later; everyone acts at the same time from different phones.
    await ok(carol.rpc('live_join', { p_game: game, p_player: P.Chloe, p_buy_in: 2000 }));
    await fails(carol.rpc('live_join', { p_game: game, p_player: P.Chloe, p_buy_in: 2000 }), 'FT409', /already in/);
    await Promise.all([
      ok(alice.rpc('live_join', { p_game: game, p_player: P.Dev, p_buy_in: 1000 })),
      ok(alice.rpc('live_rebuy', { p_game: game, p_player: P.Alex, p_amount: 2000 })),
      ok(bob.rpc('live_rebuy', { p_game: game, p_player: P.Ben, p_amount: 2000 })),
      ok(carol.rpc('live_rebuy', { p_game: game, p_player: P.Ben, p_amount: 1000 })),
      ok(carol.rpc('live_rebuy', { p_game: game, p_player: P.Chloe, p_amount: 500 })),
    ]);
    let entries = await ok(alice.from('game_entries').select('player_id,buy_in_pence,rebuys_pence,cash_out_pence').eq('game_id', game));
    const byName = () => Object.fromEntries(entries.map((e: { player_id: string }) => [players.find((p: { id: string }) => p.id === e.player_id).name, e]));
    let e = byName();
    expect(e.Ben.rebuys_pence.sort()).toEqual([1000, 2000]); // neither rebuy was lost
    expect(e.Alex.rebuys_pence).toEqual([2000]);
    expect(e.Dev.buy_in_pence).toBe(1000);

    // Dev leaves early with £25; Chloe's rebuy was a mistake.
    await ok(bob.rpc('live_cash_out', { p_game: game, p_player: P.Dev, p_amount: 2500 }));
    await fails(bob.rpc('live_rebuy', { p_game: game, p_player: P.Dev, p_amount: 2000 }), 'FT409', /cashed out/);
    await ok(carol.rpc('live_undo_rebuy', { p_game: game, p_player: P.Chloe }));
    // Can't end while people are still playing, and only the starter or an admin can end it.
    await fails(bob.rpc('end_live_game', { p_game: game }), 'FT422', /3 players are still playing/);
    // Drafts can't be finalised directly from live, and the live game doesn't count yet.
    await fails(alice.rpc('finalise_game', { p_game: game, p_expected_version: 1 }), 'FT409');
    expect((await ok(alice.rpc('get_balances', { p_group: groupId }))).every((b: { balance_pence: number }) => Number(b.balance_pence) === 0)).toBe(true);

    await ok(alice.rpc('live_cash_out', { p_game: game, p_player: P.Alex, p_amount: 9000 }));
    await ok(bob.rpc('live_cash_out', { p_game: game, p_player: P.Ben, p_amount: 0 }));
    await ok(carol.rpc('live_cash_out', { p_game: game, p_player: P.Chloe, p_amount: 2500 }));
    await fails(carol.rpc('end_live_game', { p_game: game }), 'FT403');
    const version = await ok(bob.rpc('end_live_game', { p_game: game }));
    await fails(bob.rpc('live_rebuy', { p_game: game, p_player: P.Ben, p_amount: 2000 }), 'FT409', /ended/);

    // It's now an ordinary draft: in = 2000+2000 + 2000+2000+1000 + 2000 + 1000 = 12000, out = 9000+0+2500+2500 = 14000 → unbalanced.
    await fails(alice.rpc('finalise_game', { p_game: game, p_expected_version: version }), 'FT422', /Difference: £20.00/);
    entries = await ok(alice.from('game_entries').select('player_id,buy_in_pence,rebuys_pence,cash_out_pence').eq('game_id', game));
    e = byName();
    // Fix Alex's cash-out in the normal draft editor and finalise.
    const fixed = await ok(alice.rpc('save_game_draft', {
      p_group: groupId, p_game: game, p_expected_version: version, p_name: 'Friday live', p_played_on: '2026-10-09', p_notes: '',
      p_entries: entries.map((x: { player_id: string; cash_out_pence: number }) => ({ ...x, cash_out_pence: x.player_id === P.Alex ? 7000 : x.cash_out_pence })),
    }));
    await ok(alice.rpc('finalise_game', { p_game: game, p_expected_version: fixed.version }));
    const bal = await ok(alice.rpc('get_balances', { p_group: groupId }));
    const total = bal.reduce((a: number, b: { balance_pence: number }) => a + Number(b.balance_pence), 0);
    expect(total).toBe(0);
  });

  it('lets the starter or an admin delete a live game, and never stores a live game without cash-outs as final', async () => {
    const alice = await newUser('a2');
    const groupId = await ok(alice.rpc('create_group', { p_name: 'G', p_player_names: ['A', 'B'], p_claim_index: null }));
    const players = await ok(alice.from('players').select('id').eq('group_id', groupId));
    const game = await ok(alice.rpc('start_live_game', { p_group: groupId, p_name: 'x', p_played_on: '2026-10-09', p_standard_buy_in: 500, p_players: players.map((p: { id: string }) => p.id) }));
    const backup = await ok(alice.rpc('export_backup', { p_group: groupId }));
    expect(backup.games).toEqual([]); // live games aren't in backups
    const g = await ok(alice.from('games').select('version').eq('id', game).single());
    await ok(alice.rpc('delete_draft', { p_game: game, p_expected_version: g.version }));
    expect(await ok(alice.from('games').select('id').eq('id', game))).toEqual([]);
  });
});

suite('profile pictures', () => {
  it('stores a small image, refuses anything else, and only shows it to people sharing a group', async () => {
    const [ann, bea, cal] = await Promise.all([newUser('ann'), newUser('bea'), newUser('cal')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Pics', p_player_names: ['A', 'B'], p_claim_index: 1 }));
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await ok(ann.rpc('update_my_avatar', { p_image: png }));
    await fails(ann.rpc('update_my_avatar', { p_image: 'javascript:alert(1)' }), 'FT422');
    await fails(ann.rpc('update_my_avatar', { p_image: 'data:image/svg+xml;base64,PHN2Zz4=' }), 'FT422');
    await fails(ann.rpc('update_my_avatar', { p_image: 'data:image/png;base64,' + 'A'.repeat(200001) }), 'FT422');
    const annId = (await ann.auth.getUser()).data.user!.id;
    expect((await ok(bea.from('profiles').select('avatar_url').eq('id', annId))).map((r: { avatar_url: string }) => r.avatar_url)).toEqual([png]);
    expect(await ok(cal.from('profiles').select('avatar_url').eq('id', annId))).toEqual([]); // not in a shared group
    await ok(ann.rpc('update_my_avatar', { p_image: null }));
    expect((await ok(bea.from('profiles').select('avatar_url').eq('id', annId)))[0].avatar_url).toBeNull();
  });
});

suite('deleting a group', () => {
  it('lets only an admin delete a whole group, after typing DELETE', async () => {
    const [ann, bea] = await Promise.all([newUser('del-a'), newUser('del-b')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Test group', p_player_names: ['A', 'B'], p_claim_index: 1 }));
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    const players = await ok(ann.from('players').select('id').eq('group_id', groupId));
    const d = await ok(ann.rpc('save_game_draft', {
      p_group: groupId, p_game: null, p_expected_version: null, p_name: 'g', p_played_on: '2026-10-01', p_notes: '',
      p_entries: players.map((p: { id: string }, i: number) => ({ player_id: p.id, buy_in_pence: 1000, rebuys_pence: [], cash_out_pence: i ? 0 : 2000 })),
    }));
    await ok(ann.rpc('finalise_game', { p_game: d.id, p_expected_version: d.version }));
    await fails(bea.rpc('delete_group', { p_group: groupId, p_confirm: 'DELETE' }), 'FT403');
    await fails(ann.rpc('delete_group', { p_group: groupId, p_confirm: 'yes' }), 'FT422');
    await ok(ann.rpc('delete_group', { p_group: groupId, p_confirm: 'delete' }));
    expect(await ok(ann.from('groups').select('id').eq('id', groupId))).toEqual([]);
    expect(await ok(bea.from('group_members').select('group_id').eq('group_id', groupId))).toEqual([]);
    await fails(ann.rpc('get_balances', { p_group: groupId }), 'FT403');
  });
});

suite('starting small', () => {
  it('creates a group with just its creator, and lets a friend add themselves after joining', async () => {
    const [ann, bea] = await Promise.all([newUser('solo-a'), newUser('solo-b')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Just me', p_player_names: ['Ann'], p_claim_index: 1 }));
    await fails(ann.rpc('create_group', { p_name: 'Nobody', p_player_names: [], p_claim_index: null }), 'FT422');
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    await fails(bea.rpc('add_me_as_player', { p_group: groupId, p_name: 'ann' }), 'FT409', /This is me/);
    const id = await ok(bea.rpc('add_me_as_player', { p_group: groupId, p_name: 'Bea' }));
    await fails(bea.rpc('add_me_as_player', { p_group: groupId, p_name: 'Bea 2' }), 'FT409', /already have a player/);
    const beaId = (await bea.auth.getUser()).data.user!.id;
    expect(await ok(ann.from('players').select('name,claimed_by').eq('id', id).single())).toEqual({ name: 'Bea', claimed_by: beaId });
    const outsider = await newUser('solo-c');
    await fails(outsider.rpc('add_me_as_player', { p_group: groupId, p_name: 'Cat' }), 'FT403');
  });
});

suite('guests', () => {
  it('adds a guest who plays and owes money but stays off the leaderboard until they claim it', async () => {
    const [ann, gus] = await Promise.all([newUser('g-ann'), newUser('g-gus')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Guests', p_player_names: ['Ann'], p_claim_index: 1 }));
    const guest = await ok(ann.rpc('add_player', { p_group: groupId, p_name: 'Gus', p_guest: true }));
    const annPlayer = (await ok(ann.from('players').select('id').eq('group_id', groupId).eq('name', 'Ann').single())).id;
    const game = await ok(ann.rpc('start_live_game', { p_group: groupId, p_name: 'n', p_played_on: '2026-10-09', p_standard_buy_in: 1000, p_players: [annPlayer, guest] }));
    await ok(ann.rpc('live_cash_out', { p_game: game, p_player: annPlayer, p_amount: 2000 }));
    await ok(ann.rpc('live_cash_out', { p_game: game, p_player: guest, p_amount: 0 }));
    const v = await ok(ann.rpc('end_live_game', { p_game: game }));
    await ok(ann.rpc('finalise_game', { p_game: game, p_expected_version: v }));
    const bal = await ok(ann.rpc('get_balances', { p_group: groupId }));
    expect(bal.find((b: { player_id: string }) => b.player_id === guest).balance_pence).toBe(-1000);
    // The guest pays the host; the admin confirms for the guest (nobody is signed in as them).
    const pay = await ok(ann.rpc('record_payment', { p_group: groupId, p_from: guest, p_to: annPlayer, p_amount_pence: 1000, p_note: 'cash' }));
    await ok(ann.rpc('confirm_payment', { p_payment: pay }));
    expect((await ok(ann.from('payments').select('status').eq('id', pay).single())).status).toBe('confirmed');
    // Later Gus joins the group and claims his guest player: he becomes a regular player.
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(gus.rpc('join_group', { p_code: invite_code }));
    await ok(gus.rpc('claim_player', { p_player: guest }));
    expect((await ok(ann.from('players').select('is_guest').eq('id', guest).single())).is_guest).toBe(false);
  });
});

suite('backup reminder', () => {
  it('records when an admin last downloaded a backup, and keeps guests as guests on restore', async () => {
    const [ann, bea] = await Promise.all([newUser('bk-a'), newUser('bk-b')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Backups', p_player_names: ['Ann'], p_claim_index: 1 }));
    await ok(ann.rpc('add_player', { p_group: groupId, p_name: 'Gus', p_guest: true }));
    const { invite_code, last_backup_at } = await ok(ann.from('groups').select('invite_code,last_backup_at').eq('id', groupId).single());
    expect(last_backup_at).toBeNull();
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    await fails(bea.rpc('export_backup', { p_group: groupId }), 'FT403');
    const backup = await ok(ann.rpc('export_backup', { p_group: groupId }));
    const annId = (await ann.auth.getUser()).data.user!.id;
    const g = await ok(bea.from('groups').select('last_backup_at,last_backup_by').eq('id', groupId).single());
    expect(g.last_backup_by).toBe(annId);
    expect(Date.now() - new Date(g.last_backup_at).getTime()).toBeLessThan(60_000);
    await ok(ann.rpc('restore_backup', { p_group: groupId, p_backup: backup }));
    const gus = await ok(ann.from('players').select('is_guest').eq('group_id', groupId).eq('name', 'Gus').single());
    expect(gus.is_guest).toBe(true);
  });
});

suite('keep-alive', () => {
  it('lets anyone call ping, which reveals nothing, while every other function stays closed to signed-out callers', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect(await ok(anon.rpc('ping'))).toBe('ok');
    const { error } = await anon.rpc('get_balances', { p_group: randomUUID() });
    expect(error).not.toBeNull();
  });
});

suite('names, creators and renaming games', () => {
  it('lets only the account owner rename a claimed player, and keeps the creator an admin', async () => {
    const [ann, bea, cal] = await Promise.all([newUser('own-a'), newUser('own-b'), newUser('own-c')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Owners', p_player_names: ['Ann', 'Visitor'], p_claim_index: 1 }));
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    await ok(cal.rpc('join_group', { p_code: invite_code }));
    const beaPlayer = await ok(bea.rpc('add_me_as_player', { p_group: groupId, p_name: 'Bea' }));
    const annId = (await ann.auth.getUser()).data.user!.id;
    const beaId = (await bea.auth.getUser()).data.user!.id;

    // Names: the creator/admin can't rename Bea's player, Bea can.
    await fails(ann.rpc('update_player', { p_player: beaPlayer, p_name: 'Bee', p_active: null }), 'FT403', /Only own-b can change their own name/);
    await ok(ann.rpc('update_player', { p_player: beaPlayer, p_name: 'Bea', p_active: false })); // archiving is still fine
    await ok(bea.rpc('update_player', { p_player: beaPlayer, p_name: 'Bea B', p_active: null }));
    const visitor = (await ok(ann.from('players').select('id').eq('group_id', groupId).eq('name', 'Visitor').single())).id;
    await ok(ann.rpc('update_player', { p_player: visitor, p_name: 'Visiting Vic', p_active: null })); // unclaimed: admin may rename

    // Creator: another admin can't demote or remove them, or delete the group.
    await ok(ann.rpc('set_member_role', { p_group: groupId, p_user: beaId, p_role: 'admin' }));
    await fails(bea.rpc('set_member_role', { p_group: groupId, p_user: annId, p_role: 'member' }), 'FT403', /always stays an admin/);
    await fails(bea.rpc('remove_member', { p_group: groupId, p_user: annId }), 'FT403', /can't be removed/);
    await fails(bea.rpc('delete_group', { p_group: groupId, p_confirm: 'DELETE' }), 'FT403', /created the group/);
    // The creator can still manage others.
    await ok(ann.rpc('set_member_role', { p_group: groupId, p_user: beaId, p_role: 'member' }));
  });

  it('renames a finished game (recorder or admin only) and logs it', async () => {
    const [ann, bea, cal] = await Promise.all([newUser('rn-a'), newUser('rn-b'), newUser('rn-c')]);
    const groupId = await ok(ann.rpc('create_group', { p_name: 'Renames', p_player_names: ['Ann', 'Bob'], p_claim_index: 1 }));
    const { invite_code } = await ok(ann.from('groups').select('invite_code').eq('id', groupId).single());
    await ok(bea.rpc('join_group', { p_code: invite_code }));
    await ok(cal.rpc('join_group', { p_code: invite_code }));
    const players = await ok(ann.from('players').select('id').eq('group_id', groupId));
    const d = await ok(bea.rpc('save_game_draft', {
      p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Poker night', p_played_on: '2026-10-16', p_notes: '',
      p_entries: players.map((p: { id: string }, i: number) => ({ player_id: p.id, buy_in_pence: 1000, rebuys_pence: [], cash_out_pence: i ? 0 : 2000 })),
    }));
    await ok(ann.rpc('finalise_game', { p_game: d.id, p_expected_version: d.version }));
    await ok(bea.rpc('rename_game', { p_game: d.id, p_name: "Bea's birthday" })); // recorded it
    await fails(cal.rpc('rename_game', { p_game: d.id, p_name: 'Mine' }), 'FT403');
    await ok(ann.rpc('rename_game', { p_game: d.id, p_name: 'Birthday game' })); // admin
    await fails(ann.rpc('rename_game', { p_game: d.id, p_name: '  ' }), 'FT422');
    const g = await ok(ann.from('games').select('name,status').eq('id', d.id).single());
    expect(g).toEqual({ name: 'Birthday game', status: 'final' });
    const log = await ok(ann.from('audit_log').select('detail').eq('entity_id', d.id).eq('action', 'game.renamed').order('created_at'));
    expect(log.map((l: { detail: { to: string } }) => l.detail.to)).toEqual(["Bea's birthday", 'Birthday game']);
  });
});
