/**
 * Uploaded-image storage on disk.
 *
 * Product images used to live in the database: POST /api/v1/admin/upload wrote
 * a `SiteSetting` row `image:<key>` holding a `data:image/…;base64,…` string,
 * and GET /api/v1/images/[key] decoded it out of that row. On the Hostatom
 * server that made every product photo a multi-hundred-kilobyte database read
 * (and, on Supabase, metered egress): 31 images weighed 36 MB, the largest
 * 2.68 MB in a single row.
 *
 * The app now runs on a host with a real filesystem, so bytes go to
 * `NK_MEDIA_DIR` (default `<cwd>/storage/media`) under the same key the URLs
 * already use — `/api/v1/images/<key>` keeps working, nothing in the catalogue
 * or admin screens changes. The database row is kept only as a fallback for
 * images written before the move (and for hosts without a writable disk).
 *
 * Keys are `image:<stamp>-<size>-<ext>`; the file name is the part after the
 * colon and the extension suffix is the type, so serving never needs a DB read.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Same shape the route and the upload endpoint accept: no slashes, no dots. */
export const IMAGE_KEY_RE = /^[0-9a-z-]+$/i;

const MIME_BY_SUFFIX: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function mediaDir(): string {
  return process.env['NK_MEDIA_DIR'] || path.join(process.cwd(), 'storage', 'media');
}

/** Absolute path for a validated key. Throws on anything that could escape the dir. */
export function imagePath(key: string): string {
  if (!IMAGE_KEY_RE.test(key)) throw new Error(`invalid image key: ${key}`);
  return path.join(mediaDir(), key);
}

/** MIME type from the key's `-<ext>` suffix, or null when it is not an image we serve. */
export function mimeForKey(key: string): string | null {
  const suffix = key.split('-').pop()?.toLowerCase() ?? '';
  return MIME_BY_SUFFIX[suffix] ?? null;
}

/**
 * Write bytes atomically: a partial file is never visible under the final name,
 * so a crash mid-write cannot serve a truncated image.
 */
export async function writeImage(key: string, bytes: Buffer): Promise<void> {
  const file = imagePath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.partial-${process.pid}`;
  await fs.writeFile(partial, bytes);
  await fs.rename(partial, file);
}

/** The stored bytes, or null when this key has not been migrated/uploaded to disk. */
export async function readImage(key: string): Promise<Buffer | null> {
  if (!IMAGE_KEY_RE.test(key)) return null;
  try {
    return await fs.readFile(imagePath(key));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Decode a `data:image/…;base64,…` URL, or null when the value is not one. */
export function decodeDataUrl(value: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  return { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
}
