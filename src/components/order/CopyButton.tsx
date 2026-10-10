'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface CopyButtonProps {
  text: string;
  onCopied?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 05-components.md §6.2 — Copy Button.
 * Copies text to clipboard, shows "คัดลอกแล้ว" for 2 seconds.
 * Spring animation on copied state.
 */
export function CopyButton({
  text,
  onCopied,
  size = 'md',
  className,
}: CopyButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = useCallback(async () => {
    setCopied(false);
    setFailed(false);
    try {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for older browsers; report failure if the browser refuses it.
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        try {
          textarea.select();
          if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected');
        } finally {
          document.body.removeChild(textarea);
        }
      }

      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    }
  }, [text, onCopied]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'transition-smart inline-flex items-center whitespace-nowrap rounded-md border border-line bg-surface font-medium text-fg-secondary hover:border-line-brand hover:text-fg',
        copied && 'border-jade-700 bg-jade-500/15 text-jade-700',
        failed && 'border-fg-error text-fg-error',
        sizeClasses[size],
        className,
      )}
      aria-label={copied ? 'คัดลอกแล้ว' : failed ? 'คัดลอกไม่สำเร็จ' : 'คัดลอกข้อมูลส่งมอบ'}
      aria-live="polite"
    >
      {failed ? (
        <span>คัดลอกไม่สำเร็จ</span>
      ) : copied ? (
        <>
          <Check size={size === 'sm' ? 12 : 14} strokeWidth={2.5} />
          <span>คัดลอกแล้ว</span>
        </>
      ) : (
        <>
          <Copy size={size === 'sm' ? 12 : 14} strokeWidth={1.5} />
          <span>คัดลอก</span>
        </>
      )}
    </button>
  );
}
