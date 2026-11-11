import { act, fireEvent, screen } from '@testing-library/react';
import { App } from '../App';
import type { FakeDatabase } from '../test/fakeSupabase';
import { renderWithProviders } from '../test/renderWithProviders';

// GateLock reads the password when the module loads, so the env stub has to run before the imports.
vi.hoisted(() => {
  vi.stubEnv('VITE_GUEST_PASSWORD', 'letmein');
});

const db = vi.hoisted((): FakeDatabase => ({ albums: [], photos: [] }));
const reads = vi.hoisted((): string[] => []);

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase');
  const base = fakeSupabase(db);
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

beforeEach(() => {
  sessionStorage.clear();
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

const gate = () => screen.queryByRole('dialog', { name: 'Password gate' });

// Lets the queries a mounted page would start come back, so a page behind the gate would have drawn its images.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

// The App renders every route, so a route moved outside GateLock fails here.
describe('Rule 5: the gate covers every page except /login, and the owner skips it', () => {
  it.each(['/', '/album/some-album', '/no-such-page'])('shows the gate to a guest at %s', (path) => {
    renderWithProviders(<App />, { path });
    expect(gate()).toBeInTheDocument();
  });

  it('leaves /login open to a guest', () => {
    renderWithProviders(<App />, { path: '/login' });
    expect(gate()).not.toBeInTheDocument();
  });

  it.each(['/', '/album/some-album'])('lets the owner skip the gate at %s', async (path) => {
    renderWithProviders(<App />, { path, isOwner: true });
    expect(gate()).not.toBeInTheDocument();
    expect((await screen.findAllByText('Beach trip')).length).toBeGreaterThan(0);
  });
});

describe('the gate mounts nothing behind it until a guest unlocks it', () => {
  it.each(['/', '/album/some-album'])('reads no data and loads no image for a guest at %s', async (path) => {
    renderWithProviders(<App />, { path });
    await settle();
    expect(gate()).toBeInTheDocument();
    expect(reads).toEqual([]);
    expect(screen.queryAllByRole('img')).toEqual([]);
  });

  it('renders the page once the guest types the password', async () => {
    renderWithProviders(<App />, { path: '/' });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'letmein' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect((await screen.findAllByText('Beach trip', {}, { timeout: 2000 })).length).toBeGreaterThan(0);
    expect(gate()).not.toBeInTheDocument();
    expect(reads).toContain('albums');
  });

  it('keeps the page closed after a wrong password', async () => {
    renderWithProviders(<App />, { path: '/' });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    await settle();

    expect(gate()).toBeInTheDocument();
    expect(reads).toEqual([]);
  });

  it('renders the page without the gate when this tab already unlocked it', async () => {
    sessionStorage.setItem('penny-gate-unlocked', '1');
    renderWithProviders(<App />, { path: '/album/some-album' });

    expect(gate()).not.toBeInTheDocument();
    expect((await screen.findAllByText('Beach trip')).length).toBeGreaterThan(0);
  });
});
