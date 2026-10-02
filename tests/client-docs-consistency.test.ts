/**
 * Client-doc consistency gates (2026-10-03).
 *
 * The client-facing docs drifted repeatedly with nothing failing:
 *
 *   - 831a527 (23 Sep) wrote "เสร็จแล้ว 29 ข้อ" against a table holding 28 —
 *     and 29+1+1 never summed to the stated 30.
 *   - client-feedback-status.md kept calling slip auto-verification absent
 *     and the mascot "needs code changes" for weeks after 13bdf58 shipped
 *     both.
 *   - client-acceptance-checklist.md:95 claimed "✅ 36 ข้อ" while its own
 *     table held 39, because the three promotions on the next line were
 *     never added to the tally.
 *   - pre-launch-checklist.md said the real Omise gateway was "not yet
 *     implemented" (c8210c1 shipped it the next day) and that canonical
 *     was "not emitted on any page yet" (10 pages emit it).
 *
 * So these are static markdown scans: no browser, no network, and they run
 * on every `vitest`. Per-doc tally gates (L1-L4):
 *
 *   L1 — every marked row carries exactly one recognised mark, so a blanked
 *        or typo'd status cell cannot pass silently.
 *   L2 — the summary tally equals the table's own row count, its parts sum
 *        to the stated total, and any stated total equals the row count.
 *   L3 — the inline arithmetic the ledger carries ("(28+2+0 = 30)") is
 *        itself correct and matches the tally, so the doc proves its number.
 *   L4 — a row that says it is waiting on the client is never marked
 *        not-started. "Waiting on you" and "not built yet" are different
 *        claims; conflating them hides the blocker from the client.
 *
 * Plus source-linked gates that cross-check the docs against the codebase,
 * which is what catches "the code ships it but the doc says it doesn't":
 *
 *   S1 — if the Slip2Go adapter exists, no doc may claim slip
 *        auto-verification is absent or list it not-started.
 *   S2 — if the mascot uploader exists, no doc may call for a code change.
 *   S3 — if the Omise adapter exists, no doc may say it is unimplemented or
 *        that a real PromptPay gateway would need new code.
 *   S4 — if any page emits alternates.canonical, no doc may claim canonical
 *        is not emitted.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const doc = (...p: string[]): string => path.join(ROOT, 'docs', ...p);

const MARKS = ['✅', '🟡', '⬜'] as const;

/** Docs carrying a marked tally table plus a numeric summary line. */
const TALLY_DOCS = [
  { name: 'client-feedback-status.md', file: doc('client-feedback-status.md'), requireArithmetic: true },
  { name: 'client-acceptance-checklist.md', file: doc('client-acceptance-checklist.md'), requireArithmetic: false },
] as const;

/** Every client-facing doc scanned for source-linked negative claims. */
const ALL_DOCS = [
  doc('client-feedback-status.md'),
  doc('client-acceptance-checklist.md'),
  doc('weekly-summary-2026-09-20.md'),
  doc('pre-launch-checklist.md'),
];

const SLIP_ADAPTER = path.join(ROOT, 'src', 'lib', 'payment', 'slip2go.ts');
const OMISE_ADAPTER = path.join(ROOT, 'src', 'lib', 'payment', 'omise.ts');
const SETTINGS_PAGE = path.join(ROOT, 'src', 'app', 'management', 'settings', 'page.tsx');

type LedgerRow = { line: number; label: string; title: string; mark: string; detail: string };

type Summary = {
  line: number;
  done: number | null;
  partial: number | null;
  notStarted: number | null;
  total: number | null;
  arithmetic: { parts: number[]; sum: number } | null;
};

/** Trim a pipe-delimited cell, treating an out-of-range index as empty. */
const cell = (cells: string[], i: number): string => cells[i]?.trim() ?? '';

/** Row labels are bare numbers in the ledger and lettered (A1, G5) in the acceptance list. */
const isRowLabel = (s: string): boolean => /^[A-Z]?[0-9]+$/.test(s);

/**
 * Read a numeric mark count from a line. Handles both summary styles:
 * "เสร็จแล้ว 28 ข้อ" (ledger) and "✅ 39 ข้อ" (acceptance list).
 */
function markCount(text: string, mark: string): number | null {
  // The ledger writes "เสร็จแล้ว 28 ข้อ"; the acceptance list writes "✅ 39 ข้อ".
  const re = mark === '✅' ? /(?:เสร็จแล้ว|✅)\s*(\d+)\s*ข้อ/ : new RegExp(`${mark}\\s*(\\d+)\\s*ข้อ`);
  const raw = re.exec(text)?.[1];
  return raw === undefined ? null : Number(raw);
}

