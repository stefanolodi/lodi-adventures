import { createContext } from 'react';
import type { Session, AuthError } from '@supabase/supabase-js';

export type GuestUnlock = 'guest' | 'wrong' | 'error';

export interface AuthContextValue {
  session: Session | null;
  isOwner: boolean;
  isGuest: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  unlockAsGuest: (password: string) => Promise<GuestUnlock>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
