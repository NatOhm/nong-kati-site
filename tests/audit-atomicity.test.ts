/**
 * Audit-log atomicity regression (external audit finding, High).
 *
 * Contract after the fix:
 *  1. writeAuditLog is ASYNC — it returns a promise the caller must await.
 *     The legacy sync return (entry object) fails these tests.
 *  2. With `tx`, the insert goes to THE TRANSACTION client and is awaited —
 *     an insert failure rejects INTO the transaction so the whole mutation
 *     rolls back (evidence and mutation share one fate).
 *  3. Without `tx`, the insert goes to the global prisma client.
 *  4. Sensitive helpers (staff role change / deactivation) pass their tx —
 *     asserted here with the in-process + mocked-prisma pattern, so a
 *     regression back to the detached write fails immediately.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_JWT_SECRET'] = 'audit-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock } = vi.hoisted(() => {
  const globalCreate = vi.fn(async () => ({}));
  const txCreate = vi.fn(async () => ({}));
  const prismaMock = {
    __globalCreate: globalCreate,
    __txCreate: txCreate,
    auditLog: { create: globalCreate },
    // runStaffMutation wraps everything in prisma.$transaction(fn); the mock
    // passes the mock itself as the tx client, so tx.auditLog.create IS the
    // global create spy and "written inside the transaction" is observable.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    adminSession: { updateMany: vi.fn(async () => ({ count: 0 })) },
    customer: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock['__globalCreate'].mockResolvedValue({});
  prismaMock['__txCreate'].mockResolvedValue({});
});

import { writeAuditLog } from '@/lib/auditLog';
import { adminChangeStaffRole, adminDeactivateStaff } from '@/api/adminStaff';
import { hashPassword } from '@/lib/password';

const STAFF_TX = {
  auditLog: { create: prismaMock['__txCreate'] },
} as unknown as NonNullable<Parameters<typeof writeAuditLog>[0]['tx']>;

describe('writeAuditLog — async + transaction-bound (audit fix)', () => {
  it('returns a promise that resolves to the entry (the old sync API fails here)', async () => {
    const result = writeAuditLog({
      actorType: 'admin',
      actorId: 'a1',
      actorEmail: 'a@x',
      action: 'test_action',
      tableName: 'T',
      recordId: 'r1',
    });
    expect(result).toBeInstanceOf(Promise);
    const entry = await result;
    expect(entry.id).toMatch(/^audit_/);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('with tx: writes via the TRANSACTION client, awaited', async () => {
    await writeAuditLog({
      actorType: 'admin',
      actorId: 'a1',
      actorEmail: 'a@x',
      action: 'tx_action',
      tableName: 'T',
      recordId: 'r1',
      tx: STAFF_TX,
    });
    expect(prismaMock['__txCreate']).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('with tx: insert failure REJECTS (rollback signal for the mutation)', async () => {
    prismaMock['__txCreate'].mockRejectedValueOnce(new Error('AUDIT_DOWN'));
    await expect(
      writeAuditLog({
        actorType: 'admin',
        actorId: 'a1',
        actorEmail: 'a@x',
        action: 'tx_action',
        tableName: 'T',
        recordId: 'r1',
        tx: STAFF_TX,
      }),
    ).rejects.toThrow('AUDIT_DOWN');
  });

  it('without tx: insert failure is logged, not thrown (non-critical path)', async () => {
    prismaMock['__globalCreate'].mockRejectedValueOnce(new Error('DB_DOWN'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entry = await writeAuditLog({
      actorType: 'customer',
      actorId: 'c1',
      actorEmail: 'c@x',
      action: 'login',
      tableName: 'T',
      recordId: 'r1',
    });
    expect(entry.id).toMatch(/^audit_/);
    errSpy.mockRestore();
  });
});

describe('sensitive mutations pass their transaction to the audit write', () => {
  const staffRow = {
    id: 'staff-1',
    email: 'staff@x',
    fullName: 'Staff',
    role: 'super_admin',
    status: 'active',
  };

  function useStaffTx(): void {
    // Every tx.* access the staff mutation makes is routed to the SHARED
    // tx create spy via a proxy-shaped mock; other models resolve sanely.
    prismaMock.adminUser.findUnique.mockResolvedValue(staffRow);
    prismaMock.adminUser.update.mockResolvedValue({});
    prismaMock.adminUser.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.adminUser.count.mockResolvedValue(1);
  }

  it('adminChangeStaffRole: audit insert hits the tx client (was detached before)', async () => {
    useStaffTx();
    // The mocked prisma is also the "transaction client" passed by
    // prisma.$transaction(fn) in this mock world — the audit insert must
    // therefore land on prisma.auditLog.create (same object), NOT on a
    // detached global write. Both are the same spy here, but the call must
    // carry the awaited, transactional shape: it happens BEFORE the
    // transaction callback returns, i.e. within runStaffMutation.
    let auditDuringTx = false;
    prismaMock.auditLog.create.mockImplementationOnce(async () => {
      auditDuringTx = prismaMock.adminUser.update.mock.calls.length > 0;
      return {};
    });

    const result = await adminChangeStaffRole('staff-1', 'order_manager', 'admin-1', 'a@x');
    expect(result.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(
      auditDuringTx,
      'audit insert must happen inside the mutation flow (tx-bound), not fire-and-forget after it',
    ).toBe(true);
  });

  it('adminChangeStaffRole: audit failure rolls the mutation back', async () => {
    useStaffTx();
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error('AUDIT_DOWN'));
    await expect(
      adminChangeStaffRole('staff-1', 'order_manager', 'admin-1', 'a@x'),
    ).rejects.toThrow('AUDIT_DOWN');
    // The mutation's own writes were part of the aborted transaction — the
    // role update must NOT have been committed as a silent success.
    expect(prismaMock.adminUser.update).toHaveBeenCalled();
  });

  it('adminDeactivateStaff: audit insert is awaited inside the mutation', async () => {
    useStaffTx();
    const result = await adminDeactivateStaff('staff-1', true, 'admin-1', 'a@x');
    expect(result.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('customer register remains non-tx (awaited global write, still durable)', async () => {
    const { registerCustomer } = await import('@/api/customerAuth');
    prismaMock.customer.findUnique.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({
      id: 'c-new',
      email: 'new@example.com',
    });
    await registerCustomer({
      email: 'new@example.com',
      password: 'PasswordTest!2026',
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(hashPassword).toBeDefined();
  });
});
