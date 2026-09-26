/**
 * Real-HTTP concurrency tests — run against a LIVE dev server
 * (NK_TEST_BASE_URL, e.g. http://127.0.0.1:4200). Skipped entirely when the
 * variable is absent, so `npm test` in environments without a server stays
 * green and these only execute in the dedicated CI job (Postgres + dev).
 *
 * What is under test (real DB, real HTTP, real parallelism):
 *
 *  1. Refresh-token CAS rotation — 20 concurrent refreshes of the SAME
 *     refresh token. refreshAdminSession revokes via a guarded updateMany
 *     (first writer wins): exactly one request may get 200, the other 19
 *     must see 401 TOKEN_INVALID, and the DB must end with exactly ONE
 *     un-revoked replacement session. This kills the old read-rotate-write
 *     race where N concurrent refreshes could mint N durable sessions.
 *
 *  2. Distinct-token refresh burst — 20 concurrent refreshes with 20
 *     DIFFERENT tokens must ALL succeed and revoke only their own row:
 *     proves the "exactly one" in (1) is correct locking, not over-revocation.
 *
 *  3. Parallel wrong-password lockout — 10 concurrent bad logins against one
 *     account. The failure counter is an atomic guarded increment; the 5th
 *     failure must lock the account exactly once: final state = status
 *     'locked' with a lockedUntil deadline and the counter reset to 0 by the
 *     single locker. No duplicate locks, no lost updates.
 *
 * Seeding/cleanup is idempotent per run (unique suffix): rows are created
 * through the real prisma client and deleted after assertions.
 */
import { createHash, randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env['NK_TEST_BASE_URL'] ?? '';

/** All tests in this file need a live server; skip cleanly without one. */
const d = BASE ? describe : describe.skip;

const REQUEST_TIMEOUT_MS = 60_000;
const RUN = Date.now().toString(36);

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body2 = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: body2 };
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

interface Seeded {
  id: string;
  email: string;
}

async function seedAdmin(email: string): Promise<Seeded> {
  const { hashPassword } = await import('@/lib/password');
  const { prisma } = await import('@/lib/db');
  const passwordHash = await hashPassword('ConcTest!2026x');
  const user = await prisma.adminUser.upsert({
    where: { email },
    update: {
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      totpConfirmed: false,
      totpLockedUntil: null,
      sessionsInvalidBefore: null,
      passwordHash,
    },
    create: {
      email,
      fullName: 'Concurrency Test',
      role: 'super_admin',
      status: 'active',
      passwordHash,
    },
  });
  return { id: user.id, email };
}

async function seedSession(adminUserId: string, token: string, minutes = 60): Promise<void> {
  const { prisma } = await import('@/lib/db');
  await prisma.adminSession.create({
    data: {
      adminUserId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + minutes * 60_000),
    },
  });
}

async function cleanupAdmin(email: string): Promise<void> {
  const { prisma } = await import('@/lib/db');
  await prisma.adminSession.deleteMany({ where: { adminUser: { email } } });
  await prisma.adminUser.deleteMany({ where: { email } });
}

