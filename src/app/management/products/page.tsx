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
  BadgePercent,
  PackagePlus,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { ImportDialog } from './ImportDialog';
import { BulkPricingDialog } from './BulkPricingDialog';
import { BulkStockDialog } from './BulkStockDialog';
/**
 * Admin Products Management — real CRUD over the Prisma catalog.
 * List, search, create, edit (info + image + variants), archive,
 * bulk publish/unpublish, and per-product bulk stock paste.
 */

interface AdminVariant {
  id: string;
  label: string;
  price: number;
  cost: number | null;
  memberPrice: number | null;
  dealerPrice: number | null;
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
  tags: { id: string; name: string; slug: string }[];
  variants: AdminVariant[];
  createdAt: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface TagOption {
  id: string;
  name: string;
}

interface DraftVariant {
  key: number;
  label: string;
  price: string;
  memberPrice: string;
  dealerPrice: string;
  stock: string;
  isActive: boolean;
}

const MAX_UPLOAD_BYTES = 512 * 1024;

let draftKey = 1;
function newDraftVariant(): DraftVariant {
  draftKey += 1;
  return {
    key: draftKey,
    label: '',
    price: '',
    memberPrice: '',
    dealerPrice: '',
    stock: '0',
    isActive: true,
  };
}

export default function AdminProductsPage(): React.JSX.Element {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [bulkPricing, setBulkPricing] = useState(false);
  const [stockTarget, setStockTarget] = useState<AdminProduct | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [inlineBusy, setInlineBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [productsRes, catsRes, tagsRes] = await Promise.all([
        adminFetch('/api/v1/admin/products', { cache: 'no-store' }),
        adminFetch('/api/v1/admin/categories', { cache: 'no-store' }),
        adminFetch('/api/v1/admin/tags', { cache: 'no-store' }),
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
      if (tagsRes.ok) {
        const t = (await tagsRes.json()) as { tags: TagOption[] };
        setAllTags(t.tags);
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
      const matchesCategory = categoryFilter === 'all' || p.categoryId === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [products, searchQuery, statusFilter, categoryFilter]);

  function handleSaved() {
    setEditing(null);
    void load();
  }

  async function bulkPublish(value: boolean): Promise<void> {
    if (
      !confirm(
        value
          ? 'เผยแพร่สินค้าทุกชิ้นที่ถูกซ่อนอยู่?'
          : 'ซ่อนสินค้าทุกชิ้นจากหน้าเว็บ? ลูกค้าจะไม่เห็นสินค้าใด ๆ จนกว่าจะเผยแพร่อีกครั้ง',
      )
    )
      return;
    setBulkBusy(true);
    try {
      const res = await adminFetch('/api/v1/admin/products/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) void load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function togglePublish(p: AdminProduct): Promise<void> {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)));
    const res = await adminFetch(`/api/v1/admin/products/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (!res.ok) void load();
  }

  /** Inline cell edit — commits to PATCH /api/v1/admin/variants/[id] on blur/Enter. */
  async function inlineEdit(
    product: AdminProduct,
    variantId: string,
    field: 'price' | 'cost' | 'stock' | 'memberPrice' | 'dealerPrice',
    raw: string,
  ): Promise<void> {
    const v = product.variants.find((x) => x.id === variantId);
    if (!v) return;
    const current =
      field === 'cost'
        ? v.cost
        : field === 'memberPrice'
          ? v.memberPrice
          : field === 'dealerPrice'
            ? v.dealerPrice
            : v[field];
    const parsed = raw.trim() === '' ? null : Number(raw);
    if (raw.trim() !== '' && !Number.isFinite(parsed)) return;
    if (parsed === current) return;
    const key = `${variantId}:${field}`;
    setInlineBusy(key);
    try {
      const res = await adminFetch(`/api/v1/admin/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Partial<AdminVariant>;
        setProducts((prev) =>
          prev.map((p) =>
            p.id !== product.id
              ? p
              : {
                  ...p,
                  variants: p.variants.map((x) => (x.id === variantId ? { ...x, ...updated } : x)),
                },
          ),
        );
      } else {
        void load();
      }
    } finally {
      setInlineBusy(null);
    }
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
              onClick={() => setBulkPricing(true)}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-peach-400 hover:text-fg-brand"
            >
              <BadgePercent size={16} />
              ราคาสมาชิก/ตัวแทนทีเดียว
            </button>
            <button
              onClick={() => void bulkPublish(true)}
              disabled={bulkBusy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:border-jade-400 hover:text-jade-700 disabled:opacity-50"
              title="เผยแพร่สินค้าทั้งหมด"
            >
              เผยแพร่ทั้งหมด
            </button>
            <button
              onClick={() => void bulkPublish(false)}
              disabled={bulkBusy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:border-coral-400 hover:text-fg-error disabled:opacity-50"
              title="ซ่อนสินค้าทั้งหมด"
            >
              ซ่อนทั้งหมด
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
              className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
            />
            {searchQuery !== '' && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-placeholder hover:text-fg"
                aria-label="ล้างการค้นหา"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary focus:ring-2 focus:ring-peach-500"
            aria-label="กรองตามหมวดหมู่"
          >
            <option value="all">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary focus:ring-2 focus:ring-peach-500"
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
          <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
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
                  <th className="px-4 py-3 text-right font-medium text-fg-muted">
                    ต้นทุนจริง / ราคา / ราคา VIP / ราคาขาจร
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-fg-muted">สต๊อก</th>
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
                    <td className="px-4 py-3">
                      {(() => {
                        const v = product.variants[0];
                        if (!v) return <span className="text-fg-placeholder">—</span>;
                        return (
                          <div className="space-y-1">
                            <InlineCell
                              label="ต้นทุน"
                              value={v.cost === null ? '' : String(v.cost)}
                              busy={inlineBusy === `${v.id}:cost`}
                              tone="cost"
                              onCommit={(raw) => void inlineEdit(product, v.id, 'cost', raw)}
                            />
                            <InlineCell
                              label="ราคา"
                              value={String(v.price)}
                              busy={inlineBusy === `${v.id}:price`}
                              tone="price"
                              onCommit={(raw) => void inlineEdit(product, v.id, 'price', raw)}
                            />
                            <InlineCell
                              label="สมาชิก"
                              value={v.memberPrice === null ? '' : String(v.memberPrice)}
                              busy={inlineBusy === `${v.id}:memberPrice`}
                              tone="tier"
                              onCommit={(raw) => void inlineEdit(product, v.id, 'memberPrice', raw)}
                            />
                            <InlineCell
                              label="ตัวแทน"
                              value={v.dealerPrice === null ? '' : String(v.dealerPrice)}
                              busy={inlineBusy === `${v.id}:dealerPrice`}
                              tone="tier2"
                              onCommit={(raw) => void inlineEdit(product, v.id, 'dealerPrice', raw)}
                            />
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const v = product.variants[0];
                        if (!v) return <span className="text-fg-placeholder">—</span>;
                        return (
                          <InlineCell
                            label=""
                            value={String(v.stock)}
                            busy={inlineBusy === `${v.id}:stock`}
                            tone="stock"
                            onCommit={(raw) => void inlineEdit(product, v.id, 'stock', raw)}
                          />
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => void togglePublish(product)}
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                          product.isActive
                            ? 'bg-jade-500/15 text-jade-700 hover:bg-jade-500/25'
                            : 'bg-surface text-fg-placeholder hover:bg-surface-elevated',
                        )}
                        title={product.isActive ? 'กดเพื่อซ่อนจากหน้าเว็บ' : 'กดเพื่อเผยแพร่'}
                      >
                        {product.isActive ? 'เผยแพร่' : 'ซ่อน'}
                      </button>
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
                          onClick={() => setStockTarget(product)}
                          className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg-brand"
                          aria-label={`จัดการสต๊อก ${product.name}`}
                          title="เติมสต๊อกบัญชี"
                        >
                          <PackagePlus size={14} />
                        </button>
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
                            className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg-error"
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
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-fg-placeholder">
                      ไม่พบสินค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-fg-placeholder">
          ทั้งหมด {products.length} รายการ (แสดงผล {products.filter((p) => p.isActive).length}{' '}
          รายการ)
          {searchQuery !== '' && filteredProducts.length !== products.length && (
            <> · ค้นเจอ {filteredProducts.length} รายการ</>
          )}
        </p>
      </div>

      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onImported={() => void load()} />
      )}

      {bulkPricing && (
        <BulkPricingDialog onClose={() => setBulkPricing(false)} onApplied={() => void load()} />
      )}

      {stockTarget && (
        <BulkStockDialog
          productId={stockTarget.id}
          productName={stockTarget.name}
          onClose={() => setStockTarget(null)}
          onSaved={() => void load()}
        />
      )}

      {editing !== null && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories}
          allTags={allTags}
          onTagsChanged={() => void load()}
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
  allTags,
  onTagsChanged,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  categories: CategoryOption[];
  allTags: TagOption[];
  onTagsChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    product?.tags.map((t) => t.id) ?? [],
  );
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [variants, setVariants] = useState<DraftVariant[]>(
    product && product.variants.length > 0
      ? product.variants.map((v) => ({
          key: draftKey++,
          label: v.label,
          price: String(v.price),
          memberPrice: v.memberPrice === null ? '' : String(v.memberPrice),
          dealerPrice: v.dealerPrice === null ? '' : String(v.dealerPrice),
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

  async function handleCreateTag() {
    if (newTagName.trim() === '') return;
    setCreatingTag(true);
    try {
      const res = await adminFetch('/api/v1/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const tag = (await res.json()) as { id: string; name: string };
      setSelectedTagIds((ids) => [...ids, tag.id]);
      setNewTagName('');
      onTagsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างแท็กไม่สำเร็จ');
    } finally {
      setCreatingTag(false);
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
        tagIds: selectedTagIds,
        variants: variants.map((v) => ({
          label: v.label.trim(),
          price: Number(v.price),
          memberPrice: v.memberPrice === '' ? null : Number(v.memberPrice),
          dealerPrice: v.dealerPrice === '' ? null : Number(v.dealerPrice),
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
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg animate-[drawer-in_300ms_cubic-bezier(0,0,0.2,1)_both] flex-col bg-surface shadow-clay-lg">
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
                    className="text-left text-xs text-fg-error hover:underline"
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
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted">คำอธิบาย</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="รายละเอียดที่ลูกค้าจะเห็นในหน้าสินค้า"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-fg-muted">หมวดหมู่ *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:ring-2 focus:ring-peach-500"
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

          {/* Tags (แท็ก) — free-form labels beyond category */}
          <div>
            <label className="mb-2 block text-sm font-medium text-fg-muted">แท็ก</label>
            {allTags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {allTags.map((tag) => {
                  const on = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelectedTagIds((ids) =>
                          on ? ids.filter((x) => x !== tag.id) : [...ids, tag.id],
                        )
                      }
                      className={cn(
                        'transition-smart rounded-full border px-3 py-1.5 text-xs font-medium duration-fast active:scale-95',
                        on
                          ? 'border-peach-500 bg-peach-100 text-peach-800'
                          : 'border-line bg-surface text-fg-secondary hover:border-peach-400',
                      )}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleCreateTag()}
                placeholder="สร้างแท็กใหม่…"
                className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
              />
              <button
                type="button"
                onClick={() => void handleCreateTag()}
                disabled={creatingTag || newTagName.trim() === ''}
                className="flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-fg-secondary transition-colors hover:border-peach-400 hover:text-fg-brand disabled:opacity-50"
              >
                {creatingTag ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                สร้างแท็ก
              </button>
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
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
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
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:ring-2 focus:ring-peach-500"
                  />
                  <input
                    value={v.memberPrice}
                    onChange={(e) =>
                      setVariants((arr) =>
                        arr.map((x) =>
                          x.key === v.key
                            ? { ...x, memberPrice: e.target.value.replace(/[^0-9.]/g, '') }
                            : x,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="สมาชิก ฿"
                    title="ราคาสมาชิก (เว้นว่าง = ใช้ราคาปกติ)"
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:ring-2 focus:ring-peach-500"
                  />
                  <input
                    value={v.dealerPrice}
                    onChange={(e) =>
                      setVariants((arr) =>
                        arr.map((x) =>
                          x.key === v.key
                            ? { ...x, dealerPrice: e.target.value.replace(/[^0-9.]/g, '') }
                            : x,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="ตัวแทน ฿"
                    title="ราคาตัวแทนจำหน่าย (เว้นว่าง = ใช้ราคาปกติ)"
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:ring-2 focus:ring-peach-500"
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
                    className="w-16 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-fg focus:ring-2 focus:ring-peach-500"
                  />
                  <button
                    onClick={() =>
                      setVariants((arr) =>
                        arr.length > 1 ? arr.filter((x) => x.key !== v.key) : arr,
                      )
                    }
                    disabled={variants.length <= 1}
                    className="rounded p-1.5 text-fg-placeholder hover:text-fg-error disabled:opacity-30"
                    aria-label={`ลบตัวเลือกที่ ${i + 1}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-fg-placeholder">
              ชื่อตัวเลือก · ราคาปกติ · ราคาสมาชิก · ราคาตัวแทน (เว้นว่าง = ใช้ราคาปกติ) · สต็อก
            </p>
          </div>

          {error && (
            <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
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

// ─── Inline editable cell (reference-style table) ────────────

type InlineTone = 'cost' | 'price' | 'tier' | 'tier2' | 'stock';

const TONE_STYLES: Record<InlineTone, string> = {
  cost: 'border-coral-200 bg-coral-50 text-fg-error',
  price: 'border-line-subtle bg-surface text-fg',
  tier: 'border-peach-200 bg-peach-50 text-fg-brand',
  tier2: 'border-line-subtle bg-surface text-fg-secondary',
  stock: 'border-sapphire-200 bg-sky-50 text-sapphire-700',
};

function InlineCell({
  label,
  value,
  busy,
  tone,
  onCommit,
}: {
  label: string;
  value: string;
  busy: boolean;
  tone: InlineTone;
  onCommit: (raw: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <div className="flex items-center justify-end gap-1.5">
      {label !== '' && <span className="text-[11px] text-fg-placeholder">{label}</span>}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        inputMode="decimal"
        aria-label={label === '' ? 'สต๊อก' : label}
        className={cn(
          'w-16 rounded-md border px-2 py-1 text-right text-xs font-medium transition-colors focus:ring-2 focus:ring-peach-400',
          TONE_STYLES[tone],
          busy && 'animate-pulse opacity-60',
        )}
      />
    </div>
  );
}
