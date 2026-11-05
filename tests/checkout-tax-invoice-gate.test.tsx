// @vitest-environment jsdom
/**
 * Checkout must stop asking for a ใบกำกับภาษี while the store cannot issue one.
 *
 * The setting alone is not the feature — the request form is what the customer
 * sees. This mounts the real ContactForm and pins:
 *   G1  with the switch off, no tax-invoice control is rendered at all,
 *   G2  submitting in that state sends `requiresTaxInvoice: false` with empty
 *       name/tax-id (an order must never carry a promise nobody can keep),
 *   G3  with the switch on, the control returns and its validation still runs.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ContactForm } from '@/components/checkout/ContactForm';

function fillRequired(): void {
  fireEvent.change(screen.getByLabelText(/อีเมล \*/), {
    target: { value: 'somchai@example.com' },
  });
  // T&C is the last consent checkbox in the form.
  const checkboxes = screen.getAllByRole('checkbox');
  fireEvent.click(checkboxes[0] as HTMLElement);
}

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
});

describe('checkout — ใบกำกับภาษี switch', () => {
  it('G1: switch off renders no tax-invoice control', () => {
    render(<ContactForm taxInvoiceEnabled={false} onSubmit={vi.fn()} />);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('ต้องการใบกำกับภาษี')).toBeNull();
    expect(screen.queryByText(/เลขประจำตัวผู้เสียภาษี/)).toBeNull();
  });

  it('G2: switch off submits requiresTaxInvoice=false with empty tax fields', () => {
    const onSubmit = vi.fn();
    render(<ContactForm taxInvoiceEnabled={false} onSubmit={onSubmit} />);

    fillRequired();
    fireEvent.submit(screen.getByRole('button', { name: /ดำเนินการต่อ|ถัดไป|ยืนยัน/ }).closest('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      email: 'somchai@example.com',
      requiresTaxInvoice: false,
      taxInvoiceName: '',
      taxInvoiceTaxId: '',
      tosAccepted: true,
    });
  });

  it('G3: switch on brings the control back, with its validation intact', () => {
    const onSubmit = vi.fn();
    render(<ContactForm taxInvoiceEnabled onSubmit={onSubmit} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fillRequired();
    fireEvent.submit(screen.getByRole('switch').closest('form')!);

    // Missing name / 13-digit tax id blocks the step instead of being dropped.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('กรุณากรอกชื่อหรือชื่อบริษัท')).toBeTruthy();
    expect(screen.getByText('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')).toBeTruthy();
  });
});
