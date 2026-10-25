'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * While an order is still moving (payment pending / staff fulfilment), the
 * customer's order page would otherwise freeze at its last server render —
 * they'd sit on "รอตรวจสอบ" after uploading a slip until they think to reload.
 * This re-runs the server component every 10s so verification/delivery shows
 * up by itself, and stops the moment the status reaches a terminal state.
 *
 * Mounted from the order page only for pending statuses, so terminal orders
 * ship zero client JS for this.
 */
const POLL_INTERVAL_MS = 10_000;

const PENDING_STATUSES: ReadonlySet<string> = new Set([
  'pending_payment',
  'payment_confirmed',
  'pending_manual_fulfilment',
]);

export function PendingOrderAutoRefresh({
  status,
}: {
  status: string;
}): React.JSX.Element | null {
  const router = useRouter();

  useEffect(() => {
    if (!PENDING_STATUSES.has(status)) return;
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, router]);

  return null;
}
