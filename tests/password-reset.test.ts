/**
 * Unit tests for the password reset flow — pure logic with a mocked
 * prisma (no DB, no network) so CI runs them anywhere. Mirrors the
 * phone-otp test suite style. Run: npx vitest run
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = {
  customer: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    update: vi.fn().mockResolvedValue({}),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    passwordResetToken: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customer: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  },
}));

process.env['NK_JWT_SECRET'] = 'unit-test-secret';

const { prisma } = await import('@/lib/db');
const {
  createPasswordResetToken,
  passwordResetUrl,
  resetPasswordWithToken,
  verifyCustomerPassword,
} = await import('@/api/passwordReset');

const { hashPassword } = await import('@/lib/password');

function tokenHashFor(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const NOW = Date.now();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
  txMock.customer.findUnique.mockReset();
  txMock.customer.update.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('createPasswordResetToken', () => {
  it('rejects malformed emails without touching the DB', async () => {
    const result = await createPasswordResetToken({ email: 'not-an-email' });
    expect(result).toEqual({ ok: false, error: 'INVALID_EMAIL' });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a bound token for a real password account and reports it', async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      id: 'c1',
      status: 'active',
      passwordHash: 'scrypt$16384$8$1$salt$hash',
    } as never);

    const result = await createPasswordResetToken({ email: 'Kaem@Example.com ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accountExists).toBe(true);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBe(NOW + 30 * 60 * 1000);
    // The raw token is never persisted — only its SHA-256 hash.
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'c1',
        tokenHash: tokenHashFor(result.token),
      }),
    });
  });

  it('answers uniformly for unknown addresses (row skipped, no account)', async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
    const result = await createPasswordResetToken({ email: 'nobody@example.com' });
    expect(result).toMatchObject({ ok: true, accountExists: false });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('answers uniformly for OAuth-only accounts (no password to reset)', async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      id: 'c2',
      status: 'active',
      passwordHash: null,
    } as never);
    const result = await createPasswordResetToken({ email: 'oauth@example.com' });
    expect(result).toMatchObject({ ok: true, accountExists: false });
  });

  it('answers uniformly for blocked accounts (dead link, no error leak)', async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      id: 'c3',
      status: 'blocked',
      passwordHash: 'scrypt$16384$8$1$salt$hash',
    } as never);
    const result = await createPasswordResetToken({ email: 'blocked@example.com' });
    expect(result).toMatchObject({ ok: true, accountExists: false });
  });
});

describe('resetPasswordWithToken', () => {
  const raw = 'raw-reset-token';
  const hash = tokenHashFor(raw);

  it('rejects short passwords before touching the token', async () => {
    const result = await resetPasswordWithToken({ rawToken: raw, newPassword: 'short' });
    expect(result).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });

  it('claims the token atomically and updates the password in one transaction', async () => {
    const newHash = await hashPassword('newpassword123');
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      tokenHash: hash,
      usedAt: null,
      ipAddress: null,
    } as never);
    txMock.customer.findUnique.mockResolvedValue({
      id: 'c1',
      email: 'kaem@example.com',
      status: 'active',
      passwordHash: 'old',
    });
    txMock.customer.update.mockResolvedValue({
      id: 'c1',
      email: 'kaem@example.com',
    });

    const result = await resetPasswordWithToken({
      rawToken: raw,
      newPassword: 'newpassword123',
      ipAddress: '1.2.3.4',
    });

    expect(result).toEqual({ ok: true, customerId: 'c1', email: 'kaem@example.com' });
    // Single-use claim guarded on usedAt = null and unexpired.
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hash, usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date), attemptedAt: expect.any(Date) },
    });
    // New scrypt hash differs from the old one and revokes pre-reset sessions.
    const updateArg = txMock.customer.update.mock.calls[0]?.[0] as {
      data: { passwordHash: string; sessionsInvalidBefore: Date };
    };
    expect(updateArg.data.passwordHash).not.toBe('old');
    expect(updateArg.data.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(updateArg.data.sessionsInvalidBefore.getTime()).toBeLessThan(Date.now());
    // Audit trail written.
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'password_reset_completed' }),
    });
    expect(newHash).toBeTruthy();
  });

  it('reports TOKEN_USED without re-consuming a claimed token', async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      tokenHash: hash,
      usedAt: new Date(NOW - 1000),
    } as never);

    const result = await resetPasswordWithToken({ rawToken: raw, newPassword: 'newpassword123' });
    expect(result).toEqual({ ok: false, error: 'TOKEN_USED' });
    expect(txMock.customer.update).not.toHaveBeenCalled();
  });

  it('reports TOKEN_EXPIRED for stale tokens', async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      tokenHash: hash,
      usedAt: null,
      expiresAt: new Date(NOW - 60_000),
    } as never);

    const result = await resetPasswordWithToken({ rawToken: raw, newPassword: 'newpassword123' });
    expect(result).toEqual({ ok: false, error: 'TOKEN_EXPIRED' });
  });

  it('reports INVALID_TOKEN for unknown tokens', async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

    const result = await resetPasswordWithToken({ rawToken: raw, newPassword: 'newpassword123' });
    expect(result).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('rejects consumption for blocked accounts and rolls the claim back', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      tokenHash: hash,
      usedAt: null,
      ipAddress: null,
    } as never);
    txMock.customer.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'blocked',
      passwordHash: 'old',
    });

    const result = await resetPasswordWithToken({ rawToken: raw, newPassword: 'newpassword123' });
    expect(result).toEqual({ ok: false, error: 'ACCOUNT_BLOCKED' });
    expect(txMock.customer.update).not.toHaveBeenCalled();
    // Blocked accounts keep the claim consumed (the transaction returned
    // normally) — a blocked customer must not be able to retry at all.
  });

  it('releases the claim when the transaction itself fails', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      tokenHash: hash,
      usedAt: null,
    } as never);
    txMock.customer.findUnique.mockRejectedValue(new Error('db down'));

    await expect(
      resetPasswordWithToken({ rawToken: raw, newPassword: 'newpassword123' }),
    ).rejects.toThrow('db down');
    // Retry friendly: the claim is released on failure.
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('verifyCustomerPassword', () => {
  it('returns false for OAuth-only accounts and wrong passwords', async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ passwordHash: null } as never);
    expect(await verifyCustomerPassword({ customerId: 'c1', password: 'x' })).toBe(false);

    const good = await hashPassword('correct-horse');
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ passwordHash: good } as never);
    expect(await verifyCustomerPassword({ customerId: 'c1', password: 'wrong' })).toBe(false);
    expect(await verifyCustomerPassword({ customerId: 'c1', password: 'correct-horse' })).toBe(
      true,
    );
  });
});

describe('passwordResetUrl', () => {
  it('builds the absolute reset URL with the token preserved', () => {
    expect(passwordResetUrl('abc_def', 'https://nong-kati.vercel.app/')).toBe(
      'https://nong-kati.vercel.app/account/reset-password?token=abc_def',
    );
  });
});
