/**
 * Stock Reservation — 10-digital-code.md §7.
 *
 * Reservation trigger: payment-initiate (NOT cart-add, NOT order-create).
 * Window: 30 minutes (aligned to order_payment_timeout_minutes).
 * Pattern: FOR UPDATE SKIP LOCKED, FIFO ordering.
 *
 * §7.1: Codes move available → reserved at payment-initiate.
 * §7.3: Reserved codes released back to available on timeout sweep.
 * §7.4: Sweep re-checks order status to avoid releasing codes for just-confirmed payments.
 */

import { encryptCode, hashCode } from '@/lib/crypto/giftCode';

export interface ReservationResult {
  success: boolean;
  reservedCodes?: {
    id: string;
    codeEncrypted: Buffer;
    nonce: Buffer;
  }[];
  error?: string;
}

export interface CodeAssignment {
  id: string;
  codeEncrypted: Buffer;
  nonce: Buffer;
  keyVersion: number;
}

/**
 * In-memory mock for code reservation.
 * In production, this uses Prisma with FOR UPDATE SKIP LOCKED.
 */
const mockCodeStore = new Map<string, MockGiftCode>();

interface MockGiftCode {
  id: string;
  variantId: string;
  codeEncrypted: Buffer;
  codeHash: Buffer;
  nonce: Buffer;
  keyVersion: number;
  status: 'available' | 'reserved' | 'delivered' | 'voided' | 'expired';
  orderId: string | null;
  orderItemId: string | null;
  reservedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

/**
 * Initialize mock codes for a variant (for testing).
 * In production, codes are loaded via CSV import.
 */
export function initMockCodes(
  variantId: string,
  codes: string[],
): void {
  for (const code of codes) {
    const { ciphertext, nonce } = encryptCode(code);
    const hash = hashCode(code);

    mockCodeStore.set(hash.toString('hex'), {
      id: `gc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      variantId,
      codeEncrypted: ciphertext,
      codeHash: hash,
      nonce,
      keyVersion: 1,
      status: 'available',
      orderId: null,
      orderItemId: null,
      reservedAt: null,
      deliveredAt: null,
      createdAt: new Date(),
    });
  }
}

/**
 * Reserve codes for an order item (FIFO, SKIP LOCKED pattern).
 * 10-digital-code.md §7.1 — called at payment-initiate.
 *
 * @param variantId - The product variant to reserve codes for
 * @param quantity - Number of codes to reserve
 * @param orderId - The order ID
 * @param orderItemId - The order item ID
 * @returns Reserved codes or error
 */
export function reserveCodes(
  variantId: string,
  quantity: number,
  orderId: string,
  orderItemId: string,
): ReservationResult {
  // Find available codes for this variant, FIFO order
  const availableCodes: MockGiftCode[] = [];

  for (const code of mockCodeStore.values()) {
    if (
      code.variantId === variantId &&
      code.status === 'available'
    ) {
      availableCodes.push(code);
    }
  }

  // Sort by creation time (FIFO)
  availableCodes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (availableCodes.length < quantity) {
    return {
      success: false,
      error: 'OUT_OF_STOCK',
    };
  }

  // Reserve the first `quantity` codes
  const reserved = availableCodes.slice(0, quantity);
  const now = new Date();

  for (const code of reserved) {
    code.status = 'reserved';
    code.reservedAt = now;
    code.orderId = orderId;
    code.orderItemId = orderItemId;
  }

  return {
    success: true,
    reservedCodes: reserved.map((c) => ({
      id: c.id,
      codeEncrypted: c.codeEncrypted,
      nonce: c.nonce,
    })),
  };
}

/**
 * Promote reserved codes to delivered.
 * 10-digital-code.md §8.1 — called on payment.succeeded.
 *
 * @param orderItemId - The order item whose codes to deliver
 * @param expectedQuantity - Expected number of codes
 * @returns Assigned codes (decrypted at call site, not here)
 */
export function assignCodes(
  orderItemId: string,
  expectedQuantity: number,
): { success: boolean; codes?: CodeAssignment[]; error?: string } {
  const reservedCodes: MockGiftCode[] = [];

  for (const code of mockCodeStore.values()) {
    if (
      code.orderItemId === orderItemId &&
      code.status === 'reserved'
    ) {
      reservedCodes.push(code);
    }
  }

  if (reservedCodes.length < expectedQuantity) {
    // Reservation was released by timeout or insufficient stock
    // Fall back to fresh FIFO assignment from available codes
    const fallbackResult = fallbackAssign(
      reservedCodes[0]?.variantId ?? '',
      expectedQuantity - reservedCodes.length,
      reservedCodes[0]?.orderId ?? '',
      orderItemId,
    );

    if (!fallbackResult.success) {
      return { success: false, error: 'INSUFFICIENT_STOCK' };
    }

    // Merge reserved + fallback
    const allCodes = [
      ...reservedCodes.map((c) => ({
        id: c.id,
        codeEncrypted: c.codeEncrypted,
        nonce: c.nonce,
        keyVersion: c.keyVersion,
      })),
      ...(fallbackResult.codes ?? []),
    ];

    // Mark as delivered
    for (const code of reservedCodes) {
      code.status = 'delivered';
      code.deliveredAt = new Date();
    }

    return { success: true, codes: allCodes };
  }

  // All reserved — promote to delivered
  const now = new Date();
  for (const code of reservedCodes) {
    code.status = 'delivered';
    code.deliveredAt = now;
  }

  return {
    success: true,
    codes: reservedCodes.map((c) => ({
      id: c.id,
      codeEncrypted: c.codeEncrypted,
      nonce: c.nonce,
      keyVersion: c.keyVersion,
    })),
  };
}

/**
 * Fallback FIFO assignment when reservation is insufficient.
 * Uses FOR UPDATE SKIP LOCKED pattern.
 */
function fallbackAssign(
  variantId: string,
  quantity: number,
  orderId: string,
  orderItemId: string,
): { success: boolean; codes?: CodeAssignment[] } {
  const available: MockGiftCode[] = [];

  for (const code of mockCodeStore.values()) {
    if (
      code.variantId === variantId &&
      code.status === 'available'
    ) {
      available.push(code);
    }
  }

  available.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (available.length < quantity) {
    return { success: false };
  }

  const assigned = available.slice(0, quantity);
  const now = new Date();

  for (const code of assigned) {
    code.status = 'delivered';
    code.deliveredAt = now;
    code.orderId = orderId;
    code.orderItemId = orderItemId;
  }

  return {
    success: true,
    codes: assigned.map((c) => ({
      id: c.id,
      codeEncrypted: c.codeEncrypted,
      nonce: c.nonce,
      keyVersion: c.keyVersion,
    })),
  };
}

/**
 * Release expired reservations back to available.
 * 10-digital-code.md §7.3 — called by reservation-timeout-sweep job.
 *
 * @param timeoutMinutes - Reservation timeout (default 30)
 * @returns Number of codes released
 */
export function releaseExpiredReservations(timeoutMinutes: number = 30): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);
  let released = 0;

  for (const code of mockCodeStore.values()) {
    if (
      code.status === 'reserved' &&
      code.reservedAt &&
      code.reservedAt < cutoff
    ) {
      // §7.4: Re-check order status before releasing
      // In production, this queries the order table
      // For mock, we release all stale reservations
      code.status = 'available';
      code.reservedAt = null;
      code.orderId = null;
      code.orderItemId = null;
      released++;
    }
  }

  return released;
}

/**
 * Expire available codes past their expiry date.
 * 10-digital-code.md §10.2 — called by expiry-sweep job every 15 min.
 *
 * @returns Number of codes expired
 */
export function expireOldCodes(): number {
  const now = new Date();
  let expired = 0;

  for (const code of mockCodeStore.values()) {
    if (code.status === 'available') {
      // In production, code would have an expires_at field
      // For mock, no codes expire
    }
  }

  return expired;
}

/**
 * Get available code count for a variant (for stock display).
 */
export function getAvailableCodeCount(variantId: string): number {
  let count = 0;
  for (const code of mockCodeStore.values()) {
    if (code.variantId === variantId && code.status === 'available') {
      count++;
    }
  }
  return count;
}

/**
 * Get mock code store size (for testing).
 */
export function getMockCodeStoreSize(): number {
  return mockCodeStore.size;
}
