import { gateBackdropSrc } from './gateBackdropSrc';

describe('gateBackdropSrc', () => {
  it('asks Cloudinary for a 96-pixel JPEG of the cover', () => {
    expect(gateBackdropSrc('https://res.cloudinary.com/demo/image/upload/v1/albums/cover.jpg')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,ar_16:10,w_96,q_60,f_jpg/v1/albums/cover.jpg'
    );
  });

  it('returns null for a cover outside Cloudinary', () => {
    expect(gateBackdropSrc('https://example.test/cover.jpg')).toBeNull();
  });
});
