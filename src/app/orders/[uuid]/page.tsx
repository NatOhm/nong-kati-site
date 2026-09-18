import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';

import { FacebookLayout } from '@/components/layout/FacebookLayout';

export const dynamic = 'force-dynamic';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { OrderDetailCard } from '@/components/order/OrderDetailCard';
import { TrustBadgeRow } from '@/components/checkout/TrustBadgeRow';
import { getOrderByConfirmationUuid } from '@/api/orders';

interface OrderDetailPageProps {
  params: Promise<{ uuid: string }>;
}

/**
 * Order Detail page — per UF-03.
 * Guest order retrieval by confirmation UUID.
 * Shows order status, codes (if delivered), and resend button.
 */
export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps): Promise<React.JSX.Element> {
  const { uuid } = await params;

  const order = await getOrderByConfirmationUuid(uuid);
  if (!order) notFound();

  // Map order status to OrderStatus type
  const orderStatus = order.status as
    | 'pending_payment'
    | 'payment_confirmed'
    | 'code_delivered'
    | 'completed'
    | 'pending_manual_fulfilment'
    | 'failed'
    | 'refunded'
    | 'expired';

  return (
    <>
      <FacebookLayout>
        <PageShell maxWidth="prose">
          <div className="py-8">
            {/* Breadcrumb */}
            <Breadcrumb
              className="mb-6"
              items={[
                { label: 'หน้าหลัก', href: '/' },
                { label: 'ค้นหาคำสั่งซื้อ', href: '/orders/lookup' },
                { label: order.orderNumber },
              ]}
            />

            {/* Order Detail */}
            <OrderDetailCard
              order={{
                id: order.id,
                orderNumber: order.orderNumber,
                status: orderStatus,
                createdAt: order.createdAt,
                items: order.items.map((item) => ({
                  productNameTh: item.productNameTh,
                  skuCode: item.skuCode,
                  denominationThb: Number(item.denominationThb),
                  quantity: item.quantity,
                  lineTotalThb: Number(item.lineTotalThb),
                })),
                codes: [], // Codes would be populated by delivery pipeline
                subtotalThb: Number(order.subtotalThb),
                vatAmountThb: Number(order.vatAmountThb),
                totalAmountThb: Number(order.totalAmountThb),
                customerEmail: order.customerEmail,
              }}
            />

            {/* Actions */}
            <div className="mt-6 space-y-3">
              <Link
                href="/orders/lookup"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3 text-base font-medium text-fg-secondary hover:border-clay-400 hover:text-fg"
              >
                <Search size={16} />
                ค้นหาคำสั่งซื้ออื่น
              </Link>

              <Link
                href="/"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3 text-base font-medium text-fg-secondary hover:border-clay-400 hover:text-fg"
              >
                <ArrowLeft size={16} />
                กลับหน้าหลัก
              </Link>

              <TrustBadgeRow className="mt-4" />
            </div>
          </div>
        </PageShell>
      </FacebookLayout>

      <Footer />
    </>
  );
}
