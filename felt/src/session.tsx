import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface SessionValue {
  session: Session | null | undefined; // undefined while loading
  displayName: string;
  avatarUrl: string | null;
  recovering: boolean; // arrived from a password reset email
  endRecovery: () => void;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<SessionValue>(null as unknown as SessionValue);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', userId).maybeSingle();
    setDisplayName(data?.display_name ?? '');
    setAvatarUrl(data?.avatar_url ?? null);
  }, [userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  return (
    <Ctx.Provider value={{ session, displayName, avatarUrl, recovering, endRecovery: () => setRecovering(false), refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
