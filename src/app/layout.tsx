import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, JetBrains_Mono, Noto_Serif_Thai } from 'next/font/google';

import { ThemeProvider } from '@/providers/ThemeProvider';
import { CookieConsentBanner } from '@/components/pdpa/CookieConsentBanner';
import { ToastMount } from './ToastMount';

import './globals.css';

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans-thai',
  display: 'swap',
});

const notoSerifThai = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-noto-serif-thai',
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
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'),
  title: {
    template: '%s — Nong-Kati',
    default: 'ซื้อบัตรเกม Netflix Steam และอื่นๆ — Nong-Kati',
  },
  description:
    'ซื้อ gift card ออนไลน์ ส่งโค้ดทันที ครอบคลุม เกม สตรีมมิ่ง และ อีคอมเมิร์ซ ราคาดี จ่ายผ่าน PromptPay และบัตรเครดิต',
  applicationName: 'Nong-Kati',
  robots: { index: true, follow: true },
};

/** 14-seo.md §13.1 — single sitewide lang="th", no per-page override. */
export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="th" className={`${ibmPlexSansThai.variable} ${notoSerifThai.variable} ${jetbrainsMono.variable}`}>
      <body className="text-thai font-ui">
        <ThemeProvider defaultTheme="dark">
          {children}
          <ToastMount />
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
