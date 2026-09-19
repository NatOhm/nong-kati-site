'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, Package, Zap, BarChart3 } from 'lucide-react';

/**
 * Homepage stats — plain numbers per client ask ("เอาไอ้กลมๆออกแล้วเปลี่ยนเป็น
 * ตัวเลขแทน"): no round bubbles, no tube, just icon + big counting number.
 */
function StatNumber({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      const duration = 1400;
      const steps = 42;
      const increment = value / steps;
      let current = 0;
      const timer = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCount(value);
          clearInterval(timer);
        } else {
          setCount(Math.floor(current));
        }
      }, duration / steps);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);

    // Fallback for webviews whose IntersectionObserver never fires.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      start();
    }
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="clay-card flex items-center gap-3 px-4 py-5">
      {icon}
      <div>
        <p className="text-2xl font-bold leading-none text-fg">{count.toLocaleString()}</p>
        <p className="mt-1 text-xs font-semibold text-fg-secondary">{label}</p>
      </div>
    </div>
  );
}

export function StatsCounter({
  stats: initial,
}: {
  stats?: { value: number; label: string }[] | undefined;
}) {
  const stats = initial ?? [
    { value: 0, label: 'ลูกค้า' },
    { value: 0, label: 'สินค้า' },
    { value: 0, label: 'ขายแล้ว' },
    { value: 0, label: 'สต๊อก' },
  ];

  return (
    <section className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <StatNumber
            key={s.label}
            value={s.value}
            label={s.label}
            icon={
              s.label === 'ลูกค้า' ? (
                <Users size={22} className="text-fg-brand" />
              ) : s.label === 'สินค้า' ? (
                <Package size={22} className="text-coral-500" />
              ) : s.label === 'ขายแล้ว' ? (
                <Zap size={22} className="text-fg-brand" />
              ) : (
                <BarChart3 size={22} className="text-coral-500" />
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
