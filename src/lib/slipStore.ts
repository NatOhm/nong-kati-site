/**
 * Payment-slip evidence on disk.
 *
 * Slips used to be stored as `SiteSetting` rows `slip:<32 hex>` whose value was
 * a `data:image/…;base64,…` string — up to ~6.7 MB per row inside the settings
 * table that every page reads, and the whole image travelled through Prisma on
 * every admin view. They are financial documents (account numbers, amounts,
 * PDPA data), so they must not live in the public image namespace either.
 *
 * Authored 2026-11-15, after the product images moved to files: the bytes now
 * go to `NK_SLIP_DIR` — default `<NK_MEDIA_DIR>/private/slips`, a SUBdirectory,
 * so `/api/v1/images/<key>` (which reads only `mediaDir()/<key>` and rejects
 * keys containing `/`) can never reach them. Serving stays authorized-only
 * through `/api/v1/payments/slip-download/[key]`.
 *
 * Legacy rows are still readable as a fallback (the download route checks the
 * file first, then the row), so links written before
 * `scripts/extract-slips-to-files.mjs` ran keep working without a deadline.
 *
 * The retention sweep (`src/app/api/v1/internal/settings/slip-retention`)
 * deletes the old rows and the old files on the same cutoff, so evidence has
 * one lifetime rather than two.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { mediaDir } from '@/lib/imageStore';

/** The 32 hex characters after `slip:` — the on-disk file name. */
export const SLIP_KEY_RE = /^[0-9a-f]{32}$/;
const KEY_PREFIX = 'slip:';

/** Where slip files live. A private subdirectory of the media root by default. */
export function slipDir(): string {
  return process.env['NK_SLIP_DIR'] || path.join(mediaDir(), 'private', 'slips');
}

/** Accept both `slip:<key>` and the bare key; return the bare key or null. */
export function normalizeSlipKey(key: string): string | null {
  const bare = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
  return SLIP_KEY_RE.test(bare) ? bare : null;
}

/**
 * The storage key behind a `slipImageRoute()` URL (the inverse of the builder).
 * Used by anything that has the order row and needs the bytes back — the
 * delayed-slip re-check (`src/lib/slipRecheck.ts`).
 */
export function slipKeyFromImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const tail = url.split('/').pop() ?? '';
  try {
    return normalizeSlipKey(decodeURIComponent(tail));
  } catch {
    return null;
  }
}

/** Absolute path for a validated key. Throws on anything that could escape the dir. */
export function slipPath(key: string, dir: string = slipDir()): string {
  const bare = normalizeSlipKey(key);
  if (!bare) throw new Error(`invalid slip key: ${key}`);
  return path.join(dir, bare);
}

/**
 * Write bytes atomically: a partial file is never visible under the final name,
 * so a crash mid-write cannot serve a truncated slip.
 */
export async function writeSlip(key: string, bytes: Buffer, dir: string = slipDir()): Promise<void> {
  const file = slipPath(key, dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.partial-${process.pid}`;
  await fs.writeFile(partial, bytes);
  await fs.rename(partial, file);
}

/** The stored bytes, or null when this slip is still only a legacy row. */
export async function readSlip(key: string, dir: string = slipDir()): Promise<Buffer | null> {
  const bare = normalizeSlipKey(key);
  if (!bare) return null;
  try {
    return await fs.readFile(path.join(dir, bare));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

/** Delete one slip file. Missing is success — the sweep runs on a schedule. */
export async function deleteSlip(key: string, dir: string = slipDir()): Promise<boolean> {
  const bare = normalizeSlipKey(key);
  if (!bare) return false;
  return fs
    .unlink(path.join(dir, bare))
    .then(() => true)
    .catch(() => false);
}

/** MIME from magic bytes — what the browser needs, without trusting a file name. */
export function sniffSlipMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

export type SlipFileSweepResult = { scanned: number; deleted: number; freedBytes: number };

/**
 * Delete slip files older than `cutoff`.
 *
 * Files are named by key and never written twice (every attempt mints a new
 * one), so their mtime IS the upload time — the same clock the `slip:` rows are
 * pruned on. Anything younger than the cutoff is evidence still inside the
 * dispute window and is kept.
 */
export async function pruneSlipFiles(
  cutoff: Date,
  dir: string = slipDir(),
): Promise<SlipFileSweepResult> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0, freedBytes: 0 }; // nothing uploaded to disk yet
  }
  const candidates = entries.filter((name) => SLIP_KEY_RE.test(name));
  if (candidates.length === 0) return { scanned: 0, deleted: 0, freedBytes: 0 };

  let deleted = 0;
  let freedBytes = 0;
  for (const name of candidates) {
    const file = path.join(dir, name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.mtime > cutoff) continue;
    const removed = await fs.unlink(file).then(() => true).catch(() => false);
    if (removed) {
      deleted += 1;
      freedBytes += stat.size;
    }
  }
  return { scanned: candidates.length, deleted, freedBytes };
}
