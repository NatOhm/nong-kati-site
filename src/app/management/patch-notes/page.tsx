'use client';

import { History, Rocket } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { useRelease } from '@/components/layout/ReleaseBadge';
import patchNotes from '@/data/patch-notes.json';
import patchNotesTh from '@/data/patch-notes-th.json';
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
 * 1.1.16 — Thai and structure. The deploy log stays the English audit trail
 * (it is read by whoever deploys, next to commits and BUILD_IDs), and the Thai
 * copy lives in src/data/patch-notes-th.json keyed by BUILD_ID. That file is
 * authored, not derived, so it can drift — which is why `tests/patch-notes.test.ts`
 * P5/P6 require one entry per logged build and no orphan keys: shipping a build
 * without its Thai text breaks the build instead of the page. Each entry is
 * split into ปัญหา / สิ่งที่เปลี่ยน / ตรวจสอบแล้ว / หมายเหตุ so a 400-word
 * English paragraph becomes four short lists, and the live card now shows the
 * newest release's detail too, not just its title.
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

interface ThaiNote {
  title: string;
  summary?: string;
  problem?: string;
  change: string[];
  proof?: string[];
  note?: string;
}

const NOTES = patchNotes as PatchNote[];
const NEWEST = NOTES[0];
const TH = patchNotesTh as Record<string, ThaiNote>;

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** `2026-11-05` → `5 พ.ย. 2569`; falls back to the log's English label. */
function thaiDate(iso: string, fallback: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1] ?? ''} ${Number(m[1]) + 543}`;
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

/**
 * One labelled block: a short Thai label and a bullet list.
 *
 * Lists rather than paragraphs on purpose — the deploy log writes each release
 * as one long English paragraph, which is fine as an audit trail and hard to
 * scan on a phone. `space-y-1` + `leading-relaxed` keeps 3–4 lines readable.
 */
function Block({ label, items }: { label: string; items?: string[] | undefined }): React.JSX.Element | null {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-fg-muted">{label}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Paragraph({ label, text }: { label: string; text?: string | undefined }): React.JSX.Element | null {
  if (!text) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-fg-muted">{label}</h4>
      <p className="mt-1 text-sm leading-relaxed text-fg-secondary">{text}</p>
    </div>
  );
}

/** The Thai body of one release, in a fixed order so every row scans the same. */
function Detail({ note }: { note: ThaiNote }): React.JSX.Element {
  return (
    <div className="mt-3 space-y-3 border-t border-line-subtle pt-3">
      <Paragraph label="ปัญหา" text={note.problem} />
      <Block label="สิ่งที่เปลี่ยน" items={note.change} />
      <Block label="ตรวจสอบแล้ว" items={note.proof} />
      <Paragraph label="หมายเหตุ" text={note.note} />
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
  const liveTh = live ? TH[live.buildId] : undefined;
  const newestTh = NEWEST ? TH[NEWEST.buildId] : undefined;

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
                  {logged ? thaiDate(logged.date, logged.dateLabel) : 'ยังไม่มีบันทึกของ build นี้'}
                </span>
              </div>
              {/* A bundle is always built BEFORE the row that describes it can be
                  written (the row needs the BUILD_ID the build produces), so the
                  card must stay useful on the newest release: when the running
                  build has no row it shows the latest *logged* release in full,
                  under a caption that names whose detail it is. The note stays
                  because claiming an unlogged build's changes would be a guess. */}
              {!unlogged && liveTh ? (
                <>
                  <p className="mt-2 text-base font-medium text-fg">{liveTh.title}</p>
                  {liveTh.summary && (
                    <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                      {liveTh.summary}
                    </p>
                  )}
                  <Detail note={liveTh} />
                </>
              ) : (
                <>
                  <p className="mt-3 rounded-md border border-line-subtle bg-bg p-3 text-sm text-fg-secondary">
                    build ที่รันอยู่ (v{live.version}) ยังไม่มีแถวในบันทึก deploy —
                    บันทึกจะอัปเดตหลังรอบ deploy ถัดไป
                  </p>
                  <p className="mt-3 text-xs font-semibold tracking-wide text-fg-muted">
                    รายละเอียดของ build ล่าสุดที่บันทึกไว้
                    {NEWEST?.version ? ` (v${NEWEST.version})` : ''}
                  </p>
                  <p className="mt-1 text-base font-medium text-fg">
                    {newestTh?.title ?? NEWEST?.title ?? 'ยังไม่มีบันทึกในรายการ'}
                  </p>
                  {newestTh?.summary && (
                    <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                      {newestTh.summary}
                    </p>
                  )}
                  {newestTh && <Detail note={newestTh} />}
                </>
              )}
              <div className="mt-3">
                <Meta buildId={live.buildId} gitSha={live.gitSha} />
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VersionChip version={NEWEST?.version ?? null} />
                <span className="text-sm text-fg-muted">
                  บันทึกล่าสุด · {NEWEST ? thaiDate(NEWEST.date, NEWEST.dateLabel) : ''}
                </span>
              </div>
              <p className="mt-2 text-base font-medium text-fg">
                {newestTh?.title ?? NEWEST?.title}
              </p>
              {newestTh?.summary && (
                <p className="mt-1 text-sm leading-relaxed text-fg-secondary">{newestTh.summary}</p>
              )}
              {newestTh && <Detail note={newestTh} />}
              {NEWEST && (
                <div className="mt-3">
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
            {NOTES.map((note) => {
              const th = TH[note.buildId];
              const isLive = note.buildId === live?.buildId;
              return (
                <li
                  key={note.buildId}
                  className={cn(
                    'rounded-md border border-line-subtle bg-surface p-4',
                    isLive && 'border-line-brand'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <VersionChip version={note.version} />
                    <span className="text-sm text-fg-muted">
                      {thaiDate(note.date, note.dateLabel)}
                    </span>
                    {isLive && (
                      <span className="rounded-full bg-peach-500/15 px-2 py-0.5 text-xs font-medium text-peach-700">
                        ใช้งานอยู่
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-medium text-fg">{th?.title ?? note.title}</p>
                  {th?.summary && (
                    <p className="mt-1 text-sm leading-relaxed text-fg-secondary">{th.summary}</p>
                  )}
                  <div className="mt-1">
                    <Meta buildId={note.buildId} gitSha={note.gitSha} />
                  </div>
                  {th ? (
                    <details className="mt-2" open={isLive}>
                      <summary className="cursor-pointer text-sm font-medium text-fg-secondary hover:text-fg">
                        รายละเอียด
                      </summary>
                      <Detail note={th} />
                    </details>
                  ) : (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
                      {note.detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </AdminShell>
  );
}
