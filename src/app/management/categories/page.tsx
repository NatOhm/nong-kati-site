'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronRight, FolderOpen } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminListCategories, adminDeleteCategory, type AdminCategory } from '@/api/adminCatalog';
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
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'หมวดหมู่' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-clay-900">หมวดหมู่</h1>
          <button className="flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-clay-900 hover:bg-peach-400">
            <Plus size={16} />
            เพิ่มหมวดหมู่
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาหมวดหมู่..."
            className="w-full rounded-md border border-clay-300 bg-clay-100 py-2 pl-9 pr-3 text-sm text-clay-900 placeholder:text-clay-500 focus:outline-none focus:ring-2 focus:ring-peach-500"
          />
        </div>

        {/* Categories Tree Table */}
        <div className="overflow-x-auto rounded-md border border-clay-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clay-200 bg-clay-100">
                <th className="px-4 py-3 text-left font-medium text-clay-600">หมวดหมู่</th>
                <th className="px-4 py-3 text-left font-medium text-clay-600">Slug</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">สินค้า</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">เรียงลำดับ</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-clay-500">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-clay-500">
                    <FolderOpen size={32} className="mx-auto mb-2 text-clay-500" />
                    ไม่พบหมวดหมู่
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => (
                  <tr key={cat.id} className="border-b border-clay-200 hover:bg-white">
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${cat.depth * 24}px` }}
                      >
                        {cat.depth > 0 && <ChevronRight size={14} className="text-clay-400" />}
                        <div>
                          <p className="font-medium text-clay-900">
                            {cat.icon && <span className="mr-1">{cat.icon}</span>}
                            {cat.name}
                          </p>
                          {cat.children.length > 0 && (
                            <p className="text-xs text-clay-500">
                              {cat.children.length} หมวดหมู่ย่อย
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-clay-500">{cat.slug}</td>
                    <td className="px-4 py-3 text-center text-clay-700">{cat.productCount}</td>
                    <td className="px-4 py-3 text-center text-clay-500">{cat.sortOrder}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          cat.isActive
                            ? 'bg-jade-500/15 text-jade-700'
                            : 'bg-clay-100 text-clay-400',
                        )}
                      >
                        {cat.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-clay-500 hover:bg-clay-100 hover:text-clay-900"
                          aria-label="แก้ไข"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.slug, cat.name)}
                          className="rounded p-1.5 text-clay-500 hover:bg-clay-100 hover:text-coral-600"
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

        <p className="text-xs text-clay-500">
          แสดง {filteredCategories.length} จาก {flatCategories.length} หมวดหมู่
        </p>
      </div>
    </AdminShell>
  );
}
