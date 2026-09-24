/**
 * Cookie Policy — 13-security.md §13.1.
 * Content pending founder's legal review.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'นโยบายคุกกี้',
  description: 'นโยบายคุกกี้ของ Nong-Kati',
};

export default function CookiePolicyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold text-fg">นโยบายคุกกี้</h1>
      <p className="text-clay-9000 mb-4 text-xs">อัปเดตล่าสุด: 24 สิงหาคม 2569</p>

      <div className="space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">1. คุกกี้คืออะไร</h2>
          <p>คุกกี้เป็นไฟล์ข้อมูลขนาดเล็กที่ถูกเก็บไว้ในอุปกรณ์ของคุณเมื่อคุณเข้าชมเว็บไซต์</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">2. ประเภทของคุกกี้ที่เราใช้</h2>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-fg-secondary">คุกกี้ที่จำเป็น</h3>
              <p className="text-xs text-fg-placeholder">
                จำเป็นสำหรับเว็บไซต์ทำงานได้อย่างถูกต้อง เช่น ตะกร้าสินค้า การเข้าสู่ระบบ
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-fg-secondary">คุกกี้เพื่อการวิเคราะห์</h3>
              <p className="text-xs text-fg-placeholder">
                ช่วยเราเข้าใจวิธีที่ผู้เข้าชมใช้เว็บไซต์ (Google Analytics)
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-fg-secondary">คุกกี้เพื่อการตลาด</h3>
              <p className="text-xs text-fg-placeholder">ใช้สำหรับแสดงโฆษณาที่เกี่ยวข้อง</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">3. การจัดการคุกกี้</h2>
          <p>
            คุณสามารถจัดการคุกกี้ได้ผ่าน Banner การตั้งค่าคุกกี้ที่แสดงในครั้งแรกที่เข้าชมเว็บไซต์
            หรือผ่านการตั้งค่าเบราว์เซอร์ของคุณ
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">4. การติดต่อ</h2>
          <p>
            หากมีคำถามเกี่ยวกับนโยบายคุกกี้ กรุณาติดต่อที่{' '}
            <a href="mailto:privacy@nong-kati.co.th" className="text-fg-brand hover:text-fg-brand">
              privacy@nong-kati.co.th
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
