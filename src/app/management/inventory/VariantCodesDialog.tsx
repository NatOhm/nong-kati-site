'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Ban, RefreshCw, Send, Pencil, Copy, Check } from 'lucide-react';

import { adminFetch, adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Stored-account viewer for one variant.
 *
 * Answers the question staff actually had — "did my paste land, and can I
 * pull a bad one back out?" — which until now had no UI at all: the restock
 * dialog showed accounts only in its PREVIEW, and after saving they were
 * encrypted with no way back (client report 2026-10-05).
 *
 * Three actions with deliberately different permissions:
 *  - ดู (reveal) hits `inventory:reveal` — super_admin only. Every call is
 *    audited server-side, which is why the reveal is an explicit click on a
 *    single row rather than a bulk "show all".
 *  - แก้ไข (edit) hits `inventory:reveal` too — rewriting a stored credential
 *    is at least as sensitive as reading one. A paste with a typo can be
 *    corrected without burning a unit of stock the way a void would.
 *  - ปิดใช้งาน (void) hits `inventory:void` — it decrements stock, writes
 *    the movement and voids the row in one transaction.
 *
 * The LIST itself is masked (`inventory:read`), so staff can confirm what
 * exists without every inventory reader being handed live credentials.
 */

interface CodeRow {
  id: string;
  masked: string;
  status: string;
  voidReason: string | null;
  voidedAt: string | null;
  orderNumber: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface ListResponse {
  variantId: string;
  variantLabel: string;
  productName: string;
  stock: number;
  total: number;
  offset: number;
  limit: number;
  codes: CodeRow[];
}

const STATUS_LABEL: Record<string, string> = {
  available: 'พร้อมขาย',
  reserved: 'ถูกจอง',
  delivered: 'ส่งแล้ว',
  voided: 'ปิดใช้งาน',
  expired: 'หมดอายุ',
};

const STATUS_CLASS: Record<string, string> = {
  available: 'bg-jade-500/15 text-jade-700',
  reserved: 'bg-amber-500/15 text-amber-700',
  delivered: 'bg-surface-sunken text-fg-secondary',
  voided: 'bg-surface-sunken text-fg-placeholder line-through',
  expired: 'bg-surface-sunken text-fg-placeholder line-through',
};

const PAGE = 25;

export function VariantCodesDialog({
  variantId,
  variantLabel,
  productName,
  onClose,
  onChanged,
}: {
  variantId: string;
  variantLabel: string;
  productName: string;
  onClose: () => void;
  /** Fires after a void so the page behind can refresh its stock numbers. */
  onChanged: () => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** id → plaintext. Cleared on reload/close — never persisted. */
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  /** id of the row currently open in the editor, if any. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  /** id whose plaintext was just copied — drives the "คัดลอกแล้ว" state. */
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminJson<ListResponse>(
          `/api/v1/admin/inventory/variants/${variantId}/codes?limit=${PAGE}&offset=${nextOffset}`,
        );
        setRows(data.codes);
        setTotal(data.total);
        setOffset(nextOffset);
        // A refresh must not leave stale plaintext on screen — and an editor
        // showing the pre-edit text would be exactly that.
        setRevealed({});
        setEditingId(null);
        setEditDraft('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'โหลดรายการบัญชีไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    },
    [variantId],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const reveal = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/inventory/codes/${id}/reveal`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { code: string };
      setRevealed((prev) => ({ ...prev, [id]: body.code }));
    } catch {
      setError('เปิดดูบัญชีไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Open one account in the editor.
   *
   * Editing needs the CURRENT text, so if the admin has not looked at this row
   * yet we reveal it first — through the same audited endpoint as the eye
   * button, rather than reaching for the ciphertext from the list.
   */
  const startEdit = async (id: string): Promise<void> => {
    const known = revealed[id];
    if (known) {
      setEditingId(id);
      setEditDraft(known);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/inventory/codes/${id}/reveal`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { code: string };
      setRevealed((prev) => ({ ...prev, [id]: body.code }));
      setEditingId(id);
      setEditDraft(body.code);
    } catch {
      setError('เปิดบัญชีเพื่อแก้ไขไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditDraft('');
  };

  /** Replace the stored account with the corrected text. */
  const saveEdit = async (id: string): Promise<void> => {
    const next = editDraft.trim();
    if (!next) {
      setError('บัญชีต้องไม่ว่างเปล่า');
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/inventory/codes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { changed: boolean };
      setMessage(body.changed ? 'แก้ไขบัญชีเรียบร้อยแล้ว' : 'ไม่มีการเปลี่ยนแปลง');
      // Reload rather than patch local state: stock did not move, but the row
      // must come back masked and the plaintext must leave the screen.
      await load(offset);
    } catch {
      setError('บันทึกการแก้ไขไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Copy the revealed account so it can be pasted straight into LINE.
   *
   * This is the reason reveal exists: staff read an account out of this screen
   * into a chat app. Without a copy button that is retyping a 30-character
   * password by eye, which is how a typo reaches a customer.
   */
  const copyCode = async (id: string): Promise<void> => {
    const text = revealed[id];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The Clipboard API needs a secure context. Say so instead of failing
      // silently — the text is still on screen to be selected by hand.
      setError('คัดลอกไม่สำเร็จ — ให้เลือกข้อความแล้วกดคัดลอกเอง');
      return;
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
  };

  /**
   * Hide a revealed account.
   *
   * LOCAL ONLY, on purpose. The button is labelled ซ่อน, so it must actually
   * hide — and re-calling the reveal endpoint to do it would write another
   * `inventory.code_reveal` audit row every time someone tidies their screen,
   * burying the one audit row that matters (the one for a genuine read).
   */
  const hideCode = (id: string): void => {
    setRevealed((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCopiedId((cur) => (cur === id ? null : cur));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft('');
    }
  };

  const voidCode = async (id: string): Promise<void> => {
    if (!confirm('ปิดใช้งานบัญชีนี้? สต๊อกจะลดลง 1 และย้อนกลับไม่ได้')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/inventory/codes/${id}/void`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setMessage('ปิดใช้งานบัญชีเรียบร้อยแล้ว');
      onChanged();
      await load(offset);
    } catch {
      setError('ปิดใช้งานไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Send this specific account to a specific customer.
   *
   * Asks for the order number because staff read it off the order, and the
   * endpoint resolves it — one fewer field to get wrong than an id. The
   * endpoint refuses an unpaid order, an already-delivered account, and a
   * code that isn't part of that order, so a fat-fingered number fails
   * safely rather than sending the wrong account to the wrong person.
   */
  const assignToOrder = async (id: string): Promise<void> => {
    const orderNumber = window.prompt('ส่งบัญชีนี้ให้ลูกค้าออเดอร์เลขที่: (เช่น NK-2026-000123)');
    if (!orderNumber || !orderNumber.trim()) return;
    const orderId = orderNumber.trim();
    if (!confirm(`ยืนยันส่งบัญชีนี้ให้ออเดอร์ ${orderId}?`)) return;

    setAssignBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/assign-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codeId: id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { orderComplete?: boolean; productName?: string };
      setMessage(
        body.orderComplete
          ? `ส่งบัญชีให้ออเดอร์ ${id} แล้ว — ออเดอร์เสร็จสมบูรณ์`
          : `ส่งบัญชีให้ออเดอร์ ${id} แล้ว`,
      );
      onChanged();
      await load(offset);
    } catch {
      setError('ส่งบัญชีไม่สำเร็จ');
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface-elevated">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-fg">บัญชีที่เก็บไว้</h2>
            <p className="text-sm text-fg-muted">
              {productName} — {variantLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            ปิด
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-fg-muted">
            ทั้งหมด {total} บัญชี
            {offset > 0 && ` (กำลังดูหน้า ${Math.floor(offset / PAGE) + 1})`}
          </p>

          {error && (
            <p
              role="alert"
              className="mb-3 rounded-md border border-error bg-error px-3 py-2 text-sm text-fg-error"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="mb-3 rounded-md border border-jade-500/40 bg-jade-500/10 px-3 py-2 text-sm text-jade-700"
            >
              {message}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-fg-placeholder" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-placeholder">
              ยังไม่มีบัญชีในตัวเลือกนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-line-subtle bg-surface px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        STATUS_CLASS[c.status] ?? 'bg-surface-sunken text-fg-secondary',
                      )}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                    {c.orderNumber && (
                      <span className="font-mono text-xs text-fg-muted">{c.orderNumber}</span>
                    )}
                    {revealed[c.id] ? (
                      /* A stored account is often a WHOLE multi-line block —
                         the bulk paste's "long" format keeps the delivery text
                         (email line, password line, expiry, terms) as ONE
                         account. Rendering it on a single truncated line hid
                         exactly the thing staff opened this dialog to read, so
                         a revealed row wraps in full. */
                      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-fg">
                        {revealed[c.id]}
                      </pre>
                    ) : (
                      <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg-secondary">
                        {c.masked}
                      </code>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      {c.status !== 'voided' && (
                        <>
                          {revealed[c.id] && (
                            <button
                              type="button"
                              onClick={() => void copyCode(c.id)}
                              disabled={busyId === c.id}
                              title="คัดลอกข้อความนี้ไปวางในแชท"
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-line px-2 text-xs text-fg-secondary hover:border-line-brand hover:text-fg-brand disabled:opacity-50"
                            >
                              {copiedId === c.id ? <Check size={15} /> : <Copy size={15} />}
                              {copiedId === c.id ? 'คัดลอกแล้ว' : 'คัดลอก'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (revealed[c.id]) hideCode(c.id);
                              else void reveal(c.id);
                            }}
                            disabled={busyId === c.id}
                            title={revealed[c.id] ? 'ซ่อน' : 'ดูบัญชีเต็ม'}
                            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-line px-2 text-fg-secondary hover:border-line-brand hover:text-fg-brand disabled:opacity-50"
                          >
                            {revealed[c.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          {c.status === 'available' && (
                            <>
                              <button
                                type="button"
                                onClick={() => void startEdit(c.id)}
                                disabled={busyId === c.id || assignBusy}
                                title="แก้ไขบัญชีนี้"
                                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-line px-2 text-fg-secondary hover:border-line-brand hover:text-fg-brand disabled:opacity-50"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void assignToOrder(c.id)}
                                disabled={busyId === c.id || assignBusy}
                                title="ส่งบัญชีนี้ให้ลูกค้า"
                                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-line px-2 text-fg-brand hover:border-line-brand disabled:opacity-50"
                              >
                                <Send size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void voidCode(c.id)}
                                disabled={busyId === c.id || assignBusy}
                                title="ปิดใช้งานบัญชีนี้"
                                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-line px-2 text-fg-error hover:border-error disabled:opacity-50"
                              >
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {editingId === c.id && (
                    <div className="mt-2.5 border-t border-line-subtle pt-2.5">
                      <label
                        htmlFor={`edit-${c.id}`}
                        className="mb-1 block text-xs font-medium text-fg-muted"
                      >
                        แก้ไขบัญชี (บันทึกแล้วจะเข้ารหัสใหม่ทันที)
                      </label>
                      <textarea
                        id={`edit-${c.id}`}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        className="w-full resize-y rounded-md border border-line bg-surface-sunken px-3 py-2 font-mono text-sm text-fg"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busyId === c.id}
                          className="min-h-[36px] rounded-md border border-line px-3 text-sm text-fg-secondary disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(c.id)}
                          disabled={busyId === c.id || editDraft.trim().length === 0}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-surface-brand px-3 text-sm font-semibold text-fg-inverse disabled:opacity-50"
                        >
                          {busyId === c.id && <Loader2 size={13} className="animate-spin" />}
                          บันทึก
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <button
              type="button"
              onClick={() => void load(Math.max(offset - PAGE, 0))}
              disabled={offset === 0 || loading}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-secondary disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => void load(offset + PAGE)}
              disabled={offset + PAGE >= total || loading}
              className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-fg-secondary disabled:opacity-40"
            >
              <RefreshCw size={13} /> ถัดไป
            </button>
          </div>
        )}
      </div>
    </div>
  );
}