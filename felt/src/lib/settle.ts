// Turn outstanding balances into a short list of payments that clears them.
//
// A balance is positive when the player is owed money and negative when they
// owe it. Balances always sum to zero. For up to 12 players with a non-zero
// balance we find the true minimum number of payments: the answer is
// (people with a balance) − (the most groups we can split them into where each
// group sums to zero), because each zero-sum group of k people settles in k−1
// payments. Bigger groups fall back to the greedy method (at most n−1 payments).

export interface Balance {
  id: string;
  name: string;
  balance: number; // pennies
}

export interface Transfer {
  from: string;
  to: string;
  amount: number; // pennies, > 0
}

const EXACT_LIMIT = 12;

function greedy(people: Balance[]): Transfer[] {
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ ...p }));
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ ...p, balance: -p.balance }));
  const byAmount = (a: Balance, b: Balance) => b.balance - a.balance || a.name.localeCompare(b.name);
  const out: Transfer[] = [];
  creditors.sort(byAmount);
  debtors.sort(byAmount);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].balance, creditors[j].balance);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].balance -= amount;
    creditors[j].balance -= amount;
    if (debtors[i].balance === 0) i++;
    if (creditors[j].balance === 0) j++;
  }
  return out;
}

/** Split people into the largest number of zero-sum groups (exact, for small n). */
function zeroSumGroups(people: Balance[]): Balance[][] {
  const n = people.length;
  const full = (1 << n) - 1;
  const total = new Array<number>(1 << n).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    total[mask] = total[mask ^ low] + people[31 - Math.clz32(low)].balance;
  }
  // best[mask] = most zero-sum groups that exactly partition mask (mask must sum to 0).
  const best = new Int16Array(1 << n).fill(-1);
  const choice = new Int32Array(1 << n);
  best[0] = 0;
  const solve = (mask: number): number => {
    if (best[mask] >= 0) return best[mask];
    const low = mask & -mask;
    const rest = mask ^ low;
    let top = 0;
    let pick = mask;
    // Enumerate subsets containing the lowest member.
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const group = sub | low;
      if (total[group] === 0 && (group === mask || total[mask ^ group] === 0)) {
        const value = 1 + (group === mask ? 0 : solve(mask ^ group));
        if (value > top) {
          top = value;
          pick = group;
        }
      }
      if (sub === 0) break;
    }
    best[mask] = top;
    choice[mask] = pick;
    return top;
  };
  solve(full);
  const groups: Balance[][] = [];
  for (let mask = full; mask; ) {
    const group = choice[mask];
    groups.push(people.filter((_, k) => group & (1 << k)));
    mask ^= group;
  }
  return groups;
}

export function simplifyDebts(balances: Balance[]): Transfer[] {
  const people = balances
    .filter((b) => b.balance !== 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const total = people.reduce((a, b) => a + b.balance, 0);
  if (total !== 0) {
    throw new Error(`Balances do not add up to zero (off by ${total}p).`);
  }
  if (people.length === 0) return [];
  if (people.length > EXACT_LIMIT) return greedy(people);
  return zeroSumGroups(people).flatMap(greedy);
}

/**
 * Pair people who owe with people who are owed, largest first, even when the
 * amounts don't add up to zero (as within a single game, where part of a debt
 * may already have been evened out elsewhere). Whatever can't be paired is left out.
 */
export function matchTransfers(balances: Balance[]): Transfer[] {
  return greedy(balances.filter((b) => b.balance !== 0).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)));
}
