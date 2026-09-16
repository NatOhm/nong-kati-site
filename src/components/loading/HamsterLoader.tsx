import { cn } from '@/utils/cn';

/**
 * Wait animation: a clay hamster that bounces on a grass mound while content loads.
 * Pure CSS/SVG — no assets, reduced-motion handled by the global rule.
 */
export function HamsterLoader({
  label = 'กำลังโหลด',
  className,
}: {
  label?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="กำลังโหลด"
      className={cn('flex flex-col items-center gap-4 py-12', className)}
    >
      <div className="relative h-20 w-24">
        {/* Bouncing clay hamster */}
        <svg
          viewBox="0 0 96 80"
          className="absolute inset-x-0 top-0 mx-auto h-16 w-20 animate-clay-bounce drop-shadow-[0_6px_10px_rgba(147,107,73,0.25)]"
          fill="none"
          aria-hidden="true"
        >
          {/* ears */}
          <circle cx="30" cy="14" r="7" fill="#F5B07E" />
          <circle cx="66" cy="14" r="7" fill="#F5B07E" />
          <circle cx="30" cy="14" r="3.5" fill="#FECFAD" />
          <circle cx="66" cy="14" r="3.5" fill="#FECFAD" />
          {/* body */}
          <ellipse cx="48" cy="44" rx="30" ry="26" fill="#F5B07E" />
          {/* belly */}
          <ellipse cx="48" cy="52" rx="17" ry="14" fill="#FFE9D4" />
          {/* eyes */}
          <circle cx="38" cy="38" r="3.4" fill="#4A3320" />
          <circle cx="58" cy="38" r="3.4" fill="#4A3320" />
          <circle cx="39.2" cy="36.8" r="1.1" fill="#FFF5E1" />
          <circle cx="59.2" cy="36.8" r="1.1" fill="#FFF5E1" />
          {/* cheeks */}
          <circle cx="32" cy="46" r="4.5" fill="#F8C09A" opacity="0.9" />
          <circle cx="64" cy="46" r="4.5" fill="#F8C09A" opacity="0.9" />
          {/* nose + mouth */}
          <ellipse cx="48" cy="44" rx="2.4" ry="1.8" fill="#EB737B" />
          <path d="M45 48 q3 2.5 6 0" stroke="#4A3320" strokeWidth="1.4" strokeLinecap="round" />
          {/* seed snack */}
          <ellipse cx="48" cy="50" rx="2.6" ry="3.4" fill="#936B49" />
        </svg>
        {/* Grass mound it bounces on */}
        <div className="absolute bottom-0 left-1/2 h-3 w-16 -translate-x-1/2 rounded-full bg-jade-500/70" />
      </div>
      <p className="text-sm font-medium text-fg-muted">{label}…</p>
    </div>
  );
}
