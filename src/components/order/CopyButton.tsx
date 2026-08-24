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

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  }, [text, onCopied]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 font-medium text-ink-200 transition-all hover:border-ink-400 hover:text-ink-100',
        copied && 'border-jade-700 bg-jade-900/30 text-jade-300',
        sizeClasses[size],
        className,
      )}
      aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
    >
      {copied ? (
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
