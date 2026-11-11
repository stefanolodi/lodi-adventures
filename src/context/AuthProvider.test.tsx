import { useContext, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { AuthProvider } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { fakeAuth, type FakeAuth } from '../test/fakeSupabase';

// AuthProvider reads the owner id when the module loads, so the env stub has to run before the imports.
vi.hoisted(() => {
  vi.stubEnv('VITE_OWNER_USER_ID', 'owner');
});

const auth = vi.hoisted(() => ({}) as FakeAuth);

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase');
  return { supabase: fakeSupabase({}, new Set(), auth) };
});

const anonymous = (id: string) => ({ access_token: `${id}-token`, user: { id, is_anonymous: true } });

beforeEach(() => {
  Object.assign(auth, fakeAuth({ session: null }));
});

// The test calls unlockAsGuest and reads isOwner through this, outside the component.
const latest: { current: AuthContextValue | null } = { current: null };

function AuthState() {
  const value = useContext(AuthContext);
  useEffect(() => {
    latest.current = value;
  });
  if (!value || value.isLoading) return <p>Loading</p>;
  return (
    <p>
      {value.session ? 'Signed in' : 'Signed out'}, {value.isGuest ? 'guest' : 'not a guest'}
    </p>
  );
}

function renderAuth() {
  latest.current = null;
  return render(
    <AuthProvider>
      <AuthState />
    </AuthProvider>
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const callsTo = (name: string) => auth.calls.filter((call) => call === name).length;

describe('AuthProvider', () => {
  it('finishes loading as signed out when the stored session cannot be read', async () => {
    auth.failing.add('getSession');
    renderAuth();
    expect(await screen.findByText('Signed out, not a guest')).toBeInTheDocument();
  });

  it('is not a guest with no session, and asks Supabase nothing about guests', async () => {
    renderAuth();
    expect(await screen.findByText('Signed out, not a guest')).toBeInTheDocument();
    expect(callsTo('is_guest')).toBe(0);
  });

  it('takes isGuest from is_guest for the session user', async () => {
    auth.session = anonymous('anon-guest');
    auth.guests.add('anon-guest');
    renderAuth();
    expect(await screen.findByText('Signed in, guest')).toBeInTheDocument();
  });

  it('is not a guest when is_guest says no', async () => {
    auth.session = anonymous('anon-stranger');
    renderAuth();
    expect(await screen.findByText('Signed in, not a guest')).toBeInTheDocument();
  });

  it('counts a failed guest check as not a guest', async () => {
    auth.session = anonymous('anon-guest');
    auth.guests.add('anon-guest');
    auth.failing.add('is_guest');
    renderAuth();
    expect(await screen.findByText('Signed in, not a guest')).toBeInTheDocument();
  });

  it('stays loading until the guest check answers', async () => {
    auth.session = anonymous('anon-guest');
    auth.stalled.add('is_guest');
    renderAuth();
    await settle();
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('skips the guest check for the owner', async () => {
    auth.session = { access_token: 'owner-token', user: { id: 'owner', is_anonymous: false } };
    renderAuth();
    expect(await screen.findByText('Signed in, not a guest')).toBeInTheDocument();
    expect(latest.current?.isOwner).toBe(true);
    expect(callsTo('is_guest')).toBe(0);
  });

  it('asks again when the user id changes', async () => {
    auth.session = anonymous('anon-stranger');
    auth.guests.add('anon-1');
    renderAuth();
    expect(await screen.findByText('Signed in, not a guest')).toBeInTheDocument();

    await act(async () => {
      await supabase.auth.signOut({ scope: 'local' });
    });
    expect(screen.getByText('Signed out, not a guest')).toBeInTheDocument();

    await act(async () => {
      await supabase.auth.signInAnonymously();
    });
    expect(await screen.findByText('Signed in, guest')).toBeInTheDocument();
    expect(callsTo('is_guest')).toBe(2);
  });
});

describe('unlockAsGuest', () => {
  async function unlock(password: string) {
    let result: string | undefined;
    await act(async () => {
      result = await latest.current?.unlockAsGuest(password);
    });
    return result;
  }

  it('makes a stranger a guest with the right password', async () => {
    renderAuth();
    await screen.findByText('Signed out, not a guest');
    expect(await unlock('letmein')).toBe('guest');
    expect(screen.getByText('Signed in, guest')).toBeInTheDocument();
  });

  it('keeps the guest when the guest check for the new user answers no after the claim', async () => {
    // Holding the sign-in lets the check for the new anonymous user read the guests table before
    // the claim writes to it. Holding the check makes it answer after the claim.
    let releaseSignIn: () => void = () => {};
    let releaseCheck: () => void = () => {};
    auth.held.set('signInAnonymously', new Promise<void>((resolve) => (releaseSignIn = resolve)));
    auth.held.set('is_guest', new Promise<void>((resolve) => (releaseCheck = resolve)));
    renderAuth();
    await screen.findByText('Signed out, not a guest');

    let unlocking: Promise<string> | undefined;
    act(() => {
      unlocking = latest.current?.unlockAsGuest('letmein');
    });
    await settle();
    expect(callsTo('is_guest')).toBe(1);
    expect(callsTo('claim_guest')).toBe(0);

    await act(async () => {
      releaseSignIn();
      expect(await unlocking).toBe('guest');
    });
    act(() => releaseCheck());
    await settle();

    expect(screen.getByText('Signed in, guest')).toBeInTheDocument();
  });

  it('returns wrong for a wrong password and keeps the anonymous user', async () => {
    renderAuth();
    await screen.findByText('Signed out, not a guest');
    expect(await unlock('nope')).toBe('wrong');
    expect(await unlock('nope')).toBe('wrong');
    expect(callsTo('signInAnonymously')).toBe(1);
    expect(screen.getByText('Signed in, not a guest')).toBeInTheDocument();
  });

  it('returns wrong for a locked user and signs it out locally', async () => {
    auth.session = anonymous('anon-locked');
    auth.wrongAttempts.set('anon-locked', 5);
    renderAuth();
    await screen.findByText('Signed in, not a guest');
    expect(await unlock('letmein')).toBe('wrong');
    expect(auth.calls).toContain('signOut:local');
    expect(screen.getByText('Signed out, not a guest')).toBeInTheDocument();
  });

  it.each(['signInAnonymously', 'claim_guest', 'getSession'] as const)('returns error when %s fails', async (call) => {
    renderAuth();
    await screen.findByText('Signed out, not a guest');
    auth.failing.add(call);
    expect(await unlock('letmein')).toBe('error');
  });

  it('returns error when the locked user cannot sign out', async () => {
    auth.session = anonymous('anon-locked');
    auth.wrongAttempts.set('anon-locked', 5);
    auth.failing.add('signOut');
    renderAuth();
    await screen.findByText('Signed in, not a guest');
    expect(await unlock('letmein')).toBe('error');
  });
});
