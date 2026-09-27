/**
 * Payment channel resolution (production roadmap §4).
 *
 * Order creation must succeed when at least ONE usable payment channel
 * exists — Opn PromptPay, enabled manual transfer, or an authenticated
 * customer wallet. The previous gate required manual-transfer settings
 * even when Opn was fully configured (and ignored wallets entirely).
 *
 * Extracted from the orders route so the channel matrix is unit-testable
 * without HTTP: Opn-only succeeds, manual-only succeeds, wallet-only
 * succeeds for authenticated customers, and a truly channel-less
 * environment still fails closed with NO_PAYMENT_CHANNEL.
 */

import { getCustomerFromToken } from '@/api/customerAuth';

export interface ResolvedChannels {
  opn: boolean;
  manual: boolean;
  wallet: boolean;
}

/**
 * Resolve which channels can serve a customer right now.
 *
 * `customerSessionCookie` is the raw `nk_session` cookie value (null for
 * guests). A wallet channel is available when the customer session is
 * valid — balance is checked (and topped up if needed) at pay time, so a
 * zero balance does not remove the channel, it just needs a top-up first.
 */
export async function resolvePaymentChannels(opts: {
  manualUsable: boolean;
  opnReady: boolean;
  customerSessionCookie?: string | null;
}): Promise<ResolvedChannels> {
  let wallet = false;
  if (opts.customerSessionCookie) {
    try {
      const customer = await getCustomerFromToken(opts.customerSessionCookie);
      wallet = Boolean(customer);
    } catch {
      wallet = false; // invalid/expired session — guest
    }
  }
  return { opn: opts.opnReady, manual: opts.manualUsable, wallet };
}

/** True when at least one channel can take the payment. */
export function hasUsableChannel(channels: ResolvedChannels): boolean {
  return channels.opn || channels.manual || channels.wallet;
}
