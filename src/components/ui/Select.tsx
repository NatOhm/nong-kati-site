import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  id?: string;
  name?: string;
}

/** 05-components.md §2.5 — native <select> at MVP, styled to match Input's states. */
export function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  error,
  disabled,
  fullWidth = true,
  id,
  name,
}: SelectProps): React.JSX.Element {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ink-200">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full appearance-none rounded-sm border border-ink-600 bg-ink-950 py-2.5 pl-3.5 pr-9 font-ui text-base text-ink-50 shadow-[inset_0_1px_3px_rgba(7,11,20,0.5)] transition-colors duration-fast ease-out-quart',
            'hover:border-ink-400',
            'focus:border-amber-400 focus:shadow-focus-ring',
            'disabled:cursor-not-allowed disabled:border-ink-700 disabled:opacity-50',
            error && 'border-crimson-400',
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          strokeWidth={1.5}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-300"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-crimson-200">
          {error}
        </p>
      )}
    </div>
  );
}
