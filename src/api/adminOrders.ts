/**
 * Admin Orders API — 07-api.md §22.
 * Full order lifecycle management for admin staff.
 * Uses mock data for M7 (Prisma in production).
 */
import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type AdminOrderStatus =
  | 'pending_payment'
  | 'payment_failed'
  | 'paid'
  | 'delivering'
  | 'completed'
  | 'pending_manual_fulfilment'
  | 'refunded'
  | 'cancelled'
  | 'expired';

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  customerEmail: string;
  status: AdminOrderStatus;
  paymentMethod: string | null;
  itemCount: number;
  totalAmountThb: number;
  requiresManualFulfilment: boolean;
  createdAt: Date;
  completedAt: Date | null;
};

export type AdminOrderDetail = AdminOrderListItem & {
  customerPhone: string | null;
  customerId: string | null;
  subtotalThb: number;
  vatAmountThb: number;
  couponCode: string | null;
  discountAmountThb: number;
  requiresTaxInvoice: boolean;
  ipAddress: string | null;
  tosVersion: string | null;
  items: {
    id: string;
    productNameTh: string;
    skuCode: string;
    denominationThb: number;
    quantity: number;
    unitPriceThb: number;
    lineTotalThb: number;
    deliveryStatus: string;
    deliveredAt: Date | null;
    codes: {
      codeId: string;
      maskedCode: string;
      status: string;
      deliveredAt: Date | null;
    }[];
  }[];
  paymentAttempts: {
    id: string;
    paymentMethod: string;
    status: string;
    amountThb: number;
    gatewayName: string;
    gatewayRef: string;
    webhookReceivedAt: Date | null;
    createdAt: Date;
  }[];
  notes: string | null;
  manualFulfilmentReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

// ─── Mock Order Store ────────────────────────────────────

const mockOrders: AdminOrderListItem[] = [
  {
    id: 'order-001',
    orderNumber: 'NK-2026-000001',
    customerEmail: 'kaem@example.com',
    status: 'completed',
    paymentMethod: 'promptpay',
    itemCount: 2,
    totalAmountThb: 214.0,
    requiresManualFulfilment: false,
    createdAt: new Date('2026-08-20T14:00:00Z'),
    completedAt: new Date('2026-08-20T14:00:21Z'),
  },
  {
    id: 'order-002',
    orderNumber: 'NK-2026-000002',
    customerEmail: 'somchai@example.com',
    status: 'pending_manual_fulfilment',
    paymentMethod: 'promptpay',
    itemCount: 1,
    totalAmountThb: 107.0,
    requiresManualFulfilment: true,
    createdAt: new Date('2026-08-21T10:30:00Z'),
    completedAt: null,
  },
  {
    id: 'order-003',
    orderNumber: 'NK-2026-000003',
    customerEmail: 'nisa@example.com',
    status: 'refunded',
    paymentMethod: 'card',
    itemCount: 1,
    totalAmountThb: 535.0,
    requiresManualFulfilment: false,
    createdAt: new Date('2026-08-22T09:15:00Z'),
    completedAt: new Date('2026-08-22T09:15:18Z'),
  },
  {
    id: 'order-004',
    orderNumber: 'NK-2026-000004',
    customerEmail: 'prawit@example.com',
    status: 'expired',
    paymentMethod: null,
    itemCount: 1,
    totalAmountThb: 214.0,
    requiresManualFulfilment: false,
    createdAt: new Date('2026-08-23T16:00:00Z'),
    completedAt: null,
  },
];

// ─── API Functions ───────────────────────────────────────

/**
 * List admin orders with filtering and pagination.
 * 07-api.md §22 — GET /admin/orders
 */
export async function adminListOrders(params: {
  status?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: AdminOrderListItem[]; total: number; page: number; pageSize: number }> {
  const { status, paymentMethod, dateFrom, dateTo, q, page = 1, pageSize = 20 } = params;

  let filtered = [...mockOrders];

  if (status) {
    filtered = filtered.filter((o) => o.status === status);
  }
  if (paymentMethod) {
    filtered = filtered.filter((o) => o.paymentMethod === paymentMethod);
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    filtered = filtered.filter((o) => o.createdAt >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    filtered = filtered.filter((o) => o.createdAt <= to);
  }
  if (q) {
    const term = q.toLowerCase();
    filtered = filtered.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(term) ||
        o.customerEmail.toLowerCase().includes(term) ||
        o.id.toLowerCase().includes(term)
    );
  }

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const data = filtered.slice(offset, offset + pageSize);

  return { data, total, page, pageSize };
}

/**
 * Get full order detail for admin.
 * 07-api.md §22 — GET /admin/orders/:id
 */
export async function adminGetOrder(
  orderId: string
): Promise<AdminOrderDetail | null> {
  const order = mockOrders.find((o) => o.id === orderId);
  if (!order) return null;

  // Mock full detail
  return {
    ...order,
    customerPhone: '0812345678',
    customerId: 'cust-001',
    subtotalThb: 200.0,
    vatAmountThb: 14.0,
    couponCode: null,
    discountAmountThb: 0,
    requiresTaxInvoice: false,
    ipAddress: '1.2.3.4',
    tosVersion: '1.0',
    items: [
      {
        id: 'item-001',
        productNameTh: 'Steam Wallet ฿100',
        skuCode: 'STEAM-100',
        denominationThb: 100.0,
        quantity: 2,
        unitPriceThb: 107.0,
        lineTotalThb: 214.0,
        deliveryStatus: order.status === 'completed' ? 'delivered' : 'pending',
        deliveredAt: order.completedAt,
        codes:
          order.status === 'completed'
            ? [
                {
                  codeId: 'code-001',
                  maskedCode: '****-****-****-ABCD',
                  status: 'delivered',
                  deliveredAt: order.completedAt,
                },
              ]
            : [],
      },
    ],
    paymentAttempts: [
      {
        id: 'pay-001',
        paymentMethod: order.paymentMethod ?? 'unknown',
        status: 'succeeded',
        amountThb: order.totalAmountThb,
        gatewayName: 'omise',
        gatewayRef: 'chrg_test_xxxx',
        webhookReceivedAt: order.completedAt,
        createdAt: order.createdAt,
      },
    ],
    notes: null,
    manualFulfilmentReason: order.requiresManualFulfilment
      ? 'Stock exhausted during delivery'
      : null,
  };
}

/**
 * Resend code delivery email.
 * 07-api.md §22 — POST /admin/orders/:id/resend-email
 */
export async function adminResendOrderEmail(
  orderId: string,
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean }> {
  const order = mockOrders.find((o) => o.id === orderId);
  if (!order) return { success: false };

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'resend_email',
    tableName: 'store.orders',
    recordId: orderId,
    metadata: { orderNumber: order.orderNumber },
  });

  return { success: true };
}

