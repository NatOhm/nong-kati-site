'use client';

import { History, Rocket } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { useRelease } from '@/components/layout/ReleaseBadge';
import patchNotes from '@/data/patch-notes.json';
import { cn } from '@/utils/cn';

/**
 * 1.1.9 — บันทึกแพตช์: what has actually reached production.
 *
 * The owner asked to see release history in the panel instead of asking, and
 * this page answers that from the deploy log (docs/hostatom-live.md) rather
 * than from a second list kept by hand: scripts/patch-notes.mjs generates
 * src/data/patch-notes.json from that table, and tests/patch-notes.test.ts
 * fails when the two disagree. So a row can only appear here if it also
 * appears in the record the deploy runbook requires — the page cannot quietly
 * drift ahead of, or behind, what is live.
 *
 * The list is baked into the bundle, which means it always describes the
 * release *before* the one serving it: the first version of this page showed
 * "ล่าสุด 1.1.8" while 1.1.9 was running. That is why the top card reads the
 * live build through `useRelease()` — the module already owns the single cached
 * /api/v1/version request for the whole panel (`tests/release-badge.test.ts`
 * forbids a second one) — instead of trusting the list. The running build is
 * therefore always truthful, and if it has no log row yet the page says so
 * rather than claiming an older release is current.
 *
 * Read-only by design: no mutations, and the history still renders when the
 * API is down (the card falls back to the newest recorded build).
 */
interface PatchNote {
  version: string | null;
  date: string;
  dateLabel: string;
  gitSha: string;
  buildId: string;
  title: string;
  detail: string;
}

const NOTES = patchNotes as PatchNote[];
const NEWEST = NOTES[0];

function VersionChip({ version }: { version: string | null }): React.JSX.Element {
  if (!version) {
    return (
      <span className="rounded-full border border-line-subtle px-2 py-0.5 text-xs text-fg-muted">
        pre-1.1
      </span>
    );
  }
  return (
    <span className="rounded-full bg-peach-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-peach-700">
      v{version}
    </span>
  );
}

/** BUILD_ID and SHA are read character by character — mono, never wrapped. */
function Meta({ buildId, gitSha }: { buildId: string; gitSha: string }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-fg-muted">
      <span title="BUILD_ID ของ build ที่ขึ้น production">{buildId}</span>
      <span aria-hidden>·</span>
      <span title="git commit ที่ build นี้สร้างจาก">{gitSha.slice(0, 12)}</span>
    </div>
  );
}

export default function PatchNotesPage(): React.JSX.Element {
  const { release, failed } = useRelease();
  const live = release?.buildId
    ? { version: release.version, buildId: release.buildId, gitSha: release.gitSha }
    : null;

  const logged = live ? NOTES.find((note) => note.buildId === live.buildId) : undefined;
  const unlogged = Boolean(live) && !logged;

  return (
    <AdminShell
      staffRole="super_admin"
      breadcrumbs={[{ label: 'การดูแลระบบ' }, { label: 'บันทึกแพตช์' }]}
    >
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 rounded-md bg-surface p-2 text-fg-secondary">
            <History className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-fg">บันทึกแพตช์</h1>
            <p className="mt-1 text-sm text-fg-muted">
              ทุก build ที่ขึ้น production จริง ({NOTES.length} รายการ) — สร้างจากบันทึก deploy
              โดยตรง จึงตรงกับสิ่งที่ลูกค้าเห็นเสมอ
            </p>
          </div>
        </div>

        <section
          aria-labelledby="live-heading"
          className="rounded-lg border border-line-brand bg-surface p-5"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Rocket className="h-4 w-4 text-peach-600" aria-hidden />
            <h2 id="live-heading">build ที่ให้บริการอยู่ตอนนี้</h2>
          </div>

          {live ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VersionChip version={live.version} />
                <span className="text-sm text-fg-muted">
                  {logged ? logged.dateLabel : 'ยังไม่มีบันทึกของ build นี้'}
                </span>
              </div>
              <p className="mt-2 text-base font-medium text-fg">
                {logged ? logged.title : 'build นี้ยังไม่ถูกบันทึกในรายการด้านล่าง'}
              </p>
              <div className="mt-2">
                <Meta buildId={live.buildId} gitSha={live.gitSha} />
              </div>
              {unlogged && (
                <p className="mt-3 rounded-md border border-line-subtle bg-bg p-3 text-sm text-fg-secondary">
                  build ที่รันอยู่ ({live.version}) ยังไม่มีแถวในบันทึก deploy — รายละเอียดจะขึ้นใน
                  รายการนี้เมื่ออัปเดตบันทึก รายการด้านล่างจึงเป็นของ build ก่อนหน้า
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VersionChip version={NEWEST?.version ?? null} />
                <span className="text-sm text-fg-muted">
                  บันทึกล่าสุด · {NEWEST?.dateLabel}
                </span>
              </div>
              <p className="mt-2 text-base font-medium text-fg">{NEWEST?.title}</p>
              {NEWEST && (
                <div className="mt-2">
                  <Meta buildId={NEWEST.buildId} gitSha={NEWEST.gitSha} />
                </div>
              )}
              {failed && (
                <p className="mt-3 text-xs text-fg-muted">
                  อ่าน build ที่ให้บริการอยู่ไม่ได้ — แสดง build ล่าสุดจากบันทึกแทน
                </p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-lg font-semibold text-fg">
            ประวัติทั้งหมด
          </h2>
          <ol className="space-y-3">
            {NOTES.map((note) => (
              <li
                key={note.buildId}
                className={cn(
                  'rounded-md border border-line-subtle bg-surface p-4',
                  note.buildId === live?.buildId && 'border-line-brand'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <VersionChip version={note.version} />
                  <span className="text-sm text-fg-muted">{note.dateLabel}</span>
                  {note.buildId === live?.buildId && (
                    <span className="rounded-full bg-peach-500/15 px-2 py-0.5 text-xs font-medium text-peach-700">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium text-fg">{note.title}</p>
                <div className="mt-1">
                  <Meta buildId={note.buildId} gitSha={note.gitSha} />
                </div>
                <details className="mt-3" open={note.buildId === live?.buildId}>
                  <summary className="cursor-pointer text-sm text-fg-secondary hover:text-fg">
                    รายละเอียดที่เปลี่ยน
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
                    {note.detail}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AdminShell>
  );
}
