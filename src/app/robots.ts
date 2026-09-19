import { MetadataRoute } from 'next';

/**
 * 14-seo.md §8 — robots.txt rules.
 */
export default function robots(): MetadataRoute.Robots {
  // Canonical production origin (must match the live deployment domain).
  const baseUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
