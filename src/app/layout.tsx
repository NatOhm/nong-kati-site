import type { Metadata } from 'next';
import Script from 'next/script';
import { JetBrains_Mono, Mitr, Noto_Sans_Thai_Looped } from 'next/font/google';

import { MascotProvider } from '@/providers/MascotProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { CartProvider } from '@/providers/CartProvider';
import { CustomerProfileProvider } from '@/components/layout/CustomerProfileProvider';
import { CookieConsentBanner } from '@/components/pdpa/CookieConsentBanner';
import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { ThemeVars } from '@/components/layout/ThemeVars';
import { ClayIconDefs } from '@/components/ui/ClayIconDefs';
import { getAppearance } from '@/lib/data';
import { ToastMount } from './ToastMount';

import './globals.css';

// Rounded, friendly faces: Mitr for display, Noto Sans Thai Looped for UI body.
const mitr = Mitr({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mitr',
  display: 'swap',
});

const notoSansThaiLooped = Noto_Sans_Thai_Looped({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-thai-looped',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// 14-seo.md §2.1 — root metadata defaults. <NK_DOMAIN> resolved at M10 per that
// document's placeholder convention; a safe local fallback is used until then.
export const metadata: Metadata = {
  // Canonical production origin — localhost fallback only affects local dev.
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://nong-kati.vercel.app'),
  title: {
    template: '%s — Nong-Kati',
    default: 'ซื้อบัตรเกม Netflix Steam และอื่นๆ — Nong-Kati',
  },
  description:
    'ซื้อ gift card ออนไลน์ ส่งโค้ดทันที ครอบคลุม เกม สตรีมมิ่ง และ อีคอมเมิร์ซ ราคาดี จ่ายผ่าน PromptPay หรือโอนเงิน',
  applicationName: 'Nong-Kati',
  robots: { index: true, follow: true },
};

/** No-FOUC: apply the stored/system theme — and the remembered motion choice — before first paint.
 * Roadmap §1 (CSP): loaded from /theme-init.js instead of an inline script so the
 * enforced nonce CSP (no 'unsafe-inline') never blocks it. Keep in sync with
 * public/theme-init.js. */
/** 14-seo.md §13.1 — single sitewide lang="th", no per-page override. */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  return (
    <html
      lang="th"
      className={`${mitr.variable} ${notoSansThaiLooped.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* beforeInteractive = injected into <head> and executed before React
            hydrates — keeps the no-FOUC guarantee without an inline script
            (which the enforced nonce CSP forbids). */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="text-thai font-ui">
        {/* Shared SVG paint-server defs (one document-wide registry — the
            duplicate-ID gate's sanctioned source of literal gradient ids). */}
        <ClayIconDefs />
        <ThemeVars />
        <MascotProvider mascotUrl={(await getAppearance()).mascotUrl}>
          <ThemeProvider defaultTheme="light">
            <CustomerProfileProvider>
              <CartProvider>
                {children}
                {/* Sitewide mobile taskbar (hidden on /management by the component itself) */}
                <MobileBottomNav />
              </CartProvider>
            </CustomerProfileProvider>
            <ToastMount />
            <CookieConsentBanner />
          </ThemeProvider>
        </MascotProvider>
      </body>
    </html>
  );
}
