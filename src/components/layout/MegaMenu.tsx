'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';

export interface MegaMenuCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  children: {
    id: string;
    name: string;
    slug: string;
  }[];
}

export interface MegaMenuProps {
  categories: MegaMenuCategory[];
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * 05-components.md §1.2 — Mega Menu.
 * Desktop dropdown showing L1 categories with L2 sub-categories.
 * Appears on hover over category links in Navbar.
 */
export function MegaMenu({
  categories,
  isOpen,
  onClose,
  className,
}: MegaMenuProps): React.JSX.Element | null {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="bg-surface-base/50 fixed inset-0 top-16 z-40 backdrop-blur-sm"
        onMouseLeave={onClose}
        aria-hidden="true"
      />

      {/* Menu panel */}
      <div
        className={cn(
          'bg-surface-base/98 fixed left-0 top-16 z-50 w-full border-b border-line-subtle shadow-xl backdrop-blur-md',
          className,
        )}
        onMouseLeave={onClose}
        role="menu"
        aria-label="หมวดหมู่สินค้า"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-6 p-6">
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-3">
              {/* L1 category header */}
              <Link
                href={`/category/${cat.slug}`}
                className="flex items-center gap-2 text-sm font-semibold text-fg-brand hover:text-peach-800"
                onClick={onClose}
              >
                <span className="text-lg">{cat.icon || '🎮'}</span>
                {cat.name}
              </Link>

              {/* L2 sub-categories */}
              {cat.children.length > 0 && (
                <ul className="space-y-1">
                  {cat.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/category/${child.slug}`}
                        className="block rounded-md px-2 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-clay-200 hover:text-fg-brand"
                        onClick={onClose}
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
