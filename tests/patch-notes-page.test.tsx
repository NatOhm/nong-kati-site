// @vitest-environment jsdom
/**
 * บันทึกแพตช์ has to *render*, not just contain bytes (1.1.17).
 *
 * The previous release shipped Thai text that a chunk grep could find, and that
 * was the whole verification: nobody looked at the page, and the running
 * release's own card was still empty of detail because a bundle is always baked
 * before its log row exists. Rendering it here closes both gaps without admin
 * credentials — the page is a client component reading two generated/authored
 * JSON files, so mounting it with the real data asserts exactly what the owner
 * would see.
 *
 *   D1  the live card shows the running release's Thai sections in order,
 *       with a Thai-formatted date,
 *   D2  the newest logged release's Thai detail fills the card when the running
 *       build has no row yet (the real state right after every deploy),
 *   D3  the history list renders every logged build in Thai, and only the
 *       running release's row is expanded.
 *
 * The data is the committed JSON, not a fixture: a broken generator or a stale
 * Thai file is the failure worth catching.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import patchNotes from '@/data/patch-notes.json';
import patchNotesTh from '@/data/patch-notes-th.json';

interface Note {
  version: string | null;
  date: string;
  buildId: string;
  gitSha: string;
  title: string;
}

interface Thai {
  title: string;
  summary?: string;
  problem?: string;
  change: string[];
  proof?: string[];
  note?: string;
}

const NOTES = patchNotes as Note[];
const TH = patchNotesTh as Record<string, Thai>;
/** Fail loudly instead of rendering undefined: an empty list is a broken build. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`patch-notes: ${what} is missing`);
  return value;
}

const NEWEST = must(NOTES[0], 'no logged builds');
const NEWEST_TH = must(TH[NEWEST.buildId], `no Thai entry for ${NEWEST.buildId}`);

// vi.mock factories are hoisted above the imports, so the shared state has to be
// built by vi.hoisted rather than closed over a later const.
const state = vi.hoisted(() => ({
  release: null as null | { version: string; buildId: string; gitSha: string },
}));

vi.mock('@/components/layout/ReleaseBadge', () => ({
  useRelease: () => ({ release: state.release, failed: false }),
}));

// The shell owns auth, the sidebar and its own fetches; this suite is about what
// the page body renders from data.
vi.mock('@/components/layout/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import PatchNotesPage from '@/app/management/patch-notes/page';

const LABELS = ['ปัญหา', 'สิ่งที่เปลี่ยน', 'ตรวจสอบแล้ว', 'หมายเหตุ'];

function liveCard(): HTMLElement {
  return screen.getByRole('region', { name: 'build ที่ให้บริการอยู่ตอนนี้' });
}

beforeEach(() => {
  // The repo's esbuild JSX runtime is automatic in tests, but components that
  // predate it still read the global; keep it defined as the other DOM suites do.
  (globalThis as { React?: typeof React }).React = React;
});

describe('patch notes page — renders the Thai release detail', () => {
  it('D1: the live card shows the running release in Thai, with a Thai date', () => {
    state.release = {
      version: NEWEST.version as string,
      buildId: NEWEST.buildId,
      gitSha: NEWEST.gitSha,
    };

    render(<PatchNotesPage />);
    const card = liveCard();

    expect(within(card).getByText(NEWEST_TH.title)).toBeTruthy();
    // 5 พ.ย. 2569 — Buddhist era, month abbreviated, not the log's "Nov 5, 2026".
    expect(within(card).getByText('5 พ.ย. 2569')).toBeTruthy();
    for (const label of LABELS) {
      expect(within(card).getByRole('heading', { name: label }), label).toBeTruthy();
    }
    // The detail itself, not just its headings.
    expect(within(card).getByText(must(NEWEST_TH.change[0], 'no Thai change line'))).toBeTruthy();
    if (NEWEST_TH.proof) {
      expect(within(card).getByText(must(NEWEST_TH.proof[0], 'no Thai proof line'))).toBeTruthy();
    }
    // A logged build is not captioned as unlogged.
    expect(card.textContent).not.toContain('ยังไม่มีแถวในบันทึก deploy');
  });

  it('D2: an unlogged running build still shows the newest logged Thai detail', () => {
    // This is the state of every deploy: the bundle predates its own log row.
    state.release = { version: '9.9.9', buildId: 'NOTALOGGEDBUILD000', gitSha: 'abcdef1' };

    render(<PatchNotesPage />);
    const card = liveCard();

    expect(card.textContent).toContain('ยังไม่มีแถวในบันทึก deploy');
    expect(card.textContent).toContain('รายละเอียดของ build ล่าสุดที่บันทึกไว้');
    expect(within(card).getByText(NEWEST_TH.title)).toBeTruthy();
    expect(within(card).getByText(must(NEWEST_TH.change[0], 'no Thai change line'))).toBeTruthy();
    for (const label of LABELS) {
      expect(within(card).getByRole('heading', { name: label }), label).toBeTruthy();
    }
  });

  it('D3: every logged build renders in Thai, and only the running row is expanded', () => {
    state.release = {
      version: NEWEST.version as string,
      buildId: NEWEST.buildId,
      gitSha: NEWEST.gitSha,
    };

    const { container } = render(<PatchNotesPage />);

    // `ol > li` — the section labels each carry their own `ul`, whose items are
    // also listitems, so a plain getAllByRole would count the bullets too.
    const rows = Array.from(container.querySelectorAll('ol > li'));
    expect(rows).toHaveLength(NOTES.length);

    // By position, not by text: a note body can mention another build's ID (a
    // rollback note names the previous bundle), so text matching picks the
    // wrong row. The list renders NOTES in order.
    NOTES.forEach((note, index) => {
      const th = must(TH[note.buildId], `no Thai entry for ${note.buildId}`);
      const row = must(rows[index], `no rendered row for ${note.buildId}`);
      expect(row.textContent, note.buildId).toContain(note.buildId);
      expect(row.textContent, note.buildId).toContain(th.title);
    });

    const open = Array.from(container.querySelectorAll('details[open]'));
    expect(open).toHaveLength(1);
    expect(must(open[0], 'no expanded details').closest('li')?.textContent).toContain(
      NEWEST.buildId
    );
    // Collapsed rows keep their text out of sight, not out of the DOM.
    const other = rows.find((li) => li.textContent?.includes(must(NOTES[1], 'no second build').buildId));
    expect(must(other, 'no second row').querySelector('details')?.hasAttribute('open')).toBe(false);
  });
});
