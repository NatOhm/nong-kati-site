'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Gift,
  GripVertical,
  Headphones,
  Loader2,
  Lock,
  Plus,
  Save,
  Shield,
  Trash2,
  Truck,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { AdminShell } from '@/components/layout/AdminShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { adminJson } from '@/lib/adminSession';
import {
  DEFAULT_TRUST_BADGES,
  MAX_TRUST_BADGES,
  TRUST_BADGE_DESC_MAX,
  TRUST_BADGE_ICON_KEYS,
  TRUST_BADGE_TITLE_MAX,
  type TrustBadgeIconKey,
  type TrustBadgesSettings,
} from '@/lib/trustBadges';
import { cn } from '@/utils/cn';

/** Icon key → preview lucide icon. The storefront map lives in
 *  components/home/TrustBadges; this is the editor's picker preview only. */
const ICON_PREVIEW: Record<TrustBadgeIconKey, LucideIcon> = {
  shield: Shield,
  zap: Zap,
  headphones: Headphones,
  wallet: Wallet,
  truck: Truck,
  lock: Lock,
  clock: Clock,
  gift: Gift,
};

const ICON_LABEL: Record<TrustBadgeIconKey, string> = {
  shield: 'โล่ (รับประกัน)',
  zap: 'สายฟ้า (ส่งไว)',
  headphones: 'หูฟัง (ซัพพอร์ต)',
  wallet: 'กระเป๋าสตางค์ (ชำระเงิน)',
  truck: 'รถบรรทุก (จัดส่ง)',
  lock: 'แม่กุญแจ (ปลอดภัย)',
  clock: 'นาฬิกา (ตอบเร็ว)',
  gift: 'ของขวัญ (ของแถม)',
};

interface BadgeFormItem {
  icon: TrustBadgeIconKey;
  title: string;
  desc: string;
}

// ---------------------------------------------------------------------------
// Sortable card
// ---------------------------------------------------------------------------

