'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ToastData, ToastType } from '@/components/feedback/Toast';

interface ToastOptions {
  message?: string;
  duration?: number;
}

interface UseToastResult {
  toasts: ToastData[];
  dismiss: (id: string) => void;
  toast: Record<ToastType, (title: string, options?: ToastOptions) => void>;
}

/**
 * Module-level store so any component tree can push a toast without prop-drilling.
 * Mounted once via <ToastStack /> at the app root (src/app/layout.tsx).
 */
let listeners: Array<(toasts: ToastData[]) => void> = [];
let toastState: ToastData[] = [];

function emit(): void {
  listeners.forEach((l) => l(toastState));
}

function push(type: ToastType, title: string, options?: ToastOptions): void {
  const id = crypto.randomUUID();
  const entry: ToastData = { id, type, title, duration: options?.duration ?? 4000 };
  if (options?.message) entry.message = options.message;
  toastState = [...toastState, entry];
  emit();
}

function dismiss(id: string): void {
  toastState = toastState.filter((t) => t.id !== id);
  emit();
}

export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<ToastData[]>(toastState);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  const toast = {
    success: useCallback((title: string, options?: ToastOptions) => push('success', title, options), []),
    error: useCallback((title: string, options?: ToastOptions) => push('error', title, options), []),
    warning: useCallback((title: string, options?: ToastOptions) => push('warning', title, options), []),
    info: useCallback((title: string, options?: ToastOptions) => push('info', title, options), []),
  };

  return { toasts, dismiss, toast };
}
