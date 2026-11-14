/**
 * Images live on disk now, not in SiteSetting.
 *
 * Uploaded photos used to be base64 rows (`image:<key>`), which made every
 * product-photo request a database read — 36 MB of rows, largest 2.68 MB. The
 * store writes files under NK_MEDIA_DIR and GET /api/v1/images/[key] serves
 * them without touching the database; the row is only a fallback for images
 * written before scripts/extract-images-to-files.mjs ran.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: { siteSetting: { findUnique } },
}));

const { GET } = await import('@/app/api/v1/images/[key]/route');
const { decodeDataUrl, mimeForKey, readImage, sha256, writeImage } = await import('@/lib/imageStore');

const KEY = 'mv7v1mmt-173j7-png';
const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
const DATA_URL = `data:image/png;base64,${BYTES.toString('base64')}`;

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nk-media-'));
  vi.stubEnv('NK_MEDIA_DIR', dir);
  findUnique.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

function ctx(key: string) {
  return { params: Promise.resolve({ key }) };
}

describe('imageStore', () => {
  it('round-trips bytes and derives the MIME type from the key suffix', async () => {
    await writeImage(KEY, BYTES);
    const back = await readImage(KEY);
    expect(back).not.toBeNull();
    expect(sha256(back!)).toBe(sha256(BYTES));
    expect(mimeForKey(KEY)).toBe('image/png');
    expect(mimeForKey('abc-def-jpg')).toBe('image/jpeg');
    expect(mimeForKey('abc-def-webp')).toBe('image/webp');
    expect(mimeForKey('abc-def-gif')).toBe('image/gif');
    expect(mimeForKey('abc-def-txt')).toBeNull();
  });

  it('refuses keys that could escape the directory', async () => {
    expect(await readImage('../secret')).toBeNull();
    await expect(writeImage('a/b', BYTES)).rejects.toThrow(/invalid image key/);
  });

  it('decodes a data URL and rejects anything else', () => {
    expect(decodeDataUrl(DATA_URL)?.bytes.equals(BYTES)).toBe(true);
    expect(decodeDataUrl('note: hello')).toBeNull();
    expect(decodeDataUrl('data:text/plain;base64,aGk=')).toBeNull();
  });
});

describe('GET /api/v1/images/[key]', () => {
  it('serves the file without a database read', async () => {
    await writeImage(KEY, BYTES);
    const res = await GET({} as never, ctx(KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await res.arrayBuffer()).equals(BYTES)).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falls back to a legacy base64 row when the file is not on disk', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ key: `image:${KEY}`, value: DATA_URL });
    const res = await GET({} as never, ctx(KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(BYTES)).toBe(true);
  });

  it('never serves a payment slip through the public image route', async () => {
    findUnique.mockResolvedValueOnce({ key: `slip:${KEY}` });
    const res = await GET({} as never, ctx(KEY));
    expect(res.status).toBe(403);
  });

  it('404s when neither the file nor the row exists, and 400s on a bad key', async () => {
    findUnique.mockResolvedValue(null);
    expect((await GET({} as never, ctx(KEY))).status).toBe(404);
    expect((await GET({} as never, ctx('bad..key'))).status).toBe(400);
  });
});
