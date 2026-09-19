'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Archive,
  X,
  Loader2,
  ImagePlus,
  Star,
  CheckCircle2,
  AlertTriangle,
  FileUp,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { ImportDialog } from './ImportDialog';
/**
 * Admin Products Management — real CRUD over the Prisma catalog.
 * List, search, create, edit (info + image + variants), archive.
 */

interface AdminVariant {
  id: string;
  label: string;
  price: number;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  isFeatured: boolean;
  variants: AdminVariant[];
  createdAt: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface DraftVariant {
  key: number;
  label: string;
  price: string;
  stock: string;
  isActive: boolean;
}

const MAX_UPLOAD_BYTES = 512 * 1024;

let draftKey = 1;
function newDraftVariant(): DraftVariant {
  draftKey += 1;
  return { key: draftKey, label: '', price: '', stock: '0', isActive: true };
}

export default function AdminProductsPage(): React.JSX.Element {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [productsRes, catsRes] = await Promise.all([
        adminFetch('/api/v1/admin/products', { cache: 'no-store' }),
        adminFetch('/api/v1/admin/categories', { cache: 'no-store' }),
      ]);
      if (!productsRes.ok) {
        const data = (await productsRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${productsRes.status}`);
      }
      const list = (await productsRes.json()) as AdminProduct[];
      setProducts(list);
      if (catsRes.ok) {
        const cats = (await catsRes.json()) as { categories: CategoryOption[] };
        setCategories(cats.categories);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'โหลดสินค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.isActive) ||
        (statusFilter === 'archived' && !p.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [products, searchQuery, statusFilter]);

  function handleSaved() {
    setEditing(null);
    void load();
  }

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'สินค้า' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">สินค้า</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-peach-400 hover:text-fg-brand"
            >
              <FileUp size={16} />
              นำเข้า CSV
            </button>
            <button
              onClick={() => setEditing('new')}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-peach-400 active:scale-95"
            >
              <Plus size={16} />
              เพิ่มสินค้า
            </button>
          </div>
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
              placeholder="ค้นหาสินค้าหรือ slug..."
              className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary focus:outline-none focus:ring-2 focus:ring-peach-500"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="archived">เก็บถาวร</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-line-subtle bg-surface py-16 text-sm text-fg-placeholder">
            <Loader2 size={16} className="animate-spin" /> กำลังโหลดสินค้า…
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
            <AlertTriangle size={16} /> {loadError}
            <button onClick={() => void load()} className="ml-auto font-semibold underline">
              ลองอีกครั้ง
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface">
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">สินค้า</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">หมวดหมู่</th>
                  <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                  <th className="px-4 py-3 text-center font-medium text-fg-muted">แนะนำ</th>
                  <th className="px-4 py-3 text-center font-medium text-fg-muted">ตัวเลือก</th>
                  <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-xs text-fg-placeholder">
                            ไม่มี
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-fg">{product.name}</p>
                          <p className="font-mono text-xs text-fg-placeholder">{product.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{product.categoryName}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          product.isActive
                            ? 'bg-jade-500/15 text-jade-700'
                            : 'bg-surface text-fg-placeholder',
                        )}
                      >
                        {product.isActive ? 'ใช้งาน' : 'เก็บถาวร'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {product.isFeatured ? (
                        <Star size={14} className="mx-auto fill-peach-400 text-peach-400" />
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-fg-placeholder">
                      {product.variants.length} ตัวเลือก
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditing(product)}
                          className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
                          aria-label={`แก้ไข ${product.name}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        {product.isActive && (
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  `เก็บ "${product.name}" ไว้ในถาวร? ลูกค้าจะไม่เห็นสินค้านี้`,
                                )
                              )
                                return;
                              await adminFetch(`/api/v1/admin/products/${product.id}`, {
                                method: 'DELETE',
                              });
                              void load();
                            }}
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-coral-600"
                            aria-label={`เก็บถาวร ${product.name}`}
                          >
                            <Archive size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-fg-placeholder">
                      ไม่พบสินค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-fg-placeholder">
          แสดง {filteredProducts.length} จาก {products.length} สินค้า
        </p>
      </div>

      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onImported={() => void load()} />
      )}

      {editing !== null && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AdminShell>
  );
}

// ─── Editor Drawer ────────────────────────────────────────

