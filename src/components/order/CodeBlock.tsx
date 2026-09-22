'use client';

import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import { CopyButton } from './CopyButton';

export interface CodeBlockProps {
  code: string;
  productName: string;
  denomination: number;
  className?: string;
}

/**
 * 05-components.md §6.1 — Code Block.
 * Prominent code display with amber glow border and copy button.
 */
export function CodeBlock({
  code,
  productName,
  denomination,
  className,
}: CodeBlockProps): React.JSX.Element {
  return (
    <div
      className={cn('rounded-lg border border-line-brand bg-white p-5 shadow-code-glow', className)}
    >
      {/* Product name + denomination */}
      <p className="mb-3 text-sm font-medium text-fg-muted">
        {productName} {formatThb(denomination)}
      </p>

      {/* Code + Copy — multi-line account blocks render pre-wrapped */}
      {code.includes('\n') ? (
        <div className="space-y-2">
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-elevated p-3 font-mono text-sm leading-relaxed text-fg">
            {code}
          </pre>
          <div className="flex justify-end">
            <CopyButton text={code} size="sm" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span
            className="font-mono text-xl font-medium tracking-widest text-fg-brand"
            style={{ letterSpacing: '0.12em' }}
            aria-label={`รหัสบัตร: ${code}`}
            role="textbox"
            aria-readonly="true"
          >
            {code}
          </span>

          <CopyButton text={code} size="sm" />
        </div>
      )}
    </div>
  );
}
