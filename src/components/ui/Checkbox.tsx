import { Check } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/utils/cn';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  error?: string;
  id?: string;
}

/** 05-components.md §2.6 — custom-styled checkbox, JSX-capable label (e.g. inline T&C links). */
export function Checkbox({ checked, onChange, label, disabled, error, id }: CheckboxProps): React.JSX.Element {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={checkboxId}
        className={cn(
          'flex cursor-pointer items-start gap-2.5 text-sm text-ink-200',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            id={checkboxId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.checked)}
            className="peer absolute h-5 w-5 cursor-pointer appearance-none rounded-xs border border-ink-600 bg-ink-950 transition-colors checked:border-amber-400 checked:bg-amber-400 focus-visible:shadow-focus-ring disabled:cursor-not-allowed"
          />
          <Check
            size={14}
            strokeWidth={3}
            aria-hidden="true"
            className="pointer-events-none absolute text-ink-900 opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="pl-7 text-xs text-crimson-200">
          {error}
        </p>
      )}
    </div>
  );
}
