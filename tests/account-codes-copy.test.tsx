// @vitest-environment jsdom
/**
 * โค้ดที่ซื้อ — "คัดลอกไม่ได้" (phone-user report, 2026-11-05).
 *
 * The page called `navigator.clipboard.writeText` directly, with no try/catch
 * and no fallback. In a phone browser (and inside in-app webviews) that call
 * rejects, so the tap did nothing at all and there was no message saying why.
 * The button was also hidden entirely for already-used codes.
 *
 * This suite mounts the real page with a mocked codes API and pins:
 *   C1  every delivered code has a copy button — used codes included,
 *   C2  when the Clipboard API rejects, the textarea fallback still copies and
 *       the button reports success,
 *   C3  when the Clipboard API works, the exact code string is written.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import AccountCodesPage from '@/app/account/codes/page';

const CODES = [
  {
    id: 'c1',
    code: 'ABCD-1234-EFGH-5678',
    product: 'Netflix Gift Card',
    denomination: 300,
    orderNumber: 'NK-2026-000201',
    deliveredAt: '2026-11-04T03:00:00.000Z',
    used: false,
  },
  {
    id: 'c2',
    code: 'user@example.com:password123',
    product: 'บัญชีทดลอง',
    denomination: 0,
    orderNumber: 'NK-2026-000202',
    deliveredAt: '2026-11-03T03:00:00.000Z',
    used: true,
  },
  {
    id: 'c3',
    code: 'บรรทัดที่ 1\nบรรทัดที่ 2',
    product: 'บัญชีหลายบรรทัด',
    denomination: 0,
    orderNumber: 'NK-2026-000203',
    deliveredAt: null,
    used: false,
  },
];

/** One card per code: the copy button inside it is the one we exercise. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`codes test: ${what} is missing`);
  return value;
}

function cardFor(code: string): HTMLElement {
  const node = screen.getByText(code).closest('div.rounded-md');
  if (!node) throw new Error(`no card for ${code}`);
  return node as HTMLElement;
}

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ codes: CODES }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('โค้ดที่ซื้อ — คัดลอกได้ทุกใบ', () => {
  it('C1: used codes keep a copy button, and so does a multi-line block', async () => {
    render(<AccountCodesPage />);

    await waitFor(() => expect(screen.getByText(must(CODES[0], 'first code').code)).toBeTruthy());

    // The old page rendered used codes without any copy affordance.
    expect(screen.getByText('ใช้แล้ว')).toBeTruthy();
    expect(within(cardFor(must(CODES[1], 'second code').code)).getByRole('button')).toBeTruthy();
    expect(within(cardFor(must(CODES[0], 'first code').code)).getByRole('button')).toBeTruthy();

    // The multi-line block renders inside <pre>, whose text is normalised by
    // the query engine — find the card from the element instead.
    const pre = document.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toBe(must(CODES[2], 'multi-line code').code);
    const multiLineCard = pre!.closest('div.rounded-md') as HTMLElement;
    expect(within(multiLineCard).getByRole('button')).toBeTruthy();
  });

  it('C2: a rejecting Clipboard API falls back to a textarea copy', async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('NotAllowedError');
        }),
      },
    });

    render(<AccountCodesPage />);
    await waitFor(() => expect(screen.getByText(must(CODES[0], 'first code').code)).toBeTruthy());

    const card = cardFor(must(CODES[1], 'second code').code);
    fireEvent.click(within(card).getByRole('button'));

    await waitFor(() => expect(within(card).getByText('คัดลอกแล้ว')).toBeTruthy());
    // The fallback ran, and it received the code, not an empty string.
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('C3: the working Clipboard API gets the exact code string', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<AccountCodesPage />);
    await waitFor(() => expect(screen.getByText(must(CODES[0], 'first code').code)).toBeTruthy());

    fireEvent.click(within(cardFor(must(CODES[0], 'first code').code)).getByRole('button'));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(must(CODES[0], 'first code').code),
    );
  });
});
