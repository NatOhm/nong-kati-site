/**
 * The stock floor must never erase a restock (audit 2026-11-06).
 *
 * `fulfilOrder` decrements `ProductVariant.stock` after handing out codes, then
 * floors it at 0 because stock can be out of sync with the code pool. Those are
 * two separate statements, and the second one used to be a blind
 * `update({ data: { stock: 0 } })` — so an admin restock that committed between
 * them (`stock: 10`) was overwritten by 0 and the restock vanished with no
 * trace: the StockMove row recorded 0, and the next order found no stock again.
 *
 * The floor is now conditional (`updateMany ... where stock < 0`), so a row
 * that is no longer negative is left alone.
 *
 * What is faked here is only the database: the fake applies `where` conditions
 * against live state before writing, the way Postgres does, and it lets the
 * restock land at the exact interleaving that used to lose. Everything else —
 * the FIFO pick, the guarded code claim, the clamp decision, the StockMove row
 * and the order/item updates — is the production code path.
 *
 * Pinned:
 *   C1  stock 0, order needs 2 → stock ends at 0 (the floor still works) and
 *       the StockMove row records `stockAfter: 0`.
 *   C2  a restock to 10 lands between the decrement and the clamp → stock stays
 *       10. This is the regression: with the old unconditional write it ended
 *       at 0 (`expected 0 to be 10`).
 *   C3  stock 5, order needs 2 → stock 3 and the clamp never runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type State = {
  stock: number;
  orderStatus: string;
  moves: Row[];
  itemDelivered: boolean;
  codeMarks: number;
  /** Writes to ProductVariant, in order: [{ op, data }]. */
  variantWrites: Array<{ op: 'update' | 'updateMany'; data: Row }>;
  /** Land an admin restock between the decrement and the clamp. */
  restockTo: number | null;
};

const h = vi.hoisted(() => ({
  prisma: {} as Row,
  state: {
    stock: 0,
    orderStatus: 'payment_confirmed',
    moves: [] as Row[],
    itemDelivered: false,
    codeMarks: 0,
    variantWrites: [] as Array<{ op: 'update' | 'updateMany'; data: Row }>,
    restockTo: null as number | null,
  },
  enqueueEmail: vi.fn(async (_args: Row) => undefined),
}));

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/crypto/giftCode', () => ({ decryptCode: () => 'MOCK-CODE' }));
vi.mock('@/lib/email/outbox', () => ({
  enqueueEmail: h.enqueueEmail,
  scheduleOutboxDrain: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/templates', () => ({
  orderConfirmationTemplate: () => ({ subject: 'subject', html: '<p>html</p>' }),
}));

import { fulfilOrder, type PrismaTx } from '@/lib/fulfilment';

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://nongkatistore.test';

const ORDER = {
  id: 'ord-clamp',
  orderNumber: 'NK-2026-000300',
  confirmationUuid: 'cu-clamp',
  customerEmail: 'buyer@example.test',
  status: 'payment_confirmed',
  subtotalThb: 198,
  vatAmountThb: 0,
  vatEnabled: false,
  vatRate: 0,
  totalAmountThb: 198,
  items: [
    {
      id: 'item-1',
      variantId: 'var-1',
      quantity: 2,
      productNameTh: 'Netflix 1 เดือน',
      denominationThb: 99,
    },
  ],
};

function pick(args: Row): { where: Row; data: Row } {
  return {
    where: (args['where'] ?? {}) as Row,
    data: (args['data'] ?? {}) as Row,
  };
}

