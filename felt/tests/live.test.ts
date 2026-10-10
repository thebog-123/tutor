// Live games: several phones updating the same game at once.
import { describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const URL = process.env.FELT_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON = jwt.sign({ role: 'anon', iss: 'supabase' }, 'super-secret-jwt-token-with-at-least-32-characters-long', { expiresIn: '1h' });
const up = await fetch(`${URL}/auth/v1/health`).then((r) => r.ok).catch(() => false);
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
