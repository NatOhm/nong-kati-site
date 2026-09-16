'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/providers/ThemeProvider';

/** Light/dark toggle — icon swaps with a spring pop so the change feels intentional. */
export function ThemeToggle(): React.JSX.Element {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      title={isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
      className="clay-btn flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-fg-secondary shadow-clay-xs transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand hover:shadow-clay active:translate-y-0 active:scale-95 active:shadow-clay-press"
    >
      <span
        key={theme}
        className="inline-flex animate-seed-pop"
        style={{ animationDuration: '350ms' }}
      >
        {isDark ? (
          <Sun size={19} strokeWidth={1.75} className="text-topaz-400" />
        ) : (
          <Moon size={19} strokeWidth={1.75} />
        )}
      </span>
    </button>
  );
}
