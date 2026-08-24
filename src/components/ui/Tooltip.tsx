'use client';

import { cloneElement, isValidElement, useId, useRef, useState } from 'react';

import { cn } from '@/utils/cn';

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** ms before showing, default 500 per 05-components.md §2.12. */
  delay?: number;
}

const sideClasses: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

/** 05-components.md §2.12 — role="tooltip", aria-describedby on trigger, 500ms hover/focus delay. */
export function Tooltip({ content, children, side = 'top', delay = 500 }: TooltipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipId = useId();

  const show = (): void => {
    timeoutRef.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = (): void => {
    clearTimeout(timeoutRef.current);
    setOpen(false);
  };

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': open ? tooltipId : undefined,
  });

  return (
    <span className="relative inline-block">
      {trigger}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-xs border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-200 shadow-md',
            sideClasses[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
