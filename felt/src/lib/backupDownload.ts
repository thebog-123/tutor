import { rpc } from '../supabase';
import { download, todayISO } from '../ui';

/** Download the group's JSON backup (the server records when it was taken). */
export async function downloadBackup(groupId: string, groupName: string) {
  const backup = await rpc('export_backup', { p_group: groupId });
  const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'felt';
  download(`${slug}-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
}

const DAY = 86_400_000;
const snoozeKey = (groupId: string) => `felt.backupSnooze.${groupId}`;

/**
 * Admins are reminded when there are finalised games newer than the last
 * backup and it's been 30+ days (or there has never been one).
 */
export function backupDue(
  group: { id: string; last_backup_at: string | null },
  games: { status: string; finalised_at: string | null; updated_at: string }[],
  now = Date.now(),
): boolean {
  const last = group.last_backup_at ? new Date(group.last_backup_at).getTime() : 0;
  const changed = games.some((g) => g.status === 'final' && new Date(g.finalised_at ?? g.updated_at).getTime() > last);
  if (!changed || now - last < 30 * DAY) return false;
  try {
    const snoozed = Number(localStorage.getItem(snoozeKey(group.id)) ?? 0);
    if (snoozed > now) return false;
  } catch {
    /* storage unavailable: just show it */
  }
  return true;
}

export function snoozeBackup(groupId: string, days = 7) {
  try {
    localStorage.setItem(snoozeKey(groupId), String(Date.now() + days * DAY));
  } catch {
    /* ignore */
  }
}
