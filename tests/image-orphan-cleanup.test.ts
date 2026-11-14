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
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  IMAGE_ORPHAN_MIN_AGE_MS,
  pruneOrphanImageFiles,
  pruneOrphanImageRows,
} from '@/lib/imageCleanup';

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

describe('pruneOrphanImageFiles', () => {
  it('deletes only old, unreferenced files and leaves everything else alone', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nk-media-gc-'));
    const oldDate = new Date(NOW.getTime() - IMAGE_ORPHAN_MIN_AGE_MS - 60_000);
    const write = async (name: string, body: string, mtime: Date) => {
      const file = path.join(dir, name);
      await fs.writeFile(file, body);
      await fs.utimes(file, mtime, mtime);
      return file;
    };

    const keptProduct = await write('kept-product', 'referenced', oldDate);
    const keptFresh = await write('fresh', 'just uploaded', NOW);
    const orphan = await write('orphan-old', 'nobody wants me', oldDate);
    const notAKey = await write('notes.txt', 'operator note', oldDate);
    const partial = await write('.orphan-old.partial', 'half written', oldDate);

    const { client: c } = client(
      [],
      ['/api/v1/images/kept-product'],
      ['/api/v1/images/kept-setting'],
    );
    const result = await pruneOrphanImageFiles(c, dir, NOW);

    expect(result).toEqual({ scanned: 3, deleted: 1, freedBytes: 'nobody wants me'.length });
    await expect(fs.stat(orphan)).rejects.toThrow();
    for (const survivor of [keptProduct, keptFresh, notAKey, partial]) {
      await expect(fs.stat(survivor)).resolves.toBeTruthy();
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports zeros when the media directory does not exist yet', async () => {
    const { client: c } = client([]);
    const missing = path.join(os.tmpdir(), `nk-media-missing-${Date.now()}`);
    expect(await pruneOrphanImageFiles(c, missing, NOW)).toEqual({ scanned: 0, deleted: 0, freedBytes: 0 });
  });

  it('keeps a file a setting still points at, even when it is old', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nk-media-gc-'));
    const file = path.join(dir, 'logo-key');
    await fs.writeFile(file, 'logo');
    const old = new Date(NOW.getTime() - IMAGE_ORPHAN_MIN_AGE_MS - 60_000);
    await fs.utimes(file, old, old);

    const { client: c } = client([], [], ['image:logo-key']);
    expect((await pruneOrphanImageFiles(c, dir, NOW)).deleted).toBe(0);
    await expect(fs.stat(file)).resolves.toBeTruthy();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
