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
        'flex cursor-pointer items-start gap-3 rounded-md border border-clay-300 bg-clay-100 p-3 transition-colors hover:border-peach-300',
        checked && 'border-peach-300 bg-peach-50',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-clay-300 bg-clay-300 text-peach-600 focus:ring-peach-500"
      />
      <span className="text-sm text-clay-700">{label}</span>
    </label>
  );
}
