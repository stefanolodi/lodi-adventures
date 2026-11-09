import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhotoLightbox } from './PhotoLightbox';
import { draftOf } from '../hooks/usePhotoAutosave';
import type { Photo } from '../types';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const portrait: Photo = {
  id: 'portrait',
  title: 'Tower',
  note: '',
  src: 'https://example.test/tower.jpg',
  publicId: 'tower',
  width: 2000,
  height: 3000,
  displayOrder: 0,
};

function renderLightbox(photo: Photo, props: Partial<ComponentProps<typeof PhotoLightbox>> = {}) {
  return render(
    <PhotoLightbox
      photo={photo}
      onClose={() => {}}
      onNext={() => {}}
      onPrev={() => {}}
      canStep
      canEdit={false}
      draftFor={draftOf}
      onSave={() => Promise.resolve(true)}
      {...props}
    />,
  );
}

function photoArea() {
  return screen.getByRole('img', { name: /Tower/ }).closest('.lightbox-media') as HTMLElement;
}

function touch(x: number, y = 200) {
  return { clientX: x, clientY: y };
}

function swipe(element: Element, fromX: number, toX: number, toY = 200) {
  fireEvent.touchStart(element, { touches: [touch(fromX)], changedTouches: [touch(fromX)] });
  fireEvent.touchMove(element, { touches: [touch(toX, toY)], changedTouches: [touch(toX, toY)] });
  fireEvent.touchEnd(element, { touches: [], changedTouches: [touch(toX, toY)] });
}

describe('PhotoLightbox', () => {
  it('loads a copy capped at 2400px wide, not the original file', () => {
    renderLightbox({ ...portrait, src: 'https://res.cloudinary.com/penny/image/upload/v1/penny/photos/tower.jpg' });

    expect(screen.getByRole('img', { name: /Tower/ }).getAttribute('src')).toBe(
      'https://res.cloudinary.com/penny/image/upload/c_limit,f_auto,q_auto,w_2400/v1/penny/photos/tower.jpg',
    );
  });

  it("passes a portrait photo's stored ratio to the photo area", () => {
    renderLightbox(portrait);

    expect(Number(photoArea().style.getPropertyValue('--photo-ratio'))).toBeCloseTo(2 / 3);
  });

  it('passes the natural ratio of the loaded image when the photo has no stored size', () => {
    renderLightbox({ ...portrait, width: undefined, height: undefined });
    const image = screen.getByRole('img', { name: /Tower/ });
    expect(photoArea().style.getPropertyValue('--photo-ratio')).toBe('');

    Object.defineProperty(image, 'naturalWidth', { value: 600 });
    Object.defineProperty(image, 'naturalHeight', { value: 900 });
    fireEvent.load(image);

    expect(Number(photoArea().style.getPropertyValue('--photo-ratio'))).toBeCloseTo(2 / 3);
  });
});

describe('stepping through photos', () => {
  it('names the buttons and steps once per press', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderLightbox(portrait, { onNext, onPrev });

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('has no text buttons left over', () => {
    renderLightbox(portrait);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
  });

  it('goes to the next photo on a swipe left and the previous one on a swipe right, when the finger lifts', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderLightbox(portrait, { onNext, onPrev });

    fireEvent.touchStart(photoArea(), { touches: [touch(200)], changedTouches: [touch(200)] });
    fireEvent.touchMove(photoArea(), { touches: [touch(100)], changedTouches: [touch(100)] });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.touchEnd(photoArea(), { touches: [], changedTouches: [touch(100)] });
    expect(onNext).toHaveBeenCalledTimes(1);

    swipe(photoArea(), 100, 200);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does not step on a short swipe or a mostly vertical one', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderLightbox(portrait, { onNext, onPrev });

    swipe(photoArea(), 200, 160);
    swipe(photoArea(), 200, 100, 400);

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('does not step on a two-finger gesture, whichever finger lifts last', () => {
    const onNext = vi.fn();
    renderLightbox(portrait, { onNext });
    const area = photoArea();

    fireEvent.touchStart(area, { touches: [touch(300)], changedTouches: [touch(300)] });
    fireEvent.touchStart(area, { touches: [touch(300), touch(350)], changedTouches: [touch(350)] });
    fireEvent.touchEnd(area, { touches: [touch(100)], changedTouches: [touch(350)] });
    fireEvent.touchEnd(area, { touches: [], changedTouches: [touch(100)] });

    expect(onNext).not.toHaveBeenCalled();
  });

  it('does not step when the browser cancels the touch', () => {
    const onNext = vi.fn();
    renderLightbox(portrait, { onNext });
    const area = photoArea();

    fireEvent.touchStart(area, { touches: [touch(300)], changedTouches: [touch(300)] });
    fireEvent.touchCancel(area, { touches: [], changedTouches: [touch(300)] });
    fireEvent.touchEnd(area, { touches: [], changedTouches: [touch(100)] });

    expect(onNext).not.toHaveBeenCalled();
  });

  it('does not step on a swipe that starts on the note panel', () => {
    const onNext = vi.fn();
    const { container } = renderLightbox(portrait, { onNext });

    swipe(container.querySelector('.lightbox-note-panel') as Element, 300, 100);

    expect(onNext).not.toHaveBeenCalled();
  });

  it('shows no buttons and ignores a swipe in a single-photo album', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderLightbox(portrait, { onNext, onPrev, canStep: false });

    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument();

    swipe(photoArea(), 300, 100);
    swipe(photoArea(), 100, 300);

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});

describe('scrolling the note panel', () => {
  it('opts the panel out of the page smooth scroll, so the wheel scrolls the panel', () => {
    const { container } = renderLightbox(portrait);
    expect(container.querySelector('.lightbox-note-panel')).toHaveAttribute('data-lenis-prevent');
  });
});

describe('the guest note panel', () => {
  it('shows the badge, the title and the note, with no line about the owner', () => {
    renderLightbox({ ...portrait, note: 'Sunset from the top.' });

    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tower' })).toBeInTheDocument();
    expect(screen.getByText('Sunset from the top.')).toBeInTheDocument();
    expect(screen.queryByText(/a note from the owner/i)).not.toBeInTheDocument();
  });

  it('says so when the photo has no note', () => {
    renderLightbox(portrait);
    expect(screen.getByText('No note added for this photo yet.')).toBeInTheDocument();
  });
});
