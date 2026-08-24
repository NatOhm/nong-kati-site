/**
 * Terms of Service — 00-project-charter.md §12.5.
 * Content pending founder's legal review.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ข้อกำหนดการใช้งาน — Nong-Kati',
  description: 'ข้อกำหนดการใช้งานเว็บไซต์ Nong-Kati',
};

export default function TermsOfServicePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold text-ink-100">ข้อกำหนดการใช้งาน</h1>
      <p className="mb-4 text-xs text-ink-500">อัปเดตล่าสุด: 24 สิงหาคม 2569</p>

      <div className="space-y-6 text-sm leading-relaxed text-ink-300">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">1. การยอมรับข้อกำหนด</h2>
          <p>
            การเข้าถึงและใช้งานเว็บไซต์ Nong-Kati ถือว่าคุณยอมรับข้อกำหนดการใช้งานนี้
            หากคุณไม่ยอมรับ กรุณาหยุดใช้งานเว็บไซต์
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">2. คำจำกัดความ</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>&quot;สินค้าดิจิทัล&quot; หมายถึงรหัสของขวัญ (gift codes) ที่จัดส่งทางอิเล็กทรอนิกส์</li>
            <li>&quot;ผู้ใช้&quot; หมายถึงบุคคลใดก็ตามที่เข้าถึงหรือใช้งานเว็บไซต์</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">3. การสั่งซื้อและการชำระเงิน</h2>
          <p>
            ราคาสินค้าทั้งหมดแสดงเป็นบาทไทย (THB) รวม VAT 7% แล้ว
            การชำระเงินดำเนินการผ่านผู้ให้บริการชำระเงินที่ได้รับการรับรอง
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">4. การคืนเงิน</h2>
          <p>
            นโยบายการคืนเงินเป็นไปตาม{' '}
            <a href="/legal/refund-policy" className="text-amber-400 hover:text-amber-300">
              นโยบายการคืนเงิน
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">5. การติดต่อ</h2>
          <p>
            หากมีคำถาม กรุณาติดต่อที่{' '}
            <a href="mailto:support@nong-kati.co.th" className="text-amber-400 hover:text-amber-300">
              support@nong-kati.co.th
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
