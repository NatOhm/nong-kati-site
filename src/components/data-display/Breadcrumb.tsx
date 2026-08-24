import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * 05-components.md §10.4 — Breadcrumb navigation with JSON-LD structured data.
 * Per 14-seo.md §5, includes BreadcrumbList schema.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps): React.JSX.Element {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${process.env['NEXT_PUBLIC_SITE_URL'] || 'https://nong-kati.com'}${item.href}` } : {}),
    })),
  };

  return (
    <nav aria-label="Schema.org breadcrumb" className={className}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={index}>
              {index > 0 && (
                <ChevronRight size={14} className="shrink-0 text-ink-400" strokeWidth={1.5} />
              )}
              {isLast || !item.href ? (
                <span className="text-ink-300">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-ink-400 transition-colors hover:text-amber-300"
                >
                  {item.label}
                </Link>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
