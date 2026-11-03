/**
 * VAT settings — PUT/GET /api/v1/admin/settings/vat.
 *
 * This number multiplies every order total (getVatConfig turns the stored
 * percentage into the fraction the price maths uses), so the gate is about
 * what happens to BAD input:
 *
 *  - before 2026-11-03 `rate` was coerced: anything that was not a positive
 *    number became 7, and `enabled` was `b.enabled === true`, so the strings
 *    "true"/"7" wrote {enabled: false, rate: 7} with a 200. A client bug could
 *    silently switch VAT off, or restore it at 7%, and the screen said saved.
 *  - now every malformed field is a 400 and the database is untouched, so the
 *    previous stored value keeps pricing orders.
 *
 * The read side still defaults a missing/corrupt row to {enabled:false, rate:7}
 * — that is a display default, never a write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'vatsettings-secret-0123456789abcdef0123456789ab';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(prismaMock)),
    auditLog: {
      create: vi.fn(async () => ({ id: 'audit_1' })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
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
  issueAdminJwt(`admin-${role}`, `${role}@test.local`, role, [...ROLE_PERMISSIONS[role]]);

type RouteModule = {
  GET: (r: NextRequest) => Promise<Response>;
  PUT: (r: NextRequest) => Promise<Response>;
};

async function route(): Promise<RouteModule> {
  // Variable specifier — a literal '.ts' path trips TS5097 under tsc.
  const path = '../src/app/api/v1/admin/settings/vat/route.ts';
  return (await import(path)) as RouteModule;
}

async function put(body: unknown, token?: string): Promise<Response> {
  const mod = await route();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
  const req = new NextRequest('http://localhost/api/v1/admin/settings/vat', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return mod.PUT(req);
}

const asSuperAdmin = (body: unknown): Promise<Response> =>
  tokenFor('super_admin').then((t) => put(body, t));

async function get(token?: string): Promise<Response> {
  const mod = await route();
  const headers: Record<string, string> = {};
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
  const req = new NextRequest('http://localhost/api/v1/admin/settings/vat', { headers });
  return mod.GET(req);
}

/** The value that was actually written to SiteSetting('vat'). */
function storedValue(): { enabled: boolean; rate: number } {
  const call = prismaMock.siteSetting.upsert.mock.calls[0]?.[0] as
    | { update: { value: string } }
    | undefined;
  if (!call) throw new Error('nothing was written');
  return JSON.parse(call.update.value) as { enabled: boolean; rate: number };
}

describe('PUT /api/v1/admin/settings/vat — accepted input', () => {
  it('stores an enabled 7% and mirrors it back', async () => {
    const res = await asSuperAdmin({ enabled: true, rate: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, rate: 7 });
    expect(storedValue()).toEqual({ enabled: true, rate: 7 });
  });

  it('stores disabled + a stored rate as given, not as a substituted 7', async () => {
    const res = await asSuperAdmin({ enabled: false, rate: 0.5 });
    expect(res.status).toBe(200);
    expect(storedValue()).toEqual({ enabled: false, rate: 0.5 });
  });

  it('accepts both ends of the allowed band (0.1 and 30)', async () => {
    for (const rate of [0.1, 30]) {
      prismaMock.siteSetting.upsert.mockClear();
      const res = await asSuperAdmin({ enabled: true, rate });
      expect(res.status, String(rate)).toBe(200);
      expect(storedValue().rate).toBe(rate);
    }
  });
});

describe('PUT /api/v1/admin/settings/vat — rate never defaults silently', () => {
  it.each([
    ['zero', 0],
    ['negative', -5],
    ['fraction above 30', 30.5],
    ['below 0.1', 0.05],
    ['a numeric string', '7'],
    ['null', null],
    ['missing', undefined],
  ])('rejects %s with INVALID_RATE and writes nothing', async (_label, rate) => {
    const res = await asSuperAdmin({ enabled: true, rate });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_RATE');
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/admin/settings/vat — enabled must be a real boolean', () => {
  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['null', null],
    ['missing', undefined],
  ])('rejects %s with INVALID_ENABLED and writes nothing', async (_label, enabled) => {
    const res = await asSuperAdmin({ enabled, rate: 7 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_ENABLED');
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an object at all', async () => {
    const res = await asSuperAdmin(null);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_ENABLED');
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('PUT/GET /api/v1/admin/settings/vat — access control', () => {
  it('answers 401 without a token on both verbs', async () => {
    expect((await put({ enabled: true, rate: 7 })).status).toBe(401);
    expect((await get()).status).toBe(401);
  });

  it('answers 403 for a role without settings permission, and writes nothing', async () => {
    const token = await tokenFor('order_manager');
    expect((await put({ enabled: true, rate: 7 }, token)).status).toBe(403);
    expect((await get(token)).status).toBe(403);
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/settings/vat', () => {
  it('returns the stored values', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({ enabled: true, rate: 7 }),
    });
    const res = await get(await tokenFor('super_admin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, rate: 7 });
  });

  it('falls back to disabled/7 when nothing is stored', async () => {
    const res = await get(await tokenFor('super_admin'));
    expect(await res.json()).toEqual({ enabled: false, rate: 7 });
  });

  it('falls back rather than throwing when the stored row is corrupt', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '{not json' });
    const res = await get(await tokenFor('super_admin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, rate: 7 });
  });

  it('a read never writes', async () => {
    await get(await tokenFor('super_admin'));
    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
  });
});
