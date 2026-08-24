import { Logo } from './Logo';

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'สินค้า',
    links: [
      { label: 'เกม', href: '/category/gaming' },
      { label: 'สตรีมมิ่ง', href: '/category/streaming' },
      { label: 'อีคอมเมิร์ซ', href: '/category/ecommerce' },
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
      { label: 'ติดต่อเรา', href: '/contact' },
      { label: 'เกี่ยวกับ Nong-Kati', href: '/about' },
    ],
  },
];

const LEGAL_LINKS = [
  { label: 'นโยบายความเป็นส่วนตัว', href: '/legal/privacy-policy' },
  { label: 'เงื่อนไขการใช้งาน', href: '/legal/terms-of-service' },
  { label: 'นโยบายคุกกี้', href: '/legal/cookie-policy' },
];

/** 05-components.md §1.4 — 4-col desktop, accordion-shaped stack on mobile (accordion interaction deferred to M2 content pass). */
export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-ink-700 bg-ink-900 py-16">
      <div className="mx-auto max-w-content px-4 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-ink-300">ซื้อง่าย จ่ายเร็ว ได้โค้ดทันที</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-sm font-semibold text-ink-100">{col.title}</h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="text-sm text-ink-300 hover:text-amber-300">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-ink-700 pt-6 text-xs text-ink-400 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} Nong-Kati</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-ink-200">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
