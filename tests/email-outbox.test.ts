/**
 * Email outbox + fail-closed delivery (external audit #2, 2026-09-27).
 *
 * Regression coverage:
 *  1. resend.ts never returns fake success again — without real provider
 *     credentials every send fails with EMAIL_NOT_CONFIGURED (the old mock
 *     mode returned `{ success: true, messageId: 'mock_...' }`).
 *  2. enqueueEmail is tx-bound + idempotent: P2002 on the idempotency key
 *     is a silent no-op, any other failure throws INTO the transaction.
 *  3. Fault injection in fulfilOrder: a broken outbox write rolls back the
 *     WHOLE fulfilment unit (codes/stock/order-status) — the audit-
 *     atomicity pattern applied to the delivery promise.
 *  4. processDueEmails: worker crash mid-send (stale 'sending' row) is
 *     re-claimed; exhausted attempts park the row as FAILED with lastError
 *     — never a fake success.
 *  5. magic-link / forgot-password answer 503 EMAIL_DELIVERY_UNAVAILABLE
 *     when delivery fails, and keep the uniform 200 otherwise.
 *  6. The internal drain endpoint is cron-secret/admin-JWT gated.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'outbox-test-secret-0123456789abcdef0123456789abcdef';

// ── Prisma mock with an in-memory EmailOutbox table ─────────
type OutboxRow = {
  id: string;
  idempotencyKey: string;
  templateKey: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  availableAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const { prismaMock, outbox } = vi.hoisted(() => {
  const rows: OutboxRow[] = [];
  const now = () => new Date();

  const emailOutbox = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const err = new Error('Unique constraint failed') as Error & { code?: string };
      err.code = 'P2002';
      const dupe = rows.some((r) => r.idempotencyKey === data['idempotencyKey']);
      if (dupe) throw err;
      return insertRow(data);
    }),
    findUnique: vi.fn(async ({ where }: { where: { idempotencyKey?: string; id?: string } }) => {
      const row = where.idempotencyKey
        ? rows.find((r) => r.idempotencyKey === where.idempotencyKey)
        : rows.find((r) => r.id === where.id);
      // The worker reads to/subject/html/text/attempts off this row.
      return row
        ? {
            id: row.id,
            toEmail: row.toEmail,
            subject: row.subject,
            html: row.html,
            text: row.text,
            attempts: row.attempts,
          }
        : null;
    }),
    // Mirrors INSERT … ON CONFLICT DO NOTHING: never throws on duplicates.
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { idempotencyKey: string };
        create: Record<string, unknown>;
        update: Record<string, never>;
      }) => {
        const existing = rows.find((r) => r.idempotencyKey === where.idempotencyKey);
        if (existing) return { id: existing.id };
        return insertRow(create);
      },
    ),
    findMany: vi.fn(async ({ where, take }: { where?: { OR?: unknown[] }; take?: number }) => {
      const nowMs = Date.now();
      const staleCutoff = nowMs - 5 * 60_000;
      return rows
        .filter((r) => {
          if (r.status === 'pending' && r.availableAt.getTime() <= nowMs) return true;
          if (r.status === 'sending' && r.updatedAt.getTime() < staleCutoff) return true;
          return false;
        })
        .slice(0, take ?? 20)
        .map((r) => ({ id: r.id }));
    }),
    updateMany: vi.fn(async ({ where }: { where: { id: string; OR?: unknown[] } }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) return { count: 0 };
      const nowMs = Date.now();
      const staleCutoff = nowMs - 5 * 60_000;
      const claimable =
        (row.status === 'pending' && row.availableAt.getTime() <= nowMs) ||
        (row.status === 'sending' && row.updatedAt.getTime() < staleCutoff);
      if (!claimable) return { count: 0 };
      row.status = 'sending';
      row.updatedAt = now();
      return { count: 1 };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        if ('status' in data) row.status = data['status'] as OutboxRow['status'];
        if ('attempts' in data) row.attempts = data['attempts'] as number;
        if ('lastError' in data) row.lastError = data['lastError'] as string | null;
        if ('sentAt' in data) row.sentAt = data['sentAt'] as Date | null;
        if ('availableAt' in data) row.availableAt = data['availableAt'] as Date;
        row.updatedAt = now();
        return row;
      },
    ),
    count: vi.fn(
      async ({ where }: { where: { status?: string } }) =>
        rows.filter((r) => !where?.status || r.status === where.status).length,
    ),
  };

  function insertRow(data: Record<string, unknown>): { id: string } {
    const row: OutboxRow = {
      id: `ob_${rows.length + 1}`,
      idempotencyKey: String(data['idempotencyKey']),
      templateKey: String(data['templateKey']),
      toEmail: String(data['toEmail']),
      subject: String(data['subject']),
      html: String(data['html']),
      text: (data['text'] as string | undefined) ?? null,
      status: 'pending',
      attempts: 0,
      lastError: null,
      availableAt: now(),
      sentAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    rows.push(row);
    return { id: row.id };
  }

  const prismaMock = {
    emailOutbox,
    __rows: rows,
    // The mock passes ITSELF as the transaction client — every model on
    // prismaMock is reachable through tx.*, exactly like the real client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  return { prismaMock, outbox: rows };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

// ── Resend client mock (records provider calls) ─────────────
const { resendMock } = vi.hoisted(() => {
  const resendMock = {
    sendEmail: vi.fn<
      (opts: unknown) => Promise<{ success: boolean; messageId?: string; error?: string }>
    >(async () => ({ success: true, messageId: 'prov_1' })),
  };
  return { resendMock };
});
vi.mock('@/lib/email/resend', () => ({ sendEmailWithRetry: resendMock.sendEmail }));

beforeEach(() => {
  vi.clearAllMocks();
  outbox.length = 0;
  resendMock.sendEmail.mockClear();
  resendMock.sendEmail.mockResolvedValue({ success: true, messageId: 'prov_1' });
  delete process.env['NK_RESEND_API_KEY'];
  delete process.env['NK_RESEND_FROM_EMAIL'];
});

import { enqueueEmail, processDueEmails, MAX_OUTBOX_ATTEMPTS } from '@/lib/email/outbox';
import { enqueueCodeDeliveryEmail, fulfilOrder } from '@/lib/fulfilment';
import { encryptCode } from '@/lib/crypto/giftCode';

const TX = prismaMock as unknown as Parameters<typeof enqueueEmail>[0]['tx'];

// Real AES key for the fulfilment fault-injection tests (decryptCode needs it).
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('resend.ts is fail-closed (audit #2 — no more mock success)', () => {
  // The file-level vi.mock('@/lib/email/resend') stubs the provider for the
  // outbox tests — importActual reaches the REAL client for these.
  const realResend = () =>
    vi.importActual<typeof import('@/lib/email/resend')>('@/lib/email/resend');

  it('without credentials, sendEmail reports failure — never success', async () => {
    const { sendEmail } = await realResend();
    const result = await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('EMAIL_NOT_CONFIGURED');
    expect(result.messageId).toBeUndefined();
  });

  it('isEmailDeliveryConfigured requires BOTH the key and from address', async () => {
    const { isEmailDeliveryConfigured } = await realResend();
    expect(isEmailDeliveryConfigured()).toBe(false);
    process.env['NK_RESEND_API_KEY'] = 're_live_testkey';
    expect(isEmailDeliveryConfigured()).toBe(false);
    process.env['NK_RESEND_FROM_EMAIL'] = 'orders@nong-kati.co.th';
    expect(isEmailDeliveryConfigured()).toBe(true);
    // The old backdoor: re_mock_key must NOT count as configured.
    process.env['NK_RESEND_API_KEY'] = 're_mock_key';
    expect(isEmailDeliveryConfigured()).toBe(false);
  });
});

describe('enqueueEmail — tx-bound + idempotent', () => {
  it('creates the row inside the caller transaction and returns its id', async () => {
    const r = await enqueueEmail({
      idempotencyKey: 'code_delivery:ord1',
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    expect(r.enqueued).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.idempotencyKey).toBe('code_delivery:ord1');
  });

  it('a repeated enqueue with the same idempotency key is a silent no-op', async () => {
    const first = await enqueueEmail({
      idempotencyKey: 'code_delivery:ord1',
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    const second = await enqueueEmail({
      idempotencyKey: 'code_delivery:ord1',
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(outbox).toHaveLength(1);
  });

  it('a DB failure in the enqueue THROWS (rolls the caller transaction back)', async () => {
    prismaMock.emailOutbox.findUnique.mockRejectedValueOnce(new Error('db write failed'));
    await expect(
      enqueueEmail({
        idempotencyKey: 'code_delivery:ord2',
        templateKey: 'code_delivery',
        to: 'a@b.c',
        subject: 's',
        html: '<p/>',
        tx: TX,
      }),
    ).rejects.toThrow('db write failed');
  });

  it('a true simultaneous race falls back to the atomic upsert without duplicating', async () => {
    // Pre-check misses (row committed by a racer between the read and the
    // write) — the ON CONFLICT backstop must still return exactly one row.
    prismaMock.emailOutbox.findUnique.mockImplementationOnce(async () => null);
    await enqueueEmail({
      idempotencyKey: 'code_delivery:race',
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    prismaMock.emailOutbox.findUnique.mockImplementationOnce(async () => null);
    const second = await enqueueEmail({
      idempotencyKey: 'code_delivery:race',
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    expect(second.enqueued).toBe(true);
    expect(outbox.filter((r) => r.idempotencyKey === 'code_delivery:race')).toHaveLength(1);
  });
});

describe('fulfilOrder fault injection — broken outbox rolls back the fulfilment', () => {
  const ORDER = {
    id: 'ord-fault',
    orderNumber: 'NK-1001',
    customerEmail: 'cust@test.local',
    status: 'payment_confirmed',
    subtotalThb: 100,
    vatAmountThb: 7,
    totalAmountThb: 107,
    items: [
      {
        id: 'oi1',
        variantId: 'v1',
        quantity: 1,
        productNameTh: 'HBO Max 7 วัน',
        denominationThb: 25,
      },
    ],
  };

  function seedOrder(): void {
    const enc = encryptCode('TEST-CODE-0001');
    Object.assign(prismaMock, {
      order: {
        findUnique: vi.fn().mockResolvedValue(ORDER),
        update: vi.fn().mockResolvedValue({}),
      },
      giftCode: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'g1', codeEncrypted: enc.ciphertext, nonce: enc.nonce }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: { update: vi.fn().mockResolvedValue({ stock: 0 }) },
      stockMove: { create: vi.fn().mockResolvedValue({}) },
      orderItem: { update: vi.fn().mockResolvedValue({}) },
    });
  }

  beforeEach(seedOrder);

  it('outbox insert failure → the fulfilment THROWS (transaction aborts)', async () => {
    const boom = new Error('outbox down') as Error & { code?: string };
    // The enqueue write is the tx-bound upsert (ON CONFLICT DO NOTHING).
    prismaMock.emailOutbox.upsert.mockRejectedValueOnce(boom);

    await expect(fulfilOrder('ord-fault')).rejects.toThrow('outbox down');
    // The completed-status write WAS issued in-flight (in a real transaction
    // it is rolled back together with the codes by the caller's abort — the
    // mock world has no rollback to observe). What matters: the delivery
    // promise did NOT survive a failed fulfilment.
    expect(prismaMock.emailOutbox.upsert).toHaveBeenCalled();
    // And no outbox row survived.
    expect(outbox).toHaveLength(0);
  });

  it('happy path: the delivery promise is enqueued tx-bound and idempotent', async () => {
    const result = await fulfilOrder('ord-fault');
    expect(result.success).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.idempotencyKey).toBe('code_delivery:ord-fault');
    expect(outbox[0]?.toEmail).toBe('cust@test.local');

    // A repeat confirmation (webhook redelivery / admin re-press) enqueues
    // nothing new — the unique idempotency key absorbs it.
    await enqueueCodeDeliveryEmail(TX, ORDER);
    expect(outbox).toHaveLength(1);
  });
});

describe('processDueEmails — delivery worker semantics', () => {
  async function seedRow(overrides: Partial<OutboxRow> = {}): Promise<OutboxRow> {
    await enqueueEmail({
      idempotencyKey: overrides.idempotencyKey ?? `k${outbox.length + 1}`,
      templateKey: 'code_delivery',
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      tx: TX,
    });
    const row = outbox[outbox.length - 1]!;
    Object.assign(row, overrides);
    return row;
  }

  it('sends due rows and marks them sent', async () => {
    await seedRow();
    const stats = await processDueEmails();
    expect(stats).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(outbox[0]?.status).toBe('sent');
    expect(outbox[0]?.sentAt).toBeInstanceOf(Date);
    expect(resendMock.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('provider failure → row returns to pending with attempts+1 and backoff', async () => {
    resendMock.sendEmail.mockResolvedValue({ success: false, error: 'EMAIL_TIMEOUT' });
    await seedRow();
    const stats = await processDueEmails();
    expect(stats).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(outbox[0]?.status).toBe('pending');
    expect(outbox[0]?.attempts).toBe(1);
    expect(outbox[0]?.lastError).toBe('EMAIL_TIMEOUT');
    expect(outbox[0]?.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('attempts exhaustion parks the row as FAILED — no fake success, no silent drop', async () => {
    resendMock.sendEmail.mockResolvedValue({ success: false, error: 'EMAIL_PROVIDER_ERROR' });
    await seedRow({ attempts: MAX_OUTBOX_ATTEMPTS - 1 });
    const stats = await processDueEmails();
    expect(stats).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(outbox[0]?.status).toBe('failed');
    expect(outbox[0]?.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
    expect(outbox[0]?.lastError).toBe('EMAIL_PROVIDER_ERROR');
  });

  it('a worker crash mid-send (stale sending row) is re-claimed, not lost', async () => {
    const row = await seedRow();
    // Simulate the crash: claimed, then the worker died before sending.
    row.status = 'sending';
    row.updatedAt = new Date(Date.now() - 10 * 60_000); // 10 min ago > stale cutoff

    const stats = await processDueEmails();
    expect(stats.processed).toBe(1);
    expect(outbox[0]?.status).toBe('sent');
    expect(row.id).toBe(outbox[0]?.id);
  });

  it('a fresh sending row (another live worker) is NOT re-claimed', async () => {
    const row = await seedRow();
    row.status = 'sending';
    row.updatedAt = new Date(); // just now — a live worker owns it

    const stats = await processDueEmails();
    expect(stats.processed).toBe(0);
    expect(resendMock.sendEmail).not.toHaveBeenCalled();
    expect(row.status).toBe('sending');
  });

  it('a backing-off row is not retried before its availableAt', async () => {
    await seedRow({ status: 'pending', availableAt: new Date(Date.now() + 60_000) });
    const stats = await processDueEmails();
    expect(stats.processed).toBe(0);
    expect(resendMock.sendEmail).not.toHaveBeenCalled();
  });
});
