/**
 * Roadmap hardening (production roadmap §1-§6) — regression coverage:
 *
 *  §1  CSP nonce enforcement in production middleware (no 'unsafe-inline'),
 *      escape hatch restores it; theme init is a static file (no inline).
 *  §1  One-time migration revokes every live AdminSession.
 *  §2  Resend sends an Idempotency-Key when the outbox supplies one;
 *      exhausted outbox rows raise an email_outbox_dead_letter audit row.
 *  §4  Payment-channel union gate: Opn-only / manual-only / wallet-only
 *      succeed; a channel-less environment fails closed.
 *  §5  /api/v1/version answers the running build id publicly (no auth, no
 *      secrets), read from .next/BUILD_ID so it cannot report a stale sha.
 *  §6  ops-health requires auth and reports the monitored signals;
 *      the admin reconciliation queue resolves entries from live order state.
 */
import { join } from 'path';

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

// ─── prisma mock (shared) ────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  emailOutbox: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    count: vi.fn(async () => 0),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  order: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  auditLog: {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'al-1',
      ...args.data,
    })),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  $queryRawUnsafe: vi.fn(async (_sql?: unknown): Promise<unknown[]> => []),
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () => ({ allowed: true, payload: { sub: 'admin-1' } })),
}));

// ─── §4 payment channels ─────────────────────────────────
describe('§4 payment-channel union gate', () => {
  it('opn-only environment works (no manual settings needed)', async () => {
    const { resolvePaymentChannels, hasUsableChannel } = await import('@/lib/paymentChannels');
    const c = await resolvePaymentChannels({ manualUsable: false, opnReady: true });
    expect(c.opn).toBe(true);
    expect(hasUsableChannel(c)).toBe(true);
  });

  it('manual-only environment works', async () => {
    const { resolvePaymentChannels, hasUsableChannel } = await import('@/lib/paymentChannels');
    const c = await resolvePaymentChannels({ manualUsable: true, opnReady: false });
    expect(hasUsableChannel(c)).toBe(true);
  });

  it('wallet-only works for an authenticated customer, not for guests', async () => {
    vi.resetModules();
    vi.doMock('@/api/customerAuth', () => ({
      getCustomerFromToken: vi.fn(async (token: string) =>
        token === 'good-session' ? { id: 'cust-1' } : Promise.reject(new Error('bad')),
      ),
    }));
    const { resolvePaymentChannels, hasUsableChannel } = await import('@/lib/paymentChannels');
    const authed = await resolvePaymentChannels({
      manualUsable: false,
      opnReady: false,
      customerSessionCookie: 'good-session',
    });
    expect(authed.wallet).toBe(true);
    expect(hasUsableChannel(authed)).toBe(true);

    const guest = await resolvePaymentChannels({
      manualUsable: false,
      opnReady: false,
      customerSessionCookie: null,
    });
    expect(hasUsableChannel(guest)).toBe(false);

    const stale = await resolvePaymentChannels({
      manualUsable: false,
      opnReady: false,
      customerSessionCookie: 'expired',
    });
    expect(hasUsableChannel(stale)).toBe(false);
    vi.doUnmock('@/api/customerAuth');
  });

  it('channel-less environment fails closed', async () => {
    const { resolvePaymentChannels, hasUsableChannel } = await import('@/lib/paymentChannels');
    expect(
      hasUsableChannel(await resolvePaymentChannels({ manualUsable: false, opnReady: false })),
    ).toBe(false);
  });
});

