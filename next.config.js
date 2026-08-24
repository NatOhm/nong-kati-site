/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    // 06-database.md product/asset host — extended per-milestone as CDN domain is finalised
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.nong-kati.co.th' },
    ],
  },
  async headers() {
    return [
      {
        // 13-security.md §8 — baseline security headers.
        // Full CSP is wired in M8 (13-security.md §8 rollout); M1 ships the
        // headers that carry zero third-party-script risk today.
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