function parseDoc(file: string): { lines: string[]; rows: LedgerRow[]; summary: Summary | null } {
  const lines = readFileSync(file, 'utf8').split('\n');

  const rows: LedgerRow[] = [];
  lines.forEach((line, i) => {
    const cells = line.split('|');
    if (cells.length < 6) return; // leading pipe + 4 populated cells + trailing pipe
    const label = cell(cells, 1);
    if (!isRowLabel(label)) return;
    rows.push({ line: i + 1, label, title: cell(cells, 2), mark: cell(cells, 3), detail: cell(cells, 4) });
  });

  // The summary line is the first line carrying at least two mark counts.
  let summary: Summary | null = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const done = markCount(text, '✅');
    const partial = markCount(text, '🟡');
    const notStarted = markCount(text, '⬜');
    const found = [done, partial, notStarted].filter((v) => v !== null).length;
    if (found < 2) continue;
    const totalRaw = /รวม (\d+)\s*ข้อ/.exec(text)?.[1];
    const arith = /\((\d+\+\d+\+\d+) = (\d+)\)/.exec(text);
    const partsRaw = arith?.[1];
    const sumRaw = arith?.[2];
    summary = {
      line: i + 1,
      done,
      partial,
      notStarted,
      total: totalRaw === undefined ? null : Number(totalRaw),
      arithmetic:
        partsRaw === undefined || sumRaw === undefined ? null : { parts: partsRaw.split('+').map(Number), sum: Number(sumRaw) },
    };
    break;
  }

  return { lines, rows, summary };
}

const docs = TALLY_DOCS.map((d) => ({ ...d, parsed: parseDoc(d.file) }));

/** Quote a line for a failure message without dumping the whole row. */
const clip = (line: string): string => line.trim().slice(0, 150);

const sources = readFileSync(SLIP_ADAPTER, 'utf8');
const omiseSources = existsSync(OMISE_ADAPTER) ? readFileSync(OMISE_ADAPTER, 'utf8') : '';
const settingsSources = existsSync(SETTINGS_PAGE) ? readFileSync(SETTINGS_PAGE, 'utf8') : '';

/** How many app pages actually emit alternates.canonical right now. */
function countCanonicalPages(): number {
  const appDir = path.join(ROOT, 'src', 'app');
  let count = 0;
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') && readFileSync(full, 'utf8').includes('alternates')) count++;
    }
  };
  walk(appDir);
  return count;
}

const canonicalPages = countCanonicalPages();

/** Flattened [doc, line] pairs for the source-linked negative-claim scan. */
const scanPairs: { ref: string; line: string }[] = ALL_DOCS.flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ ref: `${path.relative(ROOT, file).split(path.sep).join('/')}:${i + 1}`, line })),
);

for (const { name, file, requireArithmetic, parsed } of docs) {
  const { rows, summary } = parsed;
  const tally = (mark: string): number => rows.filter((r) => r.mark === mark).length;

  describe(`${name} — tally integrity`, () => {
    it('parses its marked table rows', () => {
      expect(rows.length, `${file} should expose a marked table`).toBeGreaterThan(0);
    });

    it('L1: every row carries exactly one recognised mark', () => {
      const bad = rows
        .filter((r) => !(MARKS as readonly string[]).includes(r.mark))
        .map((r) => `  line ${r.line} (${r.label} ${r.title}): status cell is ${JSON.stringify(r.mark)}`);
      expect(bad, `rows with an unusable status mark:\n${bad.join('\n')}`).toEqual([]);
    });

    it('L2: the summary tally matches the table it summarises', () => {
      expect(summary, `${name} must carry a numeric summary line with at least two mark counts`).not.toBeNull();
      const s = summary as Summary;
      const mismatches: string[] = [];
      const pairs: Array<[string, number | null, number]> = [
        ['✅ done', s.done, tally('✅')],
        ['🟡 partial', s.partial, tally('🟡')],
        ['⬜ not started', s.notStarted, tally('⬜')],
      ];
      for (const [label, claimed, actual] of pairs) {
        if (claimed === null) mismatches.push(`${label}: summary states no count`);
        else if (claimed !== actual) mismatches.push(`${label}: summary says ${claimed}, table has ${actual}`);
      }
      expect(mismatches, `summary line ${s.line} of ${name} disagrees with its own table:\n  ${mismatches.join('\n  ')}`).toEqual(
        [],
      );
    });

    it('L2: the summary parts sum to the table row count', () => {
      const s = summary as Summary;
      const parts = (s.done ?? 0) + (s.partial ?? 0) + (s.notStarted ?? 0);
      const expected = rows.length;
      const note = s.total === null ? ' (no stated total — row count is authoritative)' : ` (states "รวม ${s.total} ข้อ")`;
      expect(parts, `${name} summary line ${s.line}: ${s.done}+${s.partial}+${s.notStarted} = ${parts}, table has ${expected} rows${note}`).toBe(
        expected,
      );
    });

    it('L2: any stated total equals the table row count', () => {
      const s = summary as Summary;
      if (s.total === null) return;
      expect(s.total, `${name} summary line ${s.line} states a total that its table does not have`).toBe(rows.length);
    });

    it('L3: the inline arithmetic in the summary is self-consistent', () => {
      const s = summary as Summary;
      if (s.arithmetic === null) {
        if (!requireArithmetic) return;
        expect(s.arithmetic, `${name} summary line ${s.line} should carry its own arithmetic, e.g. "(28+2+0 = 30)"`).not.toBeNull();
        return;
      }
      const { parts, sum } = s.arithmetic;
      expect(parts.reduce((a, b) => a + b, 0), `${name} inline arithmetic ${parts.join('+')} does not equal the printed ${sum}`).toBe(sum);
      expect(parts, `${name} inline arithmetic must match the tally it certifies`).toEqual([s.done, s.partial, s.notStarted]);
      expect(sum).toBe(rows.length);
    });

    it('L4: a row waiting on the client is never marked not-started', () => {
      const gated = rows.filter((r) => r.detail.includes('ลูกค้า') && r.detail.includes('รอ'));
      const offenders = gated
        .filter((r) => r.mark === '⬜')
        .map((r) => `  line ${r.line} (${r.label} ${r.title}): marked ⬜ but its own text says it is waiting on the client`);
      expect(
        offenders,
        `these rows claim "not started" while describing themselves as client-gated — that hides the blocker:\n${offenders.join('\n')}`,
      ).toEqual([]);
    });
  });
}

