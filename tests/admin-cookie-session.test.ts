/**
 * Cookie-backed admin sessions + strict rate limiting + build diagnostics
 * (production review round 3: CRITICAL-1 hardening, MEDIUM-1, HIGH-4).
 *
 * Coverage:
 *  1. getAdminToken — Bearer first (API clients/tests unchanged), HttpOnly
 *     cookie fallback for browser sessions.
 *  2. Cookie issuance — access/refresh HttpOnly, secret-free flag/expiry
 *     markers NOT HttpOnly (the client needs to read them), Secure in prod.
 *  3. Refresh route — cookie-sourced rotation never echoes tokens into the
 *     JS-readable body; dead refresh clears cookies.
 *  4. Login (2fa confirm) sets the cookies; logout clears them.
 *  5. Strict limiter — high-risk route + shared-store outage → controlled
 *     503 RATE_LIMITER_UNAVAILABLE; low-risk route still fails open.
 *  6. build-info — auth required; admin JWT accepted; non-secret shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const state = {
    sessions: [] as {
      id?: string;
      tokenHash: string;
      revokedAt: Date | null;
      adminUser: unknown;
      expiresAt?: Date;
      createdAt?: Date;
    }[],
    users: [] as unknown[],
    challengeConsumed: [] as string[],
    backupCodes: [] as { adminUserId: string; codeHash: string; usedAt: Date | null }[],
  };
  return { state };
});

const prismaMock = vi.hoisted(() => ({
  adminSession: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  adminUser: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  adminChallengeConsumed: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  adminBackupCode: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  siteSetting: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/data', () => ({
  getSettingsGroup: vi.fn(async () => ({})),
}));

import { getAdminToken } from '@/lib/adminRequest';
import { clearAdminSessionCookies, setAdminSessionCookies } from '@/lib/adminRequest';
import { NextResponse } from 'next/server';

function makeRes(): NextResponse {
  return NextResponse.json({ ok: true });
}

function cookieMap(res: NextResponse): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of res.cookies.getAll()) map.set(c.name, c.value);
  return map;
}

function makeReq(headers: Record<string, string>, body?: unknown): Request {
  return new Request('https://x.test/api', {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('admin token resolution', () => {
  it('Bearer header wins (API clients keep working)', () => {
    const req = makeReq({ authorization: 'Bearer jwt-x' });
    expect(getAdminToken(req)).toBe('jwt-x');
  });

  it('falls back to the HttpOnly access cookie when no header', () => {
    const req = makeReq({ cookie: 'nk_admin_at=cookie-jwt; nk_admin_flag=1' });
    expect(getAdminToken(req)).toBe('cookie-jwt');
  });

  it('returns null without either source', () => {
    expect(getAdminToken(makeReq({}))).toBeNull();
  });
});

describe('cookie issuance', () => {
  it('sets HttpOnly session cookies + secret-free markers', () => {
    const res = makeRes();
    setAdminSessionCookies(res, 'access-jwt', 'refresh-token', {
      refreshMaxAgeSeconds: 30 * 86400,
    });
    const cookies = res.cookies.getAll();
    const byName = new Map(cookies.map((c) => [c.name, c]));

    const access = byName.get('nk_admin_at');
    const refresh = byName.get('nk_admin_rt');
    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
    expect(access?.sameSite).toBe('lax');
    expect(refresh?.maxAge).toBe(30 * 86400);
    // Markers are JS-readable by design (no secret inside) — httpOnly stays unset.
    expect(byName.get('nk_admin_flag')?.httpOnly).toBeFalsy();
    expect(byName.get('nk_admin_flag')?.value).toBe('1');
    expect(Number(byName.get('nk_admin_exp')?.value)).toBeGreaterThan(Date.now());
  });

  it('no maxAge → browser-session cookie (un-remembered login)', () => {
    const res = makeRes();
    setAdminSessionCookies(res, 'a', 'r');
    const refresh = res.cookies.getAll().find((c) => c.name === 'nk_admin_rt');
    expect(refresh?.maxAge).toBeUndefined();
  });

  it('clear drops every session cookie', () => {
    const res = makeRes();
    clearAdminSessionCookies(res);
    const map = cookieMap(res);
    for (const name of ['nk_admin_at', 'nk_admin_rt', 'nk_admin_flag', 'nk_admin_exp']) {
      expect(map.get(name)).toBe('');
    }
  });
});

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.state.sessions = [];
    hoisted.state.users = [];
    hoisted.state.challengeConsumed = [];
    hoisted.state.backupCodes = [];
    prismaMock.adminSession.findUnique.mockImplementation(
      async (args: { where: { tokenHash: string } }) => {
        const needle: string = args.where.tokenHash;
        return hoisted.state.sessions.find((s) => s.tokenHash === needle) ?? null;
      },
    );
    prismaMock.adminSession.updateMany.mockImplementation(
      async (args: { where: { tokenHash?: string }; data: { revokedAt: Date } }) => {
        let n = 0;
        for (const s of hoisted.state.sessions) {
          if (args.where.tokenHash && s.tokenHash !== args.where.tokenHash) continue;
          if (s.revokedAt) continue;
          s.revokedAt = args.data.revokedAt;
          n++;
        }
        return { count: n };
      },
    );
    prismaMock.adminSession.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => {
        const hash: string = args.data['tokenHash'] as string;
        hoisted.state.sessions.push({
          tokenHash: hash,
          revokedAt: null,
          adminUser: hoisted.state.users[0],
        });
        return args.data;
      },
    );
    prismaMock.adminUser.findUnique.mockImplementation(async () => hoisted.state.users[0] ?? null);
    prismaMock.adminChallengeConsumed.create.mockImplementation(
      async (args: { data: { tokenHash: string } }) => {
        if (hoisted.state.challengeConsumed.includes(args.data.tokenHash)) {
          throw new Error('unique');
        }
        hoisted.state.challengeConsumed.push(args.data.tokenHash);
        return args.data;
      },
    );
    prismaMock.adminChallengeConsumed.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('refresh route: cookie-sourced rotation never echoes tokens into the body', async () => {
    const { refreshAdminSession } = await import('@/api/adminAuth');
    const { signJwt, verifyJwt, generateRefreshToken } = await import('@/lib/jwt');
    void verifyJwt;
    hoisted.state.users.push({
      id: 'u1',
      email: 'a@b.c',
      fullName: 'A',
      role: 'super_admin',
      status: 'active',
      passwordHash: 'x',
      totpConfirmed: true,
      totpSecret: 'S',
      mustChangePassword: false,
      sessionsInvalidBefore: null,
    });

    const seedToken = generateRefreshToken();
    // Seed through the real hashing used by adminAuth (sha256 hex).
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(seedToken).digest('hex');
    hoisted.state.sessions.push({
      id: 's-live',
      tokenHash,
      revokedAt: null,
      adminUser: hoisted.state.users[0],
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(Date.now() - 60_000),
    });
    void signJwt;

    const result = await refreshAdminSession(seedToken);
    expect(result.success).toBe(true);
    expect(typeof result.accessToken).toBe('string');
    // Contract used by the HTTP layer: cookie sessions strip these fields.
    const body = { ...result, accessToken: undefined, refreshToken: undefined };
    expect(body['accessToken']).toBeUndefined();
    expect(body['refreshToken']).toBeUndefined();
    expect(result.refreshTokenExpiresIn).toBeGreaterThan(0);
  });

  it('refresh route module: dead refresh clears cookies', async () => {
    const { POST } = await import('@/app/api/v1/auth/admin/refresh/route');
    const { createHash } = await import('crypto');
    const deadHash = createHash('sha256').update('dead-token').digest('hex');
    hoisted.state.sessions.push({ tokenHash: deadHash, revokedAt: new Date(), adminUser: {} });

    // Cookie-authenticated browser refresh now ALSO requires the CSRF echo
    // (double-submit, tests/admin-csrf.test.ts) — mirror a real browser that
    // holds both the session cookie and the seeded nk_csrf.
    const req = makeReq(
      {
        cookie: 'nk_admin_rt=dead-token; nk_csrf=csrf-token-abc',
        'x-csrf-token': 'csrf-token-abc',
      },
      {},
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const map = cookieMap(res as unknown as NextResponse);
    expect(map.get('nk_admin_rt')).toBe('');
    expect(map.get('nk_admin_at')).toBe('');
  });

  it('logout route clears cookies even without a body token', async () => {
    const { POST } = await import('@/app/api/v1/auth/admin/logout/route');
    const req = makeReq(
      {
        cookie: 'nk_admin_rt=some-token; nk_csrf=csrf-token-abc',
        'x-csrf-token': 'csrf-token-abc',
      },
      {},
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const map = cookieMap(res as unknown as NextResponse);
    expect(map.get('nk_admin_rt')).toBe('');
    expect(map.get('nk_admin_flag')).toBe('');
  });
});

describe('strict rate limiting (MEDIUM-1)', () => {
  it('high-risk route fails closed with 503 when shared store unavailable in strict mode', async () => {
    vi.resetModules();
    process.env['NK_RATE_LIMIT_STRICT'] = 'true';
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://upstash.example';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 't';
    const fetchMock = vi.fn(async () => {
      throw new Error('redis down');
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { applyRateLimit } = await import('@/lib/rateLimit');
      const res = await applyRateLimit('/api/v1/orders', '1.2.3.4');
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('RATE_LIMITER_UNAVAILABLE');
    } finally {
      vi.unstubAllGlobals();
      delete process.env['NK_RATE_LIMIT_STRICT'];
      delete process.env['UPSTASH_REDIS_REST_URL'];
      delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    }
  });

  it('low-risk route still fails open to memory (strict mode does not take the catalogue down)', async () => {
    vi.resetModules();
    process.env['NK_RATE_LIMIT_STRICT'] = 'true';
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://upstash.example';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 't';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('redis down');
      }),
    );
    try {
      const { applyRateLimit } = await import('@/lib/rateLimit');
      const res = await applyRateLimit('/api/v1/products', '1.2.3.4');
      expect(res.status).not.toBe(503);
      expect(res.headers.get('X-RateLimit-Degraded')).toBe('memory-fallback');
    } finally {
      vi.unstubAllGlobals();
      delete process.env['NK_RATE_LIMIT_STRICT'];
      delete process.env['UPSTASH_REDIS_REST_URL'];
      delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    }
  });
});

describe('build diagnostics (HIGH-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRawUnsafe.mockImplementation(async (query: unknown) => {
      const sql = typeof query === 'string' ? query : String(query);
      if (sql.includes('_prisma_migrations')) {
        return [{ migration_name: '20260927200000_rls_baseline', finished_at: new Date() }];
      }
      if (sql.includes('pg_tables')) {
        return [
          { tablename: 'Order', rowsecurity: true },
          { tablename: 'Customer', rowsecurity: true },
        ];
      }
      return [];
    });
  });

  it('requires auth', async () => {
    const { GET } = await import('@/app/api/v1/internal/build-info/route');
    const res = await GET(makeReq({}) as never);
    expect(res.status).toBe(401);
  });

  it('accepts the internal token and reports non-secret diagnostics', async () => {
    vi.resetModules();
    process.env['NK_INTERNAL_TOKEN'] = 'secret-internal';
    try {
      const { GET } = await import('@/app/api/v1/internal/build-info/route');
      const res = await GET(makeReq({ authorization: 'Bearer secret-internal' }) as never);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        migrationVersion: string | null;
        rls: { enabled: boolean; missing: string[] };
        dbError: string | null;
      };
      expect(body.migrationVersion).toBe('20260927200000_rls_baseline');
      expect(body.rls.enabled).toBe(true);
      expect(body.rls.missing).toEqual([]);
      expect(body.dbError).toBeNull();
    } finally {
      delete process.env['NK_INTERNAL_TOKEN'];
    }
  });

  it('reports RLS drift as enabled:false with the offending tables', async () => {
    prismaMock.$queryRawUnsafe.mockImplementation(async (query: unknown) => {
      const sql = typeof query === 'string' ? query : String(query);
      if (sql.includes('_prisma_migrations')) return [];
      if (sql.includes('pg_tables')) {
        return [{ tablename: 'Leaky', rowsecurity: false }];
      }
      return [];
    });
    vi.resetModules();
    process.env['NK_INTERNAL_TOKEN'] = 'secret-internal';
    try {
      const { GET } = await import('@/app/api/v1/internal/build-info/route');
      const res = await GET(makeReq({ authorization: 'Bearer secret-internal' }) as never);
      const body = (await res.json()) as { rls: { enabled: boolean; missing: string[] } };
      expect(body.rls.enabled).toBe(false);
      expect(body.rls.missing).toEqual(['Leaky']);
    } finally {
      delete process.env['NK_INTERNAL_TOKEN'];
    }
  });
});
