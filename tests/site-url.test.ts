/**
 * Customer links have exactly one owner (review 2026-11-06).
 *
 * The order email built its link in two places. `lib/fulfilment.ts` failed
 * closed (production threw when NEXT_PUBLIC_SITE_URL was missing), but
 * `src/api/orderLookup.ts` — the RESEND path, which is the one an operator
 * presses when a customer says "I never got my codes" — appended to
 * `?? 'http://localhost:3000'`. In production that silently mailed a working
 * order link pointing at the customer's own machine. Both now call
 * `siteUrl()` from lib/siteUrl.ts.
 *
 *   S1  production + variable unset → BOTH paths throw before any I/O,
 *   S2  a configured value wins and trailing slashes are stripped,
 *   S3  non-production keeps the documented localhost default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailWithRetry = vi.hoisted(() => vi.fn());
const enqueueEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/resend', () => ({ sendEmailWithRetry }));
vi.mock('@/lib/email/outbox', () => ({ enqueueEmail, scheduleOutboxDrain: vi.fn() }));

import { siteUrl } from '@/lib/siteUrl';
import { sendOrderConfirmationEmail } from '@/api/orderLookup';
import { enqueueCodeDeliveryEmail } from '@/lib/fulfilment';

/** Minimal order shape both call sites read. */
const ORDER = {
  id: 'ord-1',
  confirmationUuid: 'cu-1',
  orderNumber: 'NK-2026-000999',
  customerEmail: 'cust@test.local',
  status: 'payment_confirmed',
  items: [
    {
      id: 'oi-1',
      productNameTh: 'HBO Max 7 วัน',
      denominationThb: 25,
      quantity: 1,
    },
  ],
  subtotalThb: 100,
  vatAmountThb: 7,
  totalAmountThb: 107,
  vatEnabled: false,
  vatRate: 0,
};

beforeEach(() => {
  sendEmailWithRetry.mockReset().mockResolvedValue({ success: true });
  enqueueEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('siteUrl — one owner for customer-facing links', () => {
  it('S1: production without the variable throws in BOTH email paths, before any I/O', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    expect(() => siteUrl()).toThrow(/required in production/);

    // Resend path (orderLookup).
    await expect(sendOrderConfirmationEmail(ORDER as never)).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL is required in production/,
    );
    expect(sendEmailWithRetry).not.toHaveBeenCalled();

    // Delivery path (fulfilment) — the throw must come before the outbox row,
    // otherwise a broken URL would still be queued and sent later.
    await expect(
      enqueueCodeDeliveryEmail({} as never, ORDER as never, [
        { code: 'CODE-1', productName: 'HBO Max 7 วัน', denomination: 25 },
      ]),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL is required in production/);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('S2: a configured value wins, trailing slashes stripped, and it is the link host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://nongkatistore.com///');

    expect(siteUrl()).toBe('https://nongkatistore.com');

    await sendOrderConfirmationEmail(ORDER as never);
    expect(sendEmailWithRetry).toHaveBeenCalledTimes(1);
    const html = (sendEmailWithRetry.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain('https://nongkatistore.com/orders/cu-1');
    expect(html).not.toContain('localhost');
  });

  it('S3: non-production keeps the localhost default', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
