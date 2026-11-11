import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type GuestUnlock } from './AuthContext';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

const OWNER_USER_ID = import.meta.env.VITE_OWNER_USER_ID as string;

type GuestCheck = { userId: string; isGuest: boolean };

async function checkIsGuest(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_guest');
    return !error && data === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasReadSession, setHasReadSession] = useState(false);
  const [guestCheck, setGuestCheck] = useState<GuestCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const userId = session?.user.id ?? null;
  const isOwner = userId !== null && userId === OWNER_USER_ID;
  const checksGuest = userId !== null && !isOwner;
  const isGuestKnown = !checksGuest || guestCheck?.userId === userId;
  const isGuest = checksGuest && guestCheck?.userId === userId && guestCheck.isGuest;

  // Loading covers the first page load only. A later sign-in, such as the anonymous one the
  // gate starts on submit, checks in the background so the gate stays on screen meanwhile.
  if (isLoading && hasReadSession && isGuestKnown) setIsLoading(false);

  useEffect(() => {
    // If the stored session cannot be read, the visitor starts signed out and the owner signs in again.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setHasReadSession(true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        void queryClient.invalidateQueries();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!checksGuest || userId === null) return;
    let isCurrent = true;
    void checkIsGuest().then((isGuest) => {
      if (!isCurrent) return;
      // A claim that succeeded while this check was in flight wins, because the check may have
      // read the guests table before the claim wrote to it.
      setGuestCheck((prev) => (prev?.userId === userId && prev.isGuest ? prev : { userId, isGuest }));
    });
    return () => {
      isCurrent = false;
    };
  }, [userId, checksGuest]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  // Runs only on submit, so a stranger who only looks at the gate creates no anonymous user. See ADR 0005.
  const unlockAsGuest = async (password: string): Promise<GuestUnlock> => {
    try {
      const { data: { session: stored }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return 'error';
      let current = stored;
      if (!current) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) return 'error';
        current = data.session;
      }

      const { data: claim, error } = await supabase.rpc('claim_guest', { password });
      if (error) return 'error';
      if (claim === 'guest') {
        setGuestCheck({ userId: current.user.id, isGuest: true });
        return 'guest';
      }
      if (claim === 'locked') {
        // Dropping the locked user lets the next try start a new anonymous user. The hourly cap
        // on anonymous sign-ins is what limits guessing. See ADR 0005.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        return signOutError ? 'error' : 'wrong';
      }
      return claim === 'wrong' ? 'wrong' : 'error';
    } catch {
      return 'error';
    }
  };

  return (
    <AuthContext.Provider value={{ session, isOwner, isGuest, isLoading, signIn, signOut, unlockAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}
