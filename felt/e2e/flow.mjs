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
await bob.getByRole('link', { name: 'Record a finished game' }).click();
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
await alice.getByText('Needs you').waitFor();
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
// Bob says he has paid Alice; it only counts once Alice confirms she received it.
await bob.goto(invite.replace(/join\/.*/, ''));
await bob.getByRole('link', { name: 'Payments' }).last().click();
const bobRow = bob.locator('.transfer').filter({ hasText: /^Ben pays Alice/ });
await bobRow.getByRole('button', { name: "I've paid" }).click();
await bob.getByRole('button', { name: 'Record payment' }).click();
await bob.getByText('Waiting for confirmation (1)').waitFor();
if (await bob.getByRole('button', { name: /Yes, I/ }).count()) errors.push('payer can confirm the receiving side');
await shot(bob, '10-payment-waiting-for-payee');
await alice.reload();
await alice.getByRole('button', { name: 'Yes, I received this' }).click();
await alice.getByRole('button', { name: 'Confirm', exact: true }).click();
await alice.getByText('Fully confirmed', { exact: false }).waitFor();
await shot(alice, '11-payment-confirmed');

// --- Leaderboard is unchanged by payments
await alice.getByRole('link', { name: 'Leaderboard' }).last().click();
await alice.getByText('Paying off a debt never changes the rankings', { exact: false }).waitFor();
await shot(alice, '12-leaderboard');
const board = await alice.locator('ol.list').innerText();
// Sort by something else, then reverse it
await alice.getByRole('group', { name: 'Sort by' }).getByRole('button', { name: 'Win %' }).click();
await alice.getByRole('button', { name: /highest first/i }).click();
await alice.getByText('↑ Lowest first').waitFor();
const sortedBoard = await alice.locator('ol.list').innerText();
if (!/^1\n[A-Z]{1,2}\n(Ben|Dev)/.test(sortedBoard)) errors.push(`unexpected sorted board: ${sortedBoard}`);
await shot(alice, '12b-leaderboard-sorted');
await alice.getByRole('link', { name: 'Home' }).last().click();
await alice.getByText('All-time poker result').waitFor();
await shot(alice, '13-overview');

// --- Live game: Alice starts it, Bob joins and rebuys from his phone, then leaves early
await alice.getByRole('link', { name: '● Start live game' }).click();
await alice.getByRole('button', { name: '● Start live game' }).click();
await alice.locator('.badge.live').first().waitFor();
const liveUrl = alice.url();
await bob.goto(liveUrl);
await bob.getByRole('button', { name: 'Join for £20' }).click();
await bob.locator('.entry-card').filter({ hasText: 'Ben' }).getByRole('button', { name: '+ Rebuy £20' }).click();
await bob.getByText('Ben rebought £20').waitFor();
// Alice's screen picks up Bob's changes by itself (Realtime, or the 8s safety-net refresh).
await alice.locator('.entry-card').filter({ hasText: 'Ben' }).getByText('In £40').waitFor({ timeout: 15000 });
await shot(alice, '17-live-game');
await bob.locator('.entry-card').filter({ hasText: 'Ben' }).getByRole('button', { name: 'Cash out' }).click();
await bob.getByLabel("Chips they're leaving with").fill('10');
await bob.getByRole('button', { name: 'Save' }).click();
await bob.getByText('Cashed out (1)').waitFor();
await shot(bob, '18-live-cashed-out-early');
await alice.getByText('Cashed out (1)').waitFor({ timeout: 15000 });
await alice.locator('.entry-card').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Cash out' }).click();
await alice.getByLabel("Chips they're leaving with").fill('50');
await alice.getByRole('button', { name: 'Save' }).click();
await alice.getByRole('button', { name: 'End game' }).click();
await alice.getByText('Ending will finalise it straight away').waitFor();
await alice.getByRole('button', { name: 'End game' }).last().click();
await alice.getByText('Game ended and finalised').waitFor();

// --- You page, profile picture, podium
await alice.getByRole('link', { name: 'You' }).last().click();
await alice.getByRole('heading', { name: 'You' }).waitFor();
await shot(alice, '19-you');
await alice.getByRole('link', { name: 'Add a profile picture' }).click();
await alice.locator('input[type=file][accept="image/*"]').setInputFiles('public/icons/apple-touch-icon.png');
await alice.getByText('Profile picture updated').waitFor();
await alice.getByRole('link', { name: 'Stats' }).count();
await alice.goto(liveUrl.replace(/games\/.*/, 'you/stats'));
await alice.getByText('Game by game').waitFor();
await shot(alice, '20-my-stats');
await alice.getByRole('link', { name: 'Leaderboard' }).last().click();
await alice.getByRole('group', { name: 'Sort by' }).getByRole('button', { name: 'Profit' }).click(); // back to highest first
await alice.locator('.podium').waitFor();
await alice.locator('.podium img.avatar').first().waitFor(); // new photo shows without a reload
await shot(alice, '21-leaderboard-podium');

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

await desk.getByRole('navigation', { name: 'Sections' }).first().getByRole('link', { name: 'Leaderboard' }).click();
await desk.getByRole('button', { name: /^Avg \/ game/ }).click();
await desk.locator('td.sorted').first().waitFor();
await shot(desk, '15b-desktop-leaderboard-sorted');

// --- Sample group stays separate
await desk.goto(`${BASE}#/groups`);
await desk.getByRole('button', { name: 'Explore a sample group' }).click();
await desk.locator('.sample-strip').waitFor();
await shot(desk, '16-desktop-sample');

console.log(JSON.stringify({ invite, firstTransfer, board, sortedBoard, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
