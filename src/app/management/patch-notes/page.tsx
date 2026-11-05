'use client';

import { History, Rocket } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
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
 * Read-only by design: no fetching, no mutations. It renders from the JSON
 * bundled at build time, so it still works when the API is down, and it never
 * offers a control that could change production state.
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
const LATEST = NOTES[0];

/** BUILD_IDs and short SHAs are read character by character — mono, no wrap. */
function Meta({ note }: { note: PatchNote }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-fg-muted">
      <span title="BUILD_ID ของ build ที่ขึ้น production">
        {note.buildId}
      </span>
      <span aria-hidden>·</span>
      <span title="git commit ที่ build นี้สร้างจาก">{note.gitSha.slice(0, 12)}</span>
    </div>
  );
}

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

export default function PatchNotesPage(): React.JSX.Element {
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
              โดยตรง จึงตรงกับสิ่งที่ลูกค้าเห็นอยู่เสมอ
            </p>
          </div>
        </div>

        {LATEST && (
          <section
            aria-labelledby="latest-heading"
            className="rounded-lg border border-line-brand bg-surface p-5"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Rocket className="h-4 w-4 text-peach-600" aria-hidden />
              <h2 id="latest-heading">ล่าสุดบน production</h2>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VersionChip version={LATEST.version} />
              <span className="text-sm text-fg-muted">{LATEST.dateLabel}</span>
            </div>
            <p className="mt-2 text-base font-medium text-fg">{LATEST.title}</p>
            <div className="mt-2">
              <Meta note={LATEST} />
            </div>
          </section>
        )}

        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-lg font-semibold text-fg">
            ประวัติทั้งหมด
          </h2>
          <ol className="space-y-3">
            {NOTES.map((note, index) => (
              <li
                key={`${note.buildId}-${note.date}`}
                className={cn(
                  'rounded-md border border-line-subtle bg-surface p-4',
                  index === 0 && 'border-line-brand'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <VersionChip version={note.version} />
                  <span className="text-sm text-fg-muted">{note.dateLabel}</span>
                  {index === 0 && (
                    <span className="rounded-full bg-peach-500/15 px-2 py-0.5 text-xs font-medium text-peach-700">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium text-fg">{note.title}</p>
                <div className="mt-1">
                  <Meta note={note} />
                </div>
                <details className="mt-3" open={index === 0}>
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
