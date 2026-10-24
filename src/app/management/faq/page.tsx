'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, GripVertical, Link, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { escapeFaqText, faqHtmlToText, sanitizeFaqHtml } from '@/lib/faqRichText';
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
import { Toggle } from '@/components/ui/Toggle';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import type { FaqItem } from '@/app/api/v1/admin/settings/faq/route';

interface FaqFormItem {
  question: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Sortable card
// ---------------------------------------------------------------------------

function AnswerEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Only rewrite the DOM on external changes. Comparing the *sanitized*
    // current HTML to the prop keeps the caret still while typing (the raw
    // innerHTML of a browser can differ cosmetically from our stored form).
    if (sanitizeFaqHtml(el.innerHTML) !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  function commit() {
    onChange(sanitizeFaqHtml(editorRef.current?.innerHTML ?? ''));
  }

  function applyBold() {
    editorRef.current?.focus();
    document.execCommand('bold');
    commit();
  }

  function applyLink() {
    const url = window.prompt('วางลิงก์ (https://...)');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert('ลิงก์ต้องขึ้นต้นด้วย https:// http:// หรือ mailto:');
      return;
    }
    editorRef.current?.focus();
    document.execCommand('createLink', false, url.trim());
    commit();
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    onChange(sanitizeFaqHtml(event.currentTarget.innerHTML));
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    // Paste as escaped plain text: predictable line breaks, no third-party markup.
    document.execCommand('insertHTML', false, escapeFaqText(text).replace(/\r?\n/g, '<br />'));
    commit();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-peach-500">
      <div className="flex items-center gap-1 border-b border-line-subtle bg-surface-sunken px-2 py-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyBold}
          className="rounded p-1.5 text-fg-secondary hover:bg-surface hover:text-fg"
          aria-label="ตัวหนา"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyLink}
          className="rounded p-1.5 text-fg-secondary hover:bg-surface hover:text-fg"
          aria-label="เพิ่มลิงก์"
        >
          <Link size={16} />
        </button>
        <span className="ml-1 text-xs text-fg-placeholder">
          เลือกข้อความแล้วกดปุ่มเพื่อจัดรูปแบบ
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="คำตอบ"
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className="min-h-[88px] whitespace-pre-wrap px-3 py-2.5 text-sm leading-relaxed text-fg outline-none empty:before:text-fg-placeholder empty:before:content-[attr(data-placeholder)]"
        data-placeholder="เช่น จัดส่งภายใน 1-3 วันทำการ ขึ้นอยู่กับพื้นที่ปลายทาง"
      />
    </div>
  );
}

function SortableFaqCard({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: FaqFormItem;
  onChange: (field: keyof FaqFormItem, value: string) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `faq-${index}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

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
          {/* Drag grip */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-0.5 text-fg-placeholder transition-colors hover:text-fg active:cursor-grabbing"
            aria-label={`ลากเพื่อจัดลำดับคำถามที่ ${index + 1}`}
          >
            <GripVertical size={16} />
          </button>
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
            คำถามที่ {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-fg-placeholder transition-colors hover:text-fg-error"
          aria-label={`ลบคำถามที่ ${index + 1}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">คำถาม</label>
          <textarea
            value={item.question}
            onChange={(e) => onChange('question', e.target.value)}
            rows={2}
            placeholder="เช่น สินค้าจัดส่งกี่วัน?"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">คำตอบ</label>
          <AnswerEditor value={item.answer} onChange={(value) => onChange('answer', value)} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminFaqPage(): React.JSX.Element {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [form, setForm] = useState<FaqFormItem[]>([]);
  /** Storefront visibility of the whole section — mirrors FaqSettings.enabled. */
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
      const data = await adminJson<{ enabled?: boolean; items: FaqItem[] }>(
        '/api/v1/admin/settings/faq',
      );
      // Absent flag (row written before the toggle existed) means visible.
      setEnabled(data.enabled !== false);
      setItems(data.items);
      setForm(data.items.map((item) => ({ question: item.question, answer: item.answer })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setItem(index: number, field: keyof FaqFormItem, value: string) {
    setForm((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return next;
      next[index] = { question: item.question, answer: item.answer, [field]: value };
      return next;
    });
  }

  function addItem() {
    setForm((prev) => [...prev, { question: '', answer: '' }]);
  }

  function removeItem(index: number) {
    setForm((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setForm((prev) => {
      const oldIndex = prev.findIndex((_, i) => `faq-${i}` === active.id);
      const newIndex = prev.findIndex((_, i) => `faq-${i}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const canSave = form.every(
    (item) => item.question.trim().length > 0 && faqHtmlToText(item.answer).length > 0,
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await adminJson('/api/v1/admin/settings/faq', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          items: form
            .filter(
              (item) => item.question.trim().length > 0 && faqHtmlToText(item.answer).length > 0,
            )
            .map((item, index) => ({
              question: item.question.trim(),
              answer: sanitizeFaqHtml(item.answer.trim()),
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
        { label: 'คำถามที่พบบ่อย' },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">คำถามที่พบบ่อย</h1>
            <p className="mt-1 text-sm text-fg-placeholder">
              ลากเพื่อจัดลำดับ — แก้ไขคำถามและคำตอบ — บันทึกแล้วเปลี่ยนทันที
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
            {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกคำถาม'}
          </button>
        </div>

        {error && (
          <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
            {error}
          </div>
        )}

        {/* Section master switch — off hides the whole FAQ block on the
            storefront while keeping every saved question intact. */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line-subtle bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fg">แสดงคำถามที่พบบ่อยในหน้าแรก</p>
            <p className="mt-0.5 text-xs text-fg-placeholder">
              ปิดเพื่อซ่อนทั้งส่วน — คำถามที่บันทึกไว้ยังอยู่ กดบันทึกเพื่อให้มีผล
            </p>
          </div>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="แสดงคำถามที่พบบ่อยในหน้าแรก"
            disabled={loading || saving}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-fg-placeholder">
            <Loader2 size={22} className="animate-spin text-fg-placeholder" />
          </div>
        ) : form.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-fg-muted">
            ยังไม่มีคำถาม — เพิ่มคำถามแรกได้เลย
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={form.map((_, i) => `faq-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {form.map((item, index) => (
                  <SortableFaqCard
                    key={`faq-${index}`}
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-sunken"
          >
            <Plus size={16} />
            เพิ่มคำถาม
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