/** A transaction stub that honours `where` on the clamp, like Postgres. */
function makeTx(): PrismaTx {
  const s: State = h.state;
  const tx = {
    order: {
      findUnique: async () => ({ ...ORDER, status: s.orderStatus }),
      update: async (args: Row) => {
        s.orderStatus = String(pick(args).data['status'] ?? s.orderStatus);
        return {};
      },
    },
    giftCode: {
      findMany: async () =>
        [1, 2].map((n) => ({
          id: `code-${n}`,
          codeEncrypted: 'enc',
          nonce: 'nonce',
          keyVersion: 1,
        })),
      updateMany: async (args: Row) => {
        const { where } = pick(args);
        // Only rows still `available` match — the guarded claim.
        const wanted = (where['status'] as string | undefined) ?? 'available';
        if (wanted !== 'available') return { count: 0 };
        s.codeMarks += 1;
        return { count: 1 };
      },
    },
    productVariant: {
      update: async (args: Row) => {
        const { data } = pick(args);
        s.variantWrites.push({ op: 'update', data });
        const value = data['stock'] as number | { decrement: number };
        if (typeof value === 'number') {
          // An absolute write (`stock: 0`) — the old clamp did this blind.
          s.stock = value;
          return { stock: s.stock };
        }
        s.stock -= value.decrement;
        const returned = s.stock;
        // The admin's restock lands right here, between the two statements.
        if (s.restockTo !== null) s.stock = s.restockTo;
        return { stock: returned };
      },
      updateMany: async (args: Row) => {
        const { where, data } = pick(args);
        s.variantWrites.push({ op: 'updateMany', data });
        const condition = where['stock'] as { lt: number } | undefined;
        if (condition && !(s.stock < condition.lt)) return { count: 0 };
        s.stock = Number(data['stock']);
        return { count: 1 };
      },
    },
    stockMove: {
      create: async (args: Row) => {
        s.moves.push(pick(args).data);
        return {};
      },
    },
    orderItem: {
      update: async () => {
        s.itemDelivered = true;
        return {};
      },
    },
  };
  return tx as unknown as PrismaTx;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.stock = 0;
  h.state.orderStatus = 'payment_confirmed';
  h.state.moves.length = 0;
  h.state.itemDelivered = false;
  h.state.codeMarks = 0;
  h.state.variantWrites.length = 0;
  h.state.restockTo = null;
});

describe('fulfilOrder — stock floor', () => {
  it('C1: floors a negative stock at 0 and records stockAfter 0', async () => {
    const result = await fulfilOrder(ORDER.id, makeTx());

    expect(result.success).toBe(true);
    expect(result.codes).toHaveLength(2);
    expect(h.state.stock).toBe(0);
    expect(h.state.moves).toHaveLength(1);
    expect(h.state.moves[0]).toMatchObject({ delta: -2, reason: 'sale', stockAfter: 0 });
    expect(h.state.orderStatus).toBe('completed');
    expect(h.state.itemDelivered).toBe(true);
  });

  it('C2: a restock that lands before the clamp is not erased', async () => {
    // Stock says 0, the order needs 2 → the decrement goes to -2. The admin
    // restocks to 10 before the floor runs; the floor must leave it alone.
    h.state.restockTo = 10;

    const result = await fulfilOrder(ORDER.id, makeTx());

    expect(result.success).toBe(true);
    expect(h.state.stock).toBe(10);
    // The clamp was attempted (stock was negative when read) but wrote nothing,
    // and it was a conditional write — never a blind `update` to 0.
    const clampWrites = h.state.variantWrites.filter((w) => w.op === 'updateMany');
    expect(clampWrites).toHaveLength(1);
    // A blind absolute write (`stock: 0` via `update`) is what erased the
    // restock; only the relative decrement may appear as an `update`.
    const absolute = h.state.variantWrites.filter(
      (w) => w.op === 'update' && typeof w.data['stock'] === 'number',
    );
    expect(absolute).toHaveLength(0);
    // The sale itself is still recorded honestly.
    expect(h.state.moves[0]).toMatchObject({ delta: -2, stockAfter: 0 });
  });

  it('C3: a healthy stock is decremented and the clamp never runs', async () => {
    h.state.stock = 5;

    const result = await fulfilOrder(ORDER.id, makeTx());

    expect(result.success).toBe(true);
    expect(h.state.stock).toBe(3);
    expect(h.state.variantWrites.filter((w) => w.op === 'updateMany')).toHaveLength(0);
    expect(h.state.moves[0]).toMatchObject({ delta: -2, stockAfter: 3 });
  });
});
