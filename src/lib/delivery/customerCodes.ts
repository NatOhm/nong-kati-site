/**
 * Customer-facing code retrieval (finding #4): order pages must render the
 * REAL delivered gift codes, not placeholders. Decryption happens here,
 * server-side only — plaintext codes never reach a JSON API or a log.
 *
 * ONE sanctioned exception (2026-11-01, client feedback "show the product on
 * the webpage when payment is correct"): POST /api/v1/payments/slip-verify
 * returns the just-delivered codes on its own 200 so the payment screen can
 * render them without a reload. That is the request the customer already
 * made to prove the slip — same capability token (HMAC orderId:uuid), no new
 * endpoint, no code in a URL, and `Cache-Control: no-store` so nothing
 * caches or replays it.
 *
 * Second sanctioned exception (2026-11-05): POST /api/v1/orders/[id]/pay-wallet
 * returns the codes it just fulfilled, so the checkout can show the receipt
 * immediately instead of only after a reload. Same reasoning — authenticated
 * session, the customer's own order, no new endpoint, `no-store`.
 *
 * Any other JSON path returning plaintext codes is still a defect.
 *
 * Access model: confirmationUuid is treated as a bearer credential (the
 * guest purchase flow was built around it); this helper is only ever called
 * after the caller has resolved the order through that UUID.
 */

import { prisma } from '@/lib/db';
import { decryptCode } from '@/lib/crypto/giftCode';

export interface CustomerCode {
  code: string;
  productName: string;
  denomination: number;
}

/** Delivered codes for an order, decrypted server-side for the customer pages. */
export async function getDeliveredCodes(orderId: string): Promise<CustomerCode[]> {
  const rows = await prisma.giftCode.findMany({
    where: { orderId, status: 'delivered' },
    select: {
      codeEncrypted: true,
      nonce: true,
      keyVersion: true,
      orderItem: {
        select: { productNameTh: true, denominationThb: true },
      },
    },
  });

  return rows.map((row) => ({
    code: decryptCode(row.codeEncrypted, row.nonce, row.keyVersion),
    productName: row.orderItem?.productNameTh ?? '',
    denomination: Number(row.orderItem?.denominationThb ?? 0),
  }));
}
