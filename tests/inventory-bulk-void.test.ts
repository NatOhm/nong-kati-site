/**
 * Bulk-void + batchId correlation (Phase 2, 2026-10-22).
 *
 * Phase 1 made a paste atomic but un-undoable: undoing a bad paste meant
 * voiding codes one at a time, or worse — adjusting the stock number while
 * every GiftCode stayed `available` (the exact drift the single-code void
 * exists to prevent). Phase 2 closes it with a batch id threaded through
 * three records that must agree:
 *
 *   CodeUploadBatch (what was pasted) ←→ GiftCode.uploadBatchId (the codes)
 *   ←→ StockMove.refId (the ledger row) ←→ audit metadata.batchId
 *
 * Contracts pinned:
 *  - every applied paste plan creates ONE batch row and stamps it on its
 *    codes, its StockMove and its audit row (preview writes nothing);
 *  - bulk-void is gated on inventory:void (same as the single-code void),
 *    flips ONLY still-available codes of the batch (CAS), decrements stock
 *    by the number actually flipped, and writes StockMove + audit carrying
 *    the SAME batchId — one transaction, or nothing;
 *  - idempotent: a re-void flips 0 rows, burns no StockMove/audit, returns
 *    200 with alreadyProcessed=true (a double-click must not double-decrement);
 *  - unknown batch → 404, missing batchId → 400;
 *  - the inventory feed exposes refId so the history chip can offer undo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'bulk-void-test-secret-0123456789abcdef0123456789';
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] = 'a'.repeat(64);
process.env['NK_GIFT_CODE_ENCRYPTION_KEY_V2'] = 'b'.repeat(64);

const { prismaMock, auditMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
    },
    giftCode: {
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
      findUnique: vi.fn(),
      createMany: vi.fn(async (_d: Record<string, unknown>) => ({ count: 0 })),
      updateMany: vi.fn(async (_d: Record<string, unknown>) => ({ count: 0 })),
      count: vi.fn(async () => 0),
    },
    codeUploadBatch: {
      create: vi.fn(async (_d: Record<string, unknown>) => ({ id: 'batch_created_1' })),
      findUnique: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(async (_w?: unknown) => ({
        id: 'var_1',
        label: '30 วัน',
        stock: 5,
        product: { name: 'Netflix' },
      })),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
      update: vi.fn(async (_d: Record<string, unknown>) => ({})),
    },
    stockMove: {
      create: vi.fn(async (_d: Record<string, unknown>) => ({})),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  const auditMock = {
    writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => ({})),
  };
  return { prismaMock, auditMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => auditMock);

const BULK = '../src/app/api/v1/admin/stock/bulk/route';
const BULK_VOID = '../src/app/api/v1/admin/stock/bulk-void/route';
const INVENTORY = '../src/app/api/v1/admin/inventory/route';

let token = '';

beforeEach(async () => {
  vi.clearAllMocks();
  if (!token) {
    const { issueAdminJwt } = await import('@/lib/jwt');
    token = await issueAdminJwt('adm_root', 'oil@test.local', 'super_admin', [
      'products:write',
      'inventory:void',
      'inventory:read',
    ]);
  }
});

function productRow(): Record<string, unknown> {
  return {
    id: 'prod_1',
    name: 'Netflix',
    variants: [{ id: 'var_30', label: '30 วัน', stock: 5 }],
  };
}

const post = async (path: string, body: Record<string, unknown>): Promise<Response> => {
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
  const fn = mod['POST'] as (r: NextRequest) => Promise<Response>;
  return fn(
    new NextRequest('http://localhost/x', {
      method: 'POST',
      headers: { cookie: `nk_admin_at=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};

describe('POST /stock/bulk — batchId correlation on the way in', () => {
  beforeEach(() => {
    prismaMock.product.findUnique.mockResolvedValue(productRow());
  });

  it('applied paste creates a batch row and stamps it on codes, StockMove and audit', async () => {
    const res = await post(BULK, {
      productId: 'prod_1',
      format: 'short',
      raw: 'user1:pass1\nuser2:pass2',
      apply: true,
    });
    expect(res.status).toBe(200);

    // One batch row per variant plan, completed, counting what it holds.
    const batchArgs = prismaMock.codeUploadBatch.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(batchArgs.data).toMatchObject({
      variantId: 'var_30',
      importedCount: 2,
      totalRows: 2,
      status: 'completed',
    });

    // Every created code carries the batch id (FK into the batch row).
    const created = prismaMock.giftCode.createMany.mock.calls[0]![0] as {
      data: Record<string, unknown>[];
    };
    expect(created.data.map((r) => r['uploadBatchId'])).toEqual([
      'batch_created_1',
      'batch_created_1',
    ]);

    // StockMove.refId and audit metadata both carry the same id, and the
    // response hands it back so callers can correlate after the fact.
    const move = prismaMock.stockMove.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(move.data['refId']).toBe('batch_created_1');
    const audit = auditMock.writeAuditLog.mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(audit.metadata['batchId']).toBe('batch_created_1');
    const body = (await res.json()) as { results: { batchId: string }[] };
    expect(body.results[0]!.batchId).toBe('batch_created_1');
  });

  it('preview (apply=false) writes no batch', async () => {
    const res = await post(BULK, {
      productId: 'prod_1',
      format: 'short',
      raw: 'user1:pass1',
      apply: false,
    });
    expect(res.status).toBe(200);
    expect(prismaMock.codeUploadBatch.create).not.toHaveBeenCalled();
    expect(prismaMock.giftCode.createMany).not.toHaveBeenCalled();
  });
});

describe('POST /stock/bulk-void — undoing a paste is voiding, n codes at once', () => {
  const batchRow = () => ({
    id: 'batch_abc',
    variantId: 'var_30',
    variant: {
      id: 'var_30',
      label: '30 วัน',
      stock: 7,
      product: { name: 'Netflix' },
    },
  });

  it('400 when batchId is missing', async () => {
    const res = await post(BULK_VOID, { reason: 'x' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('BATCH_ID_REQUIRED');
  });

  it('404 for an unknown batch', async () => {
    prismaMock.codeUploadBatch.findUnique.mockResolvedValue(null);
    const res = await post(BULK_VOID, { batchId: 'nope' });
    expect(res.status).toBe(404);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('CAS-flips only available codes, decrements stock by the flipped count, one move + one audit', async () => {
    prismaMock.codeUploadBatch.findUnique.mockResolvedValue(batchRow());
    // 10 codes in the batch, but only 7 still available (3 already sold).
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 7 });

    const res = await post(BULK_VOID, { batchId: 'batch_abc', reason: 'วางผิดไฟล์' });
    expect(res.status).toBe(200);

    const flip = prismaMock.giftCode.updateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(flip.where).toMatchObject({ uploadBatchId: 'batch_abc', status: 'available' });
    expect(flip.data['status']).toBe('voided');

    // 7 − 7 = 0, floored at 0 — never negative.
    const variantUpdate = prismaMock.productVariant.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(variantUpdate.data['stock']).toBe(0);

    // Movement and audit both carry the SAME batch id as the paste did.
    const move = prismaMock.stockMove.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(move.data).toMatchObject({ delta: -7, reason: 'void', refId: 'batch_abc', stockAfter: 0 });
    const audit = auditMock.writeAuditLog.mock.calls[0]![0] as {
      action: string;
      recordId: string;
      metadata: Record<string, unknown>;
    };
    expect(audit.action).toBe('inventory.bulk_void');
    expect(audit.recordId).toBe('batch_abc');
    expect(audit.metadata['accountsVoided']).toBe(7);

    const body = (await res.json()) as { voided: number; alreadyProcessed: boolean };
    expect(body).toMatchObject({ voided: 7, alreadyProcessed: false });
  });

  it('idempotent re-void: 0 flipped → no StockMove, no audit, alreadyProcessed', async () => {
    prismaMock.codeUploadBatch.findUnique.mockResolvedValue(batchRow());
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.giftCode.count.mockResolvedValue(10);

    const res = await post(BULK_VOID, { batchId: 'batch_abc' });
    expect(res.status).toBe(200);
    expect(prismaMock.stockMove.create).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
    const body = (await res.json()) as { voided: number; alreadyProcessed: boolean };
    expect(body).toMatchObject({ voided: 0, alreadyProcessed: true });
  });

  it('a batch id matching no code rows at all → 404 (nothing to undo)', async () => {
    prismaMock.codeUploadBatch.findUnique.mockResolvedValue(batchRow());
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.giftCode.count.mockResolvedValue(0);
    const res = await post(BULK_VOID, { batchId: 'batch_abc' });
    expect(res.status).toBe(404);
    expect(prismaMock.stockMove.create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/inventory — refId reaches the history chip', () => {
  it('moves rows expose refId (additive), defaulting to null on old rows', async () => {
    prismaMock.stockMove.findMany.mockResolvedValue([
      {
        id: 'mv_1',
        delta: 5,
        reason: 'restock',
        refId: 'batch_abc',
        note: 'bulk paste 5 accounts',
        stockAfter: 10,
        createdAt: new Date('2026-10-22T10:00:00Z'),
        variant: { label: '30 วัน', product: { name: 'Netflix' } },
      },
      {
        id: 'mv_2',
        delta: 1,
        reason: 'sale',
        refId: null,
        note: null,
        stockAfter: 9,
        createdAt: new Date('2026-10-22T11:00:00Z'),
        variant: { label: '30 วัน', product: { name: 'Netflix' } },
      },
    ]);
    const mod = (await import(/* @vite-ignore */ INVENTORY)) as Record<string, unknown>;
    const fn = mod['GET'] as (r: NextRequest) => Promise<Response>;
    const res = await fn(
      new NextRequest('http://localhost/x', {
        headers: { cookie: `nk_admin_at=${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { moves: { id: string; refId: string | null }[] };
    expect(body.moves.map((m) => m.refId)).toEqual(['batch_abc', null]);
  });
});
