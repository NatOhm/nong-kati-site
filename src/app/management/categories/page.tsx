'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import {
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  type AdminCategory,
} from '@/api/adminCatalog';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

type FlatRow = AdminCategory & { depth: number };

const ERR_TH: Record<string, string> = {
  SLUG_TAKEN: 'slug นี้ถูกใช้แล้ว กรุณาระบุใหม่',
  INVALID_SLUG: 'slug ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษตัวเล็ก ตัวเลข และขีด (-)',
  INVALID_NAME: 'ชื่อหมวดหมู่ต้องมี 2-80 ตัวอักษร',
  CYCLE: 'ไม่สามารถเลือกตัวเองหรือหมวดลูกของตัวเองเป็นหมวดแม่ได้',
  PARENT_NOT_FOUND: 'ไม่พบหมวดแม่ที่เลือก',
};

function flatten(cats: AdminCategory[], depth = 0): FlatRow[] {
  const out: FlatRow[] = [];
  for (const c of cats) {
    out.push({ ...c, depth });
    out.push(...flatten(c.children, depth + 1));
  }
  return out;
}

export default function AdminCategoriesPage(): React.JSX.Element {
  const [tree, setTree] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<
    { mode: 'create'; parentId: string | null } | { mode: 'edit'; cat: AdminCategory } | null
  >(null);
  const [form, setForm] = useState({ name: '', slug: '', parentId: '', isActive: true });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/v1/admin/categories?view=tree', { cache: 'no-store' });
      const data = (await res.json()) as { categories?: AdminCategory[] };
      setTree(data.categories ?? []);
    } catch {
      setTree([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flat = useMemo(() => flatten(tree), [tree]);
  const searching = searchQuery.trim().length > 0;

  const visible = useMemo(() => {
    if (!searching) {
      return flat.filter((r) => r.depth === 0 || !collapsed.has(r.parentId ?? ''));
    }
    const q = searchQuery.trim().toLowerCase();
    return flat.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  }, [flat, searching, searchQuery, collapsed]);

  const siblingsOf = useCallback(
    (row: FlatRow): AdminCategory[] => {
      if (!row.parentId) return tree;
      const parent = flat.find((c) => c.id === row.parentId);
      return parent ? parent.children : [];
    },
    [tree, flat],
  );

  function openCreate(parentId: string | null) {
    setModal({ mode: 'create', parentId });
    setForm({ name: '', slug: '', parentId: parentId ?? '', isActive: true });
    setSlugTouched(false);
    setModalError(null);
  }

  function openEdit(cat: AdminCategory) {
    setModal({ mode: 'edit', cat });
    setForm({
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId ?? '',
      isActive: cat.isActive,
    });
    setSlugTouched(true);
    setModalError(null);
  }

  async function handleSave() {
    if (!modal || saving) return;
    setSaving(true);
    setModalError(null);

    if (modal.mode === 'create') {
      const createPayload: Parameters<typeof adminCreateCategory>[0] = {
        name: form.name,
        sortOrder: 0,
      };
      if (form.slug.trim()) createPayload.slug = form.slug.trim();
      if (form.parentId) createPayload.parentId = form.parentId;
      const result = await adminCreateCategory(createPayload);
      if (result.success) {
        setModal(null);
        await reload();
      } else {
        setModalError(ERR_TH[result.error ?? ''] ?? result.error ?? 'บันทึกไม่สำเร็จ');
      }
    } else {
      const cat = modal.cat;
      const changed: Parameters<typeof adminUpdateCategory>[1] = {};
      if (form.name !== cat.name) changed.name = form.name;
      if (form.slug !== cat.slug) changed.slug = form.slug;
      if ((form.parentId || null) !== cat.parentId) changed.parentId = form.parentId || null;
      if (form.isActive !== cat.isActive) changed.isActive = form.isActive;
      if (Object.keys(changed).length === 0) {
        setModal(null);
      } else {
        const result = await adminUpdateCategory(cat.id, changed);
        if (result.success) {
          setModal(null);
          await reload();
        } else {
          setModalError(ERR_TH[result.error ?? ''] ?? result.error ?? 'บันทึกไม่สำเร็จ');
        }
      }
    }
    setSaving(false);
  }

  async function handleToggleActive(cat: AdminCategory) {
    const result = await adminUpdateCategory(cat.id, { isActive: !cat.isActive });
    if (result.success) await reload();
  }

  async function handleDelete(cat: AdminCategory) {
    const warn =
      cat.children.length > 0 || cat.productCount > 0
        ? ' (ระบบจะปฏิเสธถ้ายังมีสินค้าหรือหมวดย่อย)'
        : '';
    if (!window.confirm(`ลบหมวดหมู่ "${cat.name}"?${warn}`)) return;
    const result = await adminDeleteCategory(cat.id);
    if (result.success) {
      await reload();
    } else {
      window.alert(result.reason ?? 'ลบไม่สำเร็จ');
    }
  }

  async function handleMove(cat: AdminCategory, dir: -1 | 1) {
    const row = flat.find((c) => c.id === cat.id);
    if (!row) return;
    const siblings = [...siblingsOf(row)];
    const idx = siblings.findIndex((s) => s.id === cat.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    // Remove the mover, reinsert at the target slot, then renumber so moves
    // also work when siblings share the same sortOrder (e.g. all 0).
    siblings.splice(idx, 1);
    siblings.splice(target, 0, cat);
    const results = await Promise.all(
      siblings.map((s, i) =>
        s.sortOrder === i * 10 ? null : adminUpdateCategory(s.id, { sortOrder: i * 10 }),
      ),
    );
    if (results.every((r) => r === null || r.success)) await reload();
    else window.alert('ย้ายลำดับไม่สำเร็จ');
  }

  const parentOptions = useMemo(() => {
    if (!modal || modal.mode !== 'edit') return flat;
    const excluded = new Set<string>([modal.cat.id]);
    (function pushDescendants(c: AdminCategory) {
      for (const ch of c.children) {
        excluded.add(ch.id);
        pushDescendants(ch);
      }
    })(modal.cat);
    return flat.filter((c) => !excluded.has(c.id));
  }, [modal, flat]);

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'หมวดหมู่' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">หมวดหมู่</h1>
            <p className="mt-1 text-sm text-fg-muted">
              จัดกลุ่มหมวดหมู่แบบประเภท (เช่น แอปดูหนัง/ซีรีส์) และย้ายหมวดย่อยระหว่างกลุ่มได้
            </p>
          </div>
          <button
            onClick={() => openCreate(null)}
            className="flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400"
          >
            <Plus size={16} />
            เพิ่มหมวดหมู่
          </button>
        </div>

        <div className="relative max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาหมวดหมู่..."
            className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
          />
        </div>

        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">หมวดหมู่</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">Slug</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สินค้า</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">ลำดับ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-fg-placeholder">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-fg-placeholder">
                    <FolderOpen size={32} className="mx-auto mb-2 text-fg-placeholder" />
                    ไม่พบหมวดหมู่
                  </td>
                </tr>
              ) : (
                visible.map((cat) => {
                  const siblings = siblingsOf(cat);
                  const idx = siblings.findIndex((s) => s.id === cat.id);
                  const hasChildren = cat.children.length > 0;
                  const isCollapsed = collapsed.has(cat.id);
                  return (
                    <tr key={cat.id} className="border-b border-line-subtle hover:bg-surface">
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${cat.depth * 24}px` }}
                        >
                          {hasChildren ? (
                            <button
                              onClick={() =>
                                setCollapsed((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(cat.id)) next.delete(cat.id);
                                  else next.add(cat.id);
                                  return next;
                                })
                              }
                              className="rounded p-0.5 text-fg-placeholder hover:bg-surface-sunken hover:text-fg"
                              aria-label={isCollapsed ? 'ขยาย' : 'ย่อ'}
                            >
                              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <div>
                            <p className="font-medium text-fg">
                              {cat.icon && <span className="mr-1">{cat.icon}</span>}
                              {cat.name}
                            </p>
                            {hasChildren && (
                              <p className="text-xs text-fg-placeholder">
                                {cat.children.length} หมวดหมู่ย่อย
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                        {cat.slug}
                      </td>
                      <td className="px-4 py-3 text-center text-fg-secondary">
                        {cat.productCount}
                      </td>
                      <td className="px-4 py-3 text-center text-fg-placeholder">{cat.sortOrder}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => void handleToggleActive(cat)}
                          className={cn(
                            'inline-flex cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                            cat.isActive
                              ? 'bg-jade-500/15 text-jade-700 hover:bg-jade-500/25'
                              : 'bg-surface text-clay-400 hover:bg-surface-sunken',
                          )}
                          title={cat.isActive ? 'กดเพื่อปิดใช้งาน' : 'กดเพื่อเปิดใช้งาน'}
                        >
                          {cat.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => void handleMove(cat, -1)}
                            disabled={idx <= 0}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="ย้ายขึ้น"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => void handleMove(cat, 1)}
                            disabled={idx < 0 || idx >= siblings.length - 1}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="ย้ายลง"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => openCreate(cat.id)}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
                            aria-label={`เพิ่มหมวดย่อยใน ${cat.name}`}
                            title="เพิ่มหมวดย่อย"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(cat)}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
                            aria-label="แก้ไข"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => void handleDelete(cat)}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-coral-600"
                            aria-label="ลบ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-clay-900/50 p-4"
          onClick={() => !saving && setModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-clay-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={modal.mode === 'create' ? 'เพิ่มหมวดหมู่' : 'แก้ไขหมวดหมู่'}
          >
            <h2 className="mb-4 text-lg font-bold text-fg">
              {modal.mode === 'create' ? 'เพิ่มหมวดหมู่' : `แก้ไข: ${modal.cat.name}`}
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-fg-secondary"
                  htmlFor="cat-name"
                >
                  ชื่อหมวดหมู่
                </label>
                <input
                  id="cat-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug:
                        !slugTouched && modal.mode === 'create'
                          ? name
                              .toLowerCase()
                              .replace(/[^a-z0-9-]+/g, '-')
                              .replace(/^-+|-+$/g, '')
                          : f.slug,
                    }));
                  }}
                  maxLength={80}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:ring-2 focus:ring-peach-500"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium text-fg-secondary"
                  htmlFor="cat-slug"
                >
                  Slug (URL)
                </label>
                <input
                  id="cat-slug"
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  placeholder="เช่น movie-series"
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-fg focus:ring-2 focus:ring-peach-500"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium text-fg-secondary"
                  htmlFor="cat-parent"
                >
                  หมวดแม่
                </label>
                <select
                  id="cat-parent"
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:ring-2 focus:ring-peach-500"
                >
                  <option value="">— ไม่มี (หมวดใหญ่) —</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'\u00A0'.repeat(c.depth * 4)}
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {modal.mode === 'edit' && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  เปิดใช้งาน (แสดงบนหน้าเว็บ)
                </label>
              )}

              {modalError && (
                <p
                  className="rounded-md bg-coral-500/10 px-3 py-2 text-sm text-coral-600"
                  role="alert"
                >
                  {modalError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setModal(null)}
                  disabled={saving}
                  className="rounded-md border border-line px-4 py-2 text-sm text-fg-secondary hover:bg-surface-sunken"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || form.name.trim().length < 2}
                  className="rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-fg hover:bg-peach-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
