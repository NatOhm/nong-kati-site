import { useState } from 'react';

import { Dialog } from './Dialog';
import { RefusalMessage } from './RefusalMessage';

/** Shape both admin delete helpers already return (adminCatalog.ts). */
export interface DeleteFlowResult {
  success: boolean;
  reason?: string | undefined;
  orderNumbers?: string[] | undefined;
}

/**
 * One owner for the destructive-delete state machine: which row is targeted,
 * whether a purge is in flight (single-flight — no second dialog, no cancel
 * while busy), and any server refusal to render inline. Pages only supply the
 * actual delete call and a list refresh on success.
 */
export interface DeleteFlow<T> {
  target: T | null;
  busy: boolean;
  error: { reason: string; orderNumbers?: string[] | undefined } | null;
  open: (target: T) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
}

/** A purge slower than this is treated as a failed connection (retryable). */
const DELETE_TIMEOUT_MS = 15_000;

export function useDeleteFlow<T>(
  remove: (target: T) => Promise<DeleteFlowResult>,
  onSuccess?: () => void | Promise<void>,
): DeleteFlow<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [error, setError] = useState<DeleteFlow<T>['error']>(null);
  const [busy, setBusy] = useState(false);

  function open(next: T): void {
    if (busy) return; // in-flight purge: never open a second dialog
    setError(null);
    setTarget(next);
  }

  function cancel(): void {
    if (busy) return; // can't dismiss mid-purge
    setTarget(null);
    setError(null);
  }

  async function confirm(): Promise<void> {
    if (!target || busy) return;
    setBusy(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Race a timeout so a hung request can't leave the dialog stuck busy
      // (cancel is disabled while busy). A slow-but-real delete that lands
      // after the timeout is fine: the retry hits NOT_FOUND, which already
      // maps to "may have been deleted".
      const result = await Promise.race([
        remove(target),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('TIMEOUT')), DELETE_TIMEOUT_MS);
        }),
      ]);
      if (result.success) {
        setTarget(null);
        setError(null);
        await onSuccess?.();
      } else {
        setError({
          reason: result.reason ?? 'ลบไม่สำเร็จ',
          orderNumbers: result.orderNumbers,
        });
      }
    } catch {
      // Network failure or timeout — adminFetch rethrows both. Keep the
      // dialog open with a retryable message instead of an unhandled rejection.
      setError({ reason: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — กดยืนยันเพื่อลองใหม่อีกครั้ง' });
    } finally {
      if (timer) clearTimeout(timer);
      setBusy(false);
    }
  }

  return { target, busy, error, open, cancel, confirm };
}

/**
 * The confirm dialog for a DeleteFlow: destructive copy from the page (title
 * and description are per-entity, e.g. cascade counts), refusal reason +
 * blocking-order links rendered inside the dialog. Renders nothing while no
 * target is open, so pages can mount it unconditionally.
 */
export function DeleteConfirmDialog<T>({
  flow,
  title,
  description,
  confirmLabel = 'ลบถาวร',
}: {
  flow: DeleteFlow<T>;
  title: (target: T) => string;
  description: (target: T) => string;
  confirmLabel?: string;
}): React.JSX.Element | null {
  const { target, busy, error, cancel, confirm } = flow;
  if (!target) return null;
  return (
    <Dialog
      isOpen
      title={title(target)}
      description={description(target)}
      confirmLabel={confirmLabel}
      variant="destructive"
      loading={busy}
      onConfirm={() => void confirm()}
      onCancel={cancel}
    >
      {error && <RefusalMessage reason={error.reason} orderNumbers={error.orderNumbers} />}
    </Dialog>
  );
}
