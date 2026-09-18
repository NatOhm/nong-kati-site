import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Mail, FileText, CheckCircle } from 'lucide-react';

import { FacebookLayout } from '@/components/layout/FacebookLayout';

export const dynamic = 'force-dynamic';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { TrustBadgeRow } from '@/components/checkout/TrustBadgeRow';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { getOrderByConfirmationUuid } from '@/api/orders';
import { getAvailableCodeCount } from '@/lib/delivery/reservation';
import { formatThb } from '@/lib/pricing';

interface ConfirmationPageProps {
  params: Promise<{ uuid: string }>;
}

/**
 * Order Confirmation page — per UF-01 Step 3.
 * Shows order status, codes (if delivered), and payment state.
 */
export default async function ConfirmationPage({
  params,
}: ConfirmationPageProps): Promise<React.JSX.Element> {
  const { uuid } = await params;

  const order = await getOrderByConfirmationUuid(uuid);
  if (!order) notFound();

  const isCompleted = order.status === 'completed';
  const isPendingPayment = order.status === 'pending_payment';
  const isPendingManual = order.status === 'pending_manual_fulfilment';

  return (
    <>
      <FacebookLayout>
        <PageShell>
          {/* Breadcrumb */}
          <Breadcrumb
            className="py-4"
            items={[
              { label: 'หน้าหลัก', href: '/' },
              { label: 'ชำระเงิน', href: '/checkout' },
              { label: 'ยืนยันคำสั่งซื้อ' },
            ]}
          />

          <div className="mx-auto max-w-2xl pb-16">
            {/* Order Status Header */}
            <div className="mb-8 rounded-md border border-line-subtle bg-white p-6 text-center">
              <div className="mb-4 flex justify-center">
                {isCompleted ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-jade-500/15">
                    <CheckCircle size={28} className="text-jade-600" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-peach-100">
                    <Clock size={28} className="text-fg-brand" />
                  </div>
                )}
              </div>

              <h1 className="mb-2 font-display text-2xl font-bold text-fg">
                {isCompleted
                  ? 'ชำระเงินสำเร็จ'
                  : isPendingManual
                    ? 'กำลังดำเนินการ'
                    : 'รอการชำระเงิน'}
              </h1>

              <div className="mb-4">
                <OrderStatusBadge status={order.status as any} />
              </div>

              <p className="text-sm text-fg-placeholder">
                {isCompleted
                  ? 'โค้ดของคุณพร้อมใช้งานแล้ว — ตรวจสอบอีเมลหรือดูด้านล่าง'
                  : isPendingManual
                    ? 'โค้ดจะถูกส่งภายใน 2 ชั่วโมง — ตรวจสอบสถานะได้ที่นี่'
                    : 'คำสั่งซื้อของคุณถูกบันทึกไว้แล้ว — กรุณาดำเนินการชำระเงิน'}
              </p>

              {/* Order number */}
              <div className="mt-6 rounded-md border border-line-subtle bg-surface px-4 py-3">
                <p className="text-xs text-fg-placeholder">หมายเลขคำสั่งซื้อ</p>
                <p className="font-mono text-lg font-bold text-fg-brand">{order.orderNumber}</p>
              </div>
            </div>

            {/* Codes (if delivered) */}
            {isCompleted && (
              <div className="mb-6 rounded-md border border-jade-500/30 bg-jade-500/10 p-6">
                <h2 className="mb-4 text-lg font-semibold text-jade-200">โค้ดของคุณ</h2>
                <p className="mb-4 text-sm text-fg-muted">
                  โปรดนำโค้ดไปใช้ตามวิธีการใช้งานของแต่ละสินค้า
                </p>

                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-line-brand bg-white p-4 shadow-code-glow"
                    >
                      <p className="mb-2 text-sm text-fg-muted">
                        {item.productNameTh} × {item.quantity}
                      </p>
                      <p className="font-mono text-sm text-fg-brand">
                        โค้ดจะแสดงหลังการชำระเงินสำเร็จ
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order Details */}
            <div className="rounded-md border border-line-subtle bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-fg">รายละเอียดคำสั่งซื้อ</h2>

              {/* Items */}
              <div className="mb-4 space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-line-subtle bg-surface p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-fg">{item.productNameTh}</p>
                      <p className="text-xs text-fg-placeholder">
                        {item.skuCode} × {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-fg-secondary">
                      {formatThb(item.lineTotalThb)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="border-t border-line-subtle pt-4">
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>ยอดรวม</span>
                  <span>{formatThb(order.subtotalThb)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>VAT 7%</span>
                  <span>{formatThb(order.vatAmountThb)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-2">
                  <span className="font-bold text-fg">รวมทั้งสิ้น</span>
                  <span className="text-lg font-bold text-fg-brand">
                    {formatThb(order.totalAmountThb)}
                  </span>
                </div>
              </div>

              {/* Email */}
              <div className="mt-4 flex items-center gap-2 text-sm text-fg-placeholder">
                <Mail size={14} />
                <span>อีเมล: {order.customerEmail}</span>
              </div>

              {order.requiresTaxInvoice && (
                <div className="mt-2 flex items-center gap-2 text-sm text-fg-placeholder">
                  <FileText size={14} />
                  <span>ใบกำกับภาษีจะออกให้หลังชำระเงิน</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {isPendingPayment && (
                <Link
                  href="/checkout"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-500 px-5 py-3 text-base font-semibold text-white hover:bg-peach-400"
                >
                  ดำเนินการชำระเงิน
                </Link>
              )}

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
