/**
 * Payment slips as private files (2026-11-15).
 *
 * Slips were `SiteSetting` rows `slip:<32 hex>` holding a base64 data URL — up
 * to ~6.7 MB per row in the hottest settings table, and every admin view
 * pulled the whole image through Prisma. They are financial documents (account
 * numbers, amounts, PDPA data), so they must also never be reachable through
 * the public image route.
 *
 * What this gate pins:
 *   P1 — the store writes/reads/deletes under `NK_SLIP_DIR`, atomically (no
 *        `.partial` survives), and refuses a key that is not 32 hex chars.
 *   P2 — the default directory is a SUBdirectory of the media root
 *        (`private/slips`), which is what keeps slips out of
 *        `/api/v1/images/<key>`.
 *   P3 — retention deletes old files and old rows on one cutoff, keeps young
 *        files, and never touches a name that is not a slip key.
 *   P4 — the download route serves the FILE first and does not need the row;
 *        it still serves a legacy row when no file exists; 404 when neither.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const P = () => 'd'.repeat(31) + '1';

const h = vi.hoisted(() => ({
  /** Slip rows keyed by `slip:<key>` — the legacy fallback. */
  rows: new Map<string, string>(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    siteSetting: {
      findUnique: vi.fn(async (args: { where: { key: string } }) => {
        const value = h.rows.get(args.where.key);
        return value === undefined ? null : { key: args.where.key, value };
      }),
    },
    order: { findFirst: vi.fn(async () => null) },
  },
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () => ({ allowed: true, payload: { sub: 'admin-1' } })),
}));

import { GET } from '@/app/api/v1/payments/slip-download/[key]/route';
import {
  deleteSlip,
  normalizeSlipKey,
  pruneSlipFiles,
  readSlip,
  slipDir,
  writeSlip,
} from '@/lib/slipStore';

let dir = '';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nk-slips-'));
  process.env['NK_SLIP_DIR'] = dir;
  h.rows.clear();
});

afterEach(async () => {
  delete process.env['NK_SLIP_DIR'];
  await fs.rm(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

async function listAll(target: string): Promise<string[]> {
  return fs.readdir(target).catch(() => []);
}

describe('slip file store', () => {
  it('P1: writes atomically, reads back, deletes, and rejects a bad key', async () => {
    const key = `slip:${P()}`;
    await writeSlip(key, PNG);

    expect(await listAll(dir)).toEqual([P()]);
    const bytes = await readSlip(key);
    expect(bytes?.equals(PNG)).toBe(true);

    expect(await deleteSlip(key)).toBe(true);
    expect(await listAll(dir)).toEqual([]);

    expect(normalizeSlipKey('not-a-slip-key')).toBeNull();
    expect(await readSlip('../../etc/passwd')).toBeNull();
    await expect(writeSlip('../escape', PNG)).rejects.toThrow();
  });

  it('P2: defaults to a private subdirectory of the media root', () => {
    delete process.env['NK_SLIP_DIR'];
    const media = process.env['NK_MEDIA_DIR'];
    delete process.env['NK_MEDIA_DIR'];
    expect(slipDir().endsWith(path.join('private', 'slips'))).toBe(true);
    if (media !== undefined) process.env['NK_MEDIA_DIR'] = media;
  });

  it('P3: prunes old files only, and ignores names that are not slip keys', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const write = async (name: string, mtime: Date) => {
      const file = path.join(dir, name);
      await fs.writeFile(file, PNG);
      await fs.utimes(file, mtime, mtime);
      return file;
    };

    const stale = await write(P(), old);
    const fresh = await write('e'.repeat(32), new Date());
    const notes = await write('notes.txt', old);

    const result = await pruneSlipFiles(new Date(Date.now() - 30 * 86_400_000));
    expect(result).toEqual({ scanned: 2, deleted: 1, freedBytes: PNG.length });
    expect(await listAll(dir)).toEqual(expect.arrayContaining(['e'.repeat(32), 'notes.txt']));
    await expect(fs.stat(stale)).rejects.toThrow();
    await expect(fs.stat(fresh)).resolves.toBeTruthy();
    await expect(fs.stat(notes)).resolves.toBeTruthy();
  });

  it('P3: a second prune deletes nothing — evidence inside the window survives', async () => {
    await writeSlip(P(), PNG);
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const first = await pruneSlipFiles(cutoff);
    expect(first).toEqual({ scanned: 1, deleted: 0, freedBytes: 0 });
    expect(await pruneSlipFiles(cutoff)).toEqual({ scanned: 1, deleted: 0, freedBytes: 0 });
    expect(await listAll(dir)).toEqual([P()]);
  });
});

describe('GET /api/v1/payments/slip-download/[key]', () => {
  const request = () =>
    new NextRequest(`http://localhost/api/v1/payments/slip-download/${P()}`, {
      headers: { authorization: 'Bearer admin-token' },
    });

  it('P4: serves the file without reading a settings row', async () => {
    await writeSlip(P(), PNG);
    const res = await GET(request(), { params: Promise.resolve({ key: P() }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('P4: still serves a legacy slip row when no file exists', async () => {
    h.rows.set(`slip:${P()}`, `data:image/jpeg;base64,${PNG.toString('base64')}`);

    const res = await GET(request(), { params: Promise.resolve({ key: P() }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('P4: 404 when neither the file nor a row exists', async () => {
    const res = await GET(request(), { params: Promise.resolve({ key: P() }) });
    expect(res.status).toBe(404);
  });
});
