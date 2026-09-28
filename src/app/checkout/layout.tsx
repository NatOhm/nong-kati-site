import type { Metadata } from 'next';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

/** The checkout segment is a client page — the layout carries its title. */
export const metadata: Metadata = {
  title: 'ชำระเงินและตะกร้าสินค้า',
  description: 'ตรวจสอบตะกร้า กรอกข้อมูลผู้รับโค้ด และชำระเงิน',
  robots: { index: false, follow: false },
};

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
