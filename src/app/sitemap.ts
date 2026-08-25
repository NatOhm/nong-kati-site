import { MetadataRoute } from 'next';

import { getAllCategorySlugs, getAllProductSlugs } from '@/lib/data';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com';

/**
 * 14-seo.md §7 — Dynamic sitemap.xml.
 * Lists all category and product pages with appropriate changeFrequency and priority.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  // Category pages
  const categorySlugs = await getAllCategorySlugs();
  const categoryPages: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: `${BASE_URL}/category/${slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Product pages
  const productSlugs = await getAllProductSlugs();
  const productPages: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: `${BASE_URL}/product/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
