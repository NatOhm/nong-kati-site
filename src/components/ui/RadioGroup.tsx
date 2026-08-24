import { useId } from 'react';

import { cn } from '@/utils/cn';

export interface RadioOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  name: string;
  label?: string;
  layout?: 'vertical' | 'horizontal';
  error?: string;
}

/** 05-components.md §2.7 — accessible fieldset/legend/radiogroup, keyboard-navigable natively via <input type="radio">. */
export function RadioGroup({
  options,
  value,
  onChange,
  name,
  label,
  layout = 'vertical',
  error,
}: RadioGroupProps): React.JSX.Element {
  const generatedId = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      {label && <legend className="mb-1 text-sm font-medium text-ink-200">{label}</legend>}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn('flex gap-3', layout === 'vertical' ? 'flex-col' : 'flex-row flex-wrap')}
      >
        {options.map((opt) => {
          const optionId = `${generatedId}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={optionId}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 text-sm text-ink-200',
                opt.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={opt.value}
                checked={value === opt.value}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer border-ink-600 bg-ink-950 text-amber-400 focus-visible:shadow-focus-ring"
              />
              <span>
                <span className="block">{opt.label}</span>
                {opt.sublabel && <span className="block text-xs text-ink-400">{opt.sublabel}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-crimson-200">
          {error}
        </p>
      )}
    </fieldset>
  );
}
