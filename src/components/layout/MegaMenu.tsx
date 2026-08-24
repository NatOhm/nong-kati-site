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
        className="fixed inset-0 top-16 z-40 bg-ink-950/50 backdrop-blur-sm"
        onMouseLeave={onClose}
        aria-hidden="true"
      />

      {/* Menu panel */}
      <div
        className={cn(
          'fixed left-0 top-16 z-50 w-full border-b border-ink-700 bg-ink-900/98 shadow-xl backdrop-blur-md',
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
                className="flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200"
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
                        className="block rounded-md px-2 py-1.5 text-sm text-ink-200 transition-colors hover:bg-ink-800 hover:text-amber-300"
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
