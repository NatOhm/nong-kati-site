'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronRight, FolderOpen } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import {
  adminListCategories,
  adminDeleteCategory,
  type AdminCategory,
} from '@/api/adminCatalog';
import { cn } from '@/utils/cn';

/**
 * Admin Categories Management page — 07-api.md §20.
 * List, search, create, edit, delete categories.
 */
export default function AdminCategoriesPage(): React.JSX.Element {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const cats = await adminListCategories();
      setCategories(cats);
      setLoading(false);
    }
    load();
  }, []);

  // Flatten categories with depth info for display
  function flattenCategories(
    cats: AdminCategory[],
    depth = 0,
  ): (AdminCategory & { depth: number })[] {
    const result: (AdminCategory & { depth: number })[] = [];
    for (const cat of cats) {
      result.push({ ...cat, depth });
      if (cat.children.length > 0) {
        result.push(...flattenCategories(cat.children, depth + 1));
      }
    }
    return result;
  }

  const flatCategories = flattenCategories(categories);

  const filteredCategories = flatCategories.filter(
    (c) =>
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleDelete(slug: string, name: string) {
    if (!window.confirm(`ลบหมวดหมู่ "${name}" ใช่หรือไม่?`)) return;

    const result = await adminDeleteCategory(slug);
    if (result.success) {
      setCategories((prev) => {
        function removeNode(cats: AdminCategory[]): AdminCategory[] {
          return cats
            .filter((c) => c.slug !== slug)
            .map((c) => ({ ...c, children: removeNode(c.children) }));
        }
        return removeNode(prev);
      });
    } else {
      alert(result.reason ?? 'ไม่สามารถลบได้');
    }
  }

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'หมวดหมู่' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink-100">หมวดหมู่</h1>
          <button className="flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-amber-300">
            <Plus size={16} />
            เพิ่มหมวดหมู่
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาหมวดหมู่..."
            className="w-full rounded-md border border-ink-600 bg-ink-800 py-2 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {/* Categories Tree Table */}
        <div className="overflow-x-auto rounded-md border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800">
                <th className="px-4 py-3 text-left font-medium text-ink-300">
                  หมวดหมู่
                </th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">
                  Slug
                </th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">
                  สินค้า
                </th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">
                  เรียงลำดับ
                </th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">
                  สถานะ
                </th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-400">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-ink-400"
                  >
                    <FolderOpen
                      size={32}
                      className="mx-auto mb-2 text-ink-600"
                    />
                    ไม่พบหมวดหมู่
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="border-b border-ink-700/50 hover:bg-ink-850"
                  >
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${cat.depth * 24}px` }}
                      >
                        {cat.depth > 0 && (
                          <ChevronRight
                            size={14}
                            className="text-ink-500"
                          />
                        )}
                        <div>
                          <p className="font-medium text-ink-100">
                            {cat.icon && <span className="mr-1">{cat.icon}</span>}
                            {cat.name}
                          </p>
                          {cat.children.length > 0 && (
                            <p className="text-xs text-ink-400">
                              {cat.children.length} หมวดหมู่ย่อย
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-400">
                      {cat.slug}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-200">
                      {cat.productCount}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-400">
                      {cat.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          cat.isActive
                            ? 'bg-jade-900/30 text-jade-300'
                            : 'bg-ink-800 text-ink-500',
                        )}
                      >
                        {cat.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                          aria-label="แก้ไข"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.slug, cat.name)}
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-crimson-400"
                          aria-label="ลบ"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-400">
          แสดง {filteredCategories.length} จาก {flatCategories.length} หมวดหมู่
        </p>
      </div>
    </AdminShell>
  );
}
