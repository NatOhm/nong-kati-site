'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, Package, Zap, BarChart3 } from 'lucide-react';
import { ProgressRing } from '@/components/ui/ProgressRing';

interface RingStatProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
  color: string;
}

function RingStat({ icon, value, label, suffix = '', color }: RingStatProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          // Animate count
          const duration = 2000;
          const steps = 60;
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
        }
      },
      { threshold: 0.5 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  // Ring fill = capacity/penetration pacing toward the next business
  // milestone (decorative); the number itself counts to the true value.
  const MILESTONES = { ลูกค้า: 1500, สินค้า: 50, ขายแล้ว: 1000, สต๊อก: 1000 } as const;
  const ringValue = Math.min(
    100,
    Math.round((value / (MILESTONES[label as keyof typeof MILESTONES] ?? 1500)) * 100),
  );

  return (
    <div ref={ref} className="clay-card flex flex-col items-center gap-3 px-4 py-5">
      <ProgressRing value={ringValue} size={88} stroke={9} color={color}>
        <div className="flex flex-col items-center gap-0.5">
          {icon}
          <span className="text-lg font-bold text-clay-900">
            {count.toLocaleString()}
            {suffix}
          </span>
        </div>
      </ProgressRing>
      <p className="text-xs font-semibold text-clay-700">{label}</p>
    </div>
  );
}

export function StatsCounter() {
  return (
    <section className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
        <RingStat
          icon={<Users size={18} className="text-peach-600" />}
          value={1234}
          label="ลูกค้า"
          suffix="+"
          color="text-peach-500"
        />
        <RingStat
          icon={<Package size={18} className="text-coral-500" />}
          value={37}
          label="สินค้า"
          color="text-coral-400"
        />
        <RingStat
          icon={<Zap size={18} className="text-peach-600" />}
          value={567}
          label="ขายแล้ว"
          suffix="+"
          color="text-peach-400"
        />
        <RingStat
          icon={<BarChart3 size={18} className="text-coral-500" />}
          value={480}
          label="สต๊อก"
          suffix="+"
          color="text-coral-300"
        />
      </div>
    </section>
  );
}
