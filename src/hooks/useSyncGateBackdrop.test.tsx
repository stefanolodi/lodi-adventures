import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FakeDatabase } from '../test/fakeSupabase';
import { useSyncGateBackdrop } from './useSyncGateBackdrop';

const db = vi.hoisted((): FakeDatabase => ({}));
const fetched = vi.hoisted((): string[] => []);
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

vi.mock('../lib/fetchGateBackdropImage', () => ({
  fetchGateBackdropImage: (src: string) => {
    fetched.push(src);
    return Promise.resolve(`data:image/jpeg;base64,${btoa(src)}`);
  },
}));

const cloudinary = (name: string) => `https://res.cloudinary.com/demo/image/upload/${name}.jpg`;
const tiny = (name: string) => `https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,ar_16:10,w_40,q_60,f_jpg/${name}.jpg`;

function album(id: string, order: number, { isPrivate = false, isFeatured = false } = {}) {
  return {
    id,
    title: id,
    description: '',
    event_date: '2024-06-01',
    year: 2024,
    cover_url: cloudinary(id),
    cover_public_id: id,
    is_private: isPrivate,
    is_featured: isFeatured,
    display_order: order,
  };
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetched.length = 0;
  reads.length = 0;
  db.gate_backdrop = [];
  db.albums = [album('first', 0), album('featured', 1, { isFeatured: true })];
});

function renderSync(isOwner: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ owner }) => useSyncGateBackdrop(owner), { wrapper, initialProps: { owner: isOwner } });
}

const stored = () => db.gate_backdrop?.[0];

describe('useSyncGateBackdrop', () => {
  it('writes a 40-pixel copy of the featured album cover in the owner browser', async () => {
    renderSync(true);
    await waitFor(() => expect(stored()?.source_cover_url).toBe(cloudinary('featured')));
    expect(fetched).toEqual([tiny('featured')]);
    expect(stored()?.image).toBe(`data:image/jpeg;base64,${btoa(tiny('featured'))}`);
  });

  it('uses the cover a guest sees first when the featured album is private', async () => {
    db.albums = [album('private-featured', 0, { isPrivate: true, isFeatured: true }), album('public', 1)];
    renderSync(true);
    await waitFor(() => expect(stored()?.source_cover_url).toBe(cloudinary('public')));
    expect(fetched).toEqual([tiny('public')]);
  });

  it('clears the backdrop when no album is public', async () => {
    db.albums = [album('private', 0, { isPrivate: true, isFeatured: true })];
    db.gate_backdrop = [{ id: true, image: 'data:image/jpeg;base64,AA==', source_cover_url: cloudinary('old') }];
    renderSync(true);
    await waitFor(() => expect(db.gate_backdrop).toEqual([]));
    expect(fetched).toEqual([]);
  });

  it('follows the featured album when the owner features another one', async () => {
    renderSync(true);
    await waitFor(() => expect(stored()?.source_cover_url).toBe(cloudinary('featured')));

    db.albums = [album('first', 0, { isFeatured: true }), album('featured', 1)];
    await act(() => queryClient.invalidateQueries({ queryKey: ['albums'] }));

    await waitFor(() => expect(stored()?.source_cover_url).toBe(cloudinary('first')));
    expect(fetched).toEqual([tiny('featured'), tiny('first')]);
  });

  it('leaves a backdrop that already matches the cover alone', async () => {
    db.gate_backdrop = [{ id: true, image: 'data:image/jpeg;base64,AA==', source_cover_url: cloudinary('featured') }];
    renderSync(true);
    await waitFor(() => expect(queryClient.getQueryData(['gate-backdrop-source'])).toBe(cloudinary('featured')));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(fetched).toEqual([]);
    expect(stored()?.image).toBe('data:image/jpeg;base64,AA==');
  });

  it('reads and writes nothing outside the owner browser', async () => {
    renderSync(false);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(reads).toEqual([]);
    expect(fetched).toEqual([]);
    expect(db.gate_backdrop).toEqual([]);
  });
});
