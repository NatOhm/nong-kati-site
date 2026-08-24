/**
 * Code Delivery Pipeline — 10-digital-code.md §8.
 *
 * Trigger: payment.succeeded webhook (verified signature, verified amount, idempotency-checked).
 * Target: < 60 seconds from payment.succeeded (P95).
 *
 * §8.1: Reserved codes promoted to delivered in single transaction.
 * §8.2: Decryption happens ONLY after commit, in memory, immediately before handoff.
 * §8.3: Delivered codes can never be reassigned (immutability guarantee).
 *
 * IMPORTANT: Decrypted plaintext is NEVER logged, NEVER written to any table,
 * NEVER included in audit_logs.diff (per 06-database.md §14, 10-digital-code.md §12).
 */

import { decryptCode } from '@/lib/crypto/giftCode';
import { assignCodes, type CodeAssignment } from './reservation';

export interface DeliveryResult {
  success: boolean;
  codes?: {
    code: string;
    productName: string;
    denomination: number;
  }[];
  error?: string;
}

export interface CodeDeliveryInput {
  orderId: string;
  orderItemId: string;
  variantId: string;
  productNameTh: string;
  denominationThb: number;
  quantity: number;
}

/**
 * Deliver codes for an order item.
 *
 * 1. Assign codes (promote reserved → delivered)
 * 2. Decrypt codes in memory only
 * 3. Return decrypted codes for handoff to email/PDF/confirmation page
 *
 * Decrypted codes exist only in this function's scope and the returned result.
 * They are never persisted, logged, or written to any table.
 */
export function deliverCodes(input: CodeDeliveryInput): DeliveryResult {
  // Step 1: Assign codes (§8.1)
  const assignment = assignCodes(input.orderItemId, input.quantity);

  if (!assignment.success || !assignment.codes) {
    return {
      success: false,
      error: assignment.error ?? 'DELIVERY_FAILED',
    };
  }

  // Step 2: Decrypt codes (§8.2) — in memory only
  const decryptedCodes = assignment.codes.map((codeAssignment) => {
    const plainCode = decryptCode(codeAssignment.codeEncrypted, codeAssignment.nonce);
    return {
      code: plainCode,
      productName: input.productNameTh,
      denomination: input.denominationThb,
    };
  });

  // Step 3: Return for handoff
  // The caller (order confirmation page, email template, PDF generator)
  // receives the plaintext codes and uses them immediately.
  // No intermediate storage of plaintext.
  return {
    success: true,
    codes: decryptedCodes,
  };
}

/**
 * Process delivery for a full order (all items).
 *
 * In production, this is enqueued as a BullMQ job with HIGH priority.
 * Retry: 3× exponential backoff (2s, 4s, 8s).
 */
export function processOrderDelivery(
  orderId: string,
  items: CodeDeliveryInput[],
): DeliveryResult {
  const allCodes: DeliveryResult['codes'] = [];

  for (const item of items) {
    const result = deliverCodes(item);

    if (!result.success) {
      // If any item fails, the order goes to pending_manual_fulfilment
      return {
        success: false,
        error: result.error as string,
      };
    }

    allCodes.push(...(result.codes ?? []));
  }

  return {
    success: true,
    codes: allCodes,
  };
}
