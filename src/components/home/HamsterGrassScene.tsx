import { cn } from '@/utils/cn';

/**
 * Cute clay hamster grass-field band — sits under the main content as a
 * cartoonish ground line. Decorative only (aria-hidden), adapts to dark mode
 * via semantic tokens, and respects reduced motion through the global rule.
 */
export function HamsterGrassScene({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-0', className)}
    >
      {/* Rolling clay hills */}
      <div className="absolute bottom-0 left-0 right-0 h-28">
        {/* back hill */}
        <div className="absolute bottom-6 left-[8%] h-24 w-72 rounded-[100%] bg-jade-200/50 dark:bg-jade-900/40" />
        <div className="absolute bottom-4 right-[6%] h-28 w-96 rounded-[100%] bg-jade-200/40 dark:bg-jade-900/30" />
        {/* front grass */}
        <div className="absolute bottom-0 left-0 right-0 h-14 rounded-t-[100%] bg-jade-500/25 dark:bg-jade-900/50" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-jade-500/35 dark:bg-jade-900/60" />
      </div>

      {/* Swaying grass blades */}
      <svg
        viewBox="0 0 120 40"
        className="absolute bottom-4 left-[12%] h-8 w-24 origin-bottom animate-grass-sway"
        fill="none"
      >
        <path
          d="M10 40 Q8 20 16 8"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M30 40 Q30 16 24 4"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M52 40 Q56 22 50 10"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
      <svg
        viewBox="0 0 120 40"
        className="absolute bottom-6 right-[14%] h-8 w-24 origin-bottom animate-grass-sway"
        style={{ animationDelay: '1.2s' }}
        fill="none"
      >
        <path
          d="M20 40 Q16 18 26 6"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M44 40 Q46 20 40 8"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>

      {/* Little clay hamster peeking from the grass */}
      <div className="absolute bottom-2 right-[9%] animate-hamster-peek">
        <svg
          viewBox="0 0 64 44"
          className="h-10 w-14 drop-shadow-[0_3px_5px_rgba(147,107,73,0.25)]"
          fill="none"
        >
          {/* ears */}
          <circle cx="18" cy="10" r="6" fill="#F5B07E" />
          <circle cx="46" cy="10" r="6" fill="#F5B07E" />
          <circle cx="18" cy="10" r="3" fill="#FECFAD" />
          <circle cx="46" cy="10" r="3" fill="#FECFAD" />
          {/* head */}
          <ellipse cx="32" cy="26" rx="22" ry="17" fill="#F5B07E" />
          {/* cheeks */}
          <circle cx="16" cy="30" r="5" fill="#F8C09A" opacity="0.9" />
          <circle cx="48" cy="30" r="5" fill="#F8C09A" opacity="0.9" />
          {/* eyes (closed, happy) */}
          <path d="M22 24 q3 2.6 6 0" stroke="#4A3320" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M38 24 q3 2.6 6 0" stroke="#4A3320" strokeWidth="1.8" strokeLinecap="round" />
          {/* nose + mouth */}
          <ellipse cx="32" cy="29" rx="2.2" ry="1.6" fill="#EB737B" />
          <path d="M29 33 q3 2.4 6 0" stroke="#4A3320" strokeWidth="1.4" strokeLinecap="round" />
          {/* seed in paws */}
          <ellipse cx="32" cy="37" rx="2.6" ry="3.2" fill="#936B49" />
        </svg>
      </div>

      {/* Tiny seed sprinkles */}
      <div className="absolute bottom-3 left-[26%] h-2 w-1.5 rotate-45 rounded-full bg-clay-500/50" />
      <div className="absolute bottom-6 left-[58%] h-2 w-1.5 -rotate-12 rounded-full bg-clay-500/40" />
      <div className="absolute bottom-2 right-[30%] h-2 w-1.5 rotate-12 rounded-full bg-clay-500/50" />
    </div>
  );
}
