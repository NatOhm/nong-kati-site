/** Admin order search, customer history, and masked order delivery reveal. */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { checkPermission, maskEmail, maskPhone } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import { decryptCode } from '@/lib/crypto/giftCode';

export const dynamic = 'force-dynamic';

const REVEALABLE_CODE_STATUSES = new Set(['available', 'reserved', 'delivered']);

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/** GET /api/v1/admin/orders/search */
export async function GET_search(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'orders:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const orderNumber = url.searchParams.get('orderNumber');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const requestedTake = Number(url.searchParams.get('take') ?? 50);
  if (!Number.isInteger(requestedTake) || requestedTake < 1) {
    return NextResponse.json({ error: 'INVALID_TAKE' }, { status: 400 });
  }
  const take = Math.min(requestedTake, 200);
  const fullAccess = check.payload!.perms.includes('orders:read:full');

  const where: Prisma.OrderWhereInput = {};
  if (email) where.customerEmail = { contains: email, mode: 'insensitive' as const };
  if (orderNumber) where.orderNumber = { contains: orderNumber, mode: 'insensitive' as const };
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const searchRows = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      customerEmail: true,
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      subtotalThb: true,
      discountThb: true,
      totalAmountThb: true,
      manualFulfilmentReason: true,
      slipImageUrl: true,
      slipUploadedAt: true,
      createdAt: true,
      completedAt: true,
      _count: { select: { items: true } },
      paymentAttempts: {
        where: { slipVerifiedRef: { not: null } },
        select: { slipVerifiedRef: true, amountThb: true, slipVerifiedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const mappedOrders = searchRows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerEmail: fullAccess ? o.customerEmail : maskEmail(o.customerEmail),
    status: o.status,
    paymentMethod: o.paymentMethod,
    subtotalThb: Number(o.subtotalThb),
    discountThb: Number(o.discountThb),
    totalThb: Number(o.totalAmountThb),
    itemCount: o._count.items,
    manualFulfilmentReason: o.manualFulfilmentReason,
    slipImageUrl: o.slipImageUrl,
    slipUploadedAt: o.slipUploadedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt?.toISOString() ?? null,
    slip:
      o.paymentAttempts[0] !== undefined
        ? {
            ref: o.paymentAttempts[0].slipVerifiedRef ?? '',
            amountThb: Number(o.paymentAttempts[0].amountThb ?? 0),
            verifiedAt:
              o.paymentAttempts[0].slipVerifiedAt instanceof Date
                ? o.paymentAttempts[0].slipVerifiedAt.toISOString()
                : null,
          }
        : null,
  }));

  const groupResult = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } });
  const statusCounts = Object.fromEntries(
    groupResult.map((s) => [s.status, s._count._all] as const),
  );

  return NextResponse.json({
    orders: mappedOrders,
    statusCounts,
  });
}

