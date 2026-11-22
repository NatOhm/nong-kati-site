import { PawIcon } from '@/components/ui/ClayIcons';
import { SiteMascot } from '@/components/ui/SiteMascot';
import { getStoreInfo } from '@/lib/data';

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'สินค้า',
    links: [
      { label: 'สินค้าทั้งหมด', href: '/search' },
      { label: 'สินค้าแนะนำ', href: '/recommended' },
      { label: 'รายการโปรด', href: '/account/wishlist' },
      // App shortcuts, not categories: there is no /category/netflix (the
      // category list is workspace / streaming-app / chinese-miniseries), so
      // the hardcoded slug was the only 404 link on the site. Search always
      // resolves, even when an app has no category.
      { label: 'Netflix', href: '/search?q=Netflix' },
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

/**
 * Storefront footer — the warm dark-brown finish from the client mockup, not
 * a black slab. Colours come from the footer token family (`bg-footer`,
 * `text-footer`, `text-footer-muted`, `border-footer`) so light and dark each
 * keep their own measured pairing; every link stays a 44px target.
 */
export async function Footer(): Promise<React.JSX.Element> {
  const store = await getStoreInfo();
  return (
    <footer className="relative z-50 border-t border-footer bg-footer py-12">
      <div className="mx-auto max-w-content px-4 md:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="block rounded-full bg-peach-100/10 p-0.5 shadow-clay-sm">
                <SiteMascot size={40} />
              </span>
              <span className="font-display text-xl font-bold text-footer">Nong-Kati</span>
            </div>
            <p className="mt-3 text-sm text-footer-muted">
              {store.description ?? 'ซื้อง่าย จ่ายเร็ว โค้ดถึงมือหลังทีมงานยืนยันการชำระเงิน'}
            </p>
            {(store.phone || store.email || store.line) && (
              <ul className="mt-3 space-y-1 text-sm text-footer-muted">
                {store.phone && (
                  <li className="flex min-h-[44px] items-center">
                    โทร{' '}
                    <a
                      href={`tel:${store.phone.replace(/\s/g, '')}`}
                      className="inline-flex min-h-[44px] items-center text-footer-muted hover:text-footer"
                    >
                      {store.phone}
                    </a>
                  </li>
                )}
                {store.email && (
                  <li className="flex min-h-[44px] items-center">
                    <a
                      href={`mailto:${store.email}`}
                      className="inline-flex min-h-[44px] items-center text-footer-muted hover:text-footer"
                    >
                      {store.email}
                    </a>
                  </li>
                )}
                {store.line && (
                  <li className="flex min-h-[44px] items-center">LINE: {store.line}</li>
                )}
              </ul>
            )}
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-sm font-semibold text-footer">{col.title}</h3>
              <ul className="flex flex-col gap-0">
                {col.links.map((link) => (
                  <li key={link.href} className="flex min-h-[44px] items-center">
                    <a
                      href={link.href}
                      className="inline-flex min-h-[44px] items-center text-sm text-footer-muted hover:text-footer"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-footer pt-6 text-xs text-footer-muted md:flex-row md:justify-between">
          <p className="flex items-center gap-2">
            <PawIcon size={20} className="mascot-peek" />© {new Date().getFullYear()}{' '}
            {store.name ?? 'Nong-Kati'} · ขอบคุณที่สนับสนุนร้านเล็กๆ ของเรา
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-[44px] items-center text-footer-muted hover:text-footer"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
