/**
 * StructuredData — Renders JSON-LD scripts for various schema types.
 * Per 14-seo.md §5 — Organization, Product, BreadcrumbList schemas.
 */

export interface OrganizationSchema {
  name: string;
  url: string;
  logo?: string;
  description?: string;
}

export interface ProductSchema {
  name: string;
  description: string;
  image?: string;
  url: string;
  brand?: string;
  offers: {
    price: number;
    priceCurrency: string;
    availability: string;
    url?: string;
  };
  category?: string;
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
}

interface WebSiteSchema {
  name: string;
  url: string;
  description?: string;
  searchAction?: {
    target: string;
    queryInput: string;
  };
}

interface StructuredDataProps {
  type: 'organization' | 'product' | 'website';
  data: OrganizationSchema | ProductSchema | WebSiteSchema;
}

function buildOrganizationSchema(data: OrganizationSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: data.name,
    url: data.url,
    ...(data.logo && { logo: data.logo }),
    ...(data.description && { description: data.description }),
  };
}

function buildProductSchema(data: ProductSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    description: data.description,
    ...(data.image && { image: data.image }),
    url: data.url,
    ...(data.brand && { brand: { '@type': 'Brand', name: data.brand } }),
    offers: {
      '@type': 'Offer',
      price: data.offers.price,
      priceCurrency: data.offers.priceCurrency,
      availability: data.offers.availability,
      ...(data.offers.url && { url: data.offers.url }),
    },
    ...(data.category && { category: data.category }),
    ...(data.aggregateRating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: data.aggregateRating.ratingValue,
        reviewCount: data.aggregateRating.reviewCount,
      },
    }),
  };
}

function buildWebSiteSchema(data: WebSiteSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: data.name,
    url: data.url,
    ...(data.description && { description: data.description }),
    ...(data.searchAction && {
      potentialAction: {
        '@type': 'SearchAction',
        target: data.searchAction.target,
        'query-input': data.searchAction.queryInput,
      },
    }),
  };
}

/**
 * Renders a JSON-LD script tag for the given schema type.
 */
export function StructuredData({ type, data }: StructuredDataProps): React.JSX.Element {
  const schema =
    type === 'organization'
      ? buildOrganizationSchema(data as OrganizationSchema)
      : type === 'website'
      ? buildWebSiteSchema(data as WebSiteSchema)
      : buildProductSchema(data as ProductSchema);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
