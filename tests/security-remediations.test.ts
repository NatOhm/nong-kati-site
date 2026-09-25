/**
 * Unit tests for the security-review remediations (review of 25 Sep 2026):
 *  - JWT + slip-token secrets fail closed in production (no public fallback)
 *  - Minimum entropy floor for configured secrets
 *  - Magic-link tokens report deliverability (mail only for real accounts)
 * Pure logic — no network. Run: npm test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    magicLinkToken: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    customer: {
      findUnique: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('NK_JWT_SECRET', '');
  vi.stubEnv('NK_SLIP_TOKEN_SECRET', '');
  vi.stubEnv('NODE_ENV', 'test');
});

// ─── JWT secret fail-closed (review High #1) ──────────────

describe('jwt secret handling', () => {
  it('uses the dev fallback outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { signJwt, verifyJwt } = await import('@/lib/jwt');
    const token = await signJwt({ sub: 'x', typ: 'customer' });
    await expect(verifyJwt(token)).resolves.toMatchObject({ sub: 'x' });
  });

  it('refuses to sign in production without a configured secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { signJwt } = await import('@/lib/jwt');
    await expect(signJwt({ sub: 'x', typ: 'customer' })).rejects.toThrow(/NK_JWT_SECRET/);
  });

  it('rejects tokens signed with the publicly known dev fallback once in production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { signJwt, verifyJwt } = await import('@/lib/jwt');
    const forged = await signJwt({ sub: 'attacker', typ: 'customer' });

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NK_JWT_SECRET', 'x'.repeat(48));
    // A known-fallback signature must not verify under the real secret.
    await expect(verifyJwt(forged)).resolves.toBeNull();
  });

  it('enforces the entropy floor on configured secrets', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { signJwt } = await import('@/lib/jwt');
    vi.stubEnv('NK_JWT_SECRET', 'short');
    await expect(signJwt({ sub: 'x' })).rejects.toThrow(/TOO_WEAK|32 characters/);
    vi.stubEnv('NK_JWT_SECRET', 'x'.repeat(48));
    await expect(signJwt({ sub: 'x', typ: 'customer' })).resolves.toBeTruthy();
  });
});

// ─── Slip capability secret fail-closed (review High #1) ──

describe('slip token secret handling', () => {
  it('mints and verifies capability tokens in dev (fallback secret)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { mintSlipUploadToken, isValidSlipUploadToken } = await import('@/lib/slipSecurity');
    const token = mintSlipUploadToken('order_1', 'uuid_1');
    expect(isValidSlipUploadToken('order_1', token)).toBe(true);
    expect(isValidSlipUploadToken('order_2', token)).toBe(false);
  });

  it('refuses to mint capability tokens in production without a secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { mintSlipUploadToken } = await import('@/lib/slipSecurity');
    expect(() => mintSlipUploadToken('order_1', 'uuid_1')).toThrow(/NK_SLIP_TOKEN_SECRET/);
  });

  it('enforces the entropy floor on the slip secret too', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { mintSlipUploadToken } = await import('@/lib/slipSecurity');
    vi.stubEnv('NK_SLIP_TOKEN_SECRET', 'short');
    expect(() => mintSlipUploadToken('order_1', 'uuid_1')).toThrow(/TOO_WEAK|32 characters/);
  });
});

// ─── Magic link deliverability (review Medium: mail relay) ─

describe('magic link deliverability report', () => {
  it('reports accountExists=false for unknown addresses (no mail)', async () => {
    vi.mocked((await import('@/lib/db')).prisma.customer.findUnique).mockResolvedValue(null);
    const { createMagicLinkToken } = await import('@/api/magicLink');
    const result = await createMagicLinkToken({ email: 'stranger@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.accountExists).toBe(false);
  });

  it('reports accountExists=true for real active accounts', async () => {
    vi.mocked((await import('@/lib/db')).prisma.customer.findUnique).mockResolvedValue({
      status: 'active',
    } as never);
    const { createMagicLinkToken } = await import('@/api/magicLink');
    const result = await createMagicLinkToken({ email: 'real@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.accountExists).toBe(true);
  });

  it('reports accountExists=false for blocked accounts', async () => {
    vi.mocked((await import('@/lib/db')).prisma.customer.findUnique).mockResolvedValue({
      status: 'blocked',
    } as never);
    const { createMagicLinkToken } = await import('@/api/magicLink');
    const result = await createMagicLinkToken({ email: 'blocked@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.accountExists).toBe(false);
  });
});
