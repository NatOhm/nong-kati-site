/**
 * Media-orphan sweeper (2026-11-15).
 *
 * Product photos live on disk, but replacing one only rewrites
 * `Product.imageUrl`: the old file stayed forever unless an admin happened to
 * upload something else later, because the prune only ran inside the upload
 * route. `sweepMediaOrphans` is that rule set as a standalone operation, and
 * `POST /api/v1/internal/media/sweep` is how a cron runs it.
 *
 * What this gate pins:
 *   S1 — a dry run reports the orphans and deletes nothing (the first run an
 *        operator sees must be safe).
 *   S2 — `apply` deletes exactly the orphans: referenced, fresh and
 *        not-our-key files all survive.
 *   S3 — a second apply run is a no-op, so a cron can re-run without damage.
 *   S4 — a missing media directory answers zeros instead of throwing (a fresh
 *        host has no `storage/media` yet).
 *   S5 — the response list is capped and says so, so a thousand orphans cannot
 *        turn a cron response into a wall of text.
 *   S6 — the route fails closed: 503 with no secret, 401 with a wrong one, and
 *        it never deletes without `?apply=1`.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    product: { findMany: vi.fn(async () => []) },
    siteSetting: { findMany: vi.fn(async () => []) },
  },
}));

import { POST } from '@/app/api/v1/internal/media/sweep/route';
import { IMAGE_ORPHAN_MIN_AGE_MS, sweepMediaOrphans } from '@/lib/imageCleanup';

const NOW = new Date('2026-11-15T12:00:00Z');
const OLD = new Date(NOW.getTime() - IMAGE_ORPHAN_MIN_AGE_MS - 60_000);
/** Older than the cutoff against the REAL clock — the route has no `now` seam. */
const ANCIENT = new Date(Date.now() - IMAGE_ORPHAN_MIN_AGE_MS - 3_600_000);

type SweepClient = Parameters<typeof sweepMediaOrphans>[0];

/** Only the two reads the sweeper makes, mirroring the real where clauses. */
function fakeClient(productUrls: string[], settings: string[]): SweepClient {
  return {
    product: { findMany: vi.fn(async () => productUrls.map((imageUrl) => ({ imageUrl }))) },
    siteSetting: {
      findMany: vi.fn(async (args: { where: { key?: { not?: { startsWith?: string } } } }) =>
        args.where.key?.not ? settings.map((value) => ({ value })) : [],
      ),
    },
  } as unknown as SweepClient;
}

let dir = '';

async function write(name: string, body: string, mtime: Date): Promise<string> {
  const file = path.join(dir, name);
  await fs.writeFile(file, body);
  await fs.utimes(file, mtime, mtime);
  return file;
}

async function exists(file: string): Promise<boolean> {
  return fs
    .stat(file)
    .then(() => true)
    .catch(() => false);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nk-media-sweep-'));
  process.env['NK_MEDIA_DIR'] = dir;
});

afterEach(async () => {
  delete process.env['NK_MEDIA_DIR'];
  delete process.env['NK_CRON_SECRET'];
  await fs.rm(dir, { recursive: true, force: true });
});

describe('sweepMediaOrphans', () => {
  it('S1: a dry run lists the orphans and deletes nothing', async () => {
    const orphan = await write('dead-key', 'nobody wants me', OLD);
    await write('live-key', 'product photo', OLD);
    await write('fresh-key', 'just uploaded', NOW);
    await write('notes.txt', 'operator note', OLD);

    const result = await sweepMediaOrphans(fakeClient(['/api/v1/images/live-key'], []), {
      dir,
      now: NOW,
    });

    expect(result).toEqual({
      scanned: 3,
      orphans: ['dead-key'],
      truncated: false,
      deleted: 0,
      freedBytes: 0,
      apply: false,
    });
    await expect(exists(orphan)).resolves.toBe(true);
  });

  it('S2: apply deletes exactly the unreferenced, old files', async () => {
    const orphan = await write('dead-key', 'nobody wants me', OLD);
    const keptProduct = await write('live-key', 'product photo', OLD);
    const keptSetting = await write('logo-key', 'banner', OLD);
    const keptFresh = await write('fresh-key', 'just uploaded', NOW);
    const notAKey = await write('notes.txt', 'operator note', OLD);
    const partial = await write('.dead-key.partial', 'half written', OLD);

    const result = await sweepMediaOrphans(
      fakeClient(['/api/v1/images/live-key'], ['/api/v1/images/logo-key']),
      { dir, now: NOW, apply: true },
    );

    expect(result.deleted).toBe(1);
    expect(result.freedBytes).toBe('nobody wants me'.length);
    await expect(exists(orphan)).resolves.toBe(false);
    for (const survivor of [keptProduct, keptSetting, keptFresh, notAKey, partial]) {
      await expect(exists(survivor)).resolves.toBe(true);
    }
  });

  it('S3: a second apply run finds nothing to do', async () => {
    await write('dead-key', 'nobody wants me', OLD);
    const client = fakeClient([], []);
    await sweepMediaOrphans(client, { dir, now: NOW, apply: true });

    const second = await sweepMediaOrphans(client, { dir, now: NOW, apply: true });
    expect(second).toMatchObject({ orphans: [], deleted: 0, freedBytes: 0 });
  });

  it('S4: a missing media directory answers zeros instead of throwing', async () => {
    const missing = path.join(os.tmpdir(), `nk-media-missing-${Date.now()}`);
    await expect(sweepMediaOrphans(fakeClient([], []), { dir: missing, now: NOW })).resolves.toEqual({
      scanned: 0,
      orphans: [],
      truncated: false,
      deleted: 0,
      freedBytes: 0,
      apply: false,
    });
  });

  it('S5: caps the reported list and flags the truncation', async () => {
    for (let i = 0; i < 3; i += 1) await write(`dead-${i}`, 'x', OLD);
    const result = await sweepMediaOrphans(fakeClient([], []), { dir, now: NOW, listLimit: 2 });
    expect(result.orphans).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.deleted).toBe(0);
  });
});

describe('POST /api/v1/internal/media/sweep', () => {
  const request = (query = '', token?: string) =>
    new NextRequest(`http://localhost/api/v1/internal/media/sweep${query}`, {
      method: 'POST',
      headers: token ? { 'x-cron-token': token } : {},
    });

  it('S6: 503 without a configured secret, 401 with the wrong token', async () => {
    // The route uses the real clock, so this fixture has to be old relative to it.
    await write('dead-key', 'nobody wants me', ANCIENT);

    expect((await POST(request())).status).toBe(503);

    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    expect((await POST(request('', 'wrong'))).status).toBe(401);
    await expect(exists(path.join(dir, 'dead-key'))).resolves.toBe(true);
  });

  it('S6: reports without applying, then deletes only with ?apply=1', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const orphan = await write('dead-key', 'nobody wants me', ANCIENT);

    const dry = await POST(request('', 'cron-secret-value'));
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({ ok: true, apply: false, deleted: 0, orphans: ['dead-key'] });
    await expect(exists(orphan)).resolves.toBe(true);

    const applied = await POST(request('?apply=1', 'cron-secret-value'));
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ ok: true, apply: true, deleted: 1 });
    await expect(exists(orphan)).resolves.toBe(false);
  });
});
