/**
 * ใบกำกับภาษี on/off (client ask, 2026-11-05): "ตอนนี้เค้าต้องเอาใบกำกับภาษีออก
 * เพราะเค้าไม่สามารถออกได้ แก้ตรงนี้เอาเป็นฟังก์ชันนี้เปิดปิด".
 *
 * The switch is a SiteSetting read by checkout, the order API and the account
 * nav, so two things matter and are pinned here:
 *   - the DEFAULT is ON (a missing or corrupt row must not silently delete a
 *     feature the store has always offered), and
 *   - only a real boolean turns it off: a PUT of `"false"`/0/`null` is rejected
 *     rather than coerced, because a client bug must not close the surface.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, rbacMock, tokenMock } = vi.hoisted(() => ({
  prismaMock: { siteSetting: { findUnique: vi.fn(), upsert: vi.fn() } },
  rbacMock: { checkPermission: vi.fn() },
  tokenMock: { getAdminToken: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/rbac', () => rbacMock);
vi.mock('@/lib/adminRequest', () => tokenMock);

import { getTaxInvoiceConfig } from '@/lib/taxInvoice';
import { GET as adminGet, PUT as adminPut } from '@/app/api/v1/admin/settings/tax-invoice/route';
import { GET as publicGet } from '@/app/api/v1/settings/tax-invoice/route';

const adminReq = (body?: unknown): NextRequest =>
  new NextRequest('https://nongkatistore.com/api/v1/admin/settings/tax-invoice', {
    method: body === undefined ? 'GET' : 'PUT',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  tokenMock.getAdminToken.mockReturnValue('admin-token');
  rbacMock.checkPermission.mockResolvedValue({
    allowed: true,
    payload: { sub: 'admin-1', perms: ['settings:read', 'settings:write'] },
  });
});

describe('getTaxInvoiceConfig', () => {
  it('T1: no row means ON — the default must preserve the old behaviour', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue(null);
    expect(await getTaxInvoiceConfig()).toEqual({ enabled: true });
  });

  it('T2: an explicit false turns it off, anything else (and corrupt JSON) stays on', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValueOnce({ value: '{"enabled":false}' });
    expect(await getTaxInvoiceConfig()).toEqual({ enabled: false });

    prismaMock.siteSetting.findUnique.mockResolvedValueOnce({ value: '{"enabled":true}' });
    expect(await getTaxInvoiceConfig()).toEqual({ enabled: true });

    prismaMock.siteSetting.findUnique.mockResolvedValueOnce({ value: 'not json' });
    expect(await getTaxInvoiceConfig()).toEqual({ enabled: true });
  });
});

describe('admin tax-invoice route', () => {
  it('T3: GET reports the stored switch', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '{"enabled":false}' });
    const res = await adminGet(adminReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });

  it('T4: PUT rejects a non-boolean instead of guessing', async () => {
    for (const bad of ['false', 0, null, 'true']) {
      const res = await adminPut(adminReq({ enabled: bad }));
      expect(res.status, String(bad)).toBe(400);
    }
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it('T5: PUT stores the boolean and records who changed it', async () => {
    prismaMock.siteSetting.upsert.mockResolvedValue({});
    const res = await adminPut(adminReq({ enabled: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'tax_invoice' },
        create: expect.objectContaining({
          key: 'tax_invoice',
          value: '{"enabled":false}',
          updatedBy: 'admin-1',
        }),
      }),
    );
  });

  it('T6: a role without settings:write cannot flip it', async () => {
    rbacMock.checkPermission.mockResolvedValue({ allowed: false, error: 'FORBIDDEN' });
    const res = await adminPut(adminReq({ enabled: false }));
    expect(res.status).toBe(403);
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('public tax-invoice route', () => {
  it('T7: checkout can read the flag without a session, and it is not cached', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '{"enabled":false}' });
    const res = await publicGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
