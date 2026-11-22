'use client';

import { useId } from 'react';
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
 * Homepage trust strip — the compact icon row directly under the hero in the
 * client mockup. Copy, order, icons and visibility still come from
 * SiteSetting key 'trustBadges' (admin: /management/trust-badges); the server
 * reads them in app/page.tsx and passes them down.
 *
 * The admin-set section title stays in the DOM as the accessible heading but
 * is visually hidden: the mockup's strip has no heading line, and a visible
 * one pushed the category row below the first-viewport budget. Descriptions
 * are dropped below `sm` for the same reason.
 */
export function TrustBadges({
  settings,
}: {
  settings?: TrustBadgesSettings | undefined;
}): React.JSX.Element | null {
  const { enabled, title, items } = settings ?? DEFAULT_TRUST_BADGES;
  const headingId = useId();
  if (!enabled || items.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="border-y border-line-subtle bg-peach-50 px-3 py-3 dark:bg-clay-900"
    >
      <h2 id={headingId} className="sr-only">
        {title}
      </h2>
      <ul className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-8">
        {items.map((badge) => {
          const { Icon, iconClass, chipClass } = BADGE_ICONS[badge.icon] ?? BADGE_ICONS.shield;
          return (
            <li key={`${badge.order}-${badge.title}`} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  chipClass,
                )}
              >
                <Icon size={18} className={iconClass} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-tight text-fg">
                  {badge.title}
                </span>
                {badge.desc && (
                  <span className="hidden text-[11px] leading-tight text-fg-muted sm:block">
                    {badge.desc}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
