'use client';

import { cn } from '@/utils/cn';

export interface ConsentCheckboxProps {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  className?: string;
}

/**
 * Checkout consent checkbox — used for T&C and marketing opt-in.
 * 05-components.md §5.2 — ConsentCheckbox within ContactForm.
 */
export function ConsentCheckbox({
  id,
  label,
  checked,
  onChange,
  required = false,
  className,
}: ConsentCheckboxProps): React.JSX.Element {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-ink-600 bg-ink-800 p-3 transition-colors hover:border-ink-400',
        checked && 'border-amber-700/50 bg-amber-900/10',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-500 bg-ink-700 text-amber-400 focus:ring-amber-500"
      />
      <span className="text-sm text-ink-200">{label}</span>
    </label>
  );
}
