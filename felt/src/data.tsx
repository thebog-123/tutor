import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase, select, rpc } from './supabase';
import { useSession } from './session';
import type { BalanceRow, Game, Group, Member, Payment, Player, Profile } from './types';

export interface GroupData {
  group: Group;
  members: Member[];
  profiles: Map<string, Profile>;
  players: Player[];
  playersById: Map<string, Player>;
  games: Game[];
  payments: Payment[];
  balances: BalanceRow[];
  me: { userId: string; isAdmin: boolean; player: Player | null };
  personName: (userId: string | null) => string;
  playerName: (playerId: string) => string;
}

interface GroupState {
  data: GroupData | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

const Ctx = createContext<GroupState>(null as unknown as GroupState);

async function loadGroup(groupId: string, userId: string): Promise<GroupData> {
  const [group, members, players, games, payments, balances, profiles] = await Promise.all([
    select<Group>(supabase.from('groups').select('*').eq('id', groupId).maybeSingle()),
    select<Member[]>(supabase.from('group_members').select('*').eq('group_id', groupId)),
    select<Player[]>(supabase.from('players').select('*').eq('group_id', groupId).order('name')),
    select<(Game & { game_entries: Game['entries'] })[]>(
      supabase.from('games').select('*, game_entries(*)').eq('group_id', groupId).order('played_on', { ascending: false }).order('created_at', { ascending: false }),
    ),
    select<Payment[]>(supabase.from('payments').select('*').eq('group_id', groupId).order('recorded_at', { ascending: false })),
    rpc<BalanceRow[]>('get_balances', { p_group: groupId }),
    select<Profile[]>(supabase.from('profiles').select('id, display_name')),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const playersById = new Map(players.map((p) => [p.id, p]));
  const meMember = members.find((m) => m.user_id === userId);
  return {
    group,
    members,
    profiles: profileMap,
    players,
    playersById,
    games: games.map(({ game_entries, ...g }) => ({ ...g, entries: game_entries ?? [] })),
    payments,
    balances: balances.map((b) => ({
      ...b,
      profit_pence: Number(b.profit_pence),
      paid_pence: Number(b.paid_pence),
      received_pence: Number(b.received_pence),
      balance_pence: Number(b.balance_pence),
    })),
    me: { userId, isAdmin: meMember?.role === 'admin', player: players.find((p) => p.claimed_by === userId) ?? null },
    personName: (id) => (id ? profileMap.get(id)?.display_name ?? 'Former member' : 'Unknown'),
    playerName: (id) => playersById.get(id)?.name ?? 'Unknown player',
  };
}

/**
 * Loads everything for one group and keeps it fresh: it reloads when another
 * member changes something (Supabase Realtime), when the tab regains focus,
 * and after every action in this browser.
 */
export function GroupProvider({ groupId, children }: { groupId: string; children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await loadGroup(groupId, userId);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [groupId, userId]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    void reload();
  }, [reload]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 400);
    };
    const channel = supabase.channel(`group-${groupId}`);
    for (const table of ['games', 'game_entries', 'payments', 'players', 'group_members']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, soon);
    }
    channel.subscribe();
    const onVisible = () => document.visibilityState === 'visible' && soon();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', soon);
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', soon);
    };
  }, [groupId, reload]);

  const value = useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useGroupState = () => useContext(Ctx);

/** For screens rendered only once data has loaded. */
export function useGroup(): GroupData & { reload: () => Promise<void> } {
  const { data, reload } = useContext(Ctx);
  if (!data) throw new Error('useGroup used before group data loaded');
  return { ...data, reload };
}
