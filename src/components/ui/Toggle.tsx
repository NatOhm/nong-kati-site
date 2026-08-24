import { cn } from '@/utils/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** 05-components.md §2.8 — 40×22px track switch, amber-filled on, 200ms knob/track transition. */
export function Toggle({ checked, onChange, label, disabled, size = 'md' }: ToggleProps): React.JSX.Element {
  const isSmall = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-default ease-in-out',
        isSmall ? 'h-[18px] w-8' : 'h-[22px] w-10',
        checked ? 'bg-amber-400' : 'bg-ink-800',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform duration-default ease-in-out',
          isSmall ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]',
          checked ? (isSmall ? 'translate-x-[15px]' : 'translate-x-[19px]') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
