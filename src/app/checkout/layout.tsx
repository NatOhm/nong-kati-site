import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

/**
 * Checkout Layout — same FacebookNavbar + sidebar chrome as the rest of the
 * storefront, so checkout never feels like a different site.
 */
export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <FacebookLayout>{children}</FacebookLayout>
      <Footer />
    </>
  );
}
