'use client';

import { useState } from 'react';

import { Dialog } from '@/components/feedback/Dialog';
import { cn } from '@/utils/cn';

import { Logo } from './Logo';

export interface CheckoutShellProps {
  children: React.ReactNode;
  currentStep: 1 | 2 | 3;
  completedSteps: number[];
  /** Called when the customer confirms leaving mid-payment via the exit-confirm dialog. */
  onLeave?: () => void;
}

const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
  { n: 1, label: 'ข้อมูล' },
  { n: 2, label: 'ชำระเงิน' },
  { n: 3, label: 'ยืนยัน' },
];

/**
 * 05-components.md §1.6 — stripped checkout header: no category nav, no cart icon.
 * Logo is non-clickable on step 2 and triggers a leave-confirmation dialog instead
 * (02-user-flow.md UF-01's "Are you sure you want to leave?" gate).
 */
export function CheckoutShell({
  children,
  currentStep,
  completedSteps,
  onLeave,
}: CheckoutShellProps): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="border-b border-line-subtle px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-content items-center justify-between">
          {currentStep === 2 ? (
            <button type="button" onClick={() => setConfirmOpen(true)} aria-label="Nong-Kati">
              <Logo href={null} />
            </button>
          ) : (
            <Logo />
          )}

          <ol role="list" className="flex items-center gap-3 text-sm">
            {STEPS.map((step) => {
              const isCurrent = step.n === currentStep;
              const isDone = completedSteps.includes(step.n);
              const isClickable = isDone;
              return (
                <li key={step.n} role="listitem" aria-current={isCurrent ? 'step' : undefined}>
                  <span
                    className={cn(
                      'font-medium',
                      isCurrent && 'text-fg-brand',
                      isDone && !isCurrent && 'cursor-pointer text-fg-secondary',
                      !isDone && !isCurrent && 'text-clay-9000',
                    )}
                    aria-disabled={!isClickable && !isCurrent}
                  >
                    ({step.n}) {step.label}
                  </span>
                  {step.n < 3 && <span className="ml-3 text-clay-300">──────</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto max-w-content px-4 py-8 md:px-8">{children}</main>

      <Dialog
        isOpen={confirmOpen}
        title="ออกจากหน้าชำระเงิน?"
        description="หากออกไป คุณจะต้องเริ่มชำระเงินใหม่อีกครั้ง"
        confirmLabel="ออกจากหน้านี้"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          onLeave?.();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
