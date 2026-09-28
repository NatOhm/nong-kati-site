import { MetadataRoute } from 'next';

import { publicOrigin } from '@/lib/siteConfig';

/**
 * 14-seo.md §8 — robots.txt rules.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = publicOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dev/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
