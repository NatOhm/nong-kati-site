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
      className={cn(
        'rounded-lg border border-amber-700/30 bg-ink-850 p-5 shadow-code-glow',
        className,
      )}
    >
      {/* Product name + denomination */}
      <p className="mb-3 text-sm font-medium text-ink-300">
        {productName} {formatThb(denomination)}
      </p>

      {/* Code + Copy */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-mono text-xl font-medium tracking-widest text-amber-300"
          style={{ letterSpacing: '0.12em' }}
          aria-label={`รหัสบัตร: ${code}`}
          role="textbox"
          aria-readonly="true"
        >
          {code}
        </span>

        <CopyButton text={code} size="sm" />
      </div>
    </div>
  );
}
