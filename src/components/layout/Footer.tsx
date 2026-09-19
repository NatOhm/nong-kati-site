import { Logo } from './Logo';
import { PawIcon } from '@/components/ui/ClayIcons';
import { getStoreInfo } from '@/lib/data';

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'สินค้า',
    links: [
      { label: 'ดูสินค้าทั้งหมด', href: '/search' },
      { label: 'Netflix', href: '/category/netflix' },
      { label: 'Spotify', href: '/category/spotify' },
    ],
  },
  {
    title: 'บัญชีของฉัน',
    links: [
      { label: 'เข้าสู่ระบบ', href: '/account/login' },
      { label: 'สมัครสมาชิก', href: '/account/register' },
      { label: 'คำสั่งซื้อของฉัน', href: '/account/orders' },
    ],
  },
  {
    title: 'ช่วยเหลือ',
    links: [
      { label: 'ติดตามคำสั่งซื้อ', href: '/orders/lookup' },
      { label: 'ติดต่อเรา', href: '/account/support' },
    ],
  },
];

const LEGAL_LINKS = [
  { label: 'นโยบายความเป็นส่วนตัว', href: '/legal/privacy-policy' },
  { label: 'เงื่อนไขการใช้งาน', href: '/legal/terms-of-service' },
  { label: 'นโยบายคุกกี้', href: '/legal/cookie-policy' },
];

/** 05-components.md §1.4 — 4-col desktop, accordion-shaped stack on mobile (accordion interaction deferred to M2 content pass). */
export async function Footer(): Promise<React.JSX.Element> {
  const store = await getStoreInfo();
  return (
    <footer className="relative z-50 border-t border-line-subtle bg-surface-base py-16">
      <div className="mx-auto max-w-content px-4 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-fg-muted">
              {store.description ?? 'ซื้อง่าย จ่ายเร็ว ได้โค้ดทันที'}
            </p>
            {(store.phone || store.email || store.line) && (
              <ul className="mt-3 space-y-0 text-sm text-fg-muted">
                {store.phone && (
                  <li className="flex min-h-[36px] items-center">
                    โทร{' '}
                    <a
                      href={`tel:${store.phone.replace(/\s/g, '')}`}
                      className="inline-flex min-h-[32px] items-center hover:text-fg-brand"
                    >
                      {store.phone}
                    </a>
                  </li>
                )}
                {store.email && (
                  <li className="flex min-h-[36px] items-center">
                    <a
                      href={`mailto:${store.email}`}
                      className="inline-flex min-h-[32px] items-center hover:text-fg-brand"
                    >
                      {store.email}
                    </a>
                  </li>
                )}
                {store.line && (
                  <li className="flex min-h-[36px] items-center">LINE: {store.line}</li>
                )}
              </ul>
            )}
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-sm font-semibold text-fg">{col.title}</h3>
              <ul className="flex flex-col gap-0">
                {col.links.map((link) => (
                  <li key={link.href} className="flex min-h-[36px] items-center">
                    <a
                      href={link.href}
                      className="inline-flex min-h-[32px] items-center text-sm text-fg-muted hover:text-fg-brand"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-line-subtle pt-6 text-xs text-fg-placeholder md:flex-row md:justify-between">
          <p className="flex items-center gap-2">
            <PawIcon size={20} className="mascot-peek" />© {new Date().getFullYear()}{' '}
            {store.name ?? 'Nong-Kati'}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-fg-secondary">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
