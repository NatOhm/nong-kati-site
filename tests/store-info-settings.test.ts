import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'store-info-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(prismaMock)),
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS } from '@/types/auth';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const role = where.id.replace('admin-', '');
    return {
      role,
      status: 'active',
      sessionsInvalidBefore: null,
      mustChangePassword: false,
    };
  });
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  prismaMock.siteSetting.upsert.mockResolvedValue({});
});

async function putStoreInfo(lineUrl: string): Promise<Response> {
  const { PUT } = await import('@/app/api/v1/admin/settings/[key]/route');
  const token = await issueAdminJwt('admin-super_admin', 'admin@test.local', 'super_admin', [
    ...ROLE_PERMISSIONS.super_admin,
  ]);
  const req = new NextRequest('http://localhost/api/v1/admin/settings/store-info', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Shop', email: '', lineUrl }),
  });
  return PUT(req, { params: Promise.resolve({ key: 'store-info' }) });
}

describe('store contact settings', () => {
  it('persists an admin-configured LINE Official Account destination', async () => {
    const response = await putStoreInfo('https://lin.ee/test-target');

    expect(response.status).toBe(200);
    const saved = JSON.parse(
      (prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as { update: { value: string } }).update.value,
    ) as { lineUrl: string; email: string };
    expect(saved.lineUrl).toBe('https://lin.ee/test-target');
    expect(saved.email).toBe('');
  });

  it.each(['javascript:alert(1)', 'http://lin.ee/example', 'https://evil.example/contact', 'not a URL'])(
    'rejects non-HTTPS or malformed LINE destinations (%s)',
    async (lineUrl) => {
      const response = await putStoreInfo(lineUrl);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'INVALID_LINE_URL' });
      expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
    },
  );
});