// ─── §5 /api/v1/version ──────────────────────────────────
describe('§5 public version endpoint', () => {
  /**
   * Import the route with fs/promises stubbed. The route reads exactly one
   * path (.next/BUILD_ID); any other read is a bug worth failing on, so the
   * stub asserts the caller is asking for that file.
   */
  async function loadRoute(contents: string | Error): Promise<() => Promise<Response>> {
    vi.resetModules();
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn(async (p: string) => {
        expect(String(p)).toContain(join('next', 'BUILD_ID'));
        if (contents instanceof Error) throw contents;
        return contents;
      }),
    }));
    const { GET } = await import('@/app/api/v1/version/route');
    return GET as () => Promise<Response>;
  }

  afterEach(() => {
    vi.doUnmock('fs/promises');
    delete process.env['GIT_SHA'];
    delete process.env['VERCEL_GIT_COMMIT_SHA'];
    delete process.env['VERCEL_GIT_COMMIT_REF'];
  });

  it('reports the build id from .next/BUILD_ID and leaks nothing else', async () => {
    process.env['GIT_SHA'] = 'abc1234';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'master';
    const GET = await loadRoute('gUxcV6SEGUgIp6nFJf8hR\n');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    // The build id is the authoritative release identity and comes off disk.
    expect(body['buildId']).toBe('gUxcV6SEGUgIp6nFJf8hR');
    expect(body['gitSha']).toBe('abc1234');
    expect(body['gitRef']).toBe('master');
    expect(Object.keys(body).sort()).toEqual(['buildId', 'gitRef', 'gitSha']);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('never lets a stale injected sha shadow the build actually running', async () => {
    // This is the bug that made the endpoint lie: GIT_SHA lives in Infisical
    // and no deploy step updates it, so it kept naming an old commit.
    process.env['GIT_SHA'] = '2ee2ae7';
    const GET = await loadRoute('gUxcV6SEGUgIp6nFJf8hR');
    const body = (await (await GET()).json()) as Record<string, string>;

    expect(body['buildId']).toBe('gUxcV6SEGUgIp6nFJf8hR');
    // The stale value is still reported on its legacy field...
    expect(body['gitSha']).toBe('2ee2ae7');
    // ...but a caller can always tell what is really serving requests.
    expect(body['buildId']).not.toBe(body['gitSha']);
  });

  it('degrades to "unknown" instead of failing when no env identity is set', async () => {
    const GET = await loadRoute('gUxcV6SEGUgIp6nFJf8hR');
    const body = (await (await GET()).json()) as Record<string, string>;
    expect(body['gitSha']).toBe('unknown');
    expect(body['gitRef']).toBe('unknown');
    expect(body['buildId']).toBe('gUxcV6SEGUgIp6nFJf8hR');
  });

  it('returns null buildId rather than a junk one when the file is unreadable', async () => {
    const GET = await loadRoute(new Error('ENOENT'));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body['buildId']).toBeNull();
  });

  it('rejects a BUILD_ID file that does not look like a build id', async () => {
    // A truncated extraction can leave an HTML error page where BUILD_ID
    // should be; reporting that as the release id would be worse than null.
    const GET = await loadRoute('<html>502 Bad Gateway</html>');
    const body = (await (await GET()).json()) as Record<string, string | null>;
    expect(body['buildId']).toBeNull();
  });
});

// ─── §1 CSP nonce + revoke migration ─────────────────────
describe('§1 CSP enforcement', () => {
  it('production middleware enforces a nonce policy without unsafe-inline', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env['NK_CSP_UNSAFE_INLINE'];
    delete process.env['NK_CSP_REPORT_ONLY'];
    try {
      const { middleware } = await import('@/middleware');
      const { NextRequest } = await import('next/server');
      const req = new NextRequest('https://x.test/', { method: 'GET' });
      const res = await middleware(req);
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      const scriptDirective = /script-src[^;]*/.exec(csp)?.[0] ?? '';
      expect(scriptDirective).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+'( |$)/);
      expect(scriptDirective).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain('Report-Only');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('escape hatch restores unsafe-inline without a code deploy', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    process.env['NK_CSP_UNSAFE_INLINE'] = 'true';
    try {
      const { middleware } = await import('@/middleware');
      const { NextRequest } = await import('next/server');
      const res = await middleware(new NextRequest('https://x.test/', { method: 'GET' }));
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("'unsafe-inline'");
      expect(csp).not.toContain("'nonce-");
    } finally {
      vi.unstubAllEnvs();
      delete process.env['NK_CSP_UNSAFE_INLINE'];
    }
  });

  it('theme pre-paint init is a static file — the layout has no inline script', async () => {
    const { readFileSync } = await import('fs');
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toContain('src="/theme-init.js"');
    expect(layout).not.toContain('dangerouslySetInnerHTML={{ __html: themeInitScript }}');
    const staticScript = readFileSync('public/theme-init.js', 'utf8');
    expect(staticScript).toContain('nk-theme');
  });

  it('one-time migration revokes every live admin session', async () => {
    const { readFileSync } = await import('fs');
    const sql = readFileSync(
      'prisma/migrations/20260927300000_revoke_stale_admin_sessions/migration.sql',
      'utf8',
    );
    expect(sql).toMatch(/UPDATE\s+"AdminSession"/i);
    expect(sql).toMatch(/SET\s+"revokedAt"\s*=\s*NOW\(\)/i);
    expect(sql).toMatch(/WHERE\s+"revokedAt"\s+IS\s+NULL/i);
  });
});

// ─── §2 email idempotency + dead-letter alerts ───────────
describe('§2 email provider idempotency + dead letters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendEmail forwards the idempotency key as a provider header', async () => {
    vi.resetModules();
    process.env['NK_RESEND_API_KEY'] = 're_test_key';
    process.env['NK_RESEND_FROM_EMAIL'] = 'orders@test.dev';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'em-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { sendEmail } = await import('@/lib/email/resend');
      const result = await sendEmail({
        to: 'c@test.dev',
        subject: 's',
        html: '<p>x</p>',
        idempotencyKey: 'code_delivery:ord-1',
      });
      expect(result.success).toBe(true);
      const call = fetchMock.mock.calls[0] as unknown as [
        string,
        { headers: Record<string, string> },
      ];
      expect(call[1].headers['Idempotency-Key']).toBe('code_delivery:ord-1');
    } finally {
      vi.unstubAllGlobals();
      delete process.env['NK_RESEND_API_KEY'];
      delete process.env['NK_RESEND_FROM_EMAIL'];
    }
  });

  it('an exhausted outbox row raises a dead-letter audit row (alert)', async () => {
    const { recordOutboxDeadLetter } = await import('@/lib/email/outbox');
    recordOutboxDeadLetter('ob-1', 'code_delivery:ord-9', 'c@test.dev', 8, 'SMTP down');
    // Fire-and-forget: give the microtask queue a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'email_outbox_dead_letter',
        recordId: 'ob-1',
        metadata: expect.objectContaining({ attempts: 8, toEmail: 'c@test.dev' }),
      }),
    });
  });
});

