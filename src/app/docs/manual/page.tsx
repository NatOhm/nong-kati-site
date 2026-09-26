import type { Metadata } from 'next';

import { PrintButton } from './PrintButton';
import s from './manual.module.css';

/**
 * /docs/manual — printable HTML edition of docs/admin-manual-th.md.
 * Client-facing: optimized for Ctrl+P → PDF (A4, Thai fonts, print styles).
 * Screen view = same document with a floating "Print / Save as PDF" button
 * that disappears in print output. Noindex — internal ops document.
 * Styles live in manual.module.css (inline <style> tags break hydration).
 */

export const metadata: Metadata = {
  title: 'คู่มือการใช้งานหลังบ้าน',
  description: 'คู่มือแอดมิน Nong-Kati: เติมสต๊อกโค้ด, เครดิตลูกค้า, ยืนยันสลิป, ส่งโค้ดให้ลูกค้า',
  robots: { index: false, follow: false },
};

const CHECK = '✓';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className={s['manual-section']} id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminManualPage(): React.JSX.Element {
  return (
    <div className={s['manual-wrap']}>
      <PrintButton />

      <article className={s['manual']}>
        <header className={s['manual-header']}>
          <h1>คู่มือการใช้งานหลังบ้าน (Admin Manual)</h1>
          <p className={s['manual-sub']}>Nong-Kati Store — สำหรับผู้ดูแลระบบ</p>
          <p className={s['manual-meta']}>
            อัปเดต: 22 กันยายน 2569 · ทุกขั้นตอนในเอกสารนี้ทดสอบแล้วจริง (ชุดทดสอบ A–E ผ่านครบ)
          </p>
        </header>

        <nav className={s['manual-toc']}>
          <h2>สารบัญ</h2>
          <ol>
            <li>
              <a href="#s1">เข้าสู่ระบบแอดมิน</a>
            </li>
            <li>
              <a href="#s2">เตรียมข้อมูลทดสอบด้วยปุ่มเดียว (เว็บทดสอบเท่านั้น)</a>
            </li>
            <li>
              <a href="#s3">เติมสต๊อกโค้ด (จัดการสต๊อก)</a>
            </li>
            <li>
              <a href="#s4">เพิ่มเครดิตให้ลูกค้า</a>
            </li>
            <li>
              <a href="#s5">โค้ดถึงมือลูกค้าได้ 3 ทาง</a>
            </li>
            <li>
              <a href="#s6">ยืนยันสลิปแมนนวล (คำสั่งซื้อ)</a>
            </li>
            <li>
              <a href="#s7">เครดิตไม่พอเกิดอะไรขึ้น</a>
            </li>
            <li>
              <a href="#s8">เคล็ดลับการใช้งานจริง</a>
            </li>
            <li>
              <a href="#s9">แบบทดสอบ A–E (ตรวจสอบว่าระบบปกติ)</a>
            </li>
            <li>
              <a href="#s10">ติดต่อ/แก้ปัญหา</a>
            </li>
          </ol>
        </nav>

        <Section id="s1" title="1. เข้าสู่ระบบแอดมิน">
          <ol>
            <li>
              เปิดหน้า <strong>/management/login</strong>
            </li>
            <li>
              กรอก <strong>อีเมล + รหัสผ่าน</strong>
            </li>
            <li>
              กด <strong>เข้าสู่ระบบ</strong> → ระบบจะถาม <strong>รหัส 6 หลัก</strong> จากแอป
              Authenticator (Google Authenticator / Authy)
            </li>
            <li>
              เปิดแอป Authenticator → ดูโค้ด 6 หลักของ &quot;Nong-Kati Admin&quot; → พิมพ์ลงช่อง →
              กด <strong>ยืนยัน</strong>
            </li>
          </ol>

          <h3>บัญชีที่มีในระบบ</h3>
          <table>
            <thead>
              <tr>
                <th>อีเมล</th>
                <th>สิทธิ์</th>
                <th>ใช้ทำอะไร</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>admin@nong-kati.co.th</code>
                </td>
                <td>ผู้ดูแลสูงสุด</td>
                <td>ทุกอย่าง</td>
              </tr>
              <tr>
                <td>
                  <code>catalogue@nong-kati.co.th</code>
                </td>
                <td>ผู้จัดการสินค้า</td>
                <td>สินค้า/หมวดหมู่/คลัง (เปลี่ยนรหัสผ่านครั้งแรก)</td>
              </tr>
              <tr>
                <td>
                  <code>orders@nong-kati.co.th</code>
                </td>
                <td>ผู้จัดการคำสั่งซื้อ</td>
                <td>คำสั่งซื้อ/ลูกค้า/รีวิว (เปลี่ยนรหัสผ่านครั้งแรก)</td>
              </tr>
            </tbody>
          </table>

          <div className={s['callout']}>
            <p>
              <strong>🔐 เคล็ดลับ TOTP:</strong> โค้ด 6 หลักเปลี่ยนทุก <strong>30 วินาที</strong>{' '}
              ถ้าพิมพ์ช้าหรือหมดเวลาพอดี ระบบจะขึ้น &quot;รหัสไม่ถูกต้อง&quot; — ไม่ต้องตกใจ
              รอโค้ดใหม่แล้ว<strong>เริ่มขั้นตอนเข้าสู่ระบบใหม่ทั้งหมด</strong> (พิมพ์รหัสผ่านใหม่ →
              ยืนยันด้วยโค้ดใหม่ทันที) ใช้เวลาไม่เกิน 15 วินาที
            </p>
            <p>
              ติ๊ก <strong>&quot;จดจำการเข้าสู่ระบบไว้ในเครื่องนี้ (30 วัน)&quot;</strong>{' '}
              เพื่อไม่ต้องยืนยัน 2FA บ่อย (เครื่องส่วนตัวเท่านั้น)
            </p>
          </div>

          <p>
            ลืมรหัสผ่าน/หลุด Authenticator → ให้ผู้ดูแลสูงสุดอีกคนปลดล็อก/รีเซ็ตให้ ที่หน้า{' '}
            <strong>เจ้าหน้าที่</strong> (Staff)
          </p>
        </Section>

        <Section id="s2" title="2. เตรียมข้อมูลทดสอบด้วยปุ่มเดียว (เว็บทดสอบเท่านั้น)">
          <div className={`${s['callout']} ${s['warn']}`}>
            <p>
              ⚠️ ใช้ได้เฉพาะบนเว็บทดสอบ (localhost / preview) —{' '}
              <strong>บนเว็บจริง (production) ปุ่มนี้ไม่มี</strong>
            </p>
          </div>
          <p>
            ไปที่ <strong>/management/dev-seed</strong> → กดปุ่ม{' '}
            <strong>🧪 สร้างข้อมูลทดสอบ</strong> หนึ่งครั้ง ระบบจะสร้าง:
          </p>
          <ul>
            <li>
              ลูกค้าทดสอบ พร้อม <strong>เครดิต ฿100</strong> (อีเมลแสดงบนหน้าจอทันที เช่น{' '}
              <code>seed-test-1790...@test.local</code>)
            </li>
            <li>
              <strong>โค้ดทดสอบ 2 ชิ้น</strong> ในสินค้าราคาถูกที่สุด (รูปแบบสั้น{' '}
              <code>seed…:test1234</code>)
            </li>
          </ul>
          <p>กดซ้ำได้เรื่อย ๆ ระบบจะเติมให้พอดี ไม่ซ้ำ</p>
          <p>ขั้นตอนต่อไปเพื่อทดสอบแบบครบวงจร:</p>
          <ol>
            <li>
              ตั้งรหัสผ่านให้ลูกค้าทดสอบ (แจ้งโปรแกรมเมอร์ หรือสมัครบัญชีใหม่แล้วปรับเครดิตเองแทน)
            </li>
            <li>ล็อกอินเป็นลูกค้า → ซื้อสินค้านั้นด้วยเครดิต → โค้ดจะขึ้นทันที (ดู §5)</li>
          </ol>
        </Section>

        <Section id="s3" title="3. เติมสต๊อกโค้ด (จัดการสต๊อก)">
          <p>
            สินค้าของเราคือ <strong>โค้ด/บัญชี</strong> — ต้องเติมโค้ดก่อนถึงจะขายได้
          </p>
          <ol>
            <li>
              <strong>สินค้า</strong> → หาแถวสินค้า → กดปุ่ม <strong>จัดการสต๊อก</strong>{' '}
              (ไอคอนรูปกุญแจ)
              <br />
              ใช้ได้ที่หน้า <strong>คลังสินค้า</strong> เช่นกัน (ช่องค้นหาพิมพ์ชื่อสินค้าหรือ Type
              ID ได้)
            </li>
            <li>
              เลือก <strong>รูปแบบข้อมูล:</strong>
              <ul>
                <li>
                  <strong>แบบสั้น (user:pass)</strong> — บัญชีทั่วไป หนึ่งบรรทัดต่อหนึ่งโค้ด เช่น
                  <pre>{'user01:pass1111\nuser02:pass2222'}</pre>
                  เลือกตัวคั่นได้: Comma / Semicolon / Tab (ถ้าข้อมูลเป็น <code>user,pass</code>)
                </li>
                <li>
                  <strong>แบบยาว (ข้อมูลหลายบรรทัด)</strong> — บัญชีที่มีข้อความยาว/อีโมจิ เช่น
                  บล็อก HBO
                  <ul>
                    <li>
                      <strong>บรรทัดว่าง 2 บรรทัดติดกัน = แยกบัญชี</strong> (บรรทัดว่าง 1
                      บรรทัดภายในบล็อกเดียวกันจะถูกเก็บไว้)
                    </li>
                    <li>ข้อความทั้งหมดในบล็อกจะส่งถึงลูกค้าตรงตามต้นฉบับ</li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>
              วางข้อมูลลงช่องใหญ่ → กด <strong>แยกข้อมูล</strong>
            </li>
            <li>
              ตรวจตัวอย่าง <strong>ไอดี #1, #2, …</strong> ให้ตรงกับจำนวนที่ต้องการ
              (&quot;จำนวนไอดีที่จะสร้าง: N&quot;)
            </li>
            <li>
              กด <strong>บันทึก</strong> — จบ
            </li>
          </ol>

          <h3>สิ่งที่ระบบทำให้อัตโนมัติหลังบันทึก</h3>
          <ul>
            <li>
              โค้ดถูก <strong>เข้ารหัส</strong> ก่อนเก็บ (คนอื่นดูข้อมูลดิบไม่ได้)
            </li>
            <li>
              จำนวน <strong>สต๊อก +N</strong> ทันที และบันทึกประวัติ{' '}
              <strong>StockMove (restock)</strong>
            </li>
            <li>
              วางไฟล์เดิมซ้ำ → ระบบ <strong>ข้ามโค้ดที่ซ้ำอัตโนมัติ</strong> ไม่เกิด error
            </li>
          </ul>

          <div className={s['callout']}>
            <p>
              💡 <strong>แบ่งโค้ดหลายสินค้า:</strong> สินค้าที่มีหลายแพ็กเกจ
              ระบบจะแจกโค้ดเข้าแพ็กเกจแบบวนรอบ ใช้บรรทัดขึ้นต้นด้วย <code>Label:</code>{' '}
              เพื่อระบุแพ็กเกจเฉพาะได้
            </p>
          </div>
        </Section>

        <Section id="s4" title="4. เพิ่มเครดิตให้ลูกค้า">
          <ol>
            <li>
              <strong>ลูกค้า</strong> → ค้นหาอีเมลลูกค้า → กด <strong>ดู</strong>
            </li>
            <li>
              ในกล่อง <strong>เครดิต/เงินในกระเป๋า</strong> จะเห็นยอดปัจจุบัน
            </li>
            <li>
              ใส่จำนวน: <code>100</code> = เพิ่ม ฿100 · <code>-50</code> = หัก ฿50 (ระบบจะถามยืนยัน)
            </li>
            <li>
              ใส่ <strong>หมายเหตุ</strong> เช่น &quot;โอนเงินเข้าธนาคาร 22/9&quot; → กด{' '}
              <strong>ปรับเครดิต</strong>
            </li>
          </ol>
          <p>
            ระบบบันทึกรายการใน <strong>ประวัติการเติมเงินของลูกค้า</strong> ให้อัตโนมัติ (แสดงเป็น
            &quot;แอดมินปรับเครดิต&quot;) ลูกค้าเห็นยอดทันทีที่หน้า{' '}
            <strong>บัญชี → กระเป๋าเงิน</strong>
          </p>
          <div className={`${s['callout']} ${s['warn']}`}>
            <p>
              ⚠️ หักเกินยอดไม่ได้ — ระบบปฏิเสธและยอดเดิมไม่ถูกแตะ ในตาราง <strong>ลูกค้า</strong>{' '}
              คอลัมน์ <strong>เครดิตคงเหลือ</strong> แสดงยอดทุกคน (สีเขียว = มีเครดิต)
            </p>
          </div>
        </Section>

        <Section id="s5" title="5. โค้ดถึงมือลูกค้าได้ 3 ทาง">
          <ol>
            <li>
              <strong>เครดิต (ทันทีที่สุด):</strong> ลูกค้าเลือก &quot;เครดิตในกระเป๋า&quot;
              ตอนชำระเงิน → ระบบหักเงิน + ส่งโค้ดในหน้าเดียวจบ
            </li>
            <li>
              <strong>PromptPay (อัตโนมัติ):</strong> ลูกค้าสแกน QR → ธนาคารแจ้งระบบอัตโนมัติ →
              โค้ดถูกส่งภายในไม่กี่วินาที (แอดมินไม่ต้องทำอะไร)
            </li>
            <li>
              <strong>สลิปแมนนวล (แอดมินกดยืนยัน):</strong> ดูหัวข้อ 6
            </li>
          </ol>

          <h3>ลูกค้าดูโค้ดได้ 3 จุด</h3>
          <ol>
            <li>หน้ายืนยันการชำระเงิน (ทันทีที่จ่ายเสร็จ)</li>
            <li>
              <strong>บัญชี → โค้ดของฉัน</strong> (/account/codes) — เก็บทุกโค้ดที่เคยซื้อ
            </li>
            <li>หน้ารายละเอียดคำสั่งซื้อของตัวเอง</li>
          </ol>

          <div className={s['callout']}>
            <p>
              💡 หากลูกค้าบอกว่า &quot;ยังไม่ได้รับโค้ด&quot; → ให้ดูสถานะออเดอร์ที่หัวข้อ 6
              ก่อนเสมอ
            </p>
          </div>
        </Section>

        <Section id="s6" title="6. ยืนยันสลิปแมนนวล (คำสั่งซื้อ)">
          <p>
            ใช้เมื่อลูกค้า <strong>โอนเงินแล้วแต่ระบบยังไม่จับได้</strong>{' '}
            (โอนผ่านธนาคารที่ไม่แจ้งระบบทันที / ส่งสลิปมาใน LINE)
          </p>
          <ol>
            <li>
              <strong>คำสั่งซื้อ</strong> → หาออเดอร์สถานะ <strong>รอชำระเงิน</strong>{' '}
              (ตรวจสลิปกับยอดและเวลา)
            </li>
            <li>
              กด <strong>ยืนยันการชำระเงิน</strong> หนึ่งครั้ง — ระบบจะ:
              <ul>
                <li>
                  เปลี่ยนสถานะเป็น <strong>สำเร็จ</strong>
                </li>
                <li>
                  <strong>ส่งโค้ดให้ลูกค้าทันที</strong> (ตัดสต๊อก + บันทึกประวัติให้เอง)
                </li>
              </ul>
            </li>
            <li>
              ถ้าขึ้น <strong>รอจัดส่งด้วยตนเอง</strong> = โค้ดไม่พอตอนนั้น → เติมโค้ดก่อน (หัวข้อ
              3) → กลับมากดยืนยัน/ลองใหม่ → ระบบส่งให้เอง
            </li>
          </ol>
          <div className={s['callout']}>
            <p>
              🔒 กดซ้ำไม่ได้ — ออเดอร์จ่ายแล้วจะถูกล็อก ไม่มีทางส่งโค้ดซ้ำ
              ทุกการยืนยันถูกบันทึกว่าใครกดเมื่อไร
            </p>
          </div>
        </Section>

        <Section id="s7" title="7. เครดิตไม่พอเกิดอะไรขึ้น">
          <p>ทดสอบแล้ว 3 สถานการณ์:</p>
          <table>
            <thead>
              <tr>
                <th>สถานการณ์</th>
                <th>ที่ลูกค้าเห็น</th>
                <th>ผลระบบ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>เครดิต ฿0</td>
                <td>
                  ตัวเลือกเครดิต<strong>หายไปเอง</strong> เหลือ PromptPay
                </td>
                <td>ไม่มีอะไรพัง</td>
              </tr>
              <tr>
                <td>เครดิตน้อยกว่าราคา</td>
                <td>&quot;ยอดเครดิตไม่พอ — เลือกชำระผ่าน PromptPay แทนได้เลย&quot;</td>
                <td>ยอดไม่ถูกหัก ออเดอร์ยังจ่ายได้</td>
              </tr>
              <tr>
                <td>ระบบขัดข้องชั่วคราว</td>
                <td>
                  &quot;ระบบเครดิตขัดข้องชั่วคราว&quot; →{' '}
                  <strong>เด้งไป QR PromptPay ให้เอง</strong>
                </td>
                <td>ลูกค้ายังซื้อต่อได้ ไม่ต้องเริ่มใหม่</td>
              </tr>
            </tbody>
          </table>
          <p className={s['emph']}>
            <strong>ไม่มีทางเกิด &quot;เงินถูกหักแต่ไม่ได้โค้ด&quot;</strong> —
            ระบบหักเงิน+ส่งโค้ดเป็นชุดเดียว ถ้าขั้นไหนล้มเหลวทุกอย่างย้อนกลับอัตโนมัติ
          </p>
        </Section>

        <Section id="s8" title="8. เคล็ดลับการใช้งานจริง">
          <h3>การเติมสต๊อก</h3>
          <ul>
            <li>
              เติมโค้ดก่อนโฆษณาสินค้าเสมอ — สินค้าที่สต๊อก 0 ขึ้น &quot;หมด&quot;
              และปิดปุ่มซื้อทันที
            </li>
            <li>คัดลอกจากไฟล์ Excel/Notion วางตรง ๆ ได้ ไม่ต้องแก้รูปแบบ</li>
            <li>
              สต๊อกใกล้หมด → ระบบแจ้งเตือนใน <strong>Discord</strong> ตั้งค่าได้ที่{' '}
              <strong>ตั้งค่า</strong>
            </li>
          </ul>

          <h3>ราคาและส่วนลด</h3>
          <ul>
            <li>
              แก้ราคาทีละช่องได้เลยในตารางสินค้า (ต้นทุน/ราคา/สมาชิก/ตัวแทน/สต๊อก) — แก้แล้วกด Enter
              บันทึกทันที
            </li>
            <li>
              ราคา <strong>สมาชิก/ตัวแทน</strong> ใช้กับลูกค้าที่ตั้งระดับไว้ (ลูกค้า → ระดับราคา)
            </li>
            <li>
              ปรับราคาเป็น % ทีเดียวทุกสินค้า: <strong>ตั้งกำไร (%)</strong>
            </li>
          </ul>

          <h3>เผยแพร่/ซ่อน</h3>
          <ul>
            <li>
              ปุ่ม <strong>เผยแพร่/ซ่อน</strong> รายแถว หรือ{' '}
              <strong>เผยแพร่ทั้งหมด / ซ่อนทั้งหมด</strong> ครั้งเดียว
            </li>
            <li>สินค้าซ่อน = ลูกค้าไม่เห็น แต่ออเดอร์เก่ายังอยู่</li>
          </ul>

          <h3>ตรวจสอบย้อนหลัง</h3>
          <ul>
            <li>
              <strong>ประวัติเติมเงิน</strong> — เงินเข้าทุกช่องทาง (แยก
              &quot;แอดมินเพิ่มเครดิต&quot; / &quot;พร้อมเพย์&quot; /
              &quot;ใช้เครดิตซื้อสินค้า&quot;)
            </li>
            <li>
              <strong>รายงานรายได้</strong> — กำไรจริง (ราคาขาย − ต้นทุน) ตามช่วงเวลา
            </li>
            <li>
              <strong>รายงานสต๊อก</strong> — ขายดี / สินค้าค้างสต๊อก (ตั้ง &quot;ไม่ขาย N วัน&quot;
              ได้)
            </li>
            <li>
              <strong>คลังสินค้า</strong> — โค้ดพร้อมขายจริงต่อสินค้า (คอลัมน์
              &quot;จำนวนบัญชี&quot;)
            </li>
          </ul>

          <h3>ความปลอดภัย</h3>
          <ul>
            <li>เปิด 2FA ทุกบัญชีแอดมิน — บังคับอยู่แล้ว</li>
            <li>อย่าติ๊ก &quot;จดจำ 30 วัน&quot; บนเครื่องสาธารณะ</li>
            <li>
              พนักงานใหม่ → สร้างที่ <strong>เจ้าหน้าที่</strong>{' '}
              และเลือกสิทธิ์ให้น้อยที่สุดที่จำเป็น
            </li>
            <li>
              พนักงานลาออก → <strong>ปิดใช้งาน</strong> ทันที (สิทธิ์หมดใน 15 วินาที)
            </li>
          </ul>
        </Section>

        <Section id="s9" title="9. แบบทดสอบ A–E (ตรวจสอบว่าระบบปกติ)">
          <p>ใช้เวลาประมาณ 10 นาที ทดสอบครบทั้งระบบ (บนเว็บทดสอบ ใช้ dev-seed จากหัวข้อ 2 ก่อน):</p>
          <table className={s['test-table']}>
            <thead>
              <tr>
                <th className={s['col-check']}>ผ่าน</th>
                <th className={s['col-step']}>ขั้นตอน</th>
                <th>ผลที่ต้องได้</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={s['col-check']}>{CHECK}</td>
                <td className={s['col-step']}>
                  <strong>A. เติมสต๊อก</strong> — จัดการสต๊อก → วาง 2 โค้ด → แยกข้อมูล → บันทึก
                </td>
                <td>สต๊อก +2 ในตาราง / คลังสินค้าโชว์ &quot;จำนวนบัญชี&quot; เพิ่ม</td>
              </tr>
              <tr>
                <td className={s['col-check']}>{CHECK}</td>
                <td className={s['col-step']}>
                  <strong>B. เครดิต</strong> — ลูกค้า → ดู → ใส่ +100 → ปรับเครดิต
                </td>
                <td>ยอดเปลี่ยน + ประวัติเติมเงินมีแถว &quot;แอดมินปรับเครดิต&quot;</td>
              </tr>
              <tr>
                <td className={s['col-check']}>{CHECK}</td>
                <td className={s['col-step']}>
                  <strong>C. ซื้อด้วยเครดิต</strong> — ล็อกอินลูกค้า → ซื้อ → เลือกเครดิต → ยืนยัน
                </td>
                <td>
                  หน้ายืนยันมีโค้ด / โค้ดของฉัน มีโค้ด / กระเป๋าเงินหักถูกต้อง / ออเดอร์
                  &quot;สำเร็จ&quot;
                </td>
              </tr>
              <tr>
                <td className={s['col-check']}>{CHECK}</td>
                <td className={s['col-step']}>
                  <strong>D. สลิปแมนนวล</strong> — ซื้อรอบสองแบบ PromptPay → แอดมินกดยืนยัน
                </td>
                <td>สถานะเปลี่ยนสำเร็จ ลูกค้าได้โค้ดที่สอง</td>
              </tr>
              <tr>
                <td className={s['col-check']}>{CHECK}</td>
                <td className={s['col-step']}>
                  <strong>E. เครดิตไม่พอ</strong> — ปรับเครดิตเป็น 0 แล้วซื้ออีก
                </td>
                <td>ตัวเลือกเครดิตหาย หรือขึ้น &quot;ยอดเครดิตไม่พอ&quot; และ QR ยังใช้ได้</td>
              </tr>
            </tbody>
          </table>
          <p className={s['emph']}>ทั้ง 5 ข้อผ่าน = ระบบพร้อมขาย</p>
        </Section>

        <Section id="s10" title="10. ติดต่อ/แก้ปัญหา">
          <table>
            <thead>
              <tr>
                <th>อาการ</th>
                <th>ทางแก้</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ลูกค้าจ่ายแล้วไม่ได้โค้ด</td>
                <td>
                  ดู <strong>คำสั่งซื้อ</strong> — ถ้า &quot;รอชำระเงิน&quot; = รอแจ้งธนาคาร
                  กดยืนยันเอง (หัวข้อ 6) · ถ้า &quot;รอจัดส่ง&quot; = เติมโค้ดแล้วกดลองใหม่
                </td>
              </tr>
              <tr>
                <td>โค้ดซ้ำ/โค้ดไม่ถูกต้อง</td>
                <td>
                  ค้นหาที่ <strong>คลังสินค้า</strong> → จัดการสต๊อก → ตรวจรายการ;
                  ออเดอร์เก่าคืนเครดิตลูกค้าได้ (หัวข้อ 4)
                </td>
              </tr>
              <tr>
                <td>แอดมินล็อกอินไม่ได้ (ล็อก 15 นาที)</td>
                <td>
                  รอ 15 นาที หรือให้ผู้ดูแลสูงสุดปลดล็อกที่ <strong>เจ้าหน้าที่</strong>
                </td>
              </tr>
              <tr>
                <td>หลุดโค้ด Authenticator</td>
                <td>ใช้ backup code ที่เก็บไว้ตอนเปิด 2FA หรือให้ผู้ดูแลสูงสุดรีเซ็ต</td>
              </tr>
              <tr>
                <td>อยากเปลี่ยนรูป/แบนเนอร์หน้าเว็บ</td>
                <td>
                  <strong>ตั้งค่า</strong> — อัปโหลดรูปได้ตรงนั้น
                </td>
              </tr>
            </tbody>
          </table>
          <p className={s['manual-footer']}>
            เอกสารเพิ่มเติม: คู่มือทดสอบการล็อกอิน (admin-login-test) · บัญชีลูกค้าทดสอบ
            (customer-login-test) — ทั้งหมดอยู่ในโฟลเดอร์ docs ของโปรเจกต์
          </p>
        </Section>
      </article>
    </div>
  );
}
