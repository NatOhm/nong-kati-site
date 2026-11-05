// @vitest-environment jsdom
/**
 * The credit-payment receipt dialog (client ask 2026-11-05: after paying with
 * credit the codes should pop up ready to copy).
 *
 * The risky parts are not styling: it must show EVERY delivered code, copy the
 * exact bytes of a multi-line block, offer one copy for several codes, and close
 * on Escape (a keyboard user is focused inside it). Those are pinned here.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeliveredCodesDialog } from '@/components/order/DeliveredCodesDialog';

const CODES = [
  { code: 'ABCD-1234-EFGH-5678', productName: 'Netflix Gift Card', denomination: 300 },
  { code: 'user@example.com:pass123\nPIN: 9988', productName: 'บัญชีทดลอง', denomination: 0 },
];

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

describe('DeliveredCodesDialog', () => {
  it('P1: shows every code, including a multi-line account block, verbatim', () => {
    render(
      <DeliveredCodesDialog
        orderNumber="NK-2026-000301"
        orderUrl="/checkout/confirmation/uuid-1"
        codes={CODES}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /ชำระด้วยเครดิตสำเร็จ/ });
    expect(dialog.textContent).toContain('NK-2026-000301');
    for (const item of CODES) {
      expect(dialog.textContent).toContain(item.productName);
    }
    const blocks = Array.from(dialog.querySelectorAll('pre')).map((p) => p.textContent);
    expect(blocks).toEqual(CODES.map((c) => c.code));
  });

  it('P2: copy-all joins every code with newlines', async () => {
    render(
      <DeliveredCodesDialog
        orderNumber="NK-2026-000301"
        orderUrl="/checkout/confirmation/uuid-1"
        codes={CODES}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /คัดลอกทั้งหมด/ }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CODES.map((c) => c.code).join('\n')),
    );
  });

  it('P3: Escape and the close button both report a close', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <DeliveredCodesDialog
        orderNumber="NK-2026-000301"
        orderUrl="/checkout/confirmation/uuid-1"
        codes={CODES}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <DeliveredCodesDialog
        orderNumber="NK-2026-000301"
        orderUrl="/checkout/confirmation/uuid-1"
        codes={CODES}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
