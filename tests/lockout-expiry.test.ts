/**
 * Lockout expiry regression (audit finding #3, 2026-09-27).
 *
 * The bug: the failed-attempt counter was incremented behind a
 * `lockedUntil: null` predicate, but an expired lock keeps `lockedUntil`
 * non-null forever (only a SUCCESSFUL login cleared it). After an attacker
 * waited out one lock window, every further wrong password was free — the
 * counter never moved again until the real user logged in.
 *
 * The fix: the increment predicate treats an expired lock
 * (`lockedUntil <= now`) as eligible, i.e. the where clause is
 * `OR: [{ lockedUntil: null }, { lockedUntil: { lte: <now> } }]`.
 *
 * These tests call loginCustomer/loginAdmin in-process against a mocked
 * prisma whose updateMany RECORDS the where clause it received, so the
 * exact predicate is asserted — the pre-fix predicate fails these tests.
 * The live end-to-end version (real Postgres, expired lock, N wrong
 * passwords → locks again) lives in tests/admin-concurrency.test.ts and
 * runs in the dedicated CI job.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'lockout-test-secret-0123456789abcdef0123456789abcdef';

type CapturedWhere = Record<string, unknown>;

const { prismaMock, auditCreate } = vi.hoisted(() => {
  // Captures updateMany where clauses so tests can assert the predicate.
  const capturedCustomerWheres: CapturedWhere[] = [];
  const capturedAdminWheres: CapturedWhere[] = [];
  const auditCreate = vi.fn<(input: unknown) => Promise<unknown>>();
  auditCreate.mockResolvedValue({});

  const prismaMock = {
    customer: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        capturedCustomerWheres.push(where);
        return { count: 1 };
      }),
      update: vi.fn(),
      create: vi.fn(),
    },
    adminUser: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async ({ where }: { where: CapturedWhere }) => {
        capturedAdminWheres.push(where);
        return { count: 1 };
      }),
      update: vi.fn(),
    },
    adminSession: { create: vi.fn(), deleteMany: vi.fn() },
  };
  return { prismaMock, auditCreate, capturedCustomerWheres, capturedAdminWheres };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: (input: { tx?: { auditLog: { create: (args: unknown) => Promise<unknown> } } }) =>
    input.tx ? input.tx.auditLog.create({ data: input }) : auditCreate({ data: input }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auditCreate.mockResolvedValue({});
});

import { loginCustomer } from '@/api/customerAuth';
import { adminLogin } from '@/api/adminAuth';
import { hashPassword } from '@/lib/password';

/** The fixed predicate: null lock OR expired lock. */
function expectsEligibleExpiredLock(where: CapturedWhere): boolean {
  const or = where['OR'] as Array<Record<string, unknown>> | undefined;
  return (
    Array.isArray(or) &&
    or.some(
      (c) => 'lockedUntil' in c && (c['lockedUntil'] as { lte?: unknown })?.lte instanceof Date,
    )
  );
}

/** The buggy pre-fix predicate: only `lockedUntil: null` — expired locks excluded. */
function isNullOnlyPredicate(where: CapturedWhere): boolean {
  return 'lockedUntil' in where && (where['lockedUntil'] as unknown) === null && !('OR' in where);
}

const PASSWORD = 'LockoutTest!2026x';

describe('customer lockout after expiry (audit #3)', () => {
  it('wrong password on an EXPIRED lock still increments the failed-attempt counter', async () => {
    const passwordHash = await hashPassword(PASSWORD);
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-lock-1',
      email: 'expired.lock@test.local',
      passwordHash,
      status: 'active',
      // EXPIRED lock: in the past — login proceeds, wrong password must count.
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    });

    const result = await loginCustomer({
      email: 'expired.lock@test.local',
      password: 'definitely-wrong',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_CREDENTIALS');
    expect(prismaMock.customer.updateMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.customer.updateMany.mock.calls[0]?.[0]?.where as CapturedWhere;
    expect(
      isNullOnlyPredicate(where),
      'pre-fix predicate regressed: expired locks are excluded again',
    ).toBe(false);
    expect(expectsEligibleExpiredLock(where)).toBe(true);
  });

  it('ACTIVE lock (not expired) is still rejected before any counter write', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-lock-2',
      email: 'active.lock@test.local',
      passwordHash: 'scrypt$16384$8$1$00$00',
      status: 'active',
      failedLoginAttempts: 2,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    const result = await loginCustomer({
      email: 'active.lock@test.local',
      password: PASSWORD,
    });

    expect(result.error).toBe('ACCOUNT_LOCKED');
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });

  it('no lock at all keeps counting failures (regression of the original CAS fix)', async () => {
    const passwordHash = await hashPassword(PASSWORD);
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-lock-3',
      email: 'no.lock@test.local',
      passwordHash,
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await loginCustomer({ email: 'no.lock@test.local', password: 'wrong' });

    const where = prismaMock.customer.updateMany.mock.calls[0]?.[0]?.where as CapturedWhere;
    expect(expectsEligibleExpiredLock(where)).toBe(true);
  });
});

describe('admin lockout after expiry (audit #3)', () => {
  it('wrong password on an EXPIRED lock still increments the failed-attempt counter', async () => {
    const passwordHash = await hashPassword(PASSWORD);
    prismaMock.adminUser.findUnique.mockResolvedValue({
      id: 'admin-lock-1',
      email: 'expired.admin@test.local',
      fullName: 'Expired Admin',
      role: 'super_admin',
      passwordHash,
      status: 'locked', // expired lock typically leaves status 'locked'
      totpConfirmed: false,
      mustChangePassword: false,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
      lastLoginAt: null,
    });

    const result = await adminLogin('expired.admin@test.local', 'definitely-wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_CREDENTIALS');
    expect(prismaMock.adminUser.updateMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.adminUser.updateMany.mock.calls[0]?.[0]?.where as CapturedWhere;
    expect(
      isNullOnlyPredicate(where),
      'pre-fix predicate regressed: expired locks are excluded again',
    ).toBe(false);
    expect(expectsEligibleExpiredLock(where)).toBe(true);
  });

  it('ACTIVE lock is rejected with retryAfter and no counter write', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      id: 'admin-lock-2',
      email: 'active.admin@test.local',
      fullName: 'Active Lock',
      role: 'support_agent',
      passwordHash: 'scrypt$16384$8$1$00$00',
      status: 'locked',
      totpConfirmed: false,
      mustChangePassword: false,
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
      lastLoginAt: null,
    });

    const result = await adminLogin('active.admin@test.local', PASSWORD);

    expect(result.error).toBe('ACCOUNT_LOCKED');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(prismaMock.adminUser.updateMany).not.toHaveBeenCalled();
  });
});

// The route file imports stay referenced for type parity with sibling suites.
void NextRequest;
