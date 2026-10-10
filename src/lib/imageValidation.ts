const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isWithinImageSize(byteLength: number): boolean {
  return Number.isInteger(byteLength) && byteLength > 0 && byteLength <= MAX_IMAGE_BYTES;
}

export function imageDimensions(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === 'image/gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mime === 'image/webp' && bytes.length >= 30) {
    const chunk = bytes.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
      return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b1 = bytes[21] ?? 0; const b2 = bytes[22] ?? 0;
      const b3 = bytes[23] ?? 0; const b4 = bytes[24] ?? 0;
      return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)) };
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  if (mime === 'image/jpeg' && bytes.length >= 4) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1] ?? 0;
      offset += 2;
      if ([0xd8, 0xd9, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) break;
        return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }
  return null;
}

export function isWithinImageLimits(dimensions: { width: number; height: number }): boolean {
  return dimensions.width > 0 && dimensions.height > 0 &&
    dimensions.width <= MAX_DIMENSION && dimensions.height <= MAX_DIMENSION &&
    dimensions.width * dimensions.height <= MAX_PIXELS;
}
