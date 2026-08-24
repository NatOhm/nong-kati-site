'use client';

import { cn } from '@/utils/cn';

export interface TaxInvoiceData {
  name: string;
  taxId: string;
}

export interface TaxInvoiceToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  value?: TaxInvoiceData;
  onChange?: (value: TaxInvoiceData) => void;
  errors?: {
    name?: string | undefined;
    taxId?: string | undefined;
  };
}

/**
 * 05-components.md §5.3 — Tax Invoice Toggle.
 * Expandable section for requesting a Thai tax invoice (ใบกำกับภาษี).
 */
export function TaxInvoiceToggle({
  enabled,
  onToggle,
  value,
  onChange,
  errors,
}: TaxInvoiceToggleProps): React.JSX.Element {
  return (
    <div className="rounded-md border border-ink-600 bg-ink-800 p-4">
      {/* Toggle header */}
      <label className="flex cursor-pointer items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
            enabled ? 'bg-amber-400' : 'bg-ink-600',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
        <span className="text-sm font-medium text-ink-200">
          ต้องการใบกำกับภาษี
        </span>
      </label>

      {/* Expanded fields */}
      {enabled && (
        <div className="mt-4 space-y-4 border-t border-ink-600 pt-4">
          {/* Name / Company */}
          <div>
            <label htmlFor="tax-name" className="mb-1 block text-sm text-ink-300">
              ชื่อ / บริษัท *
            </label>
            <input
              id="tax-name"
              type="text"
              value={value?.name ?? ''}
              onChange={(e) =>
                onChange?.({ name: e.target.value, taxId: value?.taxId ?? '' })
              }
              placeholder="ชื่อหรือชื่อบริษัท"
              className={cn(
                'w-full rounded-md border bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500',
                errors?.name ? 'border-crimson-500' : 'border-ink-600',
              )}
            />
            {errors?.name && (
              <p className="mt-1 text-xs text-crimson-400">{errors.name}</p>
            )}
          </div>

          {/* Tax ID */}
          <div>
            <label htmlFor="tax-id" className="mb-1 block text-sm text-ink-300">
              เลขประจำตัวผู้เสียภาษี *
            </label>
            <input
              id="tax-id"
              type="text"
              value={value?.taxId ?? ''}
              onChange={(e) =>
                onChange?.({ name: value?.name ?? '', taxId: e.target.value })
              }
              placeholder="0-0000-00000-00-0"
              maxLength={13}
              className={cn(
                'w-full rounded-md border bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500',
                errors?.taxId ? 'border-crimson-500' : 'border-ink-600',
              )}
            />
            {errors?.taxId && (
              <p className="mt-1 text-xs text-crimson-400">{errors.taxId}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