// ─── §6 ops-health + reconciliation queue ────────────────
describe('§6 operational endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ops-health requires auth', async () => {
    const { GET } = await import('@/app/api/v1/internal/ops-health/route');
    const res = await GET(new Request('https://x.test/api'));
    expect(res.status).toBe(401);
  });

  it('ops-health reports the monitored signals with the internal token', async () => {
    vi.resetModules();
    process.env['NK_INTERNAL_TOKEN'] = 'ops-token';
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: unknown) => {
      const query = typeof sql === 'string' ? sql : String(sql);
      if (query.includes('LIMIT 1'))
        return [{ migration_name: '20260927300000_revoke_stale_admin_sessions' }];
      return [{ count: 9n }];
    });
    prismaMock.order.count.mockResolvedValue(2);
    prismaMock.emailOutbox.count.mockResolvedValue(1);
    try {
      const { GET } = await import('@/app/api/v1/internal/ops-health/route');
      const res = await GET(
        new Request('https://x.test/api', { headers: { authorization: 'Bearer ops-token' } }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['paidUnfulfilledOrders']).toBe(2);
      expect(body['deadLetterEmails']).toBe(1);
      expect((body['migration'] as Record<string, unknown>)['latestFinished']).toBe(
        '20260927300000_revoke_stale_admin_sessions',
      );
      expect((body['limiter'] as Record<string, unknown>)['mode']).toBe('memory');
    } finally {
      delete process.env['NK_INTERNAL_TOKEN'];
    }
  });

  it('reconciliation queue resolves entries whose order has settled', async () => {
    const { GET } = await import('@/app/api/v1/admin/reconciliation/route');
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        recordId: 'ord-settled',
        createdAt: new Date(),
        metadata: {
          trigger: 'webhook_recovery_failed',
          paymentRef: 'chrg_1',
          recoveryError: 'boom',
        },
      },
      {
        id: 'rec-2',
        recordId: 'ord-stuck',
        createdAt: new Date(),
        metadata: {
          trigger: 'slip_verify_recovery_failed',
          paymentRef: null,
          recoveryError: 'boom',
        },
      },
    ] as unknown as Awaited<ReturnType<typeof prismaMock.auditLog.findMany>>);
    prismaMock.auditLog.count.mockResolvedValue(2);
    prismaMock.order.findMany
      .mockResolvedValueOnce([
        { id: 'ord-stuck', orderNumber: 'NK-1', customerEmail: 'c@t.dev' },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.order.findMany>>) // call #1: webhook-gap query (Promise.all)
      .mockResolvedValueOnce([{ id: 'ord-settled', status: 'completed' }] as unknown as Awaited<
        ReturnType<typeof prismaMock.order.findMany>
      >); // call #2: status lookup
    prismaMock.emailOutbox.findMany.mockResolvedValue([]);

    const req = new Request('https://x.test/api', {
      headers: { authorization: 'Bearer adminjwt' },
    }) as never;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      payments: { id: string; resolved: boolean }[];
      counts: Record<string, number>;
    };
    const settled = body.payments.find((p) => p.id === 'rec-1');
    const stuck = body.payments.find((p) => p.id === 'rec-2');
    expect(settled?.resolved).toBe(true);
    expect(stuck?.resolved).toBe(false);
    expect(body['counts']['paymentsOpen']).toBe(1);
  });
});
