'use client';

import { useState } from 'react';
import { cn } from '@/utils/cn';
import { isValidEmail } from '@/lib/pricing';
import { TaxInvoiceToggle } from './TaxInvoiceToggle';
import { ConsentCheckbox } from './ConsentCheckbox';

export interface ContactFormData {
  email: string;
  phone: string;
  requiresTaxInvoice: boolean;
  taxInvoiceName: string;
  taxInvoiceTaxId: string;
  tosAccepted: boolean;
  marketingOptIn: boolean;
}

export interface ContactFormProps {
  defaultValues?: Partial<ContactFormData>;
  readOnlyEmail?: boolean;
  onSubmit: (data: ContactFormData) => void;
  loading?: boolean;
}

/**
 * 05-components.md §5.2 — Contact Form (Checkout Step 1).
 * Email (required), phone (optional), tax invoice toggle, consent checkboxes.
 */
export function ContactForm({
  defaultValues,
  readOnlyEmail = false,
  onSubmit,
  loading = false,
}: ContactFormProps): React.JSX.Element {
  const [email, setEmail] = useState(defaultValues?.email ?? '');
  const [phone, setPhone] = useState(defaultValues?.phone ?? '');
  const [requiresTaxInvoice, setRequiresTaxInvoice] = useState(
    defaultValues?.requiresTaxInvoice ?? false,
  );
  const [taxInvoiceName, setTaxInvoiceName] = useState(
    defaultValues?.taxInvoiceName ?? '',
  );
  const [taxInvoiceTaxId, setTaxInvoiceTaxId] = useState(
    defaultValues?.taxInvoiceTaxId ?? '',
  );
  const [tosAccepted, setTosAccepted] = useState(
    defaultValues?.tosAccepted ?? false,
  );
  const [marketingOptIn, setMarketingOptIn] = useState(
    defaultValues?.marketingOptIn ?? false,
  );

  interface FormErrors {
    email?: string;
    tos?: string;
    taxInvoiceName?: string;
    taxInvoiceTaxId?: string;
  }

  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email || !isValidEmail(email)) {
      newErrors.email = 'กรุณากรอกอีเมลที่ถูกต้อง';
    }

    if (!tosAccepted) {
      newErrors.tos = 'กรุณายอมรับเงื่อนไขการใช้งาน';
    }

    if (requiresTaxInvoice) {
      if (!taxInvoiceName.trim()) {
        newErrors.taxInvoiceName = 'กรุณากรอกชื่อหรือชื่อบริษัท';
      }
      if (!/^\d{13}$/.test(taxInvoiceTaxId)) {
        newErrors.taxInvoiceTaxId = 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        email,
        phone,
        requiresTaxInvoice,
        taxInvoiceName,
        taxInvoiceTaxId,
        tosAccepted,
        marketingOptIn,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email */}
      <div>
        <label htmlFor="checkout-email" className="mb-1 block text-sm font-medium text-ink-200">
          อีเมล *
        </label>
        <input
          id="checkout-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={readOnlyEmail}
          required
          placeholder="kaem@example.com"
          className={cn(
            'w-full rounded-md border bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500',
            errors.email ? 'border-crimson-500' : 'border-ink-600',
            readOnlyEmail && 'cursor-not-allowed opacity-70',
          )}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-crimson-400">{errors.email}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="checkout-phone" className="mb-1 block text-sm font-medium text-ink-200">
          เบอร์โทรศัพท์ (LINE)
          <span className="ml-1 text-ink-400">(ไม่บังคับ)</span>
        </label>
        <input
          id="checkout-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0812345678"
          className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Tax Invoice Toggle */}
      <TaxInvoiceToggle
        enabled={requiresTaxInvoice}
        onToggle={setRequiresTaxInvoice}
        value={{
          name: taxInvoiceName,
          taxId: taxInvoiceTaxId,
        }}
        onChange={(val) => {
          setTaxInvoiceName(val.name);
          setTaxInvoiceTaxId(val.taxId);
        }}
        errors={{
          name: errors.taxInvoiceName,
          taxId: errors.taxInvoiceTaxId,
        }}
      />

      {/* Consent Checkboxes */}
      <div className="space-y-3">
        <ConsentCheckbox
          id="tos"
          label={
            <>
              ยอมรับ{' '}
              <a href="/terms" className="text-amber-300 hover:underline" target="_blank" rel="noopener noreferrer">
                เงื่อนไขการใช้งาน
              </a>{' '}
              และ{' '}
              <a href="/privacy" className="text-amber-300 hover:underline" target="_blank" rel="noopener noreferrer">
                นโยบายความเป็นส่วนตัว
              </a>{' '}
              *
            </>
          }
          checked={tosAccepted}
          onChange={setTosAccepted}
          required
        />
        {errors.tos && (
          <p className="text-xs text-crimson-400">{errors.tos}</p>
        )}

        <ConsentCheckbox
          id="marketing"
          label="รับข่าวสารและโปรโมชัน"
          checked={marketingOptIn}
          onChange={setMarketingOptIn}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className={cn(
          'w-full rounded-md px-5 py-3 text-base font-semibold transition-colors',
          loading
            ? 'cursor-wait bg-ink-700 text-ink-400'
            : 'bg-amber-400 text-ink-900 hover:bg-amber-300',
        )}
      >
        {loading ? 'กำลังดำเนินการ...' : 'ดำเนินการต่อ'}
      </button>
    </form>
  );
}
