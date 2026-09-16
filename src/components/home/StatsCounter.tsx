'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, Package, Zap, BarChart3 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SeedTubeProps {
  value: number; // 0-100
  label: string;
  icon: React.ReactNode;
  seedColor: string;
}

/**
 * Progress bar as a transparent clay tube filling with clay seeds.
 * Seeds pop in as the tube "fills" (decorative pacing toward a milestone);
 * the number counts to the true value.
 */
function SeedTube({ value, label, icon, seedColor }: SeedTubeProps) {
  const [count, setCount] = useState(0);
  const [filled, setFilled] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 2000;
          const steps = 60;
          const increment = value / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
              setCount(value);
              setFilled(100);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
              setFilled(Math.round((current / value) * 100));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  const seedCount = 6;
  const visibleSeeds = Math.round((filled / 100) * seedCount);

  return (
    <div ref={ref} className="clay-card flex flex-col items-center gap-3 px-4 py-5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-lg font-bold text-fg">{count.toLocaleString()}</span>
      </div>
      {/* The clay tube */}
      <div
        className="shadow-inset-md flex h-7 w-full items-center gap-1 overflow-hidden rounded-full px-1.5"
        style={{ background: 'rgba(234, 220, 195, 0.45)' }}
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {Array.from({ length: seedCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-4 w-3.5 shrink-0 rounded-[40%] transition-all duration-interactive ease-ease-out',
              i < visibleSeeds ? 'animate-seed-pop' : 'scale-0 opacity-0',
            )}
            style={{
              background: seedColor,
              boxShadow:
                'inset 1px 1px 2px rgba(255,255,255,0.6), 1px 1px 2px rgba(124,45,18,0.25)',
            }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold text-fg-secondary">{label}</p>
    </div>
  );
}

export function StatsCounter() {
  // Ring fill = capacity/penetration pacing toward the next business
  // milestone (decorative); the number itself counts to the true value.
  const MILESTONES = { ลูกค้า: 1500, สินค้า: 50, ขายแล้ว: 1000, สต๊อก: 1000 } as const;

  const stats = [
    {
      icon: <Users size={18} className="text-fg-brand" />,
      value: 1234,
      label: 'ลูกค้า',
      seedColor: '#F97316',
    },
    {
      icon: <Package size={18} className="text-coral-500" />,
      value: 37,
      label: 'สินค้า',
      seedColor: '#FB7185',
    },
    {
      icon: <Zap size={18} className="text-fg-brand" />,
      value: 567,
      label: 'ขายแล้ว',
      seedColor: '#F59E0B',
    },
    {
      icon: <BarChart3 size={18} className="text-coral-500" />,
      value: 480,
      label: 'สต๊อก',
      seedColor: '#38BDF8',
    },
  ];

  return (
    <section className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <SeedTube
            key={s.label}
            value={Math.min(
              100,
              Math.round(
                (s.value / (MILESTONES[s.label as keyof typeof MILESTONES] ?? 1500)) * 100,
              ),
            )}
            label={s.label}
            icon={s.icon}
            seedColor={s.seedColor}
          />
        ))}
      </div>
    </section>
  );
}
