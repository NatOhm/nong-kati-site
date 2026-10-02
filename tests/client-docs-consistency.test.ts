/**
 * Client-doc ledger consistency gates (2026-10-03).
 *
 * `docs/client-feedback-status.md` is the ledger the client actually reads,
 * and it drifted twice in a row with nothing failing:
 *
 *   - 831a527 (23 Sep) wrote "เสร็จแล้ว 29 ข้อ" against a table holding 28 —
 *     and 29+1+1 never summed to the stated 30.
 *   - The same table kept claiming "no automatic slip verification" and
 *     "the mascot needs code changes" for weeks after 13bdf58 shipped both.
 *
 * So these are static markdown scans: no browser, no network, and they run
 * on every `vitest`. They enforce:
 *
 *   L1 — every numbered row carries exactly one recognised mark, so a
 *        blanked or typo'd status cell cannot pass silently.
 *   L2 — the summary tally equals the table's own row count, the parts sum
 *        to the stated total, and the total equals the row count.
 *   L3 — the inline arithmetic the summary carries ("(28+2+0 = 30)") is
 *        itself correct, so the document proves its own number.
 *   L4 — a row that says it is waiting on the client is never marked
 *        not-started. "Waiting on you" and "not built yet" are different
 *        claims; conflating them hides the blocker from the client.
 *
 * Plus two source-linked gates: if the Slip2Go adapter or the mascot
 * uploader exists in src/, the docs may not claim that capability is
 * missing. That is the exact regression these gates exist to prevent, and
 * it is why the marks are cross-checked against the codebase rather than
 * only against each other.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'docs', 'client-feedback-status.md');
const WEEKLY_PATH = path.join(ROOT, 'docs', 'weekly-summary-2026-09-20.md');
const SLIP_ADAPTER_PATH = path.join(ROOT, 'src', 'lib', 'payment', 'slip2go.ts');
const SETTINGS_PATH = path.join(ROOT, 'src', 'app', 'management', 'settings', 'page.tsx');

const MARKS = ['✅', '🟡', '⬜'] as const;

type LedgerRow = {
  line: number;
  n: number;
  title: string;
  mark: string;
  detail: string;
};

type Summary = {
  line: number;
  done: number;
  partial: number;
  notStarted: number;
  total: number;
  arithmetic: { parts: number[]; sum: number } | null;
};

const statusText = readFileSync(STATUS_PATH, 'utf8');
const statusLines = statusText.split('\n');
const weeklyText = readFileSync(WEEKLY_PATH, 'utf8');
const weeklyLines = weeklyText.split('\n');

/** Trim a pipe-delimited cell, treating an out-of-range index as empty. */
const cell = (cells: string[], i: number): string => cells[i]?.trim() ?? '';

/** Numbered rows only: a markdown row whose first cell is digits. */
function parseLedgerRows(): LedgerRow[] {
  const rows: LedgerRow[] = [];
  statusLines.forEach((line, i) => {
    const cells = line.split('|');
    // Leading pipe + at least 4 populated cells + trailing pipe.
    if (cells.length < 6) return;
    const n = cell(cells, 1);
    if (!/^\d+$/.test(n)) return;
    rows.push({
      line: i + 1,
      n: Number(n),
      title: cell(cells, 2),
      mark: cell(cells, 3),
      detail: cell(cells, 4),
    });
  });
  return rows;
}

const rows = parseLedgerRows();
const tally = (mark: string): number => rows.filter((r) => r.mark === mark).length;

function parseSummary(): Summary | null {
  /** First capture group as a number; a missing group is a genuine 0. */
  const group = (text: string, re: RegExp): number => {
    const raw = re.exec(text)?.[1];
    return raw === undefined ? 0 : Number(raw);
  };

  for (let i = 0; i < statusLines.length; i++) {
    const text = statusLines[i] ?? '';
    if (!/เสร็จแล้ว \d+ ข้อ/.test(text)) continue;
    const arith = /\((\d+\+\d+\+\d+) = (\d+)\)/.exec(text);
    const partsRaw = arith?.[1];
    const sumRaw = arith?.[2];
    return {
      line: i + 1,
      done: group(text, /เสร็จแล้ว (\d+) ข้อ/),
      partial: group(text, /🟡 (\d+) ข้อ/),
      notStarted: group(text, /⬜ (\d+) ข้อ/),
      total: group(text, /รวม (\d+) ข้อ/),
      arithmetic:
        partsRaw === undefined || sumRaw === undefined
          ? null
          : { parts: partsRaw.split('+').map(Number), sum: Number(sumRaw) },
    };
  }
  return null;
}

/** Quote a doc line for a failure message without dumping the whole row. */
const clip = (line: string): string => line.trim().slice(0, 150);

