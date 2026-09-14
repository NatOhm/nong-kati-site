'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, Package, Zap, BarChart3 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CounterItemProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
}

function CounterItem({ icon, value, label, suffix = '' }: CounterItemProps) {
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
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/30">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-amber-300">
          {count.toLocaleString()}{suffix}
        </p>
        <p className="text-xs text-ink-400">{label}</p>
      </div>
    </div>
  );
}

export function StatsCounter() {
  return (
    <section className="border-b border-ink-700 bg-ink-900/50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <CounterItem
            icon={<Users size={20} className="text-amber-400" />}
            value={1234}
            label="ลูกค้า"
            suffix="+"
          />
          <CounterItem
            icon={<Package size={20} className="text-blue-400" />}
            value={37}
            label="สินค้า"
          />
          <CounterItem
            icon={<Zap size={20} className="text-green-400" />}
            value={567}
            label="ขายแล้ว"
            suffix="+"
          />
          <CounterItem
            icon={<BarChart3 size={20} className="text-purple-400" />}
            value={480}
            label="สต๊อก"
            suffix="+"
          />
        </div>
      </div>
    </section>
  );
}
