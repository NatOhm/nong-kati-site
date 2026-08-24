'use client';

import { X } from 'lucide-react';
import { useEffect, useId } from 'react';

import { cn } from '@/utils/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[680px]',
  xl: 'max-w-[840px]',
};

/**
 * 05-components.md §8.2 — centred dialog on desktop, bottom sheet on mobile.
 * Focus trapped (useFocusTrap), Escape closes unless closeOnBackdrop=false.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps): React.JSX.Element | null {
  const titleId = useId();
  const containerRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && closeOnBackdrop) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeOnBackdrop, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(7,11,20,0.80)] md:items-center">
      <button
        type="button"
        aria-label="ปิด"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => closeOnBackdrop && onClose()}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-modal-enter relative w-full rounded-t-3xl border border-ink-700 bg-ink-850 p-8 shadow-xl md:rounded-2xl',
          sizeClasses[size],
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-ink-50">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-300">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-200"
          >
            <X size={20} />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
