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
    <div className="rounded-md border border-clay-300 bg-clay-100 p-4">
      {/* Toggle header */}
      <label className="flex cursor-pointer items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
            enabled ? 'bg-peach-500' : 'bg-clay-300',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
        <span className="text-sm font-medium text-clay-700">ต้องการใบกำกับภาษี</span>
      </label>

      {/* Expanded fields */}
      {enabled && (
        <div className="mt-4 space-y-4 border-t border-clay-300 pt-4">
          {/* Name / Company */}
          <div>
            <label htmlFor="tax-name" className="mb-1 block text-sm text-clay-600">
              ชื่อ / บริษัท *
            </label>
            <input
              id="tax-name"
              type="text"
              value={value?.name ?? ''}
              onChange={(e) => onChange?.({ name: e.target.value, taxId: value?.taxId ?? '' })}
              placeholder="ชื่อหรือชื่อบริษัท"
              className={cn(
                'w-full rounded-md border bg-clay-50 px-3 py-2 text-sm text-clay-900 placeholder:text-clay-500 focus:outline-none focus:ring-2 focus:ring-peach-500',
                errors?.name ? 'border-crimson-500' : 'border-clay-300',
              )}
            />
            {errors?.name && <p className="mt-1 text-xs text-coral-600">{errors.name}</p>}
          </div>

          {/* Tax ID */}
          <div>
            <label htmlFor="tax-id" className="mb-1 block text-sm text-clay-600">
              เลขประจำตัวผู้เสียภาษี *
            </label>
            <input
              id="tax-id"
              type="text"
              value={value?.taxId ?? ''}
              onChange={(e) => onChange?.({ name: value?.name ?? '', taxId: e.target.value })}
              placeholder="0-0000-00000-00-0"
              maxLength={13}
              className={cn(
                'w-full rounded-md border bg-clay-50 px-3 py-2 text-sm text-clay-900 placeholder:text-clay-500 focus:outline-none focus:ring-2 focus:ring-peach-500',
                errors?.taxId ? 'border-crimson-500' : 'border-clay-300',
              )}
            />
            {errors?.taxId && <p className="mt-1 text-xs text-coral-600">{errors.taxId}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
