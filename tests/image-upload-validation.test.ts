import { describe, expect, it } from 'vitest';

import { imageDimensions, isWithinImageLimits, isWithinImageSize, MAX_IMAGE_BYTES } from '@/lib/imageValidation';

describe('admin image upload dimension validation', () => {
  it('reads PNG and GIF dimensions from their format headers', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageDimensions(png, 'image/png')).toEqual({ width: 640, height: 480 });

    const gif = Buffer.alloc(10);
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(200, 8);
    expect(imageDimensions(gif, 'image/gif')).toEqual({ width: 320, height: 200 });
  });

  it('rejects invalid or oversized decoded dimensions', () => {
    expect(isWithinImageLimits({ width: 1, height: 1 })).toBe(true);
    expect(isWithinImageLimits({ width: 8193, height: 1 })).toBe(false);
    expect(isWithinImageLimits({ width: 7000, height: 7000 })).toBe(false);
    expect(isWithinImageLimits({ width: 0, height: 10 })).toBe(false);
  });

  it('accepts files up to exactly 5 MB and rejects larger or empty files', () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(isWithinImageSize(MAX_IMAGE_BYTES)).toBe(true);
    expect(isWithinImageSize(MAX_IMAGE_BYTES + 1)).toBe(false);
    expect(isWithinImageSize(0)).toBe(false);
  });
});
