import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const GATE_BACKDROP_KEY = ['gate-backdrop'] as const;

// The same pattern as the table's check, so only a base64 JPEG reaches the CSS url().
const jpegDataUrl = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

// The one read the gate makes for a stranger. It returns pixels, never a Cloudinary URL. See ADR 0006.
export function useGateBackdrop(enabled: boolean): string | null {
  const { data } = useQuery({
    queryKey: GATE_BACKDROP_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gate_backdrop');
      if (error) throw error;
      // gate_backdrop() returns null when there is no backdrop, which the generated type leaves out.
      const image: string | null = data;
      return image;
    },
  });
  return typeof data === 'string' && jpegDataUrl.test(data) ? data : null;
}
