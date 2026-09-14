'use client';

import { Shield, Zap, Headphones, CreditCard, Star } from 'lucide-react';

const BADGES = [
  {
    icon: <Shield size={24} className="text-green-400" />,
    title: 'รับประกัน 7 วัน',
    desc: 'เปลี่ยนใหม่ทันทีหากมีปัญหา',
    color: 'bg-green-900/30',
  },
  {
    icon: <Zap size={24} className="text-amber-400" />,
    title: 'ส่งโค้ดทันที',
    desc: 'ภายใน 60 วินาทีหลังชำระเงิน',
    color: 'bg-amber-900/30',
  },
  {
    icon: <Headphones size={24} className="text-blue-400" />,
    title: 'ตอบไว 24 ชม.',
    desc: 'ทีมงานพร้อมดูแลทุกวัน',
    color: 'bg-blue-900/30',
  },
  {
    icon: <CreditCard size={24} className="text-purple-400" />,
    title: 'PromptPay + บัตรเครดิต',
    desc: 'ชำระเงินได้หลายช่องทาง',
    color: 'bg-purple-900/30',
  },
  {
    icon: <Star size={24} className="text-yellow-400" />,
    title: 'ขายแล้ว 567+ โค้ด',
    desc: 'ลูกค้าไว้วางใจ 4.9/5 ดาว',
    color: 'bg-yellow-900/30',
  },
];

export function TrustBadges() {
  return (
    <section className="border-b border-ink-700 bg-ink-900/30 px-4 py-8 md:px-8">
      <h2 className="mb-6 text-center text-lg font-bold text-ink-100">
        ทำไมต้อง Nong-Kati?
      </h2>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-5">
        {BADGES.map((badge) => (
          <div
            key={badge.title}
            className="flex flex-col items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 p-4 text-center transition-all hover:border-amber-700/50 hover:shadow-brand-glow"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${badge.color}`}>
              {badge.icon}
            </div>
            <h3 className="text-sm font-semibold text-ink-100">{badge.title}</h3>
            <p className="text-xs text-ink-400">{badge.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
