'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Tags — free-form product labels beyond categories (client ask:
 * การจัดการหมวดหมู่และแท็ก). Create/rename/delete; assignment lives in the
 * product editor. Deleting a tag only detaches it from products.
 */

type TagRow = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export default function TagsPage(): React.JSX.Element {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await adminJson<{ tags: TagRow[] }>('/api/v1/admin/tags');
      setTags(d.tags);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดแท็กไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (newName.trim() === '') return;
    setCreating(true);
    setError(null);
    try {
      await adminJson('/api/v1/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างแท็กไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (id: string) => {
    if (editName.trim() === '') return;
    setError(null);
    try {
      await adminJson(`/api/v1/admin/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'แก้ไขแท็กไม่สำเร็จ');
    }
  };

  const remove = async (tag: TagRow) => {
    if (!window.confirm(`ลบแท็ก "${tag.name}" ? (สินค้าจะไม่ถูกลบ — ปลดออกจากสลิปเท่านั้น)`)) {
      return;
    }
    setError(null);
    try {
      await adminJson(`/api/v1/admin/tags/${tag.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบแท็กไม่สำเร็จ');
    }
  };

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'แดชบอร์ด', href: '/management/dashboard' }, { label: 'แท็ก' }]}
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-fg">แท็กสินค้า</h1>
        <p className="mb-5 mt-1 text-sm text-fg-muted">
          ป้ายกำกับอิสระนอกเหนือจากหมวดหมู่ — ผูกที่หน้าสินค้า (แก้ไขสินค้า)
        </p>

        {/* Create */}
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <TagIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="ชื่อแท็กใหม่ เช่น ขายดี, มาใหม่"
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-500"
            />
          </div>
          <button
            type="button"
            onClick={create}
            disabled={creating || newName.trim() === ''}
            className="clay-btn transition-smart inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface-brand px-4 text-sm font-semibold text-fg-inverse shadow-clay-brand duration-interactive ease-ease-out hover:scale-[1.02] active:scale-[0.96] disabled:opacity-50"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            เพิ่มแท็ก
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-coral-600">{error}</p>}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-fg-placeholder" />
          </div>
        ) : tags.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-fg-muted">
            ยังไม่มีแท็ก — เพิ่มแท็กแรกได้เลย
          </div>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                {editingId === tag.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(tag.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-9 flex-1 rounded-lg border border-peach-500 bg-surface-elevated px-3 text-sm text-fg"
                    />
                    <button
                      type="button"
                      onClick={() => rename(tag.id)}
                      className="text-sm font-semibold text-fg-brand hover:underline"
                    >
                      บันทึก
                    </button>
                    <button
                      type="button"
                      aria-label="ยกเลิก"
                      onClick={() => setEditingId(null)}
                      className="text-fg-muted hover:text-fg"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <TagIcon size={15} className="shrink-0 text-fg-brand" />
                    <span className="flex-1 truncate text-sm font-semibold text-fg">
                      {tag.name}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs',
                        tag.productCount > 0
                          ? 'bg-peach-100 text-peach-800'
                          : 'bg-surface-sunken text-fg-placeholder',
                      )}
                    >
                      {tag.productCount} สินค้า
                    </span>
                    <button
                      type="button"
                      aria-label={`แก้ไขแท็ก ${tag.name}`}
                      onClick={() => {
                        setEditingId(tag.id);
                        setEditName(tag.name);
                      }}
                      className="text-fg-muted transition-colors hover:text-fg-brand"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบแท็ก ${tag.name}`}
                      onClick={() => remove(tag)}
                      className="text-fg-muted transition-colors hover:text-coral-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
