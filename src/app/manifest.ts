import type { MetadataRoute } from 'next';

/**
 * Web app manifest — served by Next at /manifest.webmanifest and linked
 * automatically from every page's <head>.
 *
 * Before this existed the storefront had no installable surface at all: no
 * manifest, no 192/512 icons, no apple-touch-icon. The two PNG sizes are the
 * minimum Chrome asks for to offer "Add to Home screen" with a standalone
 * shell; the maskable variant keeps the hamster inside the 80% safe zone so
 * Android's adaptive launcher does not clip its ears.
 *
 * Icons are derived from src/app/icon.png (the 64px mark) — a proper 1024px
 * master should replace them when the brand supplies one; see the device /
 * product-decision list in docs/mobile-audit.md.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nong-Kati — แอคดูหนัง ซีรีส์ และ gift card',
    short_name: 'Nong-Kati',
    description:
      'ซื้อแอคดูหนัง ซีรีส์ Spotify YouTube ราคาดี โอนเงินพร้อมส่งสลิปยืนยัน ทีมงานยืนยันแล้วส่งโค้ดถึงอีเมล',
    lang: 'th',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFF7ED',
    theme_color: '#FFF7ED',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
