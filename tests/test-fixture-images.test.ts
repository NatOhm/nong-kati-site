/**
 * Test-fixture image integrity gate (2026-10-03).
 *
 * e2e/fixtures/slip-8x8.png was committed as a 0x0 PNG despite its name.
 * Nothing caught it: Playwright's setInputFiles does not inspect image
 * dimensions, the upload route validates by magic-byte sniff plus a size
 * cap, and `file` reporting "0 x 0" was the only signal. It would have
 * surfaced as a confusing provider-side rejection the day the client
 * whitelisted the Slip2Go IP, long after the fixture was written.
 *
 * So this walks the fixture images and asserts each one is actually a
 * decodable, complete, non-degenerate image, and that any dimensions
 * encoded in the filename match the real ones. Fixtures are discovered by
 * scanning the specs for image paths rather than by listing a directory,
 * so a renamed or moved fixture fails too, instead of the test silently
 * passing because the directory emptied out.
 *
 * Covers the four formats the upload route accepts (png/jpeg/webp/gif) so
 * a future fixture in any of them is still checked.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const E2E_DIR = path.join(ROOT, 'e2e');
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

type Size = { width: number; height: number };

/** Recursively list files under dir matching a predicate. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Read intrinsic dimensions straight from the file header.
 * Returns null when the buffer is not a recognisable image of a known type.
 */
function imageSize(buf: Buffer): Size | null {
  // PNG: 8-byte signature, then an IHDR chunk whose width/height are the
  // first two big-endian uint32s after the chunk type.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF87a / GIF89a: little-endian logical screen descriptor at offset 6.
  const gifMagic = buf.toString('ascii', 0, 6);
  if (buf.length >= 10 && (gifMagic === 'GIF87a' || gifMagic === 'GIF89a')) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // RIFF/WEBP container: the dimensions live in the first VP8 chunk.
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      // Lossy: 3-byte frame tag, 3-byte sync code, then 14-bit w/h.
      const base = 26;
      return { width: buf.readUInt16LE(base) & 0x3fff, height: buf.readUInt16LE(base + 2) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      // Lossless: 1 signature byte, then 14-bit width-1 / 14-bit height-1.
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      // Extended: 24-bit canvas width-1 / height-1, little-endian.
      const read24 = (at: number): number => (buf[at] ?? 0) | ((buf[at + 1] ?? 0) << 8) | ((buf[at + 2] ?? 0) << 16);
      return { width: read24(24) + 1, height: read24(27) + 1 };
    }
    return null;
  }

  // JPEG: walk the marker segments to the first start-of-frame.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) {
        at++;
        continue;
      }
      const marker = buf[at + 1] ?? 0;
      // SOF0..SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      const segmentLength = buf.readUInt16BE(at + 2);
      if (isSof) {
        return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      }
      at += 2 + segmentLength;
    }
    return null;
  }

  return null;
}

/** True when the file is a complete PNG (the trailing IEND chunk is present). */
function pngIsComplete(buf: Buffer): boolean {
  if (buf.length < 12 || buf.readUInt32BE(0) !== 0x89504e47) return true; // not a PNG
  return buf.toString('ascii', buf.length - 8, buf.length - 4) === 'IEND';
}

/** Image paths the e2e specs refer to by literal. */
function referencedImages(): string[] {
  const found = new Set<string>();
  for (const spec of walk(E2E_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(spec, 'utf8');
    // String literals that look like a relative path to an image.
    for (const m of src.matchAll(/['"`]([^'"`\n]*?\.(?:png|jpe?g|webp|gif))['"`]/gi)) {
      const literal = m[1];
      if (literal === undefined) continue;
      if (/^(https?:|data:|\/\/)/i.test(literal)) continue; // not a local file
      found.add(literal);
    }
  }
  return [...found];
}

const refs = referencedImages();
const fixtures = refs
  .map((rel) => ({ rel, abs: path.join(ROOT, rel) }))
  .filter((f) => existsSync(f.abs) && statSync(f.abs).isFile());

/** "slip-8x8.png" declares 8x8; a hash-named product image declares nothing. */
function declaredSize(rel: string): Size | null {
  const m = /(\d+)x(\d+)/i.exec(path.basename(rel));
  if (!m?.[1] || !m[2]) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

describe('test fixture images', () => {
  it('finds the image fixtures the e2e specs reference', () => {
    expect(
      fixtures.length,
      `no on-disk image fixtures were found for ${refs.length} referenced path(s): ${refs.join(', ') || '(none referenced)'}`,
    ).toBeGreaterThan(0);
  });

  it('every referenced image path exists on disk', () => {
    const missing = refs.filter((rel) => !existsSync(path.join(ROOT, rel)));
    expect(missing, `specs reference images that are not committed:\n${missing.map((m) => `  ${m}`).join('\n')}`).toEqual([]);
  });

  it('every fixture decodes to real intrinsic dimensions', () => {
    const bad = fixtures
      .map(({ rel, abs }) => ({ rel, size: imageSize(readFileSync(abs)) }))
      .filter((f) => f.size === null)
      .map((f) => `  ${f.rel}: not a recognisable png/jpeg/webp/gif`);
    expect(bad, `fixtures must be real images:\n${bad.join('\n')}`).toEqual([]);
  });

  it('no fixture is degenerate (zero width or height)', () => {
    const bad = fixtures
      .map(({ rel, abs }) => ({ rel, size: imageSize(readFileSync(abs)) }))
      .filter((f) => f.size !== null && (f.size.width <= 0 || f.size.height <= 0))
      .map((f) => `  ${f.rel}: ${f.size?.width}x${f.size?.height}`);
    expect(
      bad,
      `these fixtures declare zero-area images — uploads and setInputFiles both accept them silently, so nothing downstream would complain:\n${bad.join('\n')}`,
    ).toEqual([]);
  });

  it('no fixture is a truncated PNG (IEND present)', () => {
    const bad = fixtures
      .filter(({ abs }) => abs.toLowerCase().endsWith('.png'))
      .map(({ rel, abs }) => ({ rel, ok: pngIsComplete(readFileSync(abs)) }))
      .filter((f) => !f.ok)
      .map((f) => `  ${f.rel}: PNG has no IEND chunk — the file is truncated`);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('dimensions encoded in a fixture filename match the real ones', () => {
    const bad = fixtures
      .map(({ rel, abs }) => ({ rel, declared: declaredSize(rel), actual: imageSize(readFileSync(abs)) }))
      .filter((f) => f.declared !== null && f.actual !== null)
      .filter((f) => f.declared?.width !== f.actual?.width || f.declared?.height !== f.actual?.height)
      .map((f) => `  ${f.rel}: filename says ${f.declared?.width}x${f.declared?.height}, file is ${f.actual?.width}x${f.actual?.height}`);
    expect(
      bad,
      `a fixture whose name states its dimensions must match them, or the name is misleading:\n${bad.join('\n')}`,
    ).toEqual([]);
  });
});
