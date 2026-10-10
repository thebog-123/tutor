// Server-side tests: balances, permissions and safeguards, run through the
// real Supabase client against a local Auth + PostgREST + Postgres stack.
// Start it with `npm run stack:start` (see scripts/local-stack.sh).
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { simplifyDebts } from '../src/lib/settle';

const URL = process.env.FELT_TEST_URL ?? 'http://127.0.0.1:54321';
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const ANON = jwt.sign({ role: 'anon', iss: 'supabase' }, SECRET, { expiresIn: '1h' });

const up = await fetch(`${URL}/auth/v1/health`).then((r) => r.ok).catch(() => false);
const suite = up ? describe : describe.skip;

async function newUser(name: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`;
  const { error } = await c.auth.signUp({ email, password: 'correct-horse-9', options: { data: { display_name: name } } });
  if (error) throw error;
  return c;
}

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}

async function fails(p: PromiseLike<{ error: { code?: string; message?: string } | null }>, code: string, msg?: RegExp) {
  const { error } = await p;
  expect(error, 'expected an error').not.toBeNull();
  expect(error!.code).toBe(code);
  if (msg) expect(error!.message).toMatch(msg);
  return error!;
}

const entry = (player_id: string, buy: number, rebuys: number[], out: number) => ({
  player_id,
  buy_in_pence: buy,
  rebuys_pence: rebuys,
  cash_out_pence: out,
});

suite('Felt database', () => {
  let alice: SupabaseClient; // group creator, admin
  let bob: SupabaseClient; // member
  let carol: SupabaseClient; // outsider
  let groupId: string;
  let invite: string;
  let P: Record<string, string>; // player name -> id
  let aliceId: string;
  let bobId: string;

  async function balances(c: SupabaseClient = alice) {
    const rows = await ok(c.rpc('get_balances', { p_group: groupId }));
    const names = Object.fromEntries(Object.entries(P).map(([n, id]) => [id, n]));
    return Object.fromEntries(
      (rows as { player_id: string; balance_pence: number; profit_pence: number }[]).map((r) => [
        names[r.player_id],
        { balance: Number(r.balance_pence), profit: Number(r.profit_pence) },
      ]),
    );
  }

  async function finalGame(name: string, entries: ReturnType<typeof entry>[]) {
    const draft = await ok(
      bob.rpc('save_game_draft', {
        p_group: groupId, p_game: null, p_expected_version: null, p_name: name, p_played_on: '2026-10-01',
        p_notes: '', p_entries: entries, p_client_token: randomUUID(),
      }),
    );
    await ok(alice.rpc('finalise_game', { p_game: draft.id, p_expected_version: draft.version }));
    return draft.id as string;
  }

  beforeAll(async () => {
    [alice, bob, carol] = await Promise.all([newUser('Alice'), newUser('Bob'), newUser('Carol')]);
    aliceId = (await alice.auth.getUser()).data.user!.id;
    bobId = (await bob.auth.getUser()).data.user!.id;
    const names = ['Alex', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hari'];
    groupId = await ok(alice.rpc('create_group', { p_name: 'Friday Felt', p_player_names: names, p_claim_index: 1 }));
    const group = await ok(alice.from('groups').select('invite_code').eq('id', groupId).single());
    invite = group.invite_code;
    const players = await ok(alice.from('players').select('id,name').eq('group_id', groupId));
    P = Object.fromEntries(players.map((p: { id: string; name: string }) => [p.name, p.id]));
    await ok(bob.rpc('join_group', { p_code: invite }));
  });

  describe('groups and access', () => {
    it('creates eight players, makes the creator admin and attaches their claim', async () => {
      expect(Object.keys(P)).toHaveLength(8);
      const me = await ok(alice.from('group_members').select('role').eq('group_id', groupId).eq('user_id', aliceId).single());
      expect(me.role).toBe('admin');
      const alex = await ok(alice.from('players').select('claimed_by').eq('id', P.Alex).single());
      expect(alex.claimed_by).toBe(aliceId);
    });

    it('lets people join with the invite link as members, and joining twice is harmless', async () => {
      await ok(bob.rpc('join_group', { p_code: invite.toUpperCase() }));
      const rows = await ok(alice.from('group_members').select('user_id,role').eq('group_id', groupId));
      expect(rows).toHaveLength(2);
      expect(rows.find((r: { user_id: string }) => r.user_id === bobId)!.role).toBe('member');
      await fails(carol.rpc('join_group', { p_code: 'not-a-code' }), 'FT404');
    });

    it('hides every record from non-members', async () => {
      for (const table of ['groups', 'group_members', 'players', 'games', 'game_entries', 'payments', 'audit_log']) {
        const rows = await ok(carol.from(table).select('*').eq(table === 'groups' ? 'id' : 'group_id', groupId));
        expect(rows, table).toEqual([]);
      }
      await fails(carol.rpc('get_balances', { p_group: groupId }), 'FT403');
      await fails(carol.rpc('add_player', { p_group: groupId, p_name: 'Sneaky' }), 'FT403');
      await fails(carol.rpc('export_backup', { p_group: groupId }), 'FT403');
    });

    it('blocks signed-out access entirely', async () => {
      const anon = createClient(URL, ANON, { auth: { persistSession: false } });
      const { data, error } = await anon.from('players').select('*');
      expect(data ?? []).toEqual([]);
      expect(error?.code ?? '42501').toBe('42501');
      const rpc = await anon.rpc('get_balances', { p_group: groupId });
      expect(rpc.error).not.toBeNull();
    });

    it('rejects direct table writes, even from an admin', async () => {
      const ins = await alice.from('games').insert({ group_id: groupId, name: 'x', played_on: '2026-01-01', status: 'final' });
      expect(ins.error).not.toBeNull();
      const upd = await alice.from('group_members').update({ role: 'admin' }).eq('user_id', bobId).select();
      expect(upd.error).not.toBeNull();
      const del = await bob.from('players').delete().eq('group_id', groupId).select();
      expect(del.error).not.toBeNull();
      expect(Object.keys(await balances())).toHaveLength(8);
    });

    it('enforces admin-only membership actions on the server', async () => {
      await fails(bob.rpc('set_member_role', { p_group: groupId, p_user: bobId, p_role: 'admin' }), 'FT403');
      await fails(bob.rpc('regenerate_invite', { p_group: groupId }), 'FT403');
      await fails(bob.rpc('remove_member', { p_group: groupId, p_user: aliceId }), 'FT403');
      await fails(alice.rpc('set_member_role', { p_group: groupId, p_user: aliceId, p_role: 'member' }), 'FT422', /at least one admin/);
      await fails(alice.rpc('remove_member', { p_group: groupId, p_user: aliceId }), 'FT422', /admin/);
    });
  });

  describe('players', () => {
    it('lets a member claim one unclaimed player', async () => {
      await fails(bob.rpc('claim_player', { p_player: P.Alex }), 'FT409', /already been claimed/);
      await ok(bob.rpc('claim_player', { p_player: P.Ben }));
      await fails(bob.rpc('claim_player', { p_player: P.Chloe }), 'FT409', /already claimed a player/);
      await fails(carol.rpc('claim_player', { p_player: P.Chloe }), 'FT403');
    });

    it('lets members rename only their own player, admins anyone', async () => {
      await ok(bob.rpc('update_player', { p_player: P.Ben, p_name: 'Ben', p_active: null }));
      await fails(bob.rpc('update_player', { p_player: P.Chloe, p_name: 'Clo', p_active: null }), 'FT403');
      await fails(alice.rpc('update_player', { p_player: P.Chloe, p_name: 'ben', p_active: null }), 'FT409');
      await ok(alice.rpc('update_player', { p_player: P.Chloe, p_name: 'Chloe', p_active: true }));
    });

    it('lets any member add more players', async () => {
      const id = await ok(bob.rpc('add_player', { p_group: groupId, p_name: 'Izzy' }));
      P.Izzy = id;
      await fails(bob.rpc('add_player', { p_group: groupId, p_name: ' izzy ' }), 'FT409');
    });
  });

  describe('games', () => {
    it('validates amounts as whole pennies', async () => {
      const base = { p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Bad', p_played_on: '2026-10-01', p_notes: '' };
      await fails(bob.rpc('save_game_draft', { ...base, p_entries: [entry(P.Alex, 10.5, [], 0), entry(P.Ben, 1000, [], 0)] }), 'FT422', /whole number/);
      await fails(bob.rpc('save_game_draft', { ...base, p_entries: [entry(P.Alex, 1000, [0], 0), entry(P.Ben, 1000, [], 0)] }), 'FT422', /more than/);
      await fails(bob.rpc('save_game_draft', { ...base, p_entries: [entry(P.Alex, 1000, [], 0)] }), 'FT422', /two players/);
      await fails(bob.rpc('save_game_draft', { ...base, p_entries: [entry(P.Alex, 1000, [], 0), entry(P.Alex, 1000, [], 0)] }), 'FT422', /twice/);
      await fails(bob.rpc('save_game_draft', { ...base, p_played_on: '2099-01-01', p_entries: [entry(P.Alex, 1000, [], 0), entry(P.Ben, 1000, [], 0)] }), 'FT422', /future/);
    });

    it('lets members submit drafts but only admins finalise them', async () => {
      const token = randomUUID();
      const args = {
        p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Draft night', p_played_on: '2026-10-02',
        p_notes: '', p_entries: [entry(P.Alex, 2000, [], 2500), entry(P.Ben, 2000, [], 1000)], p_client_token: token,
      };
      const first = await ok(bob.rpc('save_game_draft', args));
      // A retried submission with the same token returns the same game rather than a duplicate.
      const again = await ok(bob.rpc('save_game_draft', args));
      expect(again.id).toBe(first.id);
      expect(again.duplicate).toBe(true);
      const count = await ok(alice.from('games').select('id').eq('client_token', token));
      expect(count).toHaveLength(1);

      await fails(bob.rpc('finalise_game', { p_game: first.id, p_expected_version: 1 }), 'FT403');
      // Unbalanced: £40 in, £35 out.
      await fails(alice.rpc('finalise_game', { p_game: first.id, p_expected_version: 1 }), 'FT422', /Difference: -£5.00/);

      const fixed = await ok(bob.rpc('save_game_draft', {
        ...args, p_game: first.id, p_expected_version: 1, p_client_token: null,
        p_entries: [entry(P.Alex, 2000, [], 2500), entry(P.Ben, 2000, [], 1500)],
      }));
      expect(fixed.version).toBe(2);
      // Stale version is refused.
      await fails(alice.rpc('finalise_game', { p_game: first.id, p_expected_version: 1 }), 'FT409');
      await ok(alice.rpc('finalise_game', { p_game: first.id, p_expected_version: 2 }));
      // Double-tap on finalise is harmless.
      await ok(alice.rpc('finalise_game', { p_game: first.id, p_expected_version: 2 }));
      // Members can no longer edit it.
      await fails(bob.rpc('save_game_draft', { ...args, p_game: first.id, p_expected_version: 2, p_client_token: null }), 'FT409');
      await fails(bob.rpc('delete_draft', { p_game: first.id, p_expected_version: 2 }), 'FT409');
      // Members can read every player's results.
      const entries = await ok(bob.from('game_entries').select('player_id,cash_out_pence').eq('game_id', first.id));
      expect(entries).toHaveLength(2);
    });

    it('stops other members editing or deleting someone else\'s draft', async () => {
      const dave = await newUser('Dave');
      await ok(dave.rpc('join_group', { p_code: invite }));
      const d = await ok(bob.rpc('save_game_draft', {
        p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Bob draft', p_played_on: '2026-10-03',
        p_notes: '', p_entries: [entry(P.Alex, 100, [], 100), entry(P.Ben, 100, [], 100)],
      }));
      await fails(dave.rpc('delete_draft', { p_game: d.id, p_expected_version: 1 }), 'FT403');
      await fails(dave.rpc('save_game_draft', {
        p_group: groupId, p_game: d.id, p_expected_version: 1, p_name: 'Hijack', p_played_on: '2026-10-03',
        p_notes: '', p_entries: [entry(P.Alex, 100, [], 100), entry(P.Ben, 100, [], 100)],
      }), 'FT403');
      await ok(bob.rpc('delete_draft', { p_game: d.id, p_expected_version: 1 }));
      await ok(alice.rpc('remove_member', { p_group: groupId, p_user: (await dave.auth.getUser()).data.user!.id }));
    });

    it('handles simultaneous edits safely: exactly one wins', async () => {
      const d = await ok(bob.rpc('save_game_draft', {
        p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Race', p_played_on: '2026-10-03',
        p_notes: '', p_entries: [entry(P.Alex, 100, [], 100), entry(P.Ben, 100, [], 100)],
      }));
      const edit = (c: SupabaseClient, name: string) =>
        c.rpc('save_game_draft', {
          p_group: groupId, p_game: d.id, p_expected_version: 1, p_name: name, p_played_on: '2026-10-03',
          p_notes: '', p_entries: [entry(P.Alex, 100, [], 100), entry(P.Ben, 100, [], 100)],
        });
      const results = await Promise.all([edit(alice, 'A'), edit(bob, 'B'), edit(alice, 'C'), edit(bob, 'D')]);
      const winners = results.filter((r) => !r.error);
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => r.error?.code === 'FT409')).toHaveLength(3);
      const final = await ok(alice.from('games').select('version').eq('id', d.id).single());
      expect(final.version).toBe(2);
      await ok(alice.rpc('delete_draft', { p_game: d.id, p_expected_version: 2 }));
    });
  });

  describe('balances and payments', () => {
    let night: string;

    it('computes balances from finalised games only', async () => {
      // Earlier test finalised: Alex +5, Ben -5.
      night = await finalGame('Big night', [
        entry(P.Alex, 2000, [], 4500), // +25
        entry(P.Ben, 2000, [1000], 500), // -25
        entry(P.Chloe, 2000, [], 3000), // +10
        entry(P.Dev, 2000, [1000, 1000], 0), // -40
        entry(P.Ella, 2000, [], 7000), // +50
        entry(P.Finn, 2000, [], 0), // -20
      ]);
      // A draft with big numbers must not count.
      await ok(bob.rpc('save_game_draft', {
        p_group: groupId, p_game: null, p_expected_version: null, p_name: 'Unfinished', p_played_on: '2026-10-04',
        p_notes: '', p_entries: [entry(P.Grace, 99900, [], 0), entry(P.Hari, 100, [], 100000)],
      }));
      const bal = await balances(bob);
      expect(bal.Alex.balance).toBe(3000);
      expect(bal.Ben.balance).toBe(-3000);
      expect(bal.Chloe.balance).toBe(1000);
      expect(bal.Dev.balance).toBe(-4000);
      expect(bal.Ella.balance).toBe(5000);
      expect(bal.Finn.balance).toBe(-2000);
      expect(bal.Grace.balance).toBe(0);
      expect(Object.values(bal).reduce((a, b) => a + b.balance, 0)).toBe(0);

      const transfers = simplifyDebts(Object.entries(bal).map(([name, v]) => ({ id: name, name, balance: v.balance })));
      expect(transfers.length).toBeLessThanOrEqual(4);
      expect(transfers.reduce((a, t) => a + t.amount, 0)).toBe(9000);
    });

    it('treats member-recorded payments as pending until an admin confirms them', async () => {
      const token = randomUUID();
      const args = { p_group: groupId, p_from: P.Dev, p_to: P.Ella, p_amount_pence: 1500, p_note: 'Monzo', p_client_token: token };
      const id = await ok(bob.rpc('record_payment', args));
      expect(await ok(bob.rpc('record_payment', args))).toBe(id); // retry is not a duplicate
      expect((await balances()).Dev.balance).toBe(-4000);
      await fails(bob.rpc('confirm_payment', { p_payment: id }), 'FT403');
      await ok(alice.rpc('confirm_payment', { p_payment: id }));
      await ok(alice.rpc('confirm_payment', { p_payment: id })); // double tap
      const bal = await balances();
      expect(bal.Dev.balance).toBe(-2500); // partial payment
      expect(bal.Ella.balance).toBe(3500);
      const row = await ok(bob.from('payments').select('recorded_by,confirmed_by,status,recorded_at,confirmed_at').eq('id', id).single());
      expect(row).toMatchObject({ recorded_by: bobId, confirmed_by: aliceId, status: 'confirmed' });
      expect(row.confirmed_at).toBeTruthy();
    });

    it('never lets a payment move the leaderboard', async () => {
      const bal = await balances();
      expect(bal.Dev.profit).toBe(-4000);
      expect(bal.Ella.profit).toBe(5000);
    });

    it('rejects overpayments and payments between the wrong people', async () => {
      await fails(alice.rpc('record_payment', { p_group: groupId, p_from: P.Dev, p_to: P.Alex, p_amount_pence: 2600, p_note: '' }), 'FT422', /only owes £25.00/);
      await fails(alice.rpc('record_payment', { p_group: groupId, p_from: P.Dev, p_to: P.Chloe, p_amount_pence: 1100, p_note: '' }), 'FT422', /only owed £10.00/);
      await fails(alice.rpc('record_payment', { p_group: groupId, p_from: P.Alex, p_to: P.Ella, p_amount_pence: 100, p_note: '' }), 'FT422', /only owes £0.00/);
      await fails(alice.rpc('record_payment', { p_group: groupId, p_from: P.Dev, p_to: P.Dev, p_amount_pence: 100, p_note: '' }), 'FT422');
      await fails(alice.rpc('record_payment', { p_group: groupId, p_from: P.Dev, p_to: P.Alex, p_amount_pence: 0, p_note: '' }), 'FT422');
      // A pending claim that would overpay cannot be confirmed.
      const id = await ok(bob.rpc('record_payment', { p_group: groupId, p_from: P.Finn, p_to: P.Alex, p_amount_pence: 9900, p_note: '' }));
      await fails(alice.rpc('confirm_payment', { p_payment: id }), 'FT422', /overpay/);
      await ok(bob.rpc('cancel_payment', { p_payment: id, p_reason: 'typo' }));
    });

    it('settles everything when the suggested transfers are paid', async () => {
      const bal = await balances();
      const transfers = simplifyDebts(Object.entries(bal).map(([name, v]) => ({ id: name, name, balance: v.balance })));
      for (const t of transfers) {
        await ok(alice.rpc('record_payment', { p_group: groupId, p_from: P[t.from], p_to: P[t.to], p_amount_pence: t.amount, p_note: 'settle up' }));
      }
      const after = await balances();
      expect(Object.values(after).every((v) => v.balance === 0)).toBe(true);
      expect(after.Dev.profit).toBe(-4000); // leaderboard unchanged
    });

    it('lets only admins void a confirmed payment, with a reason, and audits it', async () => {
      const [pay] = await ok(alice.from('payments').select('id,amount_pence,from_player').eq('group_id', groupId).eq('status', 'confirmed').limit(1));
      await fails(bob.rpc('cancel_payment', { p_payment: pay.id, p_reason: 'no' }), 'FT403');
      await fails(alice.rpc('cancel_payment', { p_payment: pay.id, p_reason: '' }), 'FT422', /reason/);
      await ok(alice.rpc('cancel_payment', { p_payment: pay.id, p_reason: 'Transfer bounced' }));
      const log = await ok(bob.from('audit_log').select('action,reason,actor').eq('entity_id', pay.id).eq('action', 'payment.voided'));
      expect(log).toEqual([{ action: 'payment.voided', reason: 'Transfer bounced', actor: aliceId }]);
      const bal = await balances();
      expect(Object.values(bal).reduce((a, b) => a + b.balance, 0)).toBe(0);
    });

    it('lets only admins correct a finalised game, keeping before/after in the audit log', async () => {
      const g = await ok(alice.from('games').select('version').eq('id', night).single());
      const corrected = [
        entry(P.Alex, 2000, [], 4500), entry(P.Ben, 2000, [1000], 500), entry(P.Chloe, 2000, [], 3000),
        entry(P.Dev, 2000, [1000, 1000], 1000), entry(P.Ella, 2000, [], 6000), entry(P.Finn, 2000, [], 0),
      ];
      const args = { p_game: night, p_expected_version: g.version, p_name: 'Big night', p_played_on: '2026-10-01', p_notes: 'fixed', p_entries: corrected, p_reason: 'Dev had a £10 chip left' };
      await fails(bob.rpc('correct_game', args), 'FT403');
      await fails(alice.rpc('correct_game', { ...args, p_reason: ' ' }), 'FT422', /Reason/);
      await fails(alice.rpc('correct_game', { ...args, p_entries: corrected.map((e, i) => (i === 0 ? { ...e, cash_out_pence: 1 } : e)) }), 'FT422', /must equal/);
      expect(await ok(alice.rpc('correct_game', args))).toBe(g.version + 1);
      await fails(alice.rpc('correct_game', args), 'FT409'); // stale version
      const [log] = await ok(bob.from('audit_log').select('detail,reason').eq('entity_id', night).eq('action', 'game.corrected'));
      expect(log.reason).toBe('Dev had a £10 chip left');
      const devBefore = log.detail.before.entries.find((e: { player_name: string }) => e.player_name === 'Dev');
      const devAfter = log.detail.after.entries.find((e: { player_name: string }) => e.player_name === 'Dev');
      expect([devBefore.cash_out_pence, devAfter.cash_out_pence]).toEqual([0, 1000]);
      expect((await balances()).Dev.profit).toBe(-3000);
    });

    it('lets only admins void a finalised game', async () => {
      const g = await ok(alice.from('games').select('id,version').eq('name', 'Draft night').eq('group_id', groupId).single());
      await fails(bob.rpc('void_game', { p_game: g.id, p_expected_version: g.version, p_reason: 'dupe' }), 'FT403');
      await ok(alice.rpc('void_game', { p_game: g.id, p_expected_version: g.version, p_reason: 'Entered twice' }));
      const bal = await balances();
      expect(bal.Alex.profit).toBe(2500); // the +£5 from the voided game is gone
    });
  });

  describe('backup and restore', () => {
    it('round-trips a backup and rejects invalid ones without touching data', async () => {
      await fails(bob.rpc('export_backup', { p_group: groupId }), 'FT403');
      const backup = await ok(alice.rpc('export_backup', { p_group: groupId }));
      expect(backup.format).toBe('felt-backup');
      const before = await balances();

      await fails(bob.rpc('restore_backup', { p_group: groupId, p_backup: backup }), 'FT403');
      const broken = structuredClone(backup);
      const fin = broken.games.find((g: { status: string }) => g.status === 'final');
      fin.entries[0].cash_out_pence += 1;
      await fails(alice.rpc('restore_backup', { p_group: groupId, p_backup: broken }), 'FT422', /must equal/);
      await fails(alice.rpc('restore_backup', { p_group: groupId, p_backup: { format: 'nope' } }), 'FT422');
      expect(await balances()).toEqual(before); // nothing changed

      const result = await ok(alice.rpc('restore_backup', { p_group: groupId, p_backup: backup }));
      expect(result.games).toBe(backup.games.length);
      const players = await ok(alice.from('players').select('id,name,claimed_by').eq('group_id', groupId));
      P = Object.fromEntries(players.map((p: { id: string; name: string }) => [p.name, p.id]));
      expect(await balances()).toEqual(before);
      expect(players.find((p: { name: string }) => p.name === 'Ben')!.claimed_by).toBe(bobId);
    });
  });

  describe('sample data', () => {
    it('lives in its own clearly flagged group that only it can delete', async () => {
      const sample = await ok(carol.rpc('create_sample_group'));
      const g = await ok(carol.from('groups').select('name,is_sample').eq('id', sample).single());
      expect(g).toEqual({ name: 'Sample group (demo data)', is_sample: true });
      await fails(carol.rpc('create_sample_group'), 'FT409');
      const bal = await ok(carol.rpc('get_balances', { p_group: sample }));
      expect(bal.reduce((a: number, r: { balance_pence: number }) => a + Number(r.balance_pence), 0)).toBe(0);
      expect(await ok(alice.from('games').select('id').eq('group_id', sample))).toEqual([]);
      await fails(alice.rpc('delete_sample_group', { p_group: groupId }), 'FT403');
      await ok(carol.rpc('delete_sample_group', { p_group: sample }));
    });
  });

  describe('leaving', () => {
    it('releases the claimed player when a member leaves', async () => {
      await ok(bob.rpc('remove_member', { p_group: groupId, p_user: bobId }));
      const ben = await ok(alice.from('players').select('claimed_by').eq('id', P.Ben).single());
      expect(ben.claimed_by).toBeNull();
      expect(await ok(bob.from('players').select('id').eq('group_id', groupId))).toEqual([]);
    });
  });
});
