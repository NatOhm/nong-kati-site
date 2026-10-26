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
