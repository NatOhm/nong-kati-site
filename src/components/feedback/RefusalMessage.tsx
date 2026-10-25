import Link from 'next/link';

/**
 * Server refusal body for destructive admin actions: the Thai reason, plus
 * the blocking order numbers as deep links into the orders page (prefilled
 * via ?orderNumber=) so the admin never has to copy/paste an order number
 * to unblock a delete.
 */
export function RefusalMessage({
  reason,
  orderNumbers,
}: {
  reason: string;
  orderNumbers?: string[] | undefined;
}): React.JSX.Element {
  const numbers = orderNumbers ?? [];
  return (
    <div
      role="alert"
      className="mt-3 rounded-md bg-coral-500/10 px-3 py-2 text-sm text-fg-error"
    >
      <p>{reason}</p>
      {numbers.length > 0 && (
        <p className="mt-1.5 font-medium">
          ออเดอร์ที่ขวางอยู่:{' '}
          {numbers.map((n, i) => (
            <span key={n}>
              {i > 0 && ' · '}
              <Link
                href={`/management/orders?orderNumber=${encodeURIComponent(n)}`}
                className="underline hover:no-underline"
              >
                {n}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
