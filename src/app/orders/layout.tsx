import { getTopLevelCategories } from '@/lib/data';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

/**
 * Orders Layout — Server component that fetches categories
 * and renders Navbar + Footer around order pages.
 */
export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const categories = await getTopLevelCategories();

  return (
    <>
      <Navbar
        categories={categories.map((c) => ({
          ...c,
          children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
        }))}
      />
      <main>{children}</main>
      <Footer />
    </>
  );
}