/**
 * Manually assign a code to a pending_manual_fulfilment order item.
 * 07-api.md §22 — POST /admin/orders/:id/assign-code
 */
export async function adminAssignCode(
  orderId: string,
  params: {
    orderItemId: string;
    codeId: string;
    notes?: string;
  },
  adminId: string,
  adminEmail: string
): Promise<{
  success: boolean;
  data?: { orderItemId: string; codeId: string; orderStatus: string };
  error?: string;
}> {
  const order = mockOrders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'ORDER_NOT_FOUND' };
  }

  if (order.status !== 'pending_manual_fulfilment') {
    return { success: false, error: 'ORDER_NOT_MANUAL_FULFILMENT' };
  }

  // Mock: mark as completed
  order.status = 'completed';
  order.requiresManualFulfilment = false;
  order.completedAt = new Date();

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'assign_code',
    tableName: 'store.orders',
    recordId: orderId,
    diff: {
      before: { status: 'pending_manual_fulfilment' },
      after: { status: 'completed' },
    },
    metadata: {
      orderItemId: params.orderItemId,
      codeId: params.codeId,
      notes: params.notes,
    },
  });

  return {
    success: true,
    data: {
      orderItemId: params.orderItemId,
      codeId: params.codeId,
      orderStatus: 'completed',
    },
  };
}

/**
 * Update order notes.
 * 07-api.md §22 — PATCH /admin/orders/:id/notes
 */
export async function adminUpdateOrderNotes(
  orderId: string,
  notes: string,
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean }> {
  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'update_notes',
    tableName: 'store.orders',
    recordId: orderId,
    diff: {
      before: { notes: null },
      after: { notes },
    },
  });

  return { success: true };
}

/**
 * Issue a refund for an order.
 * 07-api.md §22 — POST /admin/orders/:id/refund
 */
export async function adminRefundOrder(
  orderId: string,
  params: {
    reason: string;
    gatewayRefundReference: string;
    refundAmountThb: number;
    voidCodes: boolean;
  },
  adminId: string,
  adminEmail: string
): Promise<{
  success: boolean;
  data?: {
    orderId: string;
    status: string;
    refundedAt: Date;
    codesVoided: number;
  };
  error?: string;
}> {
  const order = mockOrders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'ORDER_NOT_FOUND' };
  }

  if (order.status === 'refunded') {
    return { success: false, error: 'ALREADY_REFUNDED' };
  }

  if (params.refundAmountThb > order.totalAmountThb) {
    return { success: false, error: 'REFUND_AMOUNT_EXCEEDS_ORDER' };
  }

  if (!params.gatewayRefundReference) {
    return { success: false, error: 'GATEWAY_REF_REQUIRED' };
  }

  const previousStatus = order.status;
  order.status = 'refunded';

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'refund_issued',
    tableName: 'store.orders',
    recordId: orderId,
    diff: {
      before: { status: previousStatus },
      after: { status: 'refunded' },
    },
    metadata: {
      orderNumber: order.orderNumber,
      gatewayRefundReference: params.gatewayRefundReference,
      refundAmountThb: params.refundAmountThb,
      reason: params.reason,
      voidCodes: params.voidCodes,
    },
  });

  return {
    success: true,
    data: {
      orderId,
      status: 'refunded',
      refundedAt: new Date(),
      codesVoided: params.voidCodes ? order.itemCount : 0,
    },
  };
}
