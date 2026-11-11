import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { mapAlbum, mapPhoto } from '../lib/mappers';
import { queryClient } from '../lib/queryClient';
import { deleteCloudinaryAssets } from '../lib/cloudinary';
import { ALL_PHOTOS_KEY } from './useAllPhotos';
import type { Album } from '../types';

const ALBUMS_KEY = ['albums'] as const;
const albumKey = (id: string) => ['album', id] as const;

export function useAlbums({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ALBUMS_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data.map((row) => mapAlbum(row));
    },
  });
}

export function useAlbum(id: string) {
  return useQuery({
    queryKey: albumKey(id),
    queryFn: async () => {
      const [albumRes, photosRes] = await Promise.all([
        supabase.from('albums').select('*').eq('id', id).single(),
        supabase
          .from('photos')
          .select('*')
          .eq('album_id', id)
          // created_at and id keep photos that share a display_order in the same order on every load.
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      ]);
      if (albumRes.error) throw albumRes.error;
      if (photosRes.error) throw photosRes.error;
      const photos = photosRes.data.map(mapPhoto);
      return mapAlbum(albumRes.data, photos);
    },
    enabled: !!id,
  });
}

export interface AlbumInput {
  title: string;
  description: string;
  eventDate: string;
  isPrivate: boolean;
  coverUrl: string;
  coverPublicId: string;
}

export function useCreateAlbum() {
  return useMutation({
    mutationFn: async (input: AlbumInput): Promise<Album> => {
      const nextOrder = await getNextAlbumOrder();
      const { data, error } = await supabase
        .from('albums')
        .insert({
          title: input.title,
          description: input.description,
          event_date: input.eventDate,
          is_private: input.isPrivate,
          cover_url: input.coverUrl,
          cover_public_id: input.coverPublicId,
          display_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return mapAlbum(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY });
    },
  });
}

export function useUpdateAlbum() {
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<AlbumInput> & { id: string }): Promise<Album> => {
      const { data, error } = await supabase
        .from('albums')
        .update({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.eventDate !== undefined && { event_date: input.eventDate }),
          ...(input.isPrivate !== undefined && { is_private: input.isPrivate }),
          ...(input.coverUrl !== undefined && { cover_url: input.coverUrl }),
          ...(input.coverPublicId !== undefined && { cover_public_id: input.coverPublicId }),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return mapAlbum(data);
    },
    onSuccess: (album) => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY });
      void queryClient.invalidateQueries({ queryKey: albumKey(album.id) });
      void queryClient.invalidateQueries({ queryKey: ALL_PHOTOS_KEY });
    },
  });
}

export function useDeleteAlbum() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: publicIds, error } = await supabase.rpc('delete_album', { album_id: id });
      if (error) throw error;
      // The rows are gone, so a failed file cleanup only leaves orphans that cost storage.
      if (publicIds.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) deleteCloudinaryAssets(publicIds, session.access_token).catch(() => {});
      }
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: albumKey(id) });
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY });
      void queryClient.invalidateQueries({ queryKey: ALL_PHOTOS_KEY });
    },
  });
}

// Featuring an album also unfeatures the one that had the flag, so the cache can't be patched one album at a time.
export function useSetFeaturedAlbum() {
  return useMutation({
    mutationFn: async (albumId: string | null) => {
      const { error } = await supabase.rpc('set_featured_album', { album_id: albumId ?? undefined });
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['album'] });
    },
  });
}

export function useReorderAlbums() {
  return useMutation({
    mutationFn: async (updates: { id: string; display_order: number }[]) => {
      const { error } = await supabase.rpc('reorder_albums', { updates });
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ALBUMS_KEY });
      const previous = queryClient.getQueryData<Album[]>(ALBUMS_KEY);
      queryClient.setQueryData<Album[]>(ALBUMS_KEY, (old) => {
        if (!old) return old;
        const orderMap = new Map(updates.map((u) => [u.id, u.display_order]));
        return [...old]
          .map((a) => ({ ...a, displayOrder: orderMap.get(a.id) ?? a.displayOrder }))
          .sort((a, b) => a.displayOrder - b.displayOrder);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ALBUMS_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY });
      void queryClient.invalidateQueries({ queryKey: ALL_PHOTOS_KEY });
    },
  });
}

async function getNextAlbumOrder(): Promise<number> {
  const { data } = await supabase.from('albums').select('display_order').order('display_order', { ascending: false }).limit(1).single();
  return (data?.display_order ?? -1) + 1;
}
