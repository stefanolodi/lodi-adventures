import { transformCloudinaryUpload } from './transformCloudinaryUpload';

// 64 pixels wide keeps fine detail out of the file itself, so no CSS change can sharpen it. See ADR 0006.
const GATE_BACKDROP = 'c_fill,g_auto,ar_16:10,w_64,q_60,f_jpg';

// Returns null for a cover outside Cloudinary, which would come back at full size.
export function gateBackdropSrc(cover: string): string | null {
  const src = transformCloudinaryUpload(cover, GATE_BACKDROP);
  return src === cover ? null : src;
}
