import { fireEvent, screen } from '@testing-library/react';
import { App } from './App';
import type { FakeDatabase } from './test/fakeSupabase';
import { renderWithProviders } from './test/renderWithProviders';

const db = vi.hoisted((): FakeDatabase => ({}));

vi.mock('./lib/supabase', async () => {
  const { fakeSupabase } = await import('./test/fakeSupabase');
  return { supabase: fakeSupabase(db) };
});

const PRIVATE_COVER = 'https://res.cloudinary.com/demo/image/upload/private-cover.jpg';
const PUBLIC_COVER = 'https://res.cloudinary.com/demo/image/upload/public-cover.jpg';
const PRIVATE_PHOTO = 'https://res.cloudinary.com/demo/image/upload/private-photo.jpg';
const PUBLIC_PHOTO = 'https://res.cloudinary.com/demo/image/upload/public-photo.jpg';

function album(id: string, title: string, isPrivate: boolean, year: number, cover: string, order: number) {
  return {
    id,
    title,
    description: `${title} description`,
    event_date: `${year}-06-01`,
    year,
    cover_url: cover,
    cover_public_id: `${id}-cover`,
    is_private: isPrivate,
    display_order: order,
  };
}

function photo(id: string, albumId: string, title: string, url: string) {
  return { id, album_id: albumId, title, note: `${title} note`, url, public_id: id, width: null, height: null, display_order: 0 };
}

// These tests cover a guest past the gate, so a non-owner render passes isGuest. The gate mounts no page behind it.
beforeEach(() => {
  // The private album comes first, so a broken filter would also make it the featured album.
  db.albums = [
    album('private-album', 'Secret party', true, 2019, PRIVATE_COVER, 0),
    album('public-album', 'Public trip', false, 2024, PUBLIC_COVER, 1),
  ];
  db.photos = [
    photo('private-photo', 'private-album', 'Secret photo', PRIVATE_PHOTO),
    photo('public-photo', 'public-album', 'Public photo', PUBLIC_PHOTO),
  ];
});

function sortables(container: HTMLElement) {
  return container.querySelectorAll('[aria-roledescription="sortable"]');
}

async function openLightbox() {
  fireEvent.click(await screen.findByRole('button', { name: 'Public photo' }));
  await screen.findByRole('dialog', { name: 'Photo detail Public photo' });
}

describe('App shell', () => {
  it('renders the owner login link for guests', async () => {
    renderWithProviders(<App />, { isGuest: true });
    expect(await screen.findByText(/owner login/i)).toBeInTheDocument();
  });
});

describe('Rule 1: a guest never sees a private album or its photos', () => {
  it('leaves the private album off the home page', async () => {
    renderWithProviders(<App />, { isGuest: true });
    expect((await screen.findAllByText('Public trip')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Secret party')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Secret party')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2019' })).not.toBeInTheDocument();
  });

  it('shows the private album to the owner on the home page', async () => {
    renderWithProviders(<App />, { isOwner: true });
    expect((await screen.findAllByText('Secret party')).length).toBeGreaterThan(0);
  });

  it('blocks the private album at its own url', async () => {
    renderWithProviders(<App />, { path: '/album/private-album', isGuest: true });
    expect(await screen.findByRole('heading', { name: 'Private album' })).toBeInTheDocument();
    expect(screen.queryByText('Secret party')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Secret party')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Secret photo')).not.toBeInTheDocument();
  });

  it('shows the private album and its photos to the owner at its own url', async () => {
    renderWithProviders(<App />, { path: '/album/private-album', isOwner: true });
    expect(await screen.findByAltText('Secret photo')).toBeInTheDocument();
  });
});

describe('Rule 3: only the owner sees the controls that create, edit, reorder or delete', () => {
  it('gives a guest no album controls on the home page', async () => {
    const { container } = renderWithProviders(<App />, { isGuest: true });
    await screen.findAllByText('Public trip');
    expect(screen.queryByRole('button', { name: /new album/i })).not.toBeInTheDocument();
    expect(sortables(container)).toHaveLength(0);
  });

  it('gives the owner album controls on the home page', async () => {
    const { container } = renderWithProviders(<App />, { isOwner: true });
    expect(await screen.findByRole('button', { name: /new album/i })).toBeInTheDocument();
    expect(sortables(container)).toHaveLength(2);
  });

  it('gives a guest no photo or album controls on an album page', async () => {
    const { container } = renderWithProviders(<App />, { path: '/album/public-album', isGuest: true });
    await openLightbox();
    for (const name of [/upload photos/i, /edit album/i, /public album/i, /delete photo/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(sortables(container)).toHaveLength(0);
  });

  it('gives the owner photo and album controls on an album page', async () => {
    const { container } = renderWithProviders(<App />, { path: '/album/public-album', isOwner: true });
    await openLightbox();
    for (const name of [/upload photos/i, /edit album/i, /public album/i, /delete photo/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument();
    expect(sortables(container)).toHaveLength(1);
  });
});

describe('Rule 4: the guest UI has no download control and no link to the original file', () => {
  function expectNoDownload(container: HTMLElement) {
    const originals = [PUBLIC_COVER, PUBLIC_PHOTO, PRIVATE_COVER, PRIVATE_PHOTO];
    expect(container.querySelectorAll('[download]')).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /download/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /download/i })).toHaveLength(0);
    for (const link of container.querySelectorAll('a')) {
      expect(originals).not.toContain(link.href);
    }
  }

  it('offers none on the home page', async () => {
    const { container } = renderWithProviders(<App />, { isGuest: true });
    await screen.findAllByText('Public trip');
    expectNoDownload(container);
    fireEvent.click(screen.getByRole('button', { name: 'All Photos' }));
    expectNoDownload(container);
  });

  it('offers none on an album page or in its lightbox', async () => {
    const { container } = renderWithProviders(<App />, { path: '/album/public-album', isGuest: true });
    await openLightbox();
    expectNoDownload(container);
  });
});
