/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 06-database.md product/asset host — extended per-milestone as CDN domain is finalised
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.nong-kati.co.th' },
    ],
  },
  async headers() {
    return [
      {
        // Fonts are content-addressed by filename and never change in place;
        // Next serves /public files with max-age=0 by default, so every visit
        // re-validated ~16 subsets. Cache them for a year (client ask
        // 2026-11-13: "ทำไงให้เว็บมันเปิดไว ๆ").
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // 13-security.md §8 — baseline security headers (the static set).
        // The full CSP is built per-request in src/middleware.ts instead of
        // here, because its directives depend on the page being served.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
