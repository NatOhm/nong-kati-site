/**
 * Slip-evidence retention — audit finding 3 (2026-10-26).
 *
 * `slip:*` rows (base64 images, up to ~6.7 MB each) were upserted into
 * SiteSetting on every upload AND every verify attempt, with no deleteMany
 * anywhere: unbounded growth in the hottest settings table plus growing
 * PDPA exposure. The new internal route deletes only `slip:*` rows whose
 * updatedAt is older than 30 days, with the sibling sweeps' fail-closed
 * NK_CRON_SECRET auth.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type SettingRow = { key: string; updatedAt: Date };
  const rows: SettingRow[] = [];
  const prisma = {
    siteSetting: {
      // In-memory stand-in for
      // deleteMany({ where: { key: { startsWith }, updatedAt: { lt } } }).
      deleteMany: vi.fn(
        async (args: { where: { key: { startsWith: string }; updatedAt: { lt: Date } } }) => {
          const prefix = args.where.key.startsWith;
          const cutoff = args.where.updatedAt.lt;
          const doomed = rows.filter((r) => r.key.startsWith(prefix) && r.updatedAt < cutoff);
          for (const d of doomed) rows.splice(rows.indexOf(d), 1);
          return { count: doomed.length };
        },
      ),
    },
  };
  return { prisma, rows };
});

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));

import { POST } from '@/app/api/v1/internal/settings/slip-retention/route';

const SECRET = 'retention-test-secret-0123456789abcdef';
const ORIGINAL_SECRET = process.env['NK_CRON_SECRET'];

const tick = (token?: string) =>
  new NextRequest('http://localhost/api/v1/internal/settings/slip-retention', {
    method: 'POST',
    headers: token ? { 'x-cron-token': token } : {},
  });

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env['NK_CRON_SECRET'];
  else process.env['NK_CRON_SECRET'] = ORIGINAL_SECRET;
  h.rows.length = 0;
  vi.clearAllMocks();
});

describe('slip evidence retention', () => {
  it('fails closed with 503 while NK_CRON_SECRET is unconfigured', async () => {
    delete process.env['NK_CRON_SECRET'];
    const res = await POST(tick('anything'));
    expect(res.status).toBe(503);
    expect(h.prisma.siteSetting.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a wrong token with 401 without touching rows', async () => {
    process.env['NK_CRON_SECRET'] = SECRET;
    const res = await POST(tick('wrong-token'));
    expect(res.status).toBe(401);
    expect(h.prisma.siteSetting.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only slip:* rows older than 30 days', async () => {
    process.env['NK_CRON_SECRET'] = SECRET;
    const day = 86_400_000;
    h.rows.push(
      { key: 'slip:old31d', updatedAt: new Date(Date.now() - 31 * day) },
      { key: 'slip:ancient90d', updatedAt: new Date(Date.now() - 90 * day) },
      { key: 'slip:fresh1d', updatedAt: new Date(Date.now() - 1 * day) },
      { key: 'slip:justnow', updatedAt: new Date() },
      // Old but NOT slip evidence — settings must never be swept here.
      { key: 'store:info', updatedAt: new Date(Date.now() - 400 * day) },
    );

    const res = await POST(tick(SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(2);

    const remaining = h.rows.map((r) => r.key).sort();
    expect(remaining).toEqual(['slip:fresh1d', 'slip:justnow', 'store:info']);
  });
});
