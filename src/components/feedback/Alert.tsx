import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

import { cn } from '@/utils/cn';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  type: AlertType;
  title?: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

const styleByType: Record<AlertType, { bg: string; border: string; fg: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-jade-900',
    border: 'border-jade-700',
    fg: 'text-jade-200',
    icon: <CheckCircle size={20} strokeWidth={1.5} />,
  },
  error: {
    bg: 'bg-crimson-900',
    border: 'border-crimson-700',
    fg: 'text-crimson-200',
    icon: <AlertCircle size={20} strokeWidth={1.5} />,
  },
  warning: {
    bg: 'bg-topaz-900',
    border: 'border-topaz-400',
    fg: 'text-topaz-200',
    icon: <AlertTriangle size={20} strokeWidth={1.5} />,
  },
  info: {
    bg: 'bg-sapphire-900',
    border: 'border-sapphire-700',
    fg: 'text-sapphire-200',
    icon: <Info size={20} strokeWidth={1.5} />,
  },
};

/** 05-components.md §8.5 — inline banner alert. role="alert" for error, "status" otherwise. */
export function Alert({ type, title, message, dismissible, onDismiss, action }: AlertProps): React.JSX.Element {
  const s = styleByType[type];
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border p-4', s.bg, s.border)}
    >
      <span className={s.fg}>{s.icon}</span>
      <div className="flex-1">
        {title && <p className={cn('text-sm font-semibold', s.fg)}>{title}</p>}
        <p className={cn('text-sm', title ? 'mt-0.5 text-ink-200' : s.fg)}>{message}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={cn('mt-2 text-sm font-medium underline underline-offset-2', s.fg)}
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button type="button" aria-label="ปิด" onClick={onDismiss} className="text-ink-400 hover:text-ink-200">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
