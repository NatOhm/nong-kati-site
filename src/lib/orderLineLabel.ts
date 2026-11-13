/**
 * The option/package a historical order line was bought as.
 *
 * `OrderItem.skuCode` is the snapshot of `ProductVariant.label` — the pricing
 * engine writes the label into that column (`skuCode: v.label` in
 * `resolveOrderPricing`/`createOrder`) — so it is the only per-line option name
 * that survives a variant rename or a product delete. An empty value or
 * `default` means the product had no selectable package.
 *
 * Client report 2026-11-13 ("ไม่รู้ว่ารายการไหนคือของอันไหน"): every order screen
 * printed `{skuCode} × {quantity}`, which for two lines of the same product read
 * as "1 × 2" and "2 × 3" — no package name, and the multiplier looked like part
 * of the name.
 */
export function orderLineOptionLabel(skuCode: string | null | undefined): string {
  const label = (skuCode ?? '').trim();
  return label && label.toLowerCase() !== 'default' ? label : '';
}

/** "แพ็กเกจ 1 · จำนวน 2" — package first, quantity named, never a bare "×". */
export function formatOrderLineDetail(
  skuCode: string | null | undefined,
  quantity: number,
): string {
  const label = orderLineOptionLabel(skuCode);
  const qty = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  return label ? `แพ็กเกจ ${label} · จำนวน ${qty}` : `จำนวน ${qty}`;
}
