import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

/**
 * The policy pages are reached from the footer and the cookie banner, so they
 * get the storefront chrome — /docs/manual stays out on purpose: it is a
 * print-optimized document, and chrome would land in the printed PDF.
 */
export default function LegalLayout({
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
