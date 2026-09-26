/**
 * Unit tests for the identity/auth remediations (review of 26 Sep 2026):
 *  - Customer logout invalidates remembered tokens server-side
 *  - Customer password failure counter uses atomic guarded increments
 *  - Admin refresh rotation uses a first-writer-wins claim
 *  - PDPA data requests persist to the DB (no in-memory store)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = {
  adminSession: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  customer: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  dataSubjectRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock('@/lib/db', () => ({ prisma: m }));

// Password lib is mocked at factory level (hoisted) so every import of
// customerAuth sees the same controllable verifyPassword.
const passwordLib = {
  hashPassword: vi.fn().mockResolvedValue('h'),
  verifyPassword: vi.fn().mockResolvedValue(false),
};
vi.mock('@/lib/password', () => passwordLib);

beforeEach(() => {
  vi.clearAllMocks();
  m.auditLog.create.mockResolvedValue({});
});

// ─── Customer logout cuts sessions ───────────────────────

describe('logoutCustomer session invalidation', () => {
  it('bumps sessionsInvalidBefore so remembered tokens die on logout', async () => {
    const { logoutCustomer } = await import('@/api/customerAuth');
    const { signJwt } = await import('@/lib/jwt');
    const token = await signJwt({ sub: 'c1', typ: 'customer' }, 3600);

    m.customer.findUnique.mockResolvedValue({
      email: 'c@x',
      sessionsInvalidBefore: null,
    });
    m.customer.update.mockResolvedValue({});

    await logoutCustomer('c1', token);
    expect(m.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { sessionsInvalidBefore: expect.any(Date) },
    });
  });

  it('does NOT bump again when the presented token predates the current marker', async () => {
    const { logoutCustomer } = await import('@/api/customerAuth');
    const { signJwt } = await import('@/lib/jwt');
    // Token issued 10 minutes ago.
    const token = await signJwt({ sub: 'c1', typ: 'customer' }, 3600);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    const issuedAt = new Date(payload.iat * 1000);

    // Marker was already set AFTER that token was issued (e.g. by a password reset).
    m.customer.findUnique.mockResolvedValue({
      email: 'c@x',
      sessionsInvalidBefore: new Date(issuedAt.getTime() + 60_000),
    });

    await logoutCustomer('c1', token);
    expect(m.customer.update).not.toHaveBeenCalled();
  });
});

// ─── Customer password counter is atomic ─────────────────

describe('loginCustomer failure counter', () => {
  it('uses guarded updateMany increment instead of read-modify-write', async () => {
    passwordLib.verifyPassword.mockResolvedValue(false);
    const { loginCustomer } = await import('@/api/customerAuth');

    m.customer.findUnique
      // First call: the login lookup.
      .mockResolvedValueOnce({
        id: 'c1',
        email: 'c@x',
        status: 'active',
        passwordHash: 'scrypt$16384$8$1$s$h',
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      // Second call: read-back after the guarded increment.
      .mockResolvedValueOnce({ failedLoginAttempts: 1 });
    m.customer.updateMany.mockResolvedValue({ count: 1 });

    const res = await loginCustomer({ email: 'c@x', password: 'wrong' });
    expect(res.success).toBe(false);
    expect(m.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', lockedUntil: null },
      data: { failedLoginAttempts: { increment: 1 } },
    });
  });

  it('locks the account when the read-back count reaches the threshold', async () => {
    passwordLib.verifyPassword.mockResolvedValue(false);
    const { loginCustomer } = await import('@/api/customerAuth');

    m.customer.findUnique
      .mockResolvedValueOnce({
        id: 'c1',
        email: 'c@x',
        status: 'active',
        passwordHash: 'scrypt$16384$8$1$s$h',
        failedLoginAttempts: 4,
        lockedUntil: null,
      })
      .mockResolvedValueOnce({ failedLoginAttempts: 5 });
    m.customer.updateMany.mockResolvedValue({ count: 1 });
    m.customer.update.mockResolvedValue({});

    await loginCustomer({ email: 'c@x', password: 'wrong' });
    expect(m.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { failedLoginAttempts: 0, lockedUntil: expect.any(Date) },
    });
  });
});

// ─── Admin refresh replay ────────────────────────────────

describe('refreshAdminSession replay claim', () => {
  it('mints a replacement only when the claim update touched exactly one row', async () => {
    const { refreshAdminSession } = await import('@/api/adminAuth');
    vi.mocked(m.adminSession.create).mockResolvedValue({} as never);

    m.adminSession.findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 60_000),
      adminUserId: 'a1',
      adminUser: {
        id: 'a1',
        email: 'admin@x',
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
      },
    });

    // Winner of the race: the guarded claim touches exactly one row.
    m.adminSession.updateMany.mockResolvedValue({ count: 1 });
    const ok = await refreshAdminSession('tok');
    expect(ok.success).toBe(true);
    expect(m.adminSession.create).toHaveBeenCalledTimes(1);

    // Loser: the same token rotated concurrently — claim touches 0 rows and
    // no replacement session may exist.
    vi.mocked(m.adminSession.findUnique).mockResolvedValue({
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 60_000),
      adminUserId: 'a1',
      adminUser: {
        id: 'a1',
        email: 'admin@x',
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
      },
    } as never);
    m.adminSession.updateMany.mockResolvedValueOnce({ count: 0 });
    const lost = await refreshAdminSession('tok');
    expect(lost.success).toBe(false);
    expect(lost.error).toBe('TOKEN_INVALID');
    expect(m.adminSession.create).toHaveBeenCalledTimes(1); // unchanged
  });
});

// ─── PDPA persistence ────────────────────────────────────

describe('PDPA data requests persist', () => {
  it('submitDataRequest writes a DataSubjectRequest row (no mock array)', async () => {
    const { submitDataRequest } = await import('@/api/dataRequests');
    m.dataSubjectRequest.create.mockResolvedValue({
      id: 'row1',
      requestId: 'dpr_1',
      requestType: 'access',
      fullName: 'x',
      email: 'a@b.c',
      phone: null,
      details: 'รบกวนส่งข้อมูลที่คุณเก็บของฉัน',
      status: 'pending',
      adminNote: null,
      createdAt: new Date(),
      handledAt: null,
    });

    const res = await submitDataRequest({
      type: 'access',
      email: 'a@b.c',
      details: 'รบกวนส่งข้อมูลที่คุณเก็บของฉัน',
    });
    expect(res.success).toBe(true);
    expect(m.dataSubjectRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestType: 'access',
        email: 'a@b.c',
        status: 'pending',
      }),
    });
  });

  it('admin status transition is audit-logged and persisted', async () => {
    const { updateDataRequest } = await import('@/api/dataRequests');
    m.dataSubjectRequest.findUnique.mockResolvedValue({
      id: 'row1',
      requestId: 'dpr_1',
      status: 'pending',
      adminNote: null,
      handledAt: null,
    });
    m.dataSubjectRequest.update.mockResolvedValue({
      id: 'row1',
      requestId: 'dpr_1',
      status: 'completed',
    });

    const res = await updateDataRequest('dpr_1', { status: 'completed' }, 'a1', 'admin@x');
    expect(res.success).toBe(true);
    expect(m.dataSubjectRequest.update).toHaveBeenCalledWith({
      where: { requestId: 'dpr_1' },
      data: expect.objectContaining({ status: 'completed', handledById: 'a1' }),
    });
    expect(m.auditLog.create).toHaveBeenCalled();
  });
});
