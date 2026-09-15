'use client';

import { Shield, Zap, Headphones, CreditCard, Star } from 'lucide-react';

const BADGES = [
  {
    icon: <Shield size={24} className="text-jade-500" />,
    title: 'รับประกัน 7 วัน',
    desc: 'เปลี่ยนใหม่ทันทีหากมีปัญหา',
    color: 'bg-jade-500/15 text-jade-700',
  },
  {
    icon: <Zap size={24} className="text-fg-brand" />,
    title: 'ส่งโค้ดทันที',
    desc: 'ภายใน 60 วินาทีหลังชำระเงิน',
    color: 'bg-peach-100 text-fg-brand',
  },
  {
    icon: <Headphones size={24} className="text-coral-500" />,
    title: 'ตอบไว 24 ชม.',
    desc: 'ทีมงานพร้อมดูแลทุกวัน',
    color: 'bg-coral-100 text-coral-600',
  },
  {
    icon: <CreditCard size={24} className="text-fg-brand" />,
    title: 'PromptPay + บัตรเครดิต',
    desc: 'ชำระเงินได้หลายช่องทาง',
    color: 'bg-peach-50 text-peach-800',
  },
  {
    icon: <Star size={24} className="text-peach-500" />,
    title: 'ขายแล้ว 567+ โค้ด',
    desc: 'ลูกค้าไว้วางใจ 4.9/5 ดาว',
    color: 'bg-peach-100 text-fg-brand',
  },
];

export function TrustBadges() {
  return (
    <section className="px-4 py-8 md:px-8">
      <h2 className="mb-6 text-center text-lg font-bold text-fg">ทำไมต้อง Nong-Kati?</h2>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-5">
        {BADGES.map((badge) => (
          <div
            key={badge.title}
            className="clay-card flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-transform duration-fast ease-out-quart hover:-translate-y-0.5 active:scale-[0.98] active:shadow-clay-press"
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${badge.color}`}
            >
              {badge.icon}
            </div>
            <h3 className="text-sm font-semibold text-clay-800">{badge.title}</h3>
            <p className="text-xs text-fg-muted">{badge.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
