import { forwardRef, useId } from 'react';

import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  fullWidth?: boolean;
}

/** 05-components.md §2.3 — labelled text input with hint/error slots and rest/hover/focus/error states. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightElement, fullWidth = true, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink-200">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 text-ink-400">{leftIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={cn(hintId, errorId) || undefined}
          aria-invalid={!!error}
          className={cn(
            'w-full rounded-sm border border-ink-600 bg-ink-950 px-3.5 py-2.5 font-ui text-base text-ink-50 shadow-[inset_0_1px_3px_rgba(7,11,20,0.5)] placeholder:text-ink-400 transition-colors duration-fast ease-out-quart',
            'hover:border-ink-400',
            'focus:border-amber-400 focus:shadow-focus-ring',
            'disabled:cursor-not-allowed disabled:border-ink-700 disabled:opacity-50',
            leftIcon && 'pl-10',
            rightElement && 'pr-10',
            error && 'border-crimson-400 focus:border-crimson-400',
            className,
          )}
          {...props}
        />
        {rightElement && <span className="absolute right-3">{rightElement}</span>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-300">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-crimson-200">
          {error}
        </p>
      )}
    </div>
  );
});
