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
        <label htmlFor={inputId} className="text-sm font-medium text-clay-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 text-clay-500">{leftIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={cn(hintId, errorId) || undefined}
          aria-invalid={!!error}
          className={cn(
            'w-full rounded-sm border border-clay-300 bg-clay-100 px-3.5 py-2.5 font-ui text-base text-clay-900 shadow-[inset_0_1px_3px_rgba(147,107,73,0.15)] transition-colors duration-fast ease-out-quart placeholder:text-clay-500',
            'hover:border-peach-300',
            'focus:border-peach-500 focus:shadow-focus-ring',
            'disabled:cursor-not-allowed disabled:border-clay-200 disabled:opacity-50',
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
        <p id={hintId} className="text-xs text-clay-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
});
