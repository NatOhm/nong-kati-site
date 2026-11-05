// @vitest-environment jsdom
/**
 * "ประวัติการเติมเงิน" on the profile page must list top-ups, not purchases.
 *
 * `GET /api/v1/wallet` returns the whole wallet ledger, and purchases are stored
 * as NEGATIVE `wallet_spend` rows in the same table. The dashboard printed the
 * first five rows of it, so a purchase appeared as a top-up and — because the
 * label map had no entry for it — showed the raw `wallet_spend` string to the
 * customer. Combined with the month total bug (see wallet-month-totals), the
 * card read as "my bank top-up never arrived".
 *
 * Pinned here:
 *   H1  negative ledger rows never appear in the top-up list,
 *   H2  a bank/admin credit is labelled in Thai, never by its raw method key.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/layout/CustomerProfileProvider', () => ({
  useCustomerProfile: () => ({ state: 'authed', reload: vi.fn() }),
}));

vi.mock('@/components/account/AccountTabs', () => ({
  AccountTabs: () => <div />,
}));

import ProfilePage from '@/app/account/dashboard/page';

const WALLET = {
  balanceThb: 620,
  topupThisMonthThb: 500,
  spendThisMonthThb: 300,
  lifetimeSpendThb: 1290,
  topups: [
    {
      id: 't1',
      amountThb: 500,
      method: 'admin_credit',
      status: 'completed',
      createdAt: '2026-11-05T02:00:00.000Z',
    },
    {
      id: 't2',
      amountThb: -300,
      method: 'wallet_spend',
      status: 'completed',
      createdAt: '2026-11-04T02:00:00.000Z',
    },
  ],
  spendHistory: [],
};

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(WALLET), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('โปรไฟล์ของฉัน — ประวัติการเติมเงิน', () => {
  it('H1/H2: only credits are listed, with a Thai method label', async () => {
    render(<ProfilePage />);

    // The row's <p> is "<date> · <method>", so match by substring.
    await waitFor(() => expect(screen.getByText(/แอดมินเติมเครดิต/)).toBeTruthy());

    // The purchase row is a spending entry, not a top-up.
    expect(screen.queryByText(/^\s*-฿300\.00\s*$/)).toBeNull();
    expect(screen.queryByText(/wallet_spend/)).toBeNull();
    // ...and the credit is shown as money in: once as the month total, once
    // in the history row.
    expect(screen.getAllByText('฿500.00')).toHaveLength(2);
  });
});
