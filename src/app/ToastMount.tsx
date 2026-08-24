'use client';

import { ToastStack } from '@/components/feedback/Toast';
import { useToast } from '@/hooks/useToast';

/** Mounted once in src/app/layout.tsx. Isolated as its own client component so the
 * root layout itself doesn't need 'use client' just to read toast state. */
export function ToastMount(): React.JSX.Element {
  const { toasts, dismiss } = useToast();
  return <ToastStack toasts={toasts} onDismiss={dismiss} />;
}
