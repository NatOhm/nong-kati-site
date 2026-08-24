'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface CheckoutStepperProps {
  currentStep: 1 | 2 | 3;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

const STEPS = [
  { number: 1, label: 'ข้อมูล' },
  { number: 2, label: 'ชำระเงิน' },
  { number: 3, label: 'ยืนยัน' },
];

/**
 * 05-components.md §5.1 — Checkout Stepper.
 * 3-step progress indicator: Contact → Payment → Confirmation.
 */
export function CheckoutStepper({
  currentStep,
  completedSteps,
  onStepClick,
}: CheckoutStepperProps): React.JSX.Element {
  return (
    <nav aria-label="ขั้นตอนการชำระเงิน" className="w-full">
      <ol className="flex items-center" role="list">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.number);
          const isCurrent = step.number === currentStep;
          const isFuture = step.number > currentStep && !isCompleted;
          const isClickable = isCompleted || isCurrent;

          return (
            <li
              key={step.number}
              className="flex flex-1 items-center"
              role="listitem"
            >
              <button
                onClick={() => isClickable && onStepClick(step.number)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={
                  isCompleted
                    ? `สำเร็จ: ${step.label}`
                    : isCurrent
                      ? `ปัจจุบัน: ${step.label}`
                      : step.label
                }
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-not-allowed',
                  isCurrent && 'text-amber-300',
                  isCompleted && 'text-jade-400',
                  isFuture && 'text-ink-400',
                )}
              >
                {/* Step circle */}
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    isCurrent && 'bg-amber-400 text-ink-900',
                    isCompleted && 'bg-jade-500 text-white',
                    isFuture && 'border border-ink-600 bg-ink-800 text-ink-400',
                  )}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : (
                    step.number
                  )}
                </span>

                {/* Step label — hidden on mobile */}
                <span className="hidden sm:inline">{step.label}</span>
              </button>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-px flex-1',
                    isCompleted ? 'bg-jade-500' : 'bg-ink-700',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
