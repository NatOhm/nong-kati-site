'use client';

import { Menu, Search, User } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { Drawer } from '@/components/feedback/Drawer';
import { CartIcon } from '@/components/cart/CartIcon';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { MegaMenu, type MegaMenuCategory } from './MegaMenu';
import { useCart } from '@/hooks/useCart';
import { cn } from '@/utils/cn';

import { Logo } from './Logo';

export interface NavbarProps {
  /** Category tree for MegaMenu and mobile drawer. */
  categories?: MegaMenuCategory[];
  /** Defaults to false — wired to real customer session in M9 (08-auth.md §4). */
  isAuthenticated?: boolean;
  customerName?: string;
  className?: string;
}

/**\ * 05-components.md §1.1 — sticky top nav with MegaMenu (§1.2), SearchOverlay (§7),
 * and category-aware MobileDrawer (§1.3).
 */
export function Navbar({
  categories = [],
  isAuthenticated = false,
  customerName,
  className,
}: NavbarProps): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { cart, updateQuantity, removeItem, itemCount } = useCart();

  return (
    <>
      <nav
        role="navigation"
        aria-label="เมนูหลัก"
        className={cn(
          'sticky top-0 z-50 flex h-14 items-center justify-between border-b border-ink-700 bg-ink-900/95 px-4 backdrop-blur-md md:h-16 md:px-8',
          className,
        )}
      >
        <div className="flex items-center gap-8">
          <IconButton
            icon={<Menu size={22} strokeWidth={1.5} />}
            label="เปิดเมนู"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          />
          <Logo />
          <div className="hidden items-center gap-6 md:flex">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onMouseEnter={() => setMegaMenuOpen(true)}
                className="text-sm font-medium text-ink-200 transition-colors hover:text-amber-300"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <IconButton
            icon={<Search size={20} strokeWidth={1.5} />}
            label="ค้นหาสินค้า"
            onClick={() => setSearchOpen(true)}
          />
          <CartIcon count={itemCount} onClick={() => setCartOpen(true)} />
          <IconButton
            icon={<User size={20} strokeWidth={1.5} />}
            label={isAuthenticated ? `บัญชี: ${customerName ?? ''}` : 'เข้าสู่ระบบ'}
          />
        </div>
      </nav>

      {/* MegaMenu */}
      <MegaMenu
        categories={categories}
        isOpen={megaMenuOpen}
        onClose={() => setMegaMenuOpen(false)}
      />

      {/* Search Overlay */}
      <SearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={(q) => {
          window.location.href = `/search?q=${encodeURIComponent(q)}`;
        }}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart?.items ?? []}
        onUpdateQty={(variantId, qty) => updateQuantity(variantId, qty)}
        onRemoveItem={(variantId) => removeItem(variantId)}
      />

      {/* Mobile Drawer */}
      <Drawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)} side="left" title="เมนูนำทาง">
        <div className="flex flex-col gap-1">
          <a href="/" className="rounded-md px-3 py-2.5 text-sm text-ink-200 hover:bg-ink-800">
            หน้าหลัก
          </a>
          {categories.map((cat) => (
            <div key={cat.id}>
              <a
                href={`/category/${cat.slug}`}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-ink-200 hover:bg-ink-800"
              >
                {cat.icon} {cat.name}
              </a>
              {cat.children.length > 0 && (
                <div className="ml-4">
                  {cat.children.map((child) => (
                    <a
                      key={child.id}
                      href={`/category/${child.slug}`}
                      className="block rounded-md px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
                    >
                      {child.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