describe('client docs vs shipped code', () => {
  const offendersFor = (test: (line: string) => boolean): string[] =>
    scanPairs.filter(({ line }) => test(line)).map(({ ref, line }) => `  ${ref}: ${clip(line)}`);

  it('S1: does not claim slip auto-verification is missing while the Slip2Go adapter ships', () => {
    if (!existsSync(SLIP_ADAPTER)) return; // capability genuinely absent
    const absent = offendersFor((l) => /ยังไม่มี[^|]{0,40}ตรวจสลิปอัตโนมัติ/.test(l));
    const unstarted = offendersFor((l) => /ตรวจสลิปอัตโนมัติ/.test(l) && l.split('|').some((c) => c.trim().startsWith('⬜')));
    expect(
      [...new Set([...absent, ...unstarted])],
      `Slip2Go ships at ${path.relative(ROOT, SLIP_ADAPTER)} — no client doc may still say slip auto-verification is absent or not-started`,
    ).toEqual([]);
  });

  it('S2: does not claim the mascot uploader is missing while the settings page ships it', () => {
    if (!settingsSources.includes('uploadMascot')) return;
    const offenders = offendersFor(
      (l) => /มาสคอต/.test(l) && (/ยังไม่ได้/.test(l) || /(?<!ไม่)ต้องแก้โค้ด/.test(l)),
    );
    expect(
      offenders,
      `the mascot uploader ships (uploadMascot) — no client doc may still call for a code change:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('S3: does not claim the Omise/PromptPay path is unimplemented while the adapter ships', () => {
    if (!omiseSources.includes('createPromptPayCharge')) return;
    const unimplemented = offendersFor((l) => /ยังไม่\s*implement/.test(l));
    const needsCode = offendersFor(
      (l) =>
        /PromptPay|Omise/.test(l) &&
        /ต้องแก้โค้ด/.test(l) &&
        // "ไม่ต้องแก้โค้ดเพิ่ม" is the negation, not the stale claim.
        !/ไม่ต้องแก้โค้ด/.test(l),
    );
    expect(
      [...new Set([...unimplemented, ...needsCode])],
      `the real PromptPay adapter ships (OmiseAdapter in ${path.relative(ROOT, OMISE_ADAPTER)}) — no client doc may call it unimplemented:\n${[...unimplemented, ...needsCode].join(
        '\n',
      )}`,
    ).toEqual([]);
  });

  it('S4: does not claim canonical is not emitted while pages emit it', () => {
    if (canonicalPages === 0) return;
    const offenders = offendersFor((l) => /canonical/i.test(l) && /(not emitted|ยังไม่)/i.test(l));
    expect(offenders, `pages do emit alternates.canonical — no client doc may claim otherwise:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('weekly summary agrees with the ledger', () => {
  const weeklyPath = doc('weekly-summary-2026-09-20.md');
  const weeklyText = readFileSync(weeklyPath, 'utf8');
  const ledger = docs.find((d) => d.name === 'client-feedback-status.md');
  if (!ledger) throw new Error('client-feedback-status.md must stay in TALLY_DOCS');
  const ledgerDone = ledger.parsed.rows.filter((r) => r.mark === '✅').length;
  const ledgerRows = ledger.parsed.rows.length;

  it('repeats the same done/total figures as the ledger table', () => {
    const m = /เสร็จแล้ว (\d+) จาก (\d+) ข้อ/.exec(weeklyText);
    expect(m, `${weeklyPath} must carry a "เสร็จแล้ว N จาก M ข้อ" line`).not.toBeNull();
    expect({ done: Number(m?.[1]), total: Number(m?.[2]) }, 'the weekly summary must not contradict the ledger it links to').toEqual({
      done: ledgerDone,
      total: ledgerRows,
    });
  });

  it('repeats the same ratio in its closing summary bullet', () => {
    const m = /(\d+)\/(\d+) ✅/.exec(weeklyText);
    expect(m, `${weeklyPath} must carry an "N/M ✅" summary bullet`).not.toBeNull();
    expect({ done: Number(m?.[1]), total: Number(m?.[2]) }).toEqual({ done: ledgerDone, total: ledgerRows });
  });
});
