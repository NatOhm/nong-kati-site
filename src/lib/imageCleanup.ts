/**
 * Uploaded-image garbage collection.
 *
 * Two generations of storage share one reference model:
 *   · files under NK_MEDIA_DIR (current — POST /api/v1/admin/upload writes
 *     them, GET /api/v1/images/[key] serves them);
 *   · legacy `SiteSetting.key = image:<key>` rows holding data URLs.
 *
 * Either way, replacing a product photo only changes Product.imageUrl, so the
 * old bytes stayed forever: production held 58 rows / 46 MB, of which 29 rows /
 * 16 MB were referenced by nothing.
 *
 * Something is orphaned when no product and no other setting references its
 * key. Anything younger than ORPHAN_MIN_AGE_MS is skipped on purpose: the admin
 * flow uploads first and saves the product afterwards, so a fresh key is
 * legitimately unreferenced for a moment.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { IMAGE_KEY_RE, mediaDir } from '@/lib/imageStore';

export const IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'image:';
const PUBLIC_PATH = '/api/v1/images/';

export type ImagePruneResult = { scanned: number; deleted: number; freedBytes: number };

type Client = Pick<PrismaClient, 'siteSetting' | 'product'>;

/** Keys a value points at, either as the public URL or as the raw `image:` key. */
function referencedKeysIn(value: string): string[] {
  const keys: string[] = [];
  const urlRe = /\/api\/v1\/images\/([A-Za-z0-9._~-]+)/g;
  const rawRe = /image:([A-Za-z0-9._~-]+)/g;
  for (const re of [urlRe, rawRe]) {
    for (const match of value.matchAll(re)) {
      if (match[1]) keys.push(match[1]);
    }
  }
  return keys;
}

/** Every image key some product or setting still points at. */
async function collectReferencedKeys(client: Client): Promise<Set<string>> {
  const products = await client.product.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const settings = await client.siteSetting.findMany({
    where: {
      key: { not: { startsWith: PREFIX } },
      value: { contains: PUBLIC_PATH },
    },
    select: { value: true },
  });

  const referenced = new Set<string>();
  for (const product of products) {
    if (product.imageUrl) for (const key of referencedKeysIn(product.imageUrl)) referenced.add(key);
  }
  for (const setting of settings) {
    for (const key of referencedKeysIn(setting.value)) referenced.add(key);
  }
  return referenced;
}

export async function pruneOrphanImageRows(
  client: Client,
  now: Date = new Date(),
): Promise<ImagePruneResult> {
  const cutoff = new Date(now.getTime() - IMAGE_ORPHAN_MIN_AGE_MS);
  const rows = await client.siteSetting.findMany({
    where: { key: { startsWith: PREFIX }, updatedAt: { lt: cutoff } },
    select: { key: true, value: true },
  });
  if (rows.length === 0) return { scanned: 0, deleted: 0, freedBytes: 0 };

  const referenced = await collectReferencedKeys(client);

  const orphans = rows.filter((row) => !referenced.has(row.key.slice(PREFIX.length)));
  if (orphans.length === 0) return { scanned: rows.length, deleted: 0, freedBytes: 0 };

  const freedBytes = orphans.reduce((sum, row) => sum + Buffer.byteLength(row.value), 0);
  const { count } = await client.siteSetting.deleteMany({
    where: { key: { in: orphans.map((row) => row.key) } },
  });
  return { scanned: rows.length, deleted: count, freedBytes };
}

export type ImageFilePruneResult = { scanned: number; deleted: number; freedBytes: number };

/**
 * Delete image files nobody references any more.
 *
 * Same rules as the row pruner, applied to the media directory: a file whose
 * name is not a valid image key is never touched (a stray `.partial` or an
 * operator's own note is not ours to delete), and anything modified within the
 * last 24 hours is kept because the admin may still be saving the product.
 */
export async function pruneOrphanImageFiles(
  client: Client,
  dir: string = mediaDir(),
  now: Date = new Date(),
): Promise<ImageFilePruneResult> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0, freedBytes: 0 }; // no media dir yet
  }
  const candidates = entries.filter((name) => IMAGE_KEY_RE.test(name));
  if (candidates.length === 0) return { scanned: 0, deleted: 0, freedBytes: 0 };

  const referenced = await collectReferencedKeys(client);
  const cutoffMs = now.getTime() - IMAGE_ORPHAN_MIN_AGE_MS;

  let deleted = 0;
  let freedBytes = 0;
  for (const name of candidates) {
    if (referenced.has(name)) continue;
    const file = path.join(dir, name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.mtimeMs > cutoffMs) continue;
    const removed = await fs.unlink(file).then(() => true).catch(() => false);
    if (removed) {
      deleted += 1;
      freedBytes += stat.size;
    }
  }
  return { scanned: candidates.length, deleted, freedBytes };
}

/** Row GC + file GC in one call — what an upload runs after the bytes are stored. */
export async function pruneOrphanImages(
  client: Client,
  options: { dir?: string; now?: Date } = {},
): Promise<{ rows: ImagePruneResult; files: ImageFilePruneResult }> {
  const rows = await pruneOrphanImageRows(client, options.now);
  const files = await pruneOrphanImageFiles(client, options.dir ?? mediaDir(), options.now);
  return { rows, files };
}
