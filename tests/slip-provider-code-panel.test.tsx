// @vitest-environment jsdom
/**
 * Slip-provider-code panel on จัดการคำสั่งซื้อ (2026-11-23).
 *
 * The endpoint (GET/POST …/slip-provider-code) explains a failed slip verdict,
 * but reaching it meant calling it from the browser console: support does not
 * read JSON, and nothing stopped an accidental paid re-probe. The panel is
 * therefore only useful if three things stay true, and each is a separate way
 * the UI could quietly go wrong:
 *
 *   1. it appears ONLY under a failed `slipCheck` — a passed or never-checked
 *      order must not grow a diagnostics link;
 *   2. the first click is the FREE GET and it shows the provider code the row
 *      kept, without spending anything;
 *   3. the paid re-probe (1 Slip2Go credit) POSTs only after `window.confirm`
 *      is accepted — a dismissed dialog must mean no provider call at all.
 *
 * The real `AdminOrdersPage` is rendered with only the transport (`adminJson`,
 * `adminFetch`) and the shell mocked, so the assertions are about the page's
 * own condition and wiring, not a copy of them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AdminOrdersPage from '@/app/management/orders/page';

const adminJsonMock = vi.fn();
const adminFetchMock = vi.fn();

vi.mock('@/lib/adminSession', () => ({
  adminJson: (...args: unknown[]) => adminJsonMock(...args),
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

vi.mock('@/components/layout/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ORDER_ID = 'ord-237';
const ORDER_NUMBER = 'NK-2026-000237';

type SlipCheck = { provider: string | null; error: string | null; checkedAt: string | null };
type SlipVerification = {
  ref: string;
  verifiedAt: string | null;
  receiverAccount: string | null;
  by: string | null;
};

const ROW = {
  id: ORDER_ID,
  orderNumber: ORDER_NUMBER,
  customerEmail: 'buyer@example.com',
  status: 'pending_payment',
  paymentMethod: 'promptpay',
  subtotalThb: 67,
  discountThb: 0,
  totalThb: 67,
  itemCount: 1,
  manualFulfilmentReason: null,
  slipImageUrl: null,
  slip: null,
  createdAt: '2026-11-23T14:11:00.000Z',
  completedAt: null,
};

function detailBody(
  slipCheck: SlipCheck | null,
  slipVerification: SlipVerification | null,
): Record<string, unknown> {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    customerEmail: 'buyer@example.com',
    status: 'pending_payment',
    subtotalThb: 67,
    discountThb: 0,
    totalAmountThb: 67,
    manualFulfilmentReason: null,
    slipVerification,
    slipCheck,
    slipImageUrl: null,
    slipUploadedAt: null,
    items: [
      {
        id: 'item-1',
        productNameTh: 'สินค้าทดสอบ',
        skuCode: 'SKU-1',
        quantity: 1,
        unitPriceThb: 67,
        lineTotalThb: 67,
        deliveryStatus: 'pending',
        codesDelivered: 0,
      },
    ],
  };
}

/** GET body: the free read of the attempt row. */
function readBody(providerCode: string | null, slipAvailable: boolean): Record<string, unknown> {
  return {
    orderNumber: ORDER_NUMBER,
    stored: {
      verdict: 'INVALID_SLIP',
      provider: 'slip2go',
      detail: 'fraud: slip not found',
      providerCode,
      checkedAt: '2026-11-23T14:12:00.000Z',
      confirmedRef: null,
    },
    slipImage: { available: slipAvailable, url: null, uploadedAt: null },
    probe: {
      method: 'POST',
      sameUrl: true,
      permission: 'orders:write',
      cost: '1 Slip2Go verification credit',
      writes: false,
    },
  };
}

function stubApi(opts: {
  slipCheck: SlipCheck | null;
  slipVerification?: SlipVerification | null;
  read?: Record<string, unknown>;
  probe?: Record<string, unknown>;
}): void {
  adminJsonMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/v1/admin/orders/search')) {
      return {
        orders: [{ ...ROW, slipCheck: opts.slipCheck }],
        statusCounts: { pending_payment: 1 },
      };
    }
    if (path.endsWith('/slip-provider-code')) {
      if (init?.method === 'POST') return opts.probe ?? {};
      return opts.read ?? readBody(null, false);
    }
    if (path === `/api/v1/admin/orders/${ORDER_ID}`) {
      return detailBody(opts.slipCheck, opts.slipVerification ?? null);
    }
    throw new Error(`unexpected adminJson path: ${path}`);
  });
}

