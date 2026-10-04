import { notFound } from 'next/navigation';

/**
 * Dev Seed is a development-only tool and must not exist in the production
 * interface.
 *
 * The backing API already returned 404 in production
 * (src/app/api/v1/admin/dev-seed/route.ts), but the PAGE still shipped and
 * rendered a dead "สร้างข้อมูลทดสอบ" button to anyone who typed the URL. Gating
 * the page as well means the tool is absent from production entirely.
 *
 * Server layout rather than a check inside the client page, because notFound()
 * is a server-only API and the page is a client component.
 */
export default function DevSeedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}