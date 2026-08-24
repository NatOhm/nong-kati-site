/**
 * Privacy Policy — 13-security.md §13.1, 00-project-charter.md §12.5.
 * Content pending founder's legal review — engineering ships the route.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว — Nong-Kati',
  description: 'นโยบายความเป็นส่วนตัวของ Nong-Kati ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562',
};

export default function PrivacyPolicyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold text-ink-100">นโยบายความเป็นส่วนตัว</h1>
      <p className="mb-4 text-xs text-ink-500">อัปเดตล่าสุด: 24 สิงหาคม 2569</p>

      <div className="space-y-6 text-sm leading-relaxed text-ink-300">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">1. บทนำ</h2>
          <p>
            Nong-Kati (&quot;เรา&quot;) ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของคุณ
            นโยบายนี้อธิบายวิธีที่เราเก็บรวบรวม ใช้ และปกป้องข้อมูลส่วนบุคคลของคุณ
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">2. ข้อมูลที่เราเก็บรวบรวม</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>อีเมลและหมายเลขโทรศัพท์ (เมื่อดำเนินการสั่งซื้อ)</li>
            <li>ข้อมูลการชำระเงิน (ไม่เก็บหมายเลขบัตรเครดิต — ประมวลผลโดยผู้ให้บริการชำระเงิน)</li>
            <li>ประวัติการสั่งซื้อ</li>
            <li>ข้อมูลการเข้าสู่ระบบ (IP address, เวลาเข้าสู่ระบบ)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">3. วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>ดำเนินการสั่งซื้อและส่งมอบสินค้าดิจิทัล</li>
            <li>ป้องกันการทุจริต</li>
            <li>ส่งการแจ้งเตือนที่เกี่ยวข้องกับคำสั่งซื้อ</li>
            <li>ปรับปรุงประสบการณ์การใช้งาน</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">4. สิทธิของคุณ</h2>
          <p>ภายใต้ PDPA คุณมีสิทธิ์:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>ขอเข้าถึงข้อมูลส่วนบุคคลของคุณ</li>
            <li>ขอแก้ไขข้อมูลให้ถูกต้อง</li>
            <li>ขอลบหรือทำให้ข้อมูลเป็นนิรนาม</li>
            <li>ขอคัดค้านการประมวลผลข้อมูล</li>
            <li>ขอโอนย้ายข้อมูล</li>
            <li>ถอนความยินยอม</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink-100">5. การติดต่อ</h2>
          <p>
            หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว กรุณาติดต่อเราที่{' '}
            <a href="mailto:privacy@nong-kati.co.th" className="text-amber-400 hover:text-amber-300">
              privacy@nong-kati.co.th
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
