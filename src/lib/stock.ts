/**
 * How many units we can actually hand over.
 *
 * `ProductVariant.stock` is a number staff can edit by hand (เติมสต็อก), while
 * delivery reads real `GiftCode` rows. Nothing keeps the two equal, so a
 * restock without a code upload used to let the shop sell units it could not
 * deliver — the customer paid, then the order parked in
 * `pending_manual_fulfilment`. Every sellable number is therefore the smaller
 * of the two, and never below zero.
 */
export function sellableStock(stock: number, codesAvailable: number): number {
  return Math.max(0, Math.min(stock, codesAvailable));
}