describe('client-feedback-status.md — ledger integrity', () => {
  it('parses the numbered table rows', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('L1: every numbered row carries exactly one recognised mark', () => {
    const bad = rows
      .filter((r) => !(MARKS as readonly string[]).includes(r.mark))
      .map((r) => `  line ${r.line} (#${r.n} ${r.title}): status cell is ${JSON.stringify(r.mark)}`);
    expect(bad, `rows with an unusable status mark:\n${bad.join('\n')}`).toEqual([]);
  });

  it('L2: the summary tally matches the table it summarises', () => {
    const s = parseSummary();
    expect(s, `${STATUS_PATH} must carry a "เสร็จแล้ว N ข้อ" summary line`).not.toBeNull();
    const summary = s as Summary;
    const mismatches: string[] = [];
    const pairs: Array<[string, number, number]> = [
      ['✅ done', summary.done, tally('✅')],
      ['🟡 partial', summary.partial, tally('🟡')],
      ['⬜ not started', summary.notStarted, tally('⬜')],
    ];
    for (const [label, claimed, actual] of pairs) {
      if (claimed !== actual) mismatches.push(`${label}: summary says ${claimed}, table has ${actual}`);
    }
    expect(mismatches, `summary line ${summary.line} disagrees with its own table:\n  ${mismatches.join('\n  ')}`).toEqual(
      [],
    );
  });

  it('L2: the summary parts sum to the stated total', () => {
    const summary = parseSummary() as Summary;
    const sum = summary.done + summary.partial + summary.notStarted;
    expect(
      sum,
      `summary line ${summary.line}: ${summary.done}+${summary.partial}+${summary.notStarted} = ${sum}, but it states "รวม ${summary.total} ข้อ"`,
    ).toBe(summary.total);
  });

  it('L2: the stated total equals the number of table rows', () => {
    const summary = parseSummary() as Summary;
    expect(summary.total, 'the stated total must match the table row count').toBe(rows.length);
  });

  it('L3: the inline arithmetic in the summary is self-consistent', () => {
    const summary = parseSummary() as Summary;
    expect(
      summary.arithmetic,
      `summary line ${summary.line} should carry its own arithmetic, e.g. "(28+2+0 = 30)"`,
    ).not.toBeNull();
    const { parts, sum } = (summary.arithmetic as NonNullable<Summary['arithmetic']>);
    expect(
      parts.reduce((a, b) => a + b, 0),
      `inline arithmetic ${parts.join('+')} does not equal the printed result ${sum}`,
    ).toBe(sum);
    expect(parts, 'inline arithmetic must match the tally it certifies').toEqual([
      summary.done,
      summary.partial,
      summary.notStarted,
    ]);
    expect(sum).toBe(summary.total);
  });

  it('L4: a row waiting on the client is never marked not-started', () => {
    const gated = rows.filter((r) => r.detail.includes('ลูกค้า') && r.detail.includes('รอ'));
    const offenders = gated
      .filter((r) => r.mark === '⬜')
      .map((r) => `  line ${r.line} (#${r.n} ${r.title}): marked ⬜ but its own text says it is waiting on the client`);
    expect(
      offenders,
      `these rows claim "not started" while describing themselves as client-gated — that hides the blocker:\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([]);
  });
});

describe('client docs vs shipped code', () => {
  const docsLines = [...statusLines, ...weeklyLines];

  it('does not claim slip auto-verification is missing while the Slip2Go adapter ships', () => {
    if (!existsSync(SLIP_ADAPTER_PATH)) return; // capability genuinely absent
    const offenders = docsLines
      .map((line, i) => ({ line: `${STATUS_PATH}:${i + 1} ${line}` }))
      .filter(({ line }) => /ยังไม่มี[^|]{0,40}ตรวจสลิปอัตโนมัติ/.test(line))
      .map(({ line }) => `  ${clip(line)}`);
    expect(
      offenders,
      `Slip2Go ships at ${SLIP_ADAPTER_PATH} — the client docs may not still say slip auto-verification is absent:\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([]);
  });

  it('does not mark the slip row not-started while the Slip2Go adapter ships', () => {
    if (!existsSync(SLIP_ADAPTER_PATH)) return;
    const offenders = weeklyLines
      .map((line, i) => ({ line, at: i + 1 }))
      .filter(({ line }) => /ตรวจสลิปอัตโนมัติ/.test(line))
      // The open-items table writes prose status cells such as
      // "⬜ ยังไม่ทำ (...)", so the mark must lead the cell rather than
      // equal it.
      .filter(({ line }) => line.split('|').some((cell) => cell.trim().startsWith('⬜')))
      .map(({ line, at }) => `  line ${at}: ${clip(line)}`);
    expect(
      offenders,
      `the weekly summary still lists slip auto-verification as ⬜ although ${SLIP_ADAPTER_PATH} ships:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('does not claim the mascot uploader is missing while the settings page ships it', () => {
    if (!existsSync(SETTINGS_PATH)) return;
    if (!readFileSync(SETTINGS_PATH, 'utf8').includes('uploadMascot')) return;
    const offenders = docsLines
      .map((line, i) => ({ line: `line ${i + 1}: ${line}` }))
      .filter(({ line }) => /มาสคอต/.test(line))
      .filter(({ line }) => /ยังไม่ได้/.test(line) || /(?<!ไม่)ต้องแก้โค้ด/.test(line))
      .map(({ line }) => `  ${clip(line)}`);
    expect(
      offenders,
      `the mascot uploader ships (uploadMascot in ${SETTINGS_PATH}) — the docs may not still call for a code change:\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([]);
  });
});

describe('weekly summary agrees with the ledger', () => {
  it('repeats the same done/total figures as the ledger table', () => {
    const m = /เสร็จแล้ว (\d+) จาก (\d+) ข้อ/.exec(weeklyText);
    expect(m, `${WEEKLY_PATH} must carry a "เสร็จแล้ว N จาก M ข้อ" line`).not.toBeNull();
    expect(
      { done: Number(m![1]), total: Number(m![2]) },
      'the weekly summary must not contradict the ledger it links to',
    ).toEqual({ done: tally('✅'), total: rows.length });
  });

  it('repeats the same ratio in its closing summary bullet', () => {
    const m = /(\d+)\/(\d+) ✅/.exec(weeklyText);
    expect(m, `${WEEKLY_PATH} must carry an "N/M ✅" summary bullet`).not.toBeNull();
    expect({ done: Number(m![1]), total: Number(m![2]) }).toEqual({ done: tally('✅'), total: rows.length });
  });
});
