/**
 * Manual-transfer settings validator — PUT /api/v1/admin/settings/[key].
 *
 * Covers the group that gates the storefront's whole payment path:
 *  - enabled / accountType / accountName / accountNumber / bankName rules
 *    (existing behaviour, kept as regression guards)
 *  - qrImageUrl (client ask 2026-09-27): optional STATIC bank-QR image —
 *    only paths produced by /api/v1/admin/upload are accepted, null/empty
 *    clears it, anything else (external URL, javascript:, random path) is
 *    rejected with 400 INVALID_QR_IMAGE_URL. The route never touches the
 *    database when validation fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'mtsettings-secret-0123456789abcdef0123456789abcdef';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const m = /^admin-(.+)$/.exec(where.id);
      if (!m) return null;
      return {
        role: m[1],
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      };
    },
  );
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  prismaMock.siteSetting.upsert.mockResolvedValue({});
});

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole } from '@/types/auth';

const tokenFor = (role: AdminRole): Promise<string> =>
  issueAdminJwt(`admin-${role}`, `${role}@test.local`, role, [...ROLE_PERMISSIONS[role]]);async function put(body: unknown): Promise<Response> {
  // Variable specifier — a literal '.ts' path trips TS5097 under tsc.
  const routePath = '../src/app/api/v1/admin/settings/[key]/route.ts';
  const mod = (await import(routePath)) as Record<string, unknown>;
  const req = new NextRequest('http://localhost/api/v1/admin/settings/manual-transfer', {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${await tokenFor('super_admin')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return (await (
    mod['PUT'] as (r: NextRequest, c: { params: Promise<{ key: string }> }) => Promise<Response>
  )(req, { params: Promise.resolve({ key: 'manual-transfer' }) })) as Response;
}

const BASE = {
  enabled: true,
  accountType: 'bank',
  accountName: 'กนกนาถ โรจนวุฒิ',
  accountNumber: '199-1-73578-6',
  bankName: 'กสิกรไทย',
};

describe('manual-transfer settings — qrImageUrl validator', () => {
  it('accepts an upload-produced path and persists it', async () => {
    const res = await put({ ...BASE, qrImageUrl: '/api/v1/images/abc123' });
    expect(res.status).toBe(200);
    const saved = JSON.parse(
      (prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as { update: { value: string } }).update
        .value,
    ) as { qrImageUrl?: string };
    expect(saved.qrImageUrl).toBe('/api/v1/images/abc123');
  });

  it('accepts null and empty string as "no image"', async () => {
    for (const qrImageUrl of [null, '']) {
      const res = await put({ ...BASE, qrImageUrl });
      expect(res.status).toBe(200);
      const saved = JSON.parse(
        (prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as { update: { value: string } }).update
          .value,
      ) as { qrImageUrl?: string | null };
      expect(saved.qrImageUrl ?? null).toBeNull();
    }
  });

  it('rejects external URLs, other paths, and injection shapes with INVALID_QR_IMAGE_URL', async () => {
    for (const qrImageUrl of [
      'https://evil.example/qr.png',
      '/products/x.png',
      '/api/v1/images/../settings',
      'javascript:alert(1)',
      '/api/v1/images/',
    ]) {
      const res = await put({ ...BASE, qrImageUrl });
      expect(res.status, qrImageUrl).toBe(400);
      expect(((await res.json()) as { error: string }).error, qrImageUrl).toBe(
        'INVALID_QR_IMAGE_URL',
      );
    }
    // Validation failure must not touch the database.
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it('omitted qrImageUrl never erases a stored image (merge semantics)', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({ ...BASE, qrImageUrl: '/api/v1/images/keep-me' }),
    });
    const res = await put({ ...BASE });
    expect(res.status).toBe(200);
    const saved = JSON.parse(
      (prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as { update: { value: string } }).update
        .value,
    ) as { qrImageUrl?: string };
    expect(saved.qrImageUrl).toBe('/api/v1/images/keep-me');
  });
});

describe('manual-transfer settings — account field rules (regression)', () => {
  it('rejects malformed account numbers', async () => {
    const res = await put({ ...BASE, accountNumber: 'abc-!!' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_ACCOUNT_NUMBER');
  });

  it('keeps the enabled+account state that gates checkout', async () => {
    const res = await put(BASE);
    expect(res.status).toBe(200);
    const saved = JSON.parse(
      (prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as { update: { value: string } }).update
        .value,
    ) as { enabled: boolean; accountName: string; accountNumber: string };
    expect(saved.enabled).toBe(true);
    expect(saved.accountName).toBe('กนกนาถ โรจนวุฒิ');
    expect(saved.accountNumber).toBe('199-1-73578-6');
  });
});