function providerCalls(method?: 'POST'): [string, RequestInit | undefined][] {
  return (adminJsonMock.mock.calls as [string, RequestInit | undefined][]).filter(
    ([path, init]) =>
      path.endsWith('/slip-provider-code') && (method ? init?.method === 'POST' : true),
  );
}

/** Open the row's detail modal — the only place the panel may appear. */
async function openOrder(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /^ดู$/ }));
  await screen.findByText(/คำสั่งซื้อ NK-2026-000237/);
}

beforeEach(() => {
  vi.clearAllMocks();
  // SlipImageView is not rendered (slipImageUrl is null), but a stray request
  // should fail loudly rather than hit the network.
  adminFetchMock.mockResolvedValue({ ok: false, status: 500 });
});

describe('orders page — slip provider code panel', () => {
  it('renders nothing when the slip check passed', async () => {
    stubApi({
      slipCheck: { provider: 'slip2go', error: null, checkedAt: '2026-11-23T14:12:00.000Z' },
      slipVerification: {
        ref: '016301135420CTF09818',
        verifiedAt: '2026-11-23T14:12:00.000Z',
        receiverAccount: '199-1-73578-6',
        by: 'slip2go:auto',
      },
    });
    render(<AdminOrdersPage />);
    await openOrder();

    expect(screen.queryByText('ดูรหัสจากผู้ให้บริการ')).toBeNull();
    expect(providerCalls()).toHaveLength(0);
  });

  it('renders the affordance when slipCheck is a failed verdict', async () => {
    stubApi({
      slipCheck: { provider: 'slip2go', error: 'INVALID_SLIP', checkedAt: '2026-11-23T14:12:00.000Z' },
    });
    render(<AdminOrdersPage />);
    await openOrder();

    expect(await screen.findByText('ดูรหัสจากผู้ให้บริการ')).toBeTruthy();
    // Nothing is fetched until the admin asks.
    expect(providerCalls()).toHaveLength(0);
  });

  it('shows the stored provider code from the free GET, without POSTing', async () => {
    stubApi({
      slipCheck: { provider: 'slip2go', error: 'INVALID_SLIP', checkedAt: '2026-11-23T14:12:00.000Z' },
      read: readBody('200500', true),
    });
    render(<AdminOrdersPage />);
    await openOrder();

    fireEvent.click(await screen.findByText('ดูรหัสจากผู้ให้บริการ'));

    expect(await screen.findByText(/รหัสจากผู้ให้บริการ: 200500/)).toBeTruthy();
    expect(screen.getByText(/fraud: slip not found/)).toBeTruthy();

    const calls = providerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]?.method ?? 'GET').toBe('GET');
    expect(providerCalls('POST')).toHaveLength(0);
  });

  it('re-probes only after the credit warning is confirmed', async () => {
    stubApi({
      slipCheck: { provider: 'slip2go', error: 'INVALID_SLIP', checkedAt: '2026-11-23T14:12:00.000Z' },
      read: readBody(null, true),
      probe: {
        orderNumber: ORDER_NUMBER,
        matched: false,
        verdict: 'INVALID_SLIP',
        detail: 'fraud: slip not found',
        providerCode: '200500',
        providerMessage: 'fraud: slip not found',
        httpStatus: 200,
      },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdminOrdersPage />);
    await openOrder();

    fireEvent.click(await screen.findByText('ดูรหัสจากผู้ให้บริการ'));
    await screen.findByText(/แถวนี้ไม่ได้เก็บรหัสดิบ/);

    // Dismissed confirm → no provider call, still the unprobed explanation.
    fireEvent.click(screen.getByText(/ยิงตรวจซ้ำกับ Slip2Go/));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(providerCalls('POST')).toHaveLength(0);
    expect(screen.queryByText(/ผู้ให้บริการตอบ/)).toBeNull();

    // Accepted confirm → exactly one paid probe, and its raw code is shown.
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText(/ยิงตรวจซ้ำกับ Slip2Go/));

    expect(await screen.findByText(/ผู้ให้บริการตอบ INVALID_SLIP · code 200500/)).toBeTruthy();
    expect(providerCalls('POST')).toHaveLength(1);

    confirmSpy.mockRestore();
  });
});
