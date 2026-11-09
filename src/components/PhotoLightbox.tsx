import { useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { photoAspectRatio, type Size } from '../lib/photoAspectRatio';
import { photoSizes } from '../lib/photoSizes';
import { photoSrc } from '../lib/photoSrc';
import { setImageFallback } from '../lib/setImageFallback';
import { useOverlayScrollLock } from '../useSmoothScroll';
import { useSwipeStep } from '../hooks/useSwipeStep';
import type { PhotoDraft, SavePhotoDraft } from '../hooks/usePhotoAutosave';
import { PhotoDetailsEditor } from './PhotoDetailsEditor';
import type { Photo } from '../types';

type PhotoLightboxProps = {
  photo: Photo;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  canStep: boolean;
  canEdit: boolean;
  draftFor: (photo: Photo) => PhotoDraft;
  onSave: (photoId: string, ...args: Parameters<SavePhotoDraft>) => ReturnType<SavePhotoDraft>;
};

type NaturalSize = Required<Size> & { photoId: string };

export function PhotoLightbox({ photo, onClose, onNext, onPrev, canStep, canEdit, draftFor, onSave }: PhotoLightboxProps) {
  // The state stores the photo id with the natural size, so the natural size of the previous photo never sets the ratio of the next one.
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  useOverlayScrollLock();
  const swipeHandlers = useSwipeStep(onNext, onPrev);
  const ratio = photoAspectRatio(photo, naturalSize?.photoId === photo.id ? naturalSize : undefined);
  const mediaStyle = ratio === undefined ? undefined : ({ '--photo-ratio': ratio } as CSSProperties);

  return (
    <section className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Photo detail ${photo.title}`}>
      <div className="lightbox-backdrop" onClick={onClose} />
      <div className="lightbox-card">
        <div className="lightbox-media" style={mediaStyle} {...(canStep ? swipeHandlers : undefined)}>
          <img
            alt={photo.title}
            src={photoSrc(photo.src, photoSizes.lightbox)}
            onLoad={(e) =>
              setNaturalSize({
                photoId: photo.id,
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            onError={(e) => setImageFallback(e, photo.title)}
          />
          {canStep && (
            <>
              <button className="lightbox-step lightbox-step-prev" type="button" aria-label="Previous photo" onClick={onPrev}>
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button className="lightbox-step lightbox-step-next" type="button" aria-label="Next photo" onClick={onNext}>
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <aside className="lightbox-note-panel" data-lenis-prevent>
          <button className="nav-item close-lightbox" type="button" onClick={onClose}>Close</button>
          <p className="owner-badge">Note</p>
          {canEdit ? (
            // The key gives each photo its own editor, whose unmount saves the pending edit.
            <PhotoDetailsEditor
              key={photo.id}
              photo={photo}
              initialDraft={draftFor(photo)}
              onSave={(draft, changes) => onSave(photo.id, draft, changes)}
            />
          ) : (
            <>
              <h2>{photo.title}</h2>
              <div className="public-note">{photo.note.trim() || 'No note added for this photo yet.'}</div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
