import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Mail, FileText, CheckCircle } from 'lucide-react';

import { Navbar } from '@/components/layout/Navbar';

export const dynamic = 'force-dynamic';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { Breadcrumb } from '@/components/data-display/Breadcrumb';
import { TrustBadgeRow } from '@/components/checkout/TrustBadgeRow';
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge';
import { getTopLevelCategories } from '@/lib/data';
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

  const order = getOrderByConfirmationUuid(uuid);
  if (!order) notFound();

  const categories = await getTopLevelCategories();
  const isCompleted = order.status === 'completed';
  const isPendingPayment = order.status === 'pending_payment';
  const isPendingManual = order.status === 'pending_manual_fulfilment';

  return (
    <>
      <Navbar
        categories={categories.map((c) => ({
          ...c,
          children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
        }))}
      />

      <main>
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
            <div className="mb-8 rounded-md border border-ink-700 bg-ink-850 p-6 text-center">
              <div className="mb-4 flex justify-center">
                {isCompleted ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-jade-900/30">
                    <CheckCircle size={28} className="text-jade-400" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/30">
                    <Clock size={28} className="text-amber-400" />
                  </div>
                )}
              </div>

              <h1 className="mb-2 font-display text-2xl font-bold text-ink-100">
                {isCompleted
                  ? 'ชำระเงินสำเร็จ'
                  : isPendingManual
                    ? 'กำลังดำเนินการ'
                    : 'รอการชำระเงิน'}
              </h1>

              <div className="mb-4">
                <OrderStatusBadge status={order.status as any} />
              </div>

              <p className="text-sm text-ink-400">
                {isCompleted
                  ? 'โค้ดของคุณพร้อมใช้งานแล้ว — ตรวจสอบอีเมลหรือดูด้านล่าง'
                  : isPendingManual
                    ? 'โค้ดจะถูกส่งภายใน 2 ชั่วโมง — ตรวจสอบสถานะได้ที่นี่'
                    : 'คำสั่งซื้อของคุณถูกบันทึกไว้แล้ว — กรุณาดำเนินการชำระเงิน'}
              </p>

              {/* Order number */}
              <div className="mt-6 rounded-md border border-ink-700 bg-ink-800 px-4 py-3">
                <p className="text-xs text-ink-400">หมายเลขคำสั่งซื้อ</p>
                <p className="font-mono text-lg font-bold text-amber-300">
                  {order.orderNumber}
                </p>
              </div>
            </div>

            {/* Codes (if delivered) */}
            {isCompleted && (
              <div className="mb-6 rounded-md border border-jade-700/30 bg-jade-900/10 p-6">
                <h2 className="mb-4 text-lg font-semibold text-jade-200">
                  โค้ดของคุณ
                </h2>
                <p className="mb-4 text-sm text-ink-300">
                  โปรดนำโค้ดไปใช้ตามวิธีการใช้งานของแต่ละสินค้า
                </p>

                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-amber-700/30 bg-ink-850 p-4 shadow-code-glow"
                    >
                      <p className="mb-2 text-sm text-ink-300">
                        {item.productNameTh} × {item.quantity}
                      </p>
                      <p className="font-mono text-sm text-amber-300">
                        โค้ดจะแสดงหลังการชำระเงินสำเร็จ
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order Details */}
            <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
              <h2 className="mb-4 text-lg font-semibold text-ink-100">รายละเอียดคำสั่งซื้อ</h2>

              {/* Items */}
              <div className="mb-4 space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-800 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-100">
                        {item.productNameTh}
                      </p>
                      <p className="text-xs text-ink-400">
                        {item.skuCode} × {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-ink-200">
                      {formatThb(item.lineTotalThb)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="border-t border-ink-700 pt-4">
                <div className="flex items-center justify-between text-sm text-ink-300">
                  <span>ยอดรวม</span>
                  <span>{formatThb(order.subtotalThb)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-ink-300">
                  <span>VAT 7%</span>
                  <span>{formatThb(order.vatAmountThb)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-ink-700 pt-2">
                  <span className="font-bold text-ink-100">รวมทั้งสิ้น</span>
                  <span className="text-lg font-bold text-amber-300">
                    {formatThb(order.totalAmountThb)}
                  </span>
                </div>
              </div>

              {/* Email */}
              <div className="mt-4 flex items-center gap-2 text-sm text-ink-400">
                <Mail size={14} />
                <span>อีเมล: {order.customerEmail}</span>
              </div>

              {order.requiresTaxInvoice && (
                <div className="mt-2 flex items-center gap-2 text-sm text-ink-400">
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
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-5 py-3 text-base font-semibold text-ink-900 hover:bg-amber-300"
                >
                  ดำเนินการชำระเงิน
                </Link>
              )}

              <Link
                href="/"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-5 py-3 text-base font-medium text-ink-200 hover:border-ink-400 hover:text-ink-100"
              >
                <ArrowLeft size={16} />
                กลับหน้าหลัก
              </Link>

              <TrustBadgeRow className="mt-4" />
            </div>
          </div>
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
