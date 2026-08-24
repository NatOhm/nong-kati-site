'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/utils/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  side?: 'left' | 'right' | 'bottom';
  title?: string;
  children: React.ReactNode;
  /** For left/right sides — default '400px'. */
  width?: string;
}

const sideTransform: Record<NonNullable<DrawerProps['side']>, string> = {
  left: 'left-0 top-0 h-full -translate-x-full data-[open=true]:translate-x-0',
  right: 'right-0 top-0 h-full translate-x-full data-[open=true]:translate-x-0',
  bottom: 'bottom-0 left-0 w-full translate-y-full data-[open=true]:translate-y-0',
};

/** 05-components.md §8.3 — role="dialog", focus trapped, Escape closes, backdrop = bg-overlay. */
export function Drawer({ isOpen, onClose, side = 'right', title, children, width = '400px' }: DrawerProps): React.JSX.Element | null {
  const containerRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="ปิด"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[rgba(7,11,20,0.80)]"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-open={isOpen}
        style={side !== 'bottom' ? { width } : undefined}
        className={cn(
          'absolute flex flex-col bg-ink-850 shadow-xl transition-transform duration-slow ease-out-quart',
          side === 'bottom' ? 'max-h-[85vh] rounded-t-3xl' : 'w-full max-w-full',
          sideTransform[side],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-700 p-4">
            <h2 className="font-ui text-lg font-semibold text-ink-50">{title}</h2>
            <button type="button" aria-label="ปิด" onClick={onClose} className="text-ink-400 hover:text-ink-200">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
