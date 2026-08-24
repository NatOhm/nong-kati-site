/**
 * Refund Policy — 00-project-charter.md §12.5.
 * Content pending founder's legal review.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'นโยบายการคืนเงิน — Nong-Kati',
  description: 'นโยบายการคืนเงินของ Nong-Kati',
};

export default function RefundPolicyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold text-ink-100">นโยบายการคืนเงิน</h1>
      <p className="mb-4 text-xs text-ink-500">อัปเดตล่าสุด: 24 สิงหาคม 2569</p>

      <div className="space-y-6 text-sm leading-relaxed text-ink-300">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">1. เงื่อนไขการคืนเงิน</h2>
          <p>
            คุณสามารถขอคืนเงินได้ภายใน 7 วันนับจากวันที่สั่งซื้อ
            หากไม่ได้รับรหัสโค้ด หรือรหัสโค้ดไม่สามารถใช้งานได้
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">2. กรณีที่ไม่สามารถคืนเงินได้</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>รหัสโค้ดถูกใช้งานแล้ว</li>
            <li>สั่งซื้อเกิน 7 วัน</li>
            <li>กรณีที่ไม่ได้เป็นข้อผิดพลาดของระบบ</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">3. วิธีการขอคืนเงิน</h2>
          <p>
            ติดต่อเราที่{' '}
            <a href="mailto:support@nong-kati.co.th" className="text-amber-400 hover:text-amber-300">
              support@nong-kati.co.th
            </a>{' '}
            พร้อมหมายเลขคำสั่งซื้อและเหตุผลในการขอคืนเงิน
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">4. ระยะเวลาดำเนินการ</h2>
          <p>
            การคืนเงินจะดำเนินการภายใน 3-5 วันทำการหลังจากได้รับการอนุมัติ
          </p>
        </section>
      </div>
    </div>
  );
}
