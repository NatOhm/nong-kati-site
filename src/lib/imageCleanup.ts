/**
 * Uploaded-image garbage collection.
 *
 * Product images are stored as database rows (`SiteSetting.key = image:<key>`,
 * value = data URL) by POST /api/v1/admin/upload; GET /api/v1/images/[key]
 * serves them. Replacing a product photo only changed Product.imageUrl — the
 * old row stayed forever. Production held 58 rows / 46 MB, of which 29 rows /
 * 16 MB were referenced by nothing.
 *
 * A row is orphaned when no product and no other setting references its key.
 * Rows younger than ORPHAN_MIN_AGE_MS are skipped on purpose: the admin flow
 * uploads first and saves the product afterwards, so a fresh key is
 * legitimately unreferenced for a moment.
 */
import type { PrismaClient } from '@prisma/client';

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

  const orphans = rows.filter((row) => !referenced.has(row.key.slice(PREFIX.length)));
  if (orphans.length === 0) return { scanned: rows.length, deleted: 0, freedBytes: 0 };

  const freedBytes = orphans.reduce((sum, row) => sum + Buffer.byteLength(row.value), 0);
  const { count } = await client.siteSetting.deleteMany({
    where: { key: { in: orphans.map((row) => row.key) } },
  });
  return { scanned: rows.length, deleted: count, freedBytes };
}
