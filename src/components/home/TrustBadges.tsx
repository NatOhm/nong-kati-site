'use client';

import { Clock, Gift, Headphones, Lock, Shield, Truck, Wallet, Zap } from 'lucide-react';

import {
  DEFAULT_TRUST_BADGES,
  type TrustBadgeIconKey,
  type TrustBadgesSettings,
} from '@/lib/trustBadges';
import { cn } from '@/utils/cn';

/**
 * Icon key → presentation. The DB stores only the key (see lib/trustBadges),
 * so this map is the single place a badge's icon and chip colours live; an
 * unknown key renders the shield fallback rather than breaking the section.
 */
const BADGE_ICONS: Record<
  TrustBadgeIconKey,
  { Icon: typeof Shield; iconClass: string; chipClass: string }
> = {
  shield: { Icon: Shield, iconClass: 'text-jade-500', chipClass: 'bg-jade-500/15 text-jade-700' },
  zap: { Icon: Zap, iconClass: 'text-fg-brand', chipClass: 'bg-peach-100 text-fg-brand' },
  headphones: {
    Icon: Headphones,
    iconClass: 'text-coral-500',
    chipClass: 'bg-coral-100 text-fg-error',
  },
  wallet: { Icon: Wallet, iconClass: 'text-fg-brand', chipClass: 'bg-peach-50 text-peach-800' },
  truck: { Icon: Truck, iconClass: 'text-jade-500', chipClass: 'bg-jade-500/15 text-jade-700' },
  lock: { Icon: Lock, iconClass: 'text-fg-brand', chipClass: 'bg-peach-100 text-fg-brand' },
  clock: { Icon: Clock, iconClass: 'text-coral-500', chipClass: 'bg-coral-100 text-fg-error' },
  gift: { Icon: Gift, iconClass: 'text-fg-brand', chipClass: 'bg-peach-50 text-peach-800' },
};

/**
 * Homepage trust-badge section. Copy, order, icons and visibility come from
 * SiteSetting key 'trustBadges' (admin: /management/trust-badges); the server
 * reads them in app/page.tsx and passes them down — visitors never call the
 * authenticated admin endpoint. With no settings prop it renders the built-in
 * DEFAULT_TRUST_BADGES, identical to the old hardcoded section.
 */
export function TrustBadges({
  settings,
}: {
  settings?: TrustBadgesSettings | undefined;
}): React.JSX.Element | null {
  const { enabled, title, items } = settings ?? DEFAULT_TRUST_BADGES;
  if (!enabled || items.length === 0) return null;

  return (
    <section className="px-4 py-8 md:px-8">
      <h2 className="mb-6 text-center text-lg font-bold text-fg">{title}</h2>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-5">
        {items.map((badge) => {
          const { Icon, iconClass, chipClass } = BADGE_ICONS[badge.icon] ?? BADGE_ICONS.shield;
          return (
            <div
              key={`${badge.order}-${badge.title}`}
              className="clay-card flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-transform duration-fast ease-out-quart hover:-translate-y-0.5 active:scale-[0.98] active:shadow-clay-press"
            >
              <div
                className={cn('flex h-12 w-12 items-center justify-center rounded-full', chipClass)}
              >
                <Icon size={24} className={iconClass} />
              </div>
              <h3 className="text-sm font-semibold text-fg-secondary">{badge.title}</h3>
              {badge.desc && <p className="text-xs text-fg-muted">{badge.desc}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
