/**
 * 2FA backup codes — external audit #9 (2026-09-27).
 *
 * The old flow GENERATED ten recovery codes and shipped them to the setup
 * UI without storing anything: they looked like a recovery path, verified
 * nothing, and confirm2fa accepted only the 6-digit TOTP. The fix makes
 * them real: hashed at rest (SHA-256 of the normalized code — plaintext
 * exists exactly once, in the setup response), accepted at confirm2fa in
 * place of the TOTP, and consumed exactly once via a guarded usedAt CAS.
 *
 * Wrong anything (bad TOTP, unknown/used code) feeds the same 5-strike
 * TOTP lockout — a spent code must not become a replay oracle.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_JWT_SECRET'] = 'backupcodes-test-secret-0123456789abcdef0123456789abcdef';

type CodeRow = { id: string; adminUserId: string; codeHash: string; usedAt: Date | null };

const { prismaMock, codeRows } = vi.hoisted(() => {
  const codeRows: CodeRow[] = [];
  const prismaMock = {
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    adminChallengeConsumed: { create: vi.fn(async () => ({})), deleteMany: vi.fn() },
    adminSession: { create: vi.fn(async () => ({})) },
    adminBackupCode: {
      deleteMany: vi.fn(async (_args?: { where?: { adminUserId?: string } }) => ({ count: 0 })),
      createMany: vi.fn(async (_args: { data: { adminUserId: string; codeHash: string }[] }) => ({
        count: 10,
      })),
      count: vi.fn(async (_args?: { where?: Record<string, unknown> }) => 10),
      // Mirrors the guarded usedAt CAS.
      updateMany: vi.fn(async ({ where }: { where: { codeHash: string } }) => {
        const row = codeRows.find(
          (r) => r.codeHash === where.codeHash && r.adminUserId === 'admin-1' && !r.usedAt,
        );
        if (!row) return { count: 0 };
        row.usedAt = new Date();
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        // Sequential-array form: run each operation against the mocks.
        const out: unknown[] = [];
        for (const op of arg as Record<string, unknown>[]) {
          if (op['deleteMany'])
            out.push(
              await prismaMock.adminBackupCode.deleteMany(
                op['deleteMany'] as { where?: { adminUserId?: string } },
              ),
            );
          else if (op['createMany'])
            out.push(
              await prismaMock.adminBackupCode.createMany(
                op['createMany'] as { data: { adminUserId: string; codeHash: string }[] },
              ),
            );
          else out.push({});
        }
        return out;
      }
      // Interactive form — not used by storeBackupCodes today.
      return (arg as (tx: unknown) => Promise<unknown>)(prismaMock);
    }),
  };
  return { prismaMock, codeRows };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: vi.fn(async () => ({})),
}));

// Real TOTP math (no mock) — codes are computed for the real secret.
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const codeHash = (raw: string): string =>
  createHash('sha256')
    .update(
      raw
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, ''),
    )
    .digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  codeRows.length = 0;
});

import { computeTotp, signJwt } from '@/lib/jwt';

/** A REAL signed challenge JWT — consumeChallengeToken verifies signatures. */
async function realChallenge(): Promise<string> {
  return signJwt({ typ: 'admin-challenge', sub: 'admin-1', rem: false }, 300);
}

/** Seed the in-memory table the way storeBackupCodes would (hashes only). */
function seedCodes(plaintexts: string[], used: number[] = []): void {
  codeRows.length = 0;
  plaintexts.forEach((p, i) => {
    codeRows.push({
      id: `bc_${i}`,
      adminUserId: 'admin-1',
      codeHash: codeHash(p),
      usedAt: used.includes(i) ? new Date() : null,
    });
  });
}

import {
  confirm2fa,
  consumeBackupCode,
  countUnusedBackupCodes,
  setup2fa,
  storeBackupCodes,
} from '@/api/adminAuth';

const CHALLENGE = 'challenge.jwt.token';
const USER = {
  id: 'admin-1',
  email: 'admin@test.local',
  role: 'super_admin',
  status: 'active',
  totpSecret: SECRET,
  totpConfirmed: true,
  mustChangePassword: false,
  totpLockedUntil: null as Date | null,
  failedTotpAttempts: 0,
};

function mockChallengeActive(): void {
  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => (where.id === USER.id ? { ...USER } : null),
  );
}

function mockChallengeConsumed(): void {
  prismaMock.adminChallengeConsumed.create.mockRejectedValueOnce(new Error('dup'));
}

function currentTotp(): Promise<string> {
  return computeTotp(SECRET, Math.floor(Date.now() / 1000)) as Promise<string>;
}

