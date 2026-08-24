import { cn } from '@/utils/cn';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Centred label, e.g. "หรือ". */
  label?: string;
  className?: string;
}

/** 05-components.md §2.11 — border-subtle rule, optional centred muted label. */
export function Divider({ orientation = 'horizontal', label, className }: DividerProps): React.JSX.Element {
  if (orientation === 'vertical') {
    return <div className={cn('w-px self-stretch bg-ink-700', className)} aria-hidden="true" />;
  }

  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)} role="separator">
        <span className="h-px flex-1 bg-ink-700" />
        <span className="text-xs text-ink-300">{label}</span>
        <span className="h-px flex-1 bg-ink-700" />
      </div>
    );
  }

  return <hr className={cn('border-t border-ink-700', className)} />;
}
