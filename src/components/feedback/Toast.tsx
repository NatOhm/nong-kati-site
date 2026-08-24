'use client';

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/utils/cn';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  /** ms, default 4000; 0 = persist until dismissed. */
  duration?: number;
}

export interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

const iconByType: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} strokeWidth={1.5} className="text-jade-400" />,
  error: <AlertCircle size={20} strokeWidth={1.5} className="text-crimson-400" />,
  warning: <AlertTriangle size={20} strokeWidth={1.5} className="text-topaz-400" />,
  info: <Info size={20} strokeWidth={1.5} className="text-sapphire-400" />,
};

/** 05-components.md §8.1 — single toast. role="alert" for error, "status" otherwise. */
export function Toast({ id, type, title, message, duration = 4000, onDismiss }: ToastProps): React.JSX.Element {
  useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className="animate-toast-enter flex w-full max-w-sm items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-4 shadow-lg"
    >
      {iconByType[type]}
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink-50">{title}</p>
        {message && <p className="mt-0.5 text-xs text-ink-300">{message}</p>}
      </div>
      <button
        type="button"
        aria-label="ปิดการแจ้งเตือน"
        onClick={() => onDismiss(id)}
        className="text-ink-400 hover:text-ink-200"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export interface ToastStackProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  position?: 'bottom-right' | 'top-right';
}

/** 05-components.md §8.1 — fixed stack, max 5 visible, newest below. */
export function ToastStack({ toasts, onDismiss, position = 'bottom-right' }: ToastStackProps): React.JSX.Element {
  const visible = toasts.slice(-5);
  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[100] flex w-full max-w-sm flex-col gap-2 p-4',
        position === 'bottom-right' ? 'bottom-0 right-0' : 'right-0 top-0',
      )}
    >
      {visible.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
