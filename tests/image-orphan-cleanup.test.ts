/**
 * Uploaded-image garbage collection (audit 2026-11-13).
 *
 * Admin uploads store each image as a SiteSetting row `image:<key>`. Replacing
 * a product photo only changed Product.imageUrl, so the old row stayed forever
 * — production had 29 rows / 16 MB referenced by nothing.
 *
 * The pruner must keep: rows a product still points at, rows another setting
 * points at (logo/banner), and rows younger than 24h (the admin flow uploads
 * before saving the product). Everything else is deleted.
 */
import { describe, expect, it, vi } from 'vitest';

import { IMAGE_ORPHAN_MIN_AGE_MS, pruneOrphanImageRows } from '@/lib/imageCleanup';

type PruneClient = Parameters<typeof pruneOrphanImageRows>[0];

const NOW = new Date('2026-11-13T12:00:00Z');

type Row = { key: string; value: string; updatedAt: Date };

function client(rows: Row[], products: string[] = [], settings: string[] = []) {
  const deleteMany = vi.fn(async (args: { where: { key: { in: string[] } } }) => ({
    count: args.where.key.in.length,
  }));
  const siteSetting = {
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where as {
        key?: { startsWith?: string; not?: { startsWith?: string } };
        updatedAt?: { lt: Date };
      };
      if (where.key?.startsWith) {
        // Mirror the real query: prefix, plus the age cutoff.
        return rows.filter(
          (r) =>
            r.key.startsWith(where.key!.startsWith!) &&
            (!where.updatedAt?.lt || r.updatedAt < where.updatedAt.lt),
        );
      }
      if (where.key?.not) return settings.map((value) => ({ value }));
      return [];
    }),
    deleteMany,
  };
  const product = {
    findMany: vi.fn(async () => products.map((imageUrl) => ({ imageUrl }))),
  };
  // Fake delegates: only the calls the pruner makes exist here.
  return { client: { siteSetting, product } as unknown as PruneClient, deleteMany };
}

const old = (key: string, value = 'data:image/png;base64,AAAA'): Row => ({
  key,
  value,
  updatedAt: new Date(NOW.getTime() - IMAGE_ORPHAN_MIN_AGE_MS - 60_000),
});

describe('pruneOrphanImageRows', () => {
  it('deletes only unreferenced, old rows and reports the freed bytes', async () => {
    const rows = [
      old('image:orphan-1', 'data:image/png;base64,AAAA'),
      old('image:orphan-2', 'data:image/png;base64,BBBBBB'),
      old('image:kept-product'),
      old('image:kept-setting'),
      { key: 'image:fresh', value: 'data:image/png;base64,CCCC', updatedAt: NOW },
    ];
    const { client: c, deleteMany } = client(
      rows,
      ['/api/v1/images/kept-product'],
      ['/api/v1/images/kept-setting'],
    );

    const result = await pruneOrphanImageRows(c, NOW);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0]![0]).toEqual({
      where: { key: { in: ['image:orphan-1', 'image:orphan-2'] } },
    });
    expect(result).toEqual({ scanned: 4, deleted: 2, freedBytes: 54 });
  });

  it('does not touch a brand-new key — the product may not be saved yet', async () => {
    const { client: c, deleteMany } = client([{ key: 'image:fresh', value: 'x', updatedAt: NOW }]);
    expect(await pruneOrphanImageRows(c, NOW)).toEqual({ scanned: 0, deleted: 0, freedBytes: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('keeps rows referenced through a setting value in the raw image: form', async () => {
    const { client: c, deleteMany } = client([old('image:logo')], [], ['image:logo']);
    expect((await pruneOrphanImageRows(c, NOW)).deleted).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
