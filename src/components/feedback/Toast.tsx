'use client';

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/utils/cn';
import { SuccessToast } from './SuccessToast';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  /** ms, default 4000; 0 = persist until dismissed. */
  duration?: number;
  /** 'cart' renders the hamster-mascot success layout. */
  variant?: 'cart' | undefined;
  /** True during the 250ms fade-out before removal. */
  exiting?: boolean;
}

export interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

const iconByType: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} strokeWidth={1.5} className="text-jade-500" />,
  error: <AlertCircle size={20} strokeWidth={1.5} className="text-coral-600" />,
  warning: <AlertTriangle size={20} strokeWidth={1.5} className="text-topaz-400" />,
  info: <Info size={20} strokeWidth={1.5} className="text-sapphire-400" />,
};

/** 05-components.md §8.1 — single toast. role="alert" for error, "status" otherwise. */
export function Toast({
  id,
  type,
  title,
  message,
  duration = 4000,
  variant,
  exiting,
  onDismiss,
}: ToastProps): React.JSX.Element {
  useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const fade = exiting ? 'animate-toast-exit' : 'animate-toast-enter';

  if (variant === 'cart') {
    return (
      <div
        role="status"
        className={cn('clay-card flex w-full max-w-sm items-start gap-3 rounded-xl p-4', fade)}
      >
        <SuccessToast title={title} message={message} />
        <button
          type="button"
          aria-label="ปิดการแจ้งเตือน"
          onClick={() => onDismiss(id)}
          className="clay-btn transition-smart rounded-full p-1 text-fg-placeholder hover:bg-surface-sunken hover:text-fg-secondary active:scale-90"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn('clay-card flex w-full max-w-sm items-start gap-3 rounded-xl p-4', fade)}
    >
      {iconByType[type]}
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {message && <p className="mt-0.5 text-xs text-fg-muted">{message}</p>}
      </div>
      <button
        type="button"
        aria-label="ปิดการแจ้งเตือน"
        onClick={() => onDismiss(id)}
        className="clay-btn transition-smart rounded-full p-1 text-fg-placeholder hover:bg-surface-sunken hover:text-fg-secondary active:scale-90"
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
export function ToastStack({
  toasts,
  onDismiss,
  position = 'bottom-right',
}: ToastStackProps): React.JSX.Element {
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
