'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Image as ImageIcon, Plus, ArrowUp, ArrowDown, Loader2, Tag } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { Field } from '../shared';

// ─── Homepage Banner (hero carousel) Settings ───────────
export interface AdminHeroSlide {
  id: string;
  imageUrl: string | null;
  /** object-position focal point, e.g. "30% 70%". Null = centred. */
  imageFocus: string | null;
  label: string | null;
  href: string | null;
  alt: string;
  sortOrder: number;
  isActive: boolean;
}

/** Parse a stored focal point into CSS percentages, defaulting to centre. */
export function focusPoint(focus: string | null): { x: string; y: string } {
  const m = /^(\d{1,3})% (\d{1,3})%$/.exec(focus ?? '');
  return { x: `${m?.[1] ?? 50}%`, y: `${m?.[2] ?? 50}%` };
}

export function BannerSettings(): React.JSX.Element {
  const [slides, setSlides] = useState<AdminHeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const newSlideInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/v1/admin/hero-slides');
      if (!res.ok)
        throw new Error((await safeJson<{ error?: string }>(res)).error ?? `HTTP ${res.status}`);
      const data = (await res.json()) as { slides: AdminHeroSlide[] };
      setSlides(data.slides);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, data: Partial<AdminHeroSlide>): Promise<void> {
    setBusyId(id);
    try {
      const res = await adminFetch(`/api/v1/admin/hero-slides/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok)
        throw new Error((await safeJson<{ error?: string }>(res)).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm('ลบสไลด์นี้ถาวร?')) return;
    setBusyId(id);
    try {
      const res = await adminFetch(`/api/v1/admin/hero-slides/${id}`, { method: 'DELETE' });
      if (!res.ok)
        throw new Error((await safeJson<{ error?: string }>(res)).error ?? `HTTP ${res.status}`);
      setSlides((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  /** Add with image = pick an image first; created with the uploaded path. */
  function startAdd(): void {
    newSlideInput.current?.click();
  }

  /** Add a text deal card (label only, no image) — the ticker's old role. */
  async function addDeal(): Promise<void> {
    const label = window.prompt('ข้อความโปรโมชั่น (เช่น 🔥 HBO Max 7 วัน ฿25)');
    if (!label?.trim()) return;
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/hero-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), sortOrder: slides.length }),
      });
      if (!res.ok)
        throw new Error((await safeJson<{ error?: string }>(res)).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เพิ่มสไลด์ไม่สำเร็จ');
    }
  }

  async function createFromImage(file: File): Promise<void> {
    setUploadingId('new');
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const up = await adminFetch('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!up.ok) {
        const data = await safeJson<{ error?: string; message?: string }>(up);
        throw new Error(data.message ?? data.error ?? `HTTP ${up.status}`);
      }
      const { path } = (await up.json()) as { path: string };
      const res = await adminFetch('/api/v1/admin/hero-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: path,
          alt: 'แบนเนอร์โปรโมชั่น',
          sortOrder: slides.length,
        }),
      });
      if (!res.ok)
        throw new Error((await safeJson<{ error?: string }>(res)).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เพิ่มสไลด์ไม่สำเร็จ');
    } finally {
      setUploadingId(null);
    }
  }

  function pickImage(id: string): void {
    fileInputs.current[id]?.click();
  }

  async function uploadImage(id: string, file: File): Promise<void> {
    setUploadingId(id);
    setError(null);
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
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string; message?: string }>(res);
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const { path } = (await res.json()) as { path: string };
      await patch(id, { imageUrl: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadingId(null);
    }
  }

  function move(slide: AdminHeroSlide, dir: -1 | 1): void {
    const idx = slides.findIndex((s) => s.id === slide.id);
    const swapWith = slides[idx + dir];
    if (!swapWith) return;
    void patch(slide.id, { sortOrder: swapWith.sortOrder });
    void patch(swapWith.id, { sortOrder: slide.sortOrder });
  }

  if (loading) {
    return (
      <div className="clay-card rounded-2xl p-8 text-center text-sm text-fg-placeholder">
        กำลังโหลด…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="clay-card rounded-2xl p-5">
        <h2 className="text-base font-bold text-fg">แบนเนอร์หน้าแรก (Carousel)</h2>
        <p className="mt-1 text-sm text-fg-muted">
          อัปโหลดภาพโปรโมชั่น ใส่ลิงก์เมื่อกดภาพ และจัดลำดับการแสดงผล — ภาพแนะนำขนาดกว้าง
          อัตราส่วนประมาณ 21:8 (สูงสุด 5MB ต่อภาพ) หรือเพิ่มเป็นข้อความโปรโมชั่นล้วนก็ได้
        </p>
        {error && (
          <p className="bg-error mt-3 rounded-lg px-3 py-2 text-sm text-fg-error dark:bg-coral-900/20 dark:text-coral-300">
            {error}
          </p>
        )}
      </div>

      {slides.length === 0 && (
        <div className="clay-card rounded-2xl p-8 text-center text-sm text-fg-placeholder">
          ยังไม่มีแบนเนอร์ — กด “เพิ่มสไลด์” เพื่อเริ่ม
        </div>
      )}

      {slides.map((slide, i) => (
        <div key={slide.id} className="clay-card rounded-2xl p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Image preview / upload */}
            <div className="relative shrink-0">
              {slide.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <button
                  type="button"
                  title="คลิกบนภาพเพื่อเลือกส่วนที่ต้องการให้เหลือในแบนเนอร์"
                  aria-label={`เลื่อนตำแหน่งภาพแบนเนอร์ (ปัจจุบัน ${slide.imageFocus ?? 'กลางภาพ'})`}
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(
                      Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)),
                    );
                    const y = Math.round(
                      Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100)),
                    );
                    void patch(slide.id, { imageFocus: `${x}% ${y}%` });
                  }}
                  className="relative block h-24 w-44 cursor-crosshair overflow-hidden rounded-xl shadow-clay-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.imageUrl}
                    alt={slide.alt}
                    className="h-full w-full object-cover"
                    style={{ objectPosition: slide.imageFocus ?? '50% 50%' }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/40 shadow"
                    style={{ left: focusPoint(slide.imageFocus).x, top: focusPoint(slide.imageFocus).y }}
                  />
                </button>
              ) : (
                <div className="flex h-24 w-44 items-center justify-center rounded-xl bg-surface text-xs text-fg-placeholder shadow-clay-sm">
                  ยังไม่มีภาพ
                </div>
              )}
              <input
                ref={(el) => {
                  fileInputs.current[slide.id] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadImage(slide.id, f);
                }}
              />
              <button
                type="button"
                onClick={() => pickImage(slide.id)}
                disabled={uploadingId === slide.id}
                className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-peach-500 px-3 py-1 text-xs font-semibold text-white shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90"
              >
                {uploadingId === slide.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ImageIcon size={12} />
                )}
                {uploadingId === slide.id ? 'กำลังอัปโหลด…' : 'เปลี่ยนรูป'}
              </button>
            </div>

            {/* Fields */}
            <div className="min-w-0 flex-1 space-y-2.5">
              <label className="block">
                <span className="text-xs font-medium text-fg-muted">
                  ข้อความโปรโมชั่น (chip บนภาพ หรือข้อความหลักถ้าไม่มีภาพ)
                </span>
                <input
                  defaultValue={slide.label ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (slide.label ?? '')) void patch(slide.id, { label: v });
                  }}
                  placeholder="🔥 HBO Max 7 วัน ฿25"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-fg-muted">
                  ลิงก์เมื่อกดภาพ (เว้นว่างได้)
                </span>
                <input
                  defaultValue={slide.href ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (slide.href ?? '')) void patch(slide.id, { href: v });
                  }}
                  placeholder="/search หรือ https://…"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-fg-muted">คำอธิบายภาพ (alt)</span>
                <input
                  defaultValue={slide.alt}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== slide.alt) void patch(slide.id, { alt: v });
                  }}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-peach-400"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={slide.isActive}
                    onChange={(e) => void patch(slide.id, { isActive: e.target.checked })}
                    className="size-4 accent-peach-500"
                  />
                  แสดงบนหน้าเว็บ
                </label>
                <span className="text-xs text-fg-placeholder">
                  {busyId === slide.id ? 'กำลังบันทึก…' : 'แก้ไขแล้วบันทึกอัตโนมัติ'}
                </span>
              </div>
            </div>

            {/* Order + delete */}
            <div className="flex shrink-0 flex-row items-center gap-1.5 sm:flex-col">
              <button
                type="button"
                onClick={() => move(slide, -1)}
                disabled={i === 0}
                aria-label="ย้ายขึ้น"
                className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => move(slide, 1)}
                disabled={i === slides.length - 1}
                aria-label="ย้ายลง"
                className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-30"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => void remove(slide.id)}
                aria-label="ลบสไลด์"
                className="hover:bg-error rounded-lg p-2 text-fg-error transition-colors dark:text-coral-400 dark:hover:bg-coral-900/20"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}

      <input
        ref={newSlideInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void createFromImage(f);
        }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={startAdd}
          disabled={uploadingId === 'new'}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-peach-300 py-4 text-sm font-semibold text-fg-brand transition-colors hover:bg-peach-50 disabled:opacity-60 dark:border-peach-700/60 dark:hover:bg-peach-900/20"
        >
          {uploadingId === 'new' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          {uploadingId === 'new' ? 'กำลังอัปโหลด…' : 'เพิ่มสไลด์ (เลือกภาพ)'}
        </button>
        <button
          type="button"
          onClick={() => void addDeal()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface"
        >
          <Tag size={16} />
          เพิ่มข้อความโปรโมชั่น (ไม่มีภาพ)
        </button>
      </div>
    </div>
  );
}
