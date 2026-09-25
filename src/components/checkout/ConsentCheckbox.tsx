'use client';

import { cn } from '@/utils/cn';

export interface ConsentCheckboxProps {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  className?: string;
  /** Marks the control invalid for assistive tech (audit #7). */
  invalid?: boolean;
  /** Element id of the associated error message. */
  describedBy?: string | undefined;
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
  invalid = false,
  describedBy,
}: ConsentCheckboxProps): React.JSX.Element {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-3 transition-colors hover:border-line-brand',
        checked && 'border-line-brand bg-peach-50',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-clay-300 text-fg-brand focus:ring-peach-500"
      />
      <span className="text-sm text-fg-secondary">{label}</span>
    </label>
  );
}
