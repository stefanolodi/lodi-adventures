import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { chooseHeroAlbum } from '../lib/chooseHeroAlbum';
import { gateBackdropSrc } from '../lib/gateBackdropSrc';
import { fetchGateBackdropImage } from '../lib/fetchGateBackdropImage';
import { useAlbums } from './useAlbums';
import { GATE_BACKDROP_KEY } from './useGateBackdrop';

const GATE_BACKDROP_SOURCE_KEY = ['gate-backdrop-source'] as const;

// src is the small Cloudinary URL, null when there is no backdrop to show.
async function writeGateBackdrop(src: string | null): Promise<void> {
  if (src === null) {
    const { error } = await supabase.from('gate_backdrop').delete().eq('id', true);
    if (error) throw error;
    return;
  }
  const image = await fetchGateBackdropImage(src);
  // source_cover_url holds the URL with its transformation, so a change to the size in
  // gateBackdropSrc no longer matches the stored row and rebuilds it.
  const { error } = await supabase
    .from('gate_backdrop')
    .upsert({ id: true, image, source_cover_url: src, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Keeps the gate backdrop on the cover a guest's home page opens with. It runs in the owner's
// browser, the only one that reads every album and may write the backdrop. It follows every
// change to the albums query, so featuring an album, changing a cover, making an album private,
// reordering and deleting all move it. See ADR 0006.
export function useSyncGateBackdrop(isOwner: boolean): void {
  const queryClient = useQueryClient();
  const { data: albums } = useAlbums({ enabled: isOwner });
  const { data: storedSrc } = useQuery({
    queryKey: GATE_BACKDROP_SOURCE_KEY,
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from('gate_backdrop').select('source_cover_url').maybeSingle();
      if (error) throw error;
      return data?.source_cover_url ?? null;
    },
  });
  const { mutate } = useMutation({
    mutationFn: writeGateBackdrop,
    onSuccess: (_data, src) => {
      queryClient.setQueryData(GATE_BACKDROP_SOURCE_KEY, src);
      void queryClient.invalidateQueries({ queryKey: GATE_BACKDROP_KEY });
    },
  });

  // undefined until the albums load. null when no album is public or the cover is outside
  // Cloudinary, so the gate shows no image.
  const hero = isOwner && albums ? chooseHeroAlbum(albums, false) : undefined;
  const src = !isOwner || !albums ? undefined : hero ? gateBackdropSrc(hero.cover) : null;
  // One try per source, so a failed write does not repeat on every render. The next load tries again.
  const tried = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (src === undefined || storedSrc === undefined || src === storedSrc) return;
    if (tried.current === src) return;
    tried.current = src;
    mutate(src);
  }, [src, storedSrc, mutate]);
}