function SortableBadgeCard({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: BadgeFormItem;
  onChange: (field: keyof BadgeFormItem, value: string) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `badge-${index}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const PreviewIcon = ICON_PREVIEW[item.icon] ?? Shield;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-line-subtle bg-surface p-4',
        isDragging && 'z-50 shadow-lg',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-0.5 text-fg-placeholder transition-colors hover:text-fg active:cursor-grabbing"
            aria-label={`ลากเพื่อจัดลำดับป้ายที่ ${index + 1}`}
          >
            <GripVertical size={16} />
          </button>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-peach-50 text-fg-brand dark:bg-peach-900/20">
            <PreviewIcon size={18} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
            ป้ายที่ {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-fg-placeholder transition-colors hover:text-fg-error"
          aria-label={`ลบป้ายที่ ${index + 1}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">ไอคอน</label>
          <select
            value={item.icon}
            onChange={(e) => onChange('icon', e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:ring-2 focus:ring-peach-500"
          >
            {TRUST_BADGE_ICON_KEYS.map((key) => (
              <option key={key} value={key}>
                {ICON_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">หัวข้อ</label>
          <input
            type="text"
            value={item.title}
            onChange={(e) => onChange('title', e.target.value)}
            maxLength={TRUST_BADGE_TITLE_MAX}
            placeholder="เช่น รับประกัน 7 วัน"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">คำอธิบาย</label>
          <input
            type="text"
            value={item.desc}
            onChange={(e) => onChange('desc', e.target.value)}
            maxLength={TRUST_BADGE_DESC_MAX}
            placeholder="เช่น เปลี่ยนใหม่ทันทีหากมีปัญหา"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminTrustBadgesPage(): React.JSX.Element {
  const [form, setForm] = useState<BadgeFormItem[]>([]);
  /** Section heading — mirrors TrustBadgesSettings.title. */
  const [heading, setHeading] = useState(DEFAULT_TRUST_BADGES.title);
  /** Storefront visibility of the whole section — mirrors enabled. */
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminJson<TrustBadgesSettings>(
        '/api/v1/admin/settings/trust-badges',
      );
      // Absent flag (row written before the toggle existed) means visible.
      setEnabled(data.enabled !== false);
      setHeading(data.title || DEFAULT_TRUST_BADGES.title);
      setForm(
        data.items.map((item) => ({
          icon: item.icon,
          title: item.title,
          desc: item.desc,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setItem(index: number, field: keyof BadgeFormItem, value: string) {
    setForm((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return next;
      if (field === 'icon') {
        const icon = (TRUST_BADGE_ICON_KEYS as readonly string[]).includes(value)
          ? (value as TrustBadgeIconKey)
          : item.icon;
        next[index] = { ...item, icon };
      } else {
        next[index] = { ...item, [field]: value };
      }
      return next;
    });
  }

  function addItem() {
    setForm((prev) =>
      prev.length >= MAX_TRUST_BADGES
        ? prev
        : [...prev, { icon: 'shield', title: '', desc: '' }],
    );
  }

  function removeItem(index: number) {
    setForm((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setForm((prev) => {
      const oldIndex = prev.findIndex((_, i) => `badge-${i}` === active.id);
      const newIndex = prev.findIndex((_, i) => `badge-${i}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const canSave = heading.trim().length > 0 && form.every((item) => item.title.trim().length > 0);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await adminJson('/api/v1/admin/settings/trust-badges', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          title: heading.trim(),
          items: form
            .filter((item) => item.title.trim().length > 0)
            .map((item, index) => ({
              icon: item.icon,
              title: item.title.trim(),
              desc: item.desc.trim(),
              order: index,
            })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      staffRole="super_admin"
      breadcrumbs={[
        { label: 'ตั้งค่า', href: '/management/settings' },
        { label: 'ป้ายความน่าเชื่อถือ' },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">ป้ายความน่าเชื่อถือ</h1>
            <p className="mt-1 text-sm text-fg-placeholder">
              ส่วน &quot;ทำไมต้อง Nong-Kati?&quot; ในหน้าแรก — ลากเพื่อจัดลำดับ แก้ไขแล้วบันทึกทันที
            </p>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              canSave && !saving
                ? 'bg-peach-500 text-white hover:bg-peach-400'
                : 'cursor-not-allowed bg-surface text-fg-placeholder',
            )}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกป้าย'}
          </button>
        </div>

        {error && (
          <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
            {error}
          </div>
        )}

        {/* Section master switch — off hides the whole block on the storefront
            while keeping every saved badge intact. */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line-subtle bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fg">แสดงป้ายในหน้าแรก</p>
            <p className="mt-0.5 text-xs text-fg-placeholder">
              ปิดเพื่อซ่อนทั้งส่วน — ป้ายที่บันทึกไว้ยังอยู่ กดบันทึกเพื่อให้มีผล
            </p>
          </div>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="แสดงป้ายความน่าเชื่อถือในหน้าแรก"
            disabled={loading || saving}
          />
        </div>

        <div className="rounded-xl border border-line-subtle bg-surface px-4 py-3">
          <label className="mb-1 block text-sm font-medium text-fg-secondary">
            หัวข้อส่วน (เช่น ทำไมต้อง Nong-Kati?)
          </label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            maxLength={TRUST_BADGE_TITLE_MAX}
            disabled={loading || saving}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500 disabled:opacity-60"
          />
        </div>

        {loading ? (
          /* Loading skeleton — mirrors the editor's real layout (header row +
             icon/title/description fields) so the cards don't pop in and the
             page doesn't jump when the settings arrive. aria-busy + sr-only
             status text keep it announced, same as the checkout shell. */
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">กำลังโหลดป้ายความน่าเชื่อถือ…</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-line-subtle bg-surface p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Skeleton className="h-6 w-4" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="space-y-3">
                  <div>
                    <Skeleton className="mb-1.5 h-3 w-10" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  <div>
                    <Skeleton className="mb-1.5 h-3 w-12" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  <div>
                    <Skeleton className="mb-1.5 h-3 w-16" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : form.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-fg-muted">
            ยังไม่มีป้าย — เพิ่มป้ายแรกได้เลย (หรือกดบันทึกเพื่อใช้ชุดเริ่มต้นเดิม)
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={form.map((_, i) => `badge-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {form.map((item, index) => (
                  <SortableBadgeCard
                    key={`badge-${index}`}
                    index={index}
                    item={item}
                    onChange={(field, value) => setItem(index, field, value)}
                    onRemove={() => removeItem(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-fg-placeholder">
            สูงสุด {MAX_TRUST_BADGES} ป้าย (ตอนนี้ {form.length})
          </p>
          <button
            type="button"
            onClick={addItem}
            disabled={form.length >= MAX_TRUST_BADGES}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold transition-colors',
              form.length >= MAX_TRUST_BADGES
                ? 'cursor-not-allowed bg-surface text-fg-placeholder'
                : 'bg-surface text-fg hover:bg-surface-sunken',
            )}
          >
            <Plus size={16} />
            เพิ่มป้าย
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
