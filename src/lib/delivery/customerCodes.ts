/**
 * Customer-facing code retrieval (finding #4): order pages must render the
 * REAL delivered gift codes, not placeholders. Decryption happens here,
 * server-side only — plaintext codes never reach a JSON API or a log.
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
      orderItem: {
        select: { productNameTh: true, denominationThb: true },
      },
    },
  });

  return rows.map((row) => ({
    code: decryptCode(row.codeEncrypted, row.nonce),
    productName: row.orderItem?.productNameTh ?? '',
    denomination: Number(row.orderItem?.denominationThb ?? 0),
  }));
}
