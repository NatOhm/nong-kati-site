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
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-clay-300 text-fg-brand focus:ring-peach-500"
      />
      <span className="text-sm text-fg-secondary">{label}</span>
    </label>
  );
}