/** GET /api/v1/admin/customers/:id/history */
export async function GET_customerHistory(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'customers:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const fullAccess = check.payload!.perms.includes('customers:read:full');

  const historyCustomer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  if (!historyCustomer) {
    return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  }

  const historyRows = await prisma.order.findMany({
    where: { customerId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      subtotalThb: true,
      vatAmountThb: true,
      discountThb: true,
      totalAmountThb: true,
      manualFulfilmentReason: true,
      requiresTaxInvoice: true,
      createdAt: true,
      completedAt: true,
      confirmationUuid: true,
      slipImageUrl: true,
      slipUploadedAt: true,
      paymentAttempts: {
        where: { slipVerifiedRef: { not: null } },
        select: { slipVerifiedRef: true, slipVerifiedAt: true, slipReceiverAccount: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      items: {
        select: {
          id: true,
          productNameTh: true,
          skuCode: true,
          quantity: true,
          lineTotalThb: true,
          deliveryStatus: true,
          ...(fullAccess
            ? {
                finalLineTotalThb: true,
                finalLineExVat: true,
                finalLineVatAmount: true,
                couponDiscountThb: true,
                promotionDiscountThb: true,
                giftCodes: { select: { id: true, status: true, createdAt: true, updatedAt: true } },
              }
            : {}),
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return NextResponse.json({
    id: historyCustomer.id,
    email: fullAccess ? historyCustomer.email : maskEmail(historyCustomer.email),
    phone: fullAccess ? historyCustomer.phoneNumber : maskPhone(historyCustomer.phoneNumber),
    createdAt: historyCustomer.createdAt.toISOString(),
    orderCount: historyCustomer._count.orders,
    orders: historyRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMethod: o.paymentMethod,
      subtotalThb: Number(o.subtotalThb),
      vatAmountThb: Number(o.vatAmountThb),
      discountThb: Number(o.discountThb),
      totalAmountThb: Number(o.totalAmountThb),
      manualFulfilmentReason: o.manualFulfilmentReason,
      requiresTaxInvoice: o.requiresTaxInvoice,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      slip:
        o.paymentAttempts[0] !== undefined
          ? {
              ref: o.paymentAttempts[0].slipVerifiedRef ?? '',
              verifiedAt: o.paymentAttempts[0].slipVerifiedAt instanceof Date
                ? o.paymentAttempts[0].slipVerifiedAt.toISOString()
                : null,
              receiverAccount: o.paymentAttempts[0].slipReceiverAccount,
            }
          : null,
      slipImageUrl: o.slipImageUrl,
      slipUploadedAt: o.slipUploadedAt?.toISOString() ?? null,
      items: o.items.map((i) => ({
        id: i.id,
        productNameTh: i.productNameTh,
        skuCode: i.skuCode,
        quantity: i.quantity,
        lineTotalThb: Number(i.lineTotalThb ?? 0),
        deliveryStatus: i.deliveryStatus ?? null,
        ...(fullAccess
          ? {
              finalLineTotalThb: Number(i.finalLineTotalThb ?? 0),
              finalLineExVat: Number(i.finalLineExVat ?? 0),
              finalLineVatAmount: Number(i.finalLineVatAmount ?? 0),
              couponDiscountThb: Number(i.couponDiscountThb ?? 0),
              promotionDiscountThb: Number(i.promotionDiscountThb ?? 0),
              giftCodes: i.giftCodes?.map((g) => ({
                id: g.id,
                status: g.status ?? null,
                createdAt: g.createdAt instanceof Date
                  ? g.createdAt.toISOString()
                  : null,
                updatedAt: g.updatedAt instanceof Date
                  ? g.updatedAt.toISOString()
                  : null,
              })),
            }
          : {}),
      })),
    })),
    ...(fullAccess ? { revealedPii: { email: historyCustomer.email, phone: historyCustomer.phoneNumber } } : {}),
  });
}

/** GET /api/v1/admin/orders/:id/delivery */
export async function GET_delivery(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'orders:delivery:reveal');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const fullReveal = check.payload!.perms.includes('orders:delivery:reveal');

  const deliveryOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          giftCodes: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!deliveryOrder) {
    return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }

  const lines: Array<Record<string, unknown>> = deliveryOrder.items.map((item) => {
    const codes = (item.giftCodes ?? []).map((g) => ({
      id: g.id,
      status: g.status ?? null,
      createdAt: g.createdAt instanceof Date
        ? g.createdAt.toISOString()
        : null,
    }));
    return {
      itemId: item.id,
      productNameTh: item.productNameTh,
      skuCode: item.skuCode,
      deliveryStatus: item.deliveryStatus ?? null,
      latestCode: codes[0] ?? null,
      codesCount: codes.length,
    };
  });

  const responseBody: Record<string, unknown> = {
    id: deliveryOrder.id,
    orderNumber: deliveryOrder.orderNumber,
    lines,
    revealedCodes: [],
  };

  if (!fullReveal) {
    return NextResponse.json(responseBody);
  }

  const revealed: Array<Record<string, unknown>> = [];
  for (const item of deliveryOrder.items) {
    for (const g of item.giftCodes ?? []) {
      if (
        !g?.codeEncrypted ||
        !g.nonce ||
        !g.codeHash ||
        !REVEALABLE_CODE_STATUSES.has(g.status)
      ) {
        continue;
      }

      let plaintext: string;
      try {
        plaintext = decryptCode(g.codeEncrypted, g.nonce, g.keyVersion);
      } catch {
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await writeAuditLog({
          actorType: 'admin',
          actorId: check.payload!.sub ?? 'unknown',
          actorEmail: check.payload!.email ?? '',
          action: 'order.delivery_revealed',
          tableName: 'Order',
          recordId: deliveryOrder.id,
          diff: null,
          ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          metadata: {
            orderNumber: deliveryOrder.orderNumber,
            itemId: item.id,
            giftCodeId: g.id,
            codeStatus: g.status,
          },
          tx,
        });
      });

      revealed.push({
        itemId: item.id,
        productNameTh: item.productNameTh,
        skuCode: item.skuCode,
        code: plaintext,
        status: g.status ?? null,
        createdAt: g.createdAt instanceof Date
          ? g.createdAt.toISOString()
          : null,
      });
    }
  }

  responseBody['revealedCodes'] = revealed.length > 0 ? revealed : [];
  return NextResponse.json(responseBody);
}
