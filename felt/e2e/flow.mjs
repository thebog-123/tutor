// End-to-end walkthrough in a real browser against the local stack:
// two friends sign up, create/join a group, record and finalise a game, settle up.
// Usage: npm run stack:start && npm run build && (write dist/config.js) && npx vite preview --port 4173
//        node e2e/flow.mjs [screenshotDir]
import { chromium, devices } from 'playwright';

const BASE = process.env.FELT_E2E_URL ?? 'http://localhost:4173/';
const OUT = process.argv[2] ?? 'test-results';
const id = Math.random().toString(36).slice(2, 7);
const errors = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const phone = { ...devices['iPhone 13'], defaultBrowserType: undefined };
delete phone.defaultBrowserType;

async function newPage(ctxOpts = phone) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/realtime|websocket|ERR_CONNECTION_REFUSED|404/i.test(m.text()) && errors.push(`console: ${m.text()}`));
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function signUp(page, name, url = BASE) {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${id}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
}

// --- Alice creates the group
const alice = await newPage();
await signUp(alice, 'Alice');
await alice.getByRole('heading', { name: 'Your groups' }).waitFor();
await shot(alice, '01-groups-empty');
await alice.getByRole('link', { name: 'Create a group' }).click();
await alice.getByLabel('Group name').fill('Friday Felt');
const names = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Grace', 'Hari'];
for (let i = 0; i < 8; i++) await alice.getByLabel(`Player ${i + 1} name`).fill(names[i]);
await shot(alice, '02-create-group');
await alice.getByRole('button', { name: 'Create group' }).click();
await alice.getByText('Invite friends').waitFor();
const invite = (await alice.locator('.code').textContent()).trim();
await shot(alice, '03-group-page');

// --- Bob joins through the invite link
const bob = await newPage();
await signUp(bob, 'Ben', invite);
await bob.getByRole('button', { name: 'Join group' }).click();
await bob.getByText('Find your name below').waitFor();
await bob.getByRole('listitem').filter({ hasText: /^BBen/ }).getByRole('button', { name: 'This is me' }).click();
await bob.getByRole('button', { name: "Yes, that's me" }).click();
await bob.getByText('Claimed by you').waitFor();

// --- Bob records a game as a draft
await bob.getByRole('link', { name: 'Games' }).last().click();
await bob.getByRole('link', { name: '+ New game' }).click();
for (const n of ['Alice', 'Ben', 'Chloe', 'Dev']) await bob.getByRole('button', { name: n, exact: true }).click();
await bob.getByLabel('Cash-out').nth(0).fill('45');
await bob.getByLabel('Cash-out').nth(1).fill('5');
await bob.getByLabel('Cash-out').nth(2).fill('30');
// Dev rebought once for the standard £20 and lost everything.
await bob.locator('.entry-card').nth(3).getByRole('button', { name: '+ £20' }).click();
await bob.getByLabel('Cash-out').nth(3).fill('0');
await bob.getByText('£20 over').or(bob.getByText('£20 short')).waitFor();
await shot(bob, '04-editor-unbalanced');
await bob.getByLabel('Cash-out').nth(3).fill('20');
await bob.getByText('✓ Balanced').waitFor();
await shot(bob, '05-editor-balanced');
await bob.getByRole('button', { name: 'Review' }).click();
await bob.getByText('Check before you submit').waitFor();
await shot(bob, '06-review');
await bob.getByRole('button', { name: 'Submit draft' }).click();
await bob.getByText('An admin needs to finalise it.').waitFor();
if (await bob.getByRole('button', { name: 'Finalise game' }).count()) errors.push('member can see Finalise button');

// --- Alice finalises it
await alice.goto(`${BASE}#/g/`);
await alice.reload();
await alice.getByText('Waiting for an admin').waitFor();
await shot(alice, '07-overview-admin-attention');
await alice.getByRole('link', { name: /Draft Poker night/ }).click();
await alice.getByRole('button', { name: 'Finalise game' }).click();
await alice.getByRole('button', { name: 'Finalise', exact: true }).click();
await alice.getByText('Final', { exact: true }).waitFor();
await shot(alice, '08-game-final');

// --- Payments
await alice.getByRole('link', { name: 'Payments' }).last().click();
await alice.getByText('Who owes whom').waitFor();
await shot(alice, '09-payments');
const firstTransfer = (await alice.locator('.transfer').first().innerText()).replace(/\s+/g, ' ');
// Bob says he has paid part of his debt
await bob.goto(invite.replace(/join\/.*/, ''));
await bob.getByRole('link', { name: 'Payments' }).last().click();
const bobRow = bob.locator('.transfer').filter({ hasText: /^Ben pays Chloe/ });
await bobRow.getByRole('button', { name: 'Paid?' }).click();
await bob.getByLabel('Amount').fill('5');
await bob.getByRole('button', { name: 'Submit for confirmation' }).click();
await bob.getByText('Waiting for an admin (1)').waitFor();
await shot(bob, '10-member-pending-payment');
await alice.reload();
await alice.getByRole('button', { name: 'Confirm received' }).click();
await alice.getByRole('button', { name: 'Confirm', exact: true }).click();
await alice.getByText('Confirmed by Alice').waitFor();
await shot(alice, '11-payment-confirmed');

// --- Leaderboard is unchanged by payments
await alice.getByRole('link', { name: 'Leaderboard' }).last().click();
await alice.getByText('Ranked by total profit').waitFor();
await shot(alice, '12-leaderboard');
const board = await alice.locator('ol.list').innerText();
await alice.getByRole('link', { name: 'Overview' }).last().click();
await alice.getByText('All-time poker result').waitFor();
await shot(alice, '13-overview');

// --- Desktop layout
const desk = await newPage({ viewport: { width: 1280, height: 860 } });
await desk.goto(BASE);
await desk.getByLabel('Email').fill(`alice-${id}@example.com`);
await desk.getByLabel('Password').fill('correct-horse-9');
await desk.getByRole('button', { name: 'Sign in' }).click();
await desk.getByText('All-time poker result').waitFor();
await shot(desk, '14-desktop-overview');
await desk.getByRole('navigation', { name: 'Sections' }).first().getByRole('link', { name: 'Payments' }).click();
await desk.getByText('Who owes whom').waitFor();
await shot(desk, '15-desktop-payments');

// --- Sample group stays separate
await desk.goto(`${BASE}#/groups`);
await desk.getByRole('button', { name: 'Explore a sample group' }).click();
await desk.locator('.sample-strip').waitFor();
await shot(desk, '16-desktop-sample');

console.log(JSON.stringify({ invite, firstTransfer, board, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
