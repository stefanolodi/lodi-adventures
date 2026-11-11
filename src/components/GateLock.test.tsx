import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { fakeAuth, type FakeAuth, type FakeDatabase } from '../test/fakeSupabase';

// AuthProvider reads the owner id when the module loads, so the env stub has to run before the imports.
vi.hoisted(() => {
  vi.stubEnv('VITE_OWNER_USER_ID', 'owner');
});

const db = vi.hoisted((): FakeDatabase => ({ albums: [], photos: [] }));
const reads = vi.hoisted((): string[] => []);
const auth = vi.hoisted(() => ({}) as FakeAuth);

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase');
  const base = fakeSupabase(db, new Set(), auth);
  return {
    supabase: {
      ...base,
      from: (table: string) => {
        reads.push(table);
        return base.from(table);
      },
    },
  };
});

const anonymous = (id: string) => ({ access_token: `${id}-token`, user: { id, is_anonymous: true } });

beforeEach(() => {
  Object.assign(auth, fakeAuth({ session: null }));
  reads.length = 0;
  db.albums = [
    {
      id: 'some-album',
      title: 'Beach trip',
      description: 'Beach trip description',
      event_date: '2024-06-01',
      year: 2024,
      cover_url: 'https://res.cloudinary.com/demo/image/upload/some-album.jpg',
      cover_public_id: 'some-album',
      is_private: false,
      display_order: 0,
    },
  ];
  db.photos = [
    {
      id: 'photo-1',
      album_id: 'some-album',
      title: 'Photo 1',
      note: '',
      url: 'https://res.cloudinary.com/demo/image/upload/photo-1.jpg',
      public_id: 'photo-1',
      width: 1200,
      height: 800,
      display_order: 0,
      created_at: '2024-06-02T10:00:00Z',
    },
  ];
});

function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const gate = () => screen.queryByRole('dialog', { name: 'Password gate' });
const findGate = () => screen.findByRole('dialog', { name: 'Password gate' });
const findPage = async () => (await screen.findAllByText('Beach trip', {}, { timeout: 2000 })).length;

// Waits for pending promises and the queries a mounted page starts, so a page behind the gate would have drawn its images by now.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

async function submit(password: string) {
  fireEvent.change(await screen.findByPlaceholderText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
  await settle();
}

const callsTo = (name: string) => auth.calls.filter((call) => call === name).length;

// The App renders every route, so a route moved outside GateLock fails here.
describe('Rule 5: the gate covers every page except /login, and the owner skips it', () => {
  it.each(['/', '/album/some-album', '/no-such-page'])('shows the gate to a stranger at %s', async (path) => {
    renderApp(path);
    expect(await findGate()).toBeInTheDocument();
  });

  it('leaves /login open to a stranger', async () => {
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Owner sign in' })).toBeInTheDocument();
    expect(gate()).not.toBeInTheDocument();
  });

  it.each(['/', '/album/some-album'])('lets the owner skip the gate at %s', async (path) => {
    auth.session = { access_token: 'owner-token', user: { id: 'owner', is_anonymous: false } };
    renderApp(path);
    expect(await findPage()).toBeGreaterThan(0);
    expect(gate()).not.toBeInTheDocument();
    expect(callsTo('is_guest')).toBe(0);
  });

  it('shows the gate again once the owner signs out', async () => {
    auth.session = { access_token: 'owner-token', user: { id: 'owner', is_anonymous: false } };
    renderApp('/');
    await findPage();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await findGate()).toBeInTheDocument();
  });
});

describe('the gate makes a visitor a guest only on submit', () => {
  it.each(['/', '/album/some-album'])('reads no data, loads no image and signs in nobody for a stranger at %s', async (path) => {
    renderApp(path);
    expect(await findGate()).toBeInTheDocument();
    await settle();
    expect(reads).toEqual([]);
    expect(screen.queryAllByRole('img')).toEqual([]);
    expect(auth.calls).toEqual(['getSession']);
  });

  it('signs in anonymously, claims the guest password, then renders the page', async () => {
    renderApp('/');
    await submit('letmein');

    expect(await findPage()).toBeGreaterThan(0);
    expect(gate()).not.toBeInTheDocument();
    expect(auth.calls.filter((call) => call !== 'is_guest')).toEqual(['getSession', 'getSession', 'signInAnonymously', 'claim_guest']);
    expect(auth.guests).toEqual(new Set(['anon-1']));
    expect(reads).toContain('albums');
  });

  it('keeps the page closed after a wrong password, and reuses the anonymous user on the next try', async () => {
    renderApp('/');
    await submit('wrong');

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password');
    expect(gate()).toBeInTheDocument();
    expect(reads).toEqual([]);

    await submit('letmein');
    expect(await findPage()).toBeGreaterThan(0);
    expect(callsTo('signInAnonymously')).toBe(1);
    expect(callsTo('claim_guest')).toBe(2);
  });

  it('signs a locked user out locally, and starts a new anonymous user on the next try', async () => {
    auth.session = anonymous('anon-locked');
    auth.wrongAttempts.set('anon-locked', 5);
    renderApp('/');
    await submit('letmein');

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password');
    expect(auth.calls).toContain('signOut:local');
    expect(auth.calls.some((call) => call.startsWith('signOut:') && call !== 'signOut:local')).toBe(false);
    expect(gate()).toBeInTheDocument();

    await submit('letmein');
    expect(await findPage()).toBeGreaterThan(0);
    expect(callsTo('signInAnonymously')).toBe(1);
    expect(auth.guests).toEqual(new Set(['anon-1']));
  });

  it.each(['signInAnonymously', 'claim_guest'] as const)('says something went wrong when %s fails', async (call) => {
    auth.failing.add(call);
    renderApp('/');
    await submit('letmein');

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(gate()).toBeInTheDocument();
    expect(reads).toEqual([]);
  });

  it('disables the submit button while a try is running', async () => {
    auth.stalled.add('claim_guest');
    renderApp('/');
    await submit('letmein');

    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    await settle();
    expect(callsTo('claim_guest')).toBe(1);
  });
});

describe('a visitor with a session', () => {
  it('renders the page for a returning guest without showing the gate', async () => {
    auth.session = anonymous('anon-guest');
    auth.guests.add('anon-guest');
    renderApp('/album/some-album');

    expect(gate()).not.toBeInTheDocument();
    expect(await findPage()).toBeGreaterThan(0);
    expect(gate()).not.toBeInTheDocument();
    expect(callsTo('signInAnonymously')).toBe(0);
  });

  it('shows the gate when the session is not a guest', async () => {
    auth.session = anonymous('anon-stranger');
    renderApp('/');

    expect(await findGate()).toBeInTheDocument();
    await settle();
    expect(reads).toEqual([]);
  });

  it.each(['getSession', 'is_guest'] as const)('renders neither the gate nor the page while %s loads', async (call) => {
    auth.session = anonymous('anon-guest');
    auth.guests.add('anon-guest');
    auth.stalled.add(call);
    renderApp('/');
    await settle();

    expect(gate()).not.toBeInTheDocument();
    expect(screen.queryByText('Beach trip')).not.toBeInTheDocument();
    expect(reads).toEqual([]);
  });
});

describe('the bundle holds no guest password', () => {
  it('reads no guest password from the env anywhere in src', () => {
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
    // Built in two parts so this file does not match its own search.
    const needle = 'import.meta.env.VITE_' + 'GUEST_PASSWORD';
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.keys(sources).filter((file) => sources[file].includes(needle))).toEqual([]);
  });
});
