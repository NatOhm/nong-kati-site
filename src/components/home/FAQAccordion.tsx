'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/cn';

const FAQ_DATA = [
  {
    q: 'สินค้าใช้งานได้จริงไหม?',
    a: 'ใช่ครับ สินค้าทุกชิ้นใช้งานได้จริง 100% เราการันตีด้วยยอดขายมากกว่า 567+ โค้ด และรีวิว 4.9/5 ดาวจากลูกค้า',
  },
  {
    q: 'รับประกันอย่างไร?',
    a: 'เรารับประกัน 7 วัน หากสินค้ามีปัญหาภายในระยะเวลาที่กำหนด เราจะเปลี่่ยนบัญชีใหม่ให้ทันที โดยไม่มีค่าใช้จ่ายเพิ่มเติม',
  },
  {
    q: 'ชำระเงินช่องทางไหนได้บ้าง?',
    a: 'รองรับ PromptPay (QR Code) และบัตรเครดิต/เดบิต ชำระเงินผ่านระบบอัตโนมัติ ปลอดภัย 100%',
  },
  {
    q: 'ใช้เวลานานแค่ไหนกว่าจะได้โค้ด?',
    a: 'หลังชำระเงินสำเร็จ ระบบจะส่งโค้ดให้อัตโนมัติภายใน 60 วินาที โดยจะแสดงในหน้ายืนยันคำสั่งซื้อ และส่งทางอีเมล',
  },
  {
    q: 'สินค้าหมดหรือยัง?',
    a: ' STOCK สินค้าอัพเดตแบบเรียลไทม์ หากสินค้าหมด จะแสดงสถานะ "หมดชั่วคราว" และสามารถติดตามได้ทาง LINE Official',
  },
  {
    q: 'มีโปรโมชั่นอะไรบ้าง?',
    a: 'ติดตามโปรโมชั่นได้ทาง LINE Official Account หรือหน้าเว็บไซต์ เรามีโปรโมชั่นใหม่ๆ ทุกสัปดาห์',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-line-subtle last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-surface"
      >
        <span className="pr-4 text-sm font-medium text-clay-800">{q}</span>
        {isOpen ? (
          <ChevronUp size={18} className="shrink-0 text-fg-brand" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-fg-placeholder" />
        )}
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-40' : 'max-h-0',
        )}
      >
        <p className="px-4 pb-4 text-sm leading-relaxed text-fg-muted">{a}</p>
      </div>
    </div>
  );
}

export function FAQAccordion() {
  return (
    <section className="px-4 py-8 md:px-8">
      <h2 className="mb-6 text-center text-lg font-bold text-fg">คำถามที่พบบ่อย</h2>
      <div className="clay-card mx-auto max-w-2xl rounded-2xl">
        {FAQ_DATA.map((item) => (
          <FAQItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  );
}
