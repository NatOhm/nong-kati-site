import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getCustomerFromToken } from '@/api/customerAuth';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/** Orders that have been paid — only those get documents. */
const PAID_STATUSES = ['payment_confirmed', 'code_delivered', 'completed', 'refunded'];

/**
 * GET /api/v1/account/documents — receipts + tax invoices for the
 * signed-in customer's paid orders (account ใบเสร็จ/ใบกำกับ pages).
 * Document numbers are deterministic (RCPT-<orderNumber>) so the listing
 * stays stable without persisting rows; a persisted Invoice row is used
 * for the number when one already exists (admin-issued).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { customerId: session.id, status: { in: PAID_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmountThb: true,
      createdAt: true,
      requiresTaxInvoice: true,
      invoices: { select: { invoiceNumber: true, invoiceType: true } },
    },
  });

  interface Doc {
    id: string;
    type: 'receipt' | 'tax_invoice';
    documentNumber: string;
    orderNumber: string;
    amountThb: number;
    date: string;
    orderId: string;
  }
  const documents = orders.flatMap((o): Doc[] => {
    const receiptNo =
      o.invoices.find((i) => i.invoiceType === 'receipt')?.invoiceNumber ?? `RCPT-${o.orderNumber}`;
    const docs: Doc[] = [
      {
        id: `${o.id}-receipt`,
        type: 'receipt',
        documentNumber: receiptNo,
        orderNumber: o.orderNumber,
        amountThb: Number(o.totalAmountThb),
        date: o.createdAt.toISOString(),
        orderId: o.id,
      },
    ];
    if (o.requiresTaxInvoice) {
      docs.push({
        id: `${o.id}-tax`,
        type: 'tax_invoice',
        documentNumber:
          o.invoices.find((i) => i.invoiceType === 'tax_invoice')?.invoiceNumber ??
          `TAX-${o.orderNumber}`,
        orderNumber: o.orderNumber,
        amountThb: Number(o.totalAmountThb),
        date: o.createdAt.toISOString(),
        orderId: o.id,
      });
    }
    return docs;
  });

  return NextResponse.json({ documents });
}

/**
 * GET the document itself: /api/v1/account/documents?orderId=…&type=receipt
 * Renders the same HTML document the PDF pipeline produces (server-side,
 * session-checked — nobody can fetch another customer's receipt).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: { orderId?: unknown; type?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const type = body.type === 'tax_invoice' ? 'tax_invoice' : 'receipt';
  if (!orderId) return NextResponse.json({ error: 'ORDER_REQUIRED' }, { status: 400 });

  // Ownership check: the order must belong to the session customer.
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: session.id, status: { in: PAID_STATUSES } },
    include: {
      items: {
        select: {
          productNameTh: true,
          skuCode: true,
          denominationThb: true,
          quantity: true,
          unitPriceExVat: true,
          unitVatAmount: true,
          lineTotalThb: true,
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const documentNumber =
    type === 'tax_invoice' ? `TAX-${order.orderNumber}` : `RCPT-${order.orderNumber}`;

  // Seller tax identity comes from validated admin settings (review
  // 2026-09-26: the template previously fell back to placeholder tax data).
  // Buyer identity comes from the order's tax-invoice fields when the
  // customer requested one.
  const [sellerName, sellerTaxId, sellerAddress, sellerEmail] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'seller_tax_name' } }),
    prisma.siteSetting.findUnique({ where: { key: 'seller_tax_id' } }),
    prisma.siteSetting.findUnique({ where: { key: 'seller_tax_address' } }),
    prisma.siteSetting.findUnique({ where: { key: 'seller_tax_email' } }),
  ]);

  // Reuse the shared document generator (same HTML the PDF pipeline renders).
  const { generateReceiptPdf, generateTaxInvoicePdf } = await import('@/lib/pdf/receipt');
  const data = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: documentNumber,
    invoiceType: type as 'receipt' | 'tax_invoice',
    customerEmail: order.customerEmail,
    ...(order.taxInvoiceName ? { buyerName: order.taxInvoiceName } : {}),
    ...(order.taxInvoiceTaxId ? { buyerTaxId: order.taxInvoiceTaxId } : {}),
    ...(sellerName?.value ? { sellerName: sellerName.value } : {}),
    ...(sellerTaxId?.value ? { sellerTaxId: sellerTaxId.value } : {}),
    ...(sellerAddress?.value ? { sellerAddress: sellerAddress.value } : {}),
    ...(sellerEmail?.value ? { sellerEmail: sellerEmail.value } : {}),
    items: order.items.map((i) => ({
      productNameTh: i.productNameTh,
      skuCode: i.skuCode,
      denominationThb: Number(i.denominationThb),
      quantity: i.quantity,
      unitPriceExVat: Number(i.unitPriceExVat),
      unitVatAmount: Number(i.unitVatAmount),
      lineTotalThb: Number(i.lineTotalThb),
    })),
    subtotalThb: Number(order.subtotalThb),
    vatAmountThb: Number(order.vatAmountThb),
    totalAmountThb: Number(order.totalAmountThb),
    createdAt: order.createdAt.toISOString(),
  };
  const result =
    type === 'tax_invoice' ? await generateTaxInvoicePdf(data) : await generateReceiptPdf(data);
  if (!result.success || !result.buffer) {
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  });
}
