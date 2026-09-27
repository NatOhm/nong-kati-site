/**
 * Honest auth-email routes + outbox drain endpoint (external audit #2).
 *
 * magic-link / forgot-password used to answer 200 "เราได้ส่งลิงก์แล้ว"
 * even when delivery failed outright (no provider key in prod) — a fake
 * success that left customers staring at an empty inbox. The routes now
 * return 503 EMAIL_DELIVERY_UNAVAILABLE on delivery failure while KEEPING
 * the uniform 200 for unknown addresses (no enumeration).
 *
 * The internal drain endpoint must be gated: 503 OUTBOX_DISABLED without
 * NK_CRON_SECRET (fail-closed), 401 on a bad token, 200 with the cron
 * secret or a valid admin JWT.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'authhonesty-test-secret-0123456789abcdef0123456789abcdef';

// Deterministic client IP — real rate limiter runs from its memory store.
vi.mock('@/lib/rateLimit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rateLimit')>();
  return { ...actual, getClientIp: () => '203.0.113.9' };
});

// Token helpers (only their shape matters here).
const { magicMock, resetMock } = vi.hoisted(() => {
  const magicMock = {
    createMagicLinkToken: vi.fn(),
    magicLinkUrl: (token: string, base: string) => `${base}/auth/magic?token=${token}`,
  };
  const resetMock = {
    createPasswordResetToken: vi.fn(),
    passwordResetUrl: (token: string, base: string) =>
      `${base}/account/reset-password?token=${token}`,
  };
  return { magicMock, resetMock };
});
vi.mock('@/api/magicLink', () => magicMock);
vi.mock('@/api/passwordReset', () => resetMock);

// Email helpers: default succeeds; individual tests force failures.
const { magicEmail, resetEmail } = vi.hoisted(() => {
  const magicEmail = { sendMagicLinkEmail: vi.fn() };
  const resetEmail = { sendPasswordResetEmail: vi.fn() };
  return { magicEmail, resetEmail };
});
vi.mock('@/lib/email/magicLinkEmail', () => magicEmail);
vi.mock('@/lib/email/passwordResetEmail', () => resetEmail);

// Drain endpoint touches prisma for its counters; verifyAdminJwt (admin-JWT
// drain path) hits adminUser — answer with an active super_admin row.
vi.mock('@/lib/db', () => ({
  prisma: {
    emailOutbox: { count: vi.fn(async () => 0) },
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
  },
}));

// Controllable worker for the drain endpoint.
const { outboxMock } = vi.hoisted(() => ({
  outboxMock: { processDueEmails: vi.fn() },
}));
vi.mock('@/lib/email/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/outbox')>();
  return { ...actual, processDueEmails: outboxMock.processDueEmails };
});

beforeEach(() => {
  vi.clearAllMocks();
  magicEmail.sendMagicLinkEmail.mockResolvedValue({ ok: true });
  resetEmail.sendPasswordResetEmail.mockResolvedValue({ ok: true });
  outboxMock.processDueEmails.mockResolvedValue({ processed: 0, sent: 0, failed: 0 });
  delete process.env['NK_CRON_SECRET'];
});

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const TOKEN_RESULT = {
  ok: true,
  token: 'raw-token',
  expiresAt: new Date(Date.now() + 900_000),
  accountExists: true,
};

describe('POST /api/v1/auth/magic-link — delivery honesty (audit #2)', () => {
  const routePath = '../src/app/api/v1/auth/magic-link/route.ts';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(routePath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest) => Promise<Response>)(req);
  };

  it('delivery failure → 503 EMAIL_DELIVERY_UNAVAILABLE, never a fake success', async () => {
    magicMock.createMagicLinkToken.mockResolvedValue({ ...TOKEN_RESULT });
    magicEmail.sendMagicLinkEmail.mockResolvedValue({
      ok: false,
      error: 'EMAIL_NOT_CONFIGURED: NK_RESEND_API_KEY is not set',
    });

    const res = await call(
      post('http://localhost/api/v1/auth/magic-link', { email: 'known@example.com' }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; success?: boolean };
    expect(body.error).toBe('EMAIL_DELIVERY_UNAVAILABLE');
    expect(body.success).toBeUndefined();
    expect(magicEmail.sendMagicLinkEmail).toHaveBeenCalledTimes(1);
  });

  it('unknown address keeps the uniform 200 (no enumeration) and sends no mail', async () => {
    magicMock.createMagicLinkToken.mockResolvedValue({ ...TOKEN_RESULT, accountExists: false });

    const res = await call(
      post('http://localhost/api/v1/auth/magic-link', { email: 'nobody@example.com' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(magicEmail.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it('successful delivery still answers the friendly 200', async () => {
    magicMock.createMagicLinkToken.mockResolvedValue({ ...TOKEN_RESULT });

    const res = await call(
      post('http://localhost/api/v1/auth/magic-link', { email: 'known@example.com' }),
    );
    expect(res.status).toBe(200);
    expect(magicEmail.sendMagicLinkEmail).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/v1/auth/forgot-password — delivery honesty (audit #2)', () => {
  const routePath = '../src/app/api/v1/auth/forgot-password/route.ts';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(routePath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest) => Promise<Response>)(req);
  };

  it('delivery failure → 503 EMAIL_DELIVERY_UNAVAILABLE, never a fake success', async () => {
    resetMock.createPasswordResetToken.mockResolvedValue({ ...TOKEN_RESULT });
    resetEmail.sendPasswordResetEmail.mockResolvedValue({
      ok: false,
      error: 'EMAIL_TIMEOUT: Resend API did not respond in time',
    });

    const res = await call(
      post('http://localhost/api/v1/auth/forgot-password', { email: 'known@example.com' }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('EMAIL_DELIVERY_UNAVAILABLE');
  });

  it('unknown / OAuth-only address keeps the uniform 200', async () => {
    resetMock.createPasswordResetToken.mockResolvedValue({ ...TOKEN_RESULT, accountExists: false });

    const res = await call(
      post('http://localhost/api/v1/auth/forgot-password', { email: 'nobody@example.com' }),
    );
    expect(res.status).toBe(200);
    expect(resetEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/internal/email-outbox/drain — gating', () => {
  const drainPath = '../src/app/api/v1/internal/email-outbox/drain/route.ts';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(drainPath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest) => Promise<Response>)(req);
  };

  it('503 OUTBOX_DISABLED when NK_CRON_SECRET is unset (fail-closed)', async () => {
    const res = await call(
      new NextRequest('http://localhost/api/v1/internal/email-outbox/drain', { method: 'POST' }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('OUTBOX_DISABLED');
    expect(outboxMock.processDueEmails).not.toHaveBeenCalled();
  });

  it('401 with a wrong token — the worker never runs', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const res = await call(
      new NextRequest('http://localhost/api/v1/internal/email-outbox/drain', {
        method: 'POST',
        headers: { 'x-outbox-token': 'nope' },
      }),
    );
    expect(res.status).toBe(401);
    expect(outboxMock.processDueEmails).not.toHaveBeenCalled();
  });

  it('200 with the correct cron secret and counters in the body', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const res = await call(
      new NextRequest('http://localhost/api/v1/internal/email-outbox/drain', {
        method: 'POST',
        headers: { 'x-outbox-token': 'cron-secret-value' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number; pendingRemaining: number };
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(outboxMock.processDueEmails).toHaveBeenCalledWith(20);
  });

  it('accepts a valid admin JWT as Bearer (panel-triggered drain)', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const { issueAdminJwt } = await import('@/lib/jwt');
    const token = await issueAdminJwt('admin-super', 'super@test.local', 'super_admin', [
      'orders:write',
    ]);

    const res = await call(
      new NextRequest('http://localhost/api/v1/internal/email-outbox/drain', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(outboxMock.processDueEmails).toHaveBeenCalled();
  });
});