function ProductEditor({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [variants, setVariants] = useState<DraftVariant[]>(
    product && product.variants.length > 0
      ? product.variants.map((v) => ({
          key: draftKey++,
          label: v.label,
          price: String(v.price),
          stock: String(v.stock),
          isActive: v.isActive,
        }))
      : [newDraftVariant()],
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(() => {
    if (!name.trim() || !categoryId) return false;
    return variants.every(
      (v) =>
        v.label.trim() !== '' && v.price !== '' && Number(v.price) >= 0 && Number(v.stock) >= 0,
    );
  }, [name, categoryId, variants]);

  async function handleUpload(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('รูปใหญ่เกิน 512KB — กรุณาย่อรูปก่อนอัปโหลด');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const res = await adminFetch('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { path } = (await res.json()) as { path: string };
      setImageUrl(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        imageUrl,
        categoryId,
        isFeatured,
        variants: variants.map((v) => ({
          label: v.label.trim(),
          price: Number(v.price),
          stock: Math.max(0, Math.round(Number(v.stock) || 0)),
          isActive: v.isActive,
        })),
      };
      const res = await adminFetch(
        product ? `/api/v1/admin/products/${product.id}` : '/api/v1/admin/products',
        {
          method: product ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={product ? `แก้ไข ${product.name}` : 'เพิ่มสินค้า'}
    >
      <button aria-label="ปิด" onClick={onClose} className="bg-overlay absolute inset-0" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg animate-[drawer-in_300ms_cubic-bezier(0,0,0.2,1)_both] flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-lg font-bold text-fg">
            {product ? `แก้ไข: ${product.name}` : 'เพิ่มสินค้าใหม่'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
            aria-label="ปิดหน้าต่างแก้ไข"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Image */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted">รูปสินค้า</label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="รูปสินค้า" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={20} className="text-fg-placeholder" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface hover:text-fg">
                  {uploading ? 'กำลังอัปโหลด…' : 'เลือกรูปใหม่'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {imageUrl && (
                  <button
                    onClick={() => setImageUrl(null)}
                    className="text-left text-xs text-coral-600 hover:underline"
                  >
                    ลบรูป
                  </button>
                )}
                <p className="text-[10px] text-fg-placeholder">
                  PNG / JPG / WEBP / GIF · ไม่เกิน 512KB
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted">ชื่อสินค้า *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น HBO Max 7 วัน 4K แชร์"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted">คำอธิบาย</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="รายละเอียดที่ลูกค้าจะเห็นในหน้าสินค้า"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-fg-muted">หมวดหมู่ *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-peach-500"
                />
                <Star size={14} className="text-peach-500" /> แสดงเป็นสินค้าแนะนำ
              </label>
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-fg-muted">
                ตัวเลือกราคา (แพ็กเกจ) *
              </label>
              <button
                onClick={() => setVariants((v) => [...v, newDraftVariant()])}
                className="flex items-center gap-1 text-xs font-semibold text-fg-brand hover:underline"
              >
                <Plus size={12} /> เพิ่มตัวเลือก
              </button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.key} className="flex items-center gap-2">
                  <input
                    value={v.label}
                    onChange={(e) =>
                      setVariants((arr) =>
                        arr.map((x) => (x.key === v.key ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    placeholder="ชื่อ เช่น 7 วัน 4K"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:ring-2 focus:ring-peach-500"
                  />
                  <input
                    value={v.price}
                    onChange={(e) =>
                      setVariants((arr) =>
                        arr.map((x) =>
                          x.key === v.key
                            ? { ...x, price: e.target.value.replace(/[^0-9.]/g, '') }
                            : x,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="ราคา ฿"
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
                  />
                  <input
                    value={v.stock}
                    onChange={(e) =>
                      setVariants((arr) =>
                        arr.map((x) =>
                          x.key === v.key
                            ? { ...x, stock: e.target.value.replace(/[^0-9]/g, '') }
                            : x,
                        ),
                      )
                    }
                    inputMode="numeric"
                    placeholder="สต็อก"
                    title="สต็อก"
                    className="w-16 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
                  />
                  <button
                    onClick={() =>
                      setVariants((arr) =>
                        arr.length > 1 ? arr.filter((x) => x.key !== v.key) : arr,
                      )
                    }
                    disabled={variants.length <= 1}
                    className="rounded p-1.5 text-fg-placeholder hover:text-coral-600 disabled:opacity-30"
                    aria-label={`ลบตัวเลือกที่ ${i + 1}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-fg-placeholder">
              ชื่อตัวเลือก · ราคา (บาท) · สต็อก (โค้ดที่ขายได้)
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-fg-secondary hover:bg-surface hover:text-fg"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave || saving || uploading}
            className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}
          </button>
        </div>
      </div>
    </div>
  );
}
