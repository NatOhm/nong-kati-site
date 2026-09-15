'use client';

import { useState } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { seedProducts } from '@/seed-data/products';
import { cn } from '@/utils/cn';

/**
 * Admin Products Management page — 07-api.md §20.
 * List, search, create, edit, delete products.
 */
export default function AdminProductsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter products
  const filteredProducts = seedProducts.filter((p) => {
    const matchesSearch =
      !searchQuery || p.nameTh.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'สินค้า' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">สินค้า</h1>
          <button className="flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-fg hover:bg-peach-400">
            <Plus size={16} />
            เพิ่มสินค้า
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg-secondary focus:outline-none focus:ring-2 focus:ring-peach-500"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="published">เผยแพร่</option>
            <option value="draft">ร่าง</option>
            <option value="archived">เก็บถาวร</option>
          </select>
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">สินค้า</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">Slug</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">แนะนำ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">ตัวเลือก</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b border-line-subtle hover:bg-white">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-fg">{product.nameTh}</p>
                      <p className="text-xs text-fg-placeholder">{product.nameEn}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                    {product.slug}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        product.status === 'published' && 'bg-jade-500/15 text-jade-700',
                        product.status === 'draft' && 'bg-surface text-fg-placeholder',
                        product.status === 'archived' && 'bg-surface text-clay-400',
                      )}
                    >
                      {product.status === 'published'
                        ? 'เผยแพร่'
                        : product.status === 'draft'
                          ? 'ร่าง'
                          : 'เก็บถาวร'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{product.isFeatured ? '⭐' : '—'}</td>
                  <td className="px-4 py-3 text-center text-fg-placeholder">
                    {product.variants.length} ตัวเลือก
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
                        aria-label="แก้ไข"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-coral-600"
                        aria-label="ลบ"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-fg-placeholder">
          แสดง {filteredProducts.length} จาก {seedProducts.length} สินค้า
        </p>
      </div>
    </AdminShell>
  );
}
