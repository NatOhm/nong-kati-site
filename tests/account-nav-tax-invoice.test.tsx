// @vitest-environment jsdom
/**
 * ใบกำกับภาษี is a switch, and the account menu obeys it (2026-11-05).
 *
 * `tax-invoice-setting.test.ts` pins the stored flag and the admin route;
 * `checkout-tax-invoice-gate.test.tsx` pins the checkout form. The fourth
 * surface the switch owns is the account navigation: with the store unable to
 * issue invoices, a nav row to an empty page is worse than no row. That filter
 * lives inline in the layout's `navItems`, so this mounts the real
 * `AccountLayout` and reads the menu it renders.
 *
 *   N1  switch off → no ใบกำกับภาษี link (the rest of the menu stays),
 *   N2  switch on → the link is back.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/account/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/components/layout/CustomerProfileProvider', () => ({
  useCustomerProfile: () => ({ state: 'authed', reload: vi.fn() }),
}));

import AccountLayout from '@/app/account/layout';

function stubSwitch(enabled: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/settings/tax-invoice')) {
        return new Response(JSON.stringify({ enabled }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('เมนูบัญชี — ใบกำกับภาษี', () => {
  it('N1: switch off removes the nav row, and only that row', async () => {
    stubSwitch(false);
    render(
      <AccountLayout>
        <p>content</p>
      </AccountLayout>,
    );

    // The menu itself still renders (the filter runs after the switch loads).
    await waitFor(() => expect(screen.getByRole('link', { name: /คำสั่งซื้อ/ })).toBeTruthy());
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /ใบกำกับภาษี/ })).toBeNull(),
    );
  });

  it('N2: switching it back on restores the nav row', async () => {
    stubSwitch(true);
    render(
      <AccountLayout>
        <p>content</p>
      </AccountLayout>,
    );

    await waitFor(() => expect(screen.getByRole('link', { name: /ใบกำกับภาษี/ })).toBeTruthy());
  });
});
