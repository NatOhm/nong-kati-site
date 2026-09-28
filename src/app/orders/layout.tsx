import type { Metadata } from 'next';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ค้นหาคำสั่งซื้อ',
  description: 'ติดตามสถานะคำสั่งซื้อและรับโค้ดด้วยอีเมลและรหัสคำสั่งซื้อ',
  robots: { index: false, follow: false },
};

/**
 * Orders Layout — same FacebookNavbar + sidebar chrome as the rest of the
 * storefront, so order lookup and order detail stay visually consistent.
 */
export default function OrdersLayout({
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
