/**
 * Payment-method display labels — ONE copy for every admin surface.
 *
 * The dashboard rendered a ternary that labelled wallet/manual_transfer as
 * "บัตรเครดิต", and each admin page carried its own drifting copy of this map
 * (review 2026-10-24). Unknown/future methods fall back to the raw value
 * instead of silently claiming to be a credit card.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  promptpay: 'PromptPay',
  card: 'บัตรเครดิต',
  credit_card: 'บัตรเครดิต',
  wallet: 'เงินในกระเป๋า',
  manual_transfer: 'โอนเงิน',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