describe('storeBackupCodes — hashes only, replace-any (audit #9)', () => {
  it('stores 10 hashed rows (never the plaintext) and returns the plaintext once', async () => {
    const codes = await storeBackupCodes('admin-1');
    expect(codes).toHaveLength(10);
    expect(codes.every((c) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c))).toBe(true);
    expect(prismaMock.adminBackupCode.createMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.adminBackupCode.createMany.mock.calls[0]![0];
    expect(arg.data).toHaveLength(10);
    // Every stored value is a SHA-256 hex digest — never a plaintext code.
    expect(arg.data.every((d) => /^[0-9a-f]{64}$/.test(d.codeHash))).toBe(true);
    // No stored value may equal the plaintext.
    for (const c of codes) {
      expect(arg.data.some((d) => d.codeHash === c)).toBe(false);
      expect(arg.data.some((d) => d.codeHash === codeHash(c))).toBe(true);
    }
  });

  it('wipes the previous set before storing the new one (replace-any)', async () => {
    await storeBackupCodes('admin-1');
    expect(prismaMock.adminBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1' },
    });
  });

  it('countUnusedBackupCodes counts only unused rows', async () => {
    prismaMock.adminBackupCode.count.mockResolvedValueOnce(7);
    expect(await countUnusedBackupCodes('admin-1')).toBe(7);
  });
});

describe('consumeBackupCode — one-time CAS', () => {
  it('consumes an unused code exactly once; the second use fails', async () => {
    seedCodes(['ABCD-1234', 'WXYZ-9876']);
    expect(await consumeBackupCode('admin-1', 'abcd-1234')).toBe(true);
    expect(await consumeBackupCode('admin-1', 'ABCD1234')).toBe(false);
    // Normalization: dash optional, case-insensitive — same hash.
    expect(prismaMock.adminBackupCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adminUserId: 'admin-1', codeHash: codeHash('ABCD-1234'), usedAt: null },
      }),
    );
  });

  it('rejects a code belonging to another user', async () => {
    seedCodes(['ABCD-1234']);
    codeRows[0]!.adminUserId = 'someone-else';
    expect(await consumeBackupCode('admin-1', 'ABCD-1234')).toBe(false);
  });
});

describe('setup2fa — codes persist (audit #9: they used to be discarded)', () => {
  it('hands out plaintext codes and stores their hashes', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      ...USER,
      totpConfirmed: false,
    });
    const setup = await setup2fa(await realChallenge());
    expect(setup.success).toBe(true);
    expect(setup.backupCodes).toHaveLength(10);
    expect(prismaMock.adminBackupCode.createMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.adminBackupCode.createMany.mock.calls[0]![0];
    expect(arg.data).toHaveLength(10);
    // Round-trip: each returned plaintext matches one stored hash.
    for (const c of setup.backupCodes ?? []) {
      expect(arg.data.some((d) => d.codeHash === codeHash(c))).toBe(true);
    }
  });
});

describe('confirm2fa — backup code replaces the TOTP (audit #9)', () => {
  it('a valid UNUSED backup code logs in and is consumed', async () => {
    mockChallengeActive();
    seedCodes(['ABCD-1234']);
    const challenge = await realChallenge();

    const result = await confirm2fa(challenge, 'ABCD-1234');
    expect(result.success).toBe(true);
    expect(result.accessToken).toBeTruthy();
    expect(codeRows[0]?.usedAt).not.toBeNull();
  });

  it('an already-used code is rejected and feeds the TOTP lockout', async () => {
    mockChallengeActive();
    seedCodes(['ABCD-1234'], [0]); // already consumed
    const challenge = await realChallenge();

    const result = await confirm2fa(challenge, 'ABCD-1234');
    expect(result.success).toBe(false);
    expect(result.error).toBe('TOTP_INVALID');
    expect(prismaMock.adminUser.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedTotpAttempts: { increment: 1 } }),
      }),
    );
  });

  it('a wrong backup code also counts toward the lockout', async () => {
    mockChallengeActive();
    seedCodes(['ABCD-1234']);
    const challenge = await realChallenge();

    const result = await confirm2fa(challenge, 'ZZZZ-9999');
    expect(result.success).toBe(false);
    expect(prismaMock.adminUser.updateMany).toHaveBeenCalled();
  });

  it('the TOTP still works and does not touch backup codes', async () => {
    mockChallengeActive();
    seedCodes(['ABCD-1234']);
    const challenge = await realChallenge();
    const totp = (await currentTotp()) as string;

    const result = await confirm2fa(challenge, totp);
    expect(result.success).toBe(true);
    expect(codeRows[0]?.usedAt).toBeNull();
    expect(prismaMock.adminBackupCode.updateMany).not.toHaveBeenCalled();
  });

  it('a locked account never reaches verification', async () => {
    mockChallengeActive();
    seedCodes(['ABCD-1234']);
    prismaMock.adminUser.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === USER.id ? { ...USER, totpLockedUntil: new Date(Date.now() + 600_000) } : null,
    );
    const challenge = await realChallenge();

    const result = await confirm2fa(challenge, 'ABCD-1234');
    expect(result.success).toBe(false);
    expect(result.error).toBe('TOTP_LOCKED');
    expect(codeRows[0]?.usedAt).toBeNull();
  });

  it('a consumed challenge yields TOKEN_INVALID before any code check', async () => {
    mockChallengeConsumed();
    seedCodes(['ABCD-1234']);
    const challenge = await realChallenge();

    const result = await confirm2fa(challenge, 'ABCD-1234');
    expect(result.success).toBe(false);
    expect(result.error).toBe('TOKEN_INVALID');
    expect(codeRows[0]?.usedAt).toBeNull();
  });
});
