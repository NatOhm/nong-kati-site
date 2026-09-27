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
 *
 * Security (production review, High): `JSON.stringify` alone does NOT make
 * text safe inside an HTML `<script>` element — a stored `</script>` in
 * product name/description (catalogue managers have products:write; imports
 * can carry it too) terminates the element and executes as stored XSS on
 * the public origin, where JS-readable admin tokens live. Every `<`, `>`,
 * `&` and the U+2028/U+2029 line separators are escaped to \uXXXX inside
 * the serialized JSON — semantically identical JSON (the decoded values
 * are unchanged for schema.org consumers), but no `</script>` sequence can
 * appear in the markup. The escape runs on the FINAL serialization text —
 * doing it inside a JSON.stringify replacer would double-escape the
 * backslash (stringify re-escapes the inserted `\u003c` to `\\u003c`),
 * corrupting the values. The single reviewed helper keeps every inline
 * JSON-LD block on the site on this one safe path.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