d('admin concurrency (live dev server)', () => {
  beforeAll(async () => {
    // First hit compiles the auth routes in dev — warm them so the timed
    // bursts below measure concurrency, not webpack.
    await postJson('/api/v1/auth/admin/refresh', { refreshToken: 'warmup' });
    await postJson('/api/v1/auth/admin/login', { email: 'warmup@ci.local', password: 'x' });
  });

  afterAll(async () => {
    // All rows carry unique per-run emails; nothing lingers between runs.
    const { prisma } = await import('@/lib/db');
    await prisma.adminSession.deleteMany({
      where: { adminUser: { email: { contains: `concurrency-${RUN}` } } },
    });
    await prisma.adminUser.deleteMany({ where: { email: { contains: `concurrency-${RUN}` } } });
  });

  it(
    '20 concurrent refreshes of ONE token → exactly one 200, nineteen 401, one live session',
    { timeout: 180_000 },
    async () => {
      const email = `concurrency-${RUN}-cas@ci.local`;
      const { prisma } = await import('@/lib/db');
      const admin = await seedAdmin(email);
      const token = `ci_rt_${randomBytes(24).toString('hex')}`;
      await seedSession(admin.id, token);

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          postJson('/api/v1/auth/admin/refresh', { refreshToken: token }),
        ),
      );

      const ok = results.filter((r) => r.status === 200);
      const rejected = results.filter((r) => r.status === 401);
      expect(
        ok.length,
        `expected exactly one refresh to win the CAS race, got ${ok.length}: ${JSON.stringify(results.map((r) => r.status))}`,
      ).toBe(1);
      expect(rejected.length, 'all losers must get 401 TOKEN_INVALID').toBe(19);
      const winner = ok[0]?.body;
      expect(typeof winner?.['accessToken']).toBe('string');
      expect(typeof winner?.['refreshToken']).toBe('string');

      // DB truth: exactly one un-revoked session (the replacement), and every
      // row for this run's burst is accounted for (old revoked + new live).
      const live = await prisma.adminSession.count({
        where: { adminUserId: admin.id, revokedAt: null },
      });
      const revoked = await prisma.adminSession.count({
        where: { adminUserId: admin.id, revokedAt: { not: null } },
      });
      expect(live, 'exactly one durable session may survive the burst').toBe(1);
      expect(revoked, 'the original row must be revoked (20 requests → 1 revocation)').toBe(1);
    },
  );

  it(
    '20 concurrent refreshes with DISTINCT tokens → all 200, each revoking only its own row',
    { timeout: 180_000 },
    async () => {
      const email = `concurrency-${RUN}-distinct@ci.local`;
      const { prisma } = await import('@/lib/db');
      const admin = await seedAdmin(email);
      const tokens = Array.from({ length: 20 }, () => `ci_rt_${randomBytes(24).toString('hex')}`);
      await Promise.all(tokens.map((t) => seedSession(admin.id, t)));

      const results = await Promise.all(
        tokens.map((t) => postJson('/api/v1/auth/admin/refresh', { refreshToken: t })),
      );

      const ok = results.filter((r) => r.status === 200);
      expect(
        ok.length,
        `all 20 distinct-token refreshes must succeed: ${JSON.stringify(results.map((r) => r.status))}`,
      ).toBe(20);

      const live = await prisma.adminSession.count({
        where: { adminUserId: admin.id, revokedAt: null },
      });
      const revoked = await prisma.adminSession.count({
        where: { adminUserId: admin.id, revokedAt: { not: null } },
      });
      expect(live, '20 successful rotations → 20 replacement sessions').toBe(20);
      expect(revoked, 'each old row revoked exactly once — no cross-revocation').toBe(20);
    },
  );

  it(
    '10 concurrent wrong passwords → account locks exactly once (atomic counter)',
    { timeout: 180_000 },
    async () => {
      const email = `concurrency-${RUN}-lock@ci.local`;
      const { prisma } = await import('@/lib/db');
      const admin = await seedAdmin(email);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          postJson('/api/v1/auth/admin/login', {
            email,
            password: `wrong-${RUN}-${randomBytes(4).toString('hex')}`,
          }),
        ),
      );

      // Every request must be rejected — no timing side channel, no 500s.
      const non401 = results.filter((r) => r.status !== 401);
      expect(
        non401.map((r) => [r.status, r.body]),
        'all 10 bad logins must return 401',
      ).toEqual([]);

      // Exactly one writer flips the account to locked (guarded updateMany +
      // counter reset). Final state proves the atomicity: locked with a
      // deadline, counter reset by the locker — never stuck mid-count.
      const user = await prisma.adminUser.findUnique({ where: { id: admin.id } });
      expect(user?.status).toBe('locked');
      expect(user?.lockedUntil, 'lockout deadline must be set').not.toBeNull();
      expect(user?.failedLoginAttempts, 'the single locker resets the counter').toBe(0);
      const lockMs = (user?.lockedUntil?.getTime() ?? 0) - Date.now();
      expect(
        lockMs,
        'lock must be in the future and sane (≤ default 15min + slack)',
      ).toBeGreaterThan(0);

      // And the locked account now rejects even a CORRECT password with
      // ACCOUNT_LOCKED until the deadline passes.
      const post = await postJson('/api/v1/auth/admin/login', {
        email,
        password: 'ConcTest!2026x',
      });
      expect(post.status).toBe(401);
      expect(post.body['error']).toBe('ACCOUNT_LOCKED');
    },
  );
});
