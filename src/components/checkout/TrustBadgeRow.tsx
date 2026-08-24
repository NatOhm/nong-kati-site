'use client';

import { Lock, Zap, Shield } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface TrustBadgeRowProps {
  className?: string;
}

const BADGES = [
  { icon: Lock, label: 'SSL Secured' },
  { icon: Zap, label: 'ส่งโค้ดทันที' },
  { icon: Shield, label: 'คืนเงินหากโค้ดไม่ถูกต้อง' },
];

/**
 * 05-components.md §5.9 — Trust Badge Row.
 * Static trust indicators shown below checkout form.
 */
export function TrustBadgeRow({ className }: TrustBadgeRowProps): React.JSX.Element {
  return (
    <div className={cn('flex items-center justify-center gap-6', className)}>
      {BADGES.map((badge) => (
        <div
          key={badge.label}
          className="flex items-center gap-1.5 text-xs text-ink-400"
        >
          <badge.icon size={14} strokeWidth={1.5} className="text-ink-400" />
          <span>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}
