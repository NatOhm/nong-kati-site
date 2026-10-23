/**
 * Bulk account-paste record counting + error copy — regression gate for the
 * 2026-10-14 "NO_VARIANTS on valid long-format text" repro
 * (freebuff-note-add-stock-error.md).
 *
 * What actually broke (verified, not assumed):
 *   - the fixture product's 60 variants are ALL isActive:false, so the
 *     stock/bulk route's active-variant filter returned 400 NO_VARIANTS
 *     before parsing — the dialog then rendered the raw code on screen;
 *   - the dialog's inline record-count regex drifted from the route's
 *     blank-run loop (whitespace-only lines with NBSP/zero-width paste
 *     artifacts are blank to the server but not to the regex), so the
 *     "ตอนนี้: N รายการ" counter could disagree with the actual split.
 *
 * Fixtures are the exact supplier text from the repro note.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bulkErrorMessage,
  countBulkRecords,
  parseBulkRecords,
  routeBulkRecords,
  splitLongRecords,
} from '../src/lib/bulkRecords';

// ── Fixtures (verbatim from freebuff-note-add-stock-error.md §2) ──────────

/** Screenshot 3: one ONED block — Unicode labels, indented Exp, internal blanks. */
const ONED_BLOCK = [
  '✿シ 𝗢𝗡𝗘𝗗 𝟯𝟬 𝗱𝗮𝘆𝘀 [ไม่ชน]',
  '',
  '𝗠𝗮𝗶𝗹 : silip23527@bejum.com',
  '𝗣𝗮𝘀𝘀 : oned30days',
  '    𝐄𝐱𝐩 : 4-9-26',
  '',
  '✦ เข้าได้ 1 อุปกรณ์เท่านั้น',
  '✦ จอหารไม่ชน จอชนแจ้งยึด',
  '',
  'มีปัญหาแจ้งแอดมินได้เลย',
].join('\n');

/** Screenshot 2 / the dialog placeholder: two blocks, 2 blank lines apart. */
const HBO_TWO_BLOCKS = [
  '🔴 ➤ HBO MAX 4K  7 days 💜',
  '',
  '✅ Mail : mansdevt@gmail.com',
  '✅ pass : baby123456hii',
  '',
  '',
  '✅ Mail : บัญชีถัดไป@gmail.com',
  '✅ pass : xxxxxxxx',
].join('\n');

describe('countBulkRecords — mirrors the stock/bulk route split', () => {
  it('ONED block (internal single blank lines) = 1 record in long format', () => {
    expect(countBulkRecords(ONED_BLOCK, 'long')).toBe(1);
  });

  it('ONED block under CRLF line endings = 1 record', () => {
    expect(countBulkRecords(ONED_BLOCK.replace(/\n/g, '\r\n'), 'long')).toBe(1);
  });

  it('HBO two blocks separated by 2 blank lines = 2 records', () => {
    expect(countBulkRecords(HBO_TWO_BLOCKS, 'long')).toBe(2);
  });

  it('HBO blocks under CRLF line endings = 2 records', () => {
    expect(countBulkRecords(HBO_TWO_BLOCKS.replace(/\n/g, '\r\n'), 'long')).toBe(2);
  });

  it('whitespace-only separator lines (NBSP paste artifact) still split', () => {
    const nbsp = HBO_TWO_BLOCKS.replace(/\n\n\n/, '\n\u00a0\n\n');
    expect(countBulkRecords(nbsp, 'long')).toBe(2);
  });

  it('single blank line between accounts keeps them as ONE record (by design)', () => {
    const oneBlank = HBO_TWO_BLOCKS.replace(/\n\n\n/, '\n\n');
    expect(countBulkRecords(oneBlank, 'long')).toBe(1);
  });

  it('empty / whitespace-only input = 0 (placeholder never counts)', () => {
    expect(countBulkRecords('', 'long')).toBe(0);
    expect(countBulkRecords('   \n\t\n', 'long')).toBe(0);
    expect(countBulkRecords('', 'short')).toBe(0);
  });

  it('short format = one record per non-blank line', () => {
    expect(countBulkRecords('user1:pass1\nuser2:pass2\n\nuser3:pass3\n', 'short')).toBe(3);
  });

  it('splitLongRecords preserves the block text exactly (vendor template survives)', () => {
    const records = splitLongRecords(ONED_BLOCK);
    expect(records).toHaveLength(1);
    expect(records[0]).toBe(ONED_BLOCK);
  });
});

describe('bulkErrorMessage — never leaks a raw route code to the screen', () => {
  it('NO_VARIANTS maps to Thai guidance with no raw code visible', () => {
    const msg = bulkErrorMessage(new Error('NO_VARIANTS'), 'แยกข้อมูลไม่สำเร็จ');
    expect(msg).toContain('แพ็กเกจ');
    expect(msg).not.toContain('NO_VARIANTS');
  });

  it('an unknown upper-snake code falls back to Thai, not the code', () => {
    expect(bulkErrorMessage(new Error('SOMETHING_NEW'), 'บันทึกไม่สำเร็จ')).toBe(
      'บันทึกไม่สำเร็จ',
    );
  });

  it('non-code messages (network errors) pass through for diagnosability', () => {
    expect(bulkErrorMessage(new Error('Failed to fetch'), 'x')).toBe('Failed to fetch');
  });

  it('empty message uses the fallback', () => {
    expect(bulkErrorMessage(new Error(''), 'x')).toBe('x');
  });
});

describe('parseBulkRecords — THE paste parser (server writes exactly this)', () => {
  it('short: one record per non-blank line, trimmed', () => {
    expect(parseBulkRecords('a:1\n \n b:2\n', 'short')).toEqual(['a:1', 'b:2']);
  });

  it('long: 2+ blank lines split, a single blank stays inside the record', () => {
    expect(parseBulkRecords('x\n\ny', 'long')).toEqual(['x\n\ny']);
    expect(parseBulkRecords('x\n\n\ny', 'long')).toEqual(['x', 'y']);
  });

  it('empty / whitespace-only paste = []', () => {
    expect(parseBulkRecords('', 'short')).toEqual([]);
    expect(parseBulkRecords(' \n\u00a0\n', 'long')).toEqual([]);
  });
});

describe('routeBulkRecords — where each record lands (dialog preview == server)', () => {
  const variants = [
    { id: 'v1', label: 'แพ็กเกจ A' },
    { id: 'v2', label: 'แพ็กเกจ B' },
  ];
  const codes = (plans: ReturnType<typeof routeBulkRecords>, id: string): string[] =>
    plans.find((p) => p.variantId === id)!.codes;

  it('unpinned short records round-robin across active variants', () => {
    const plans = routeBulkRecords(parseBulkRecords('a\nb\nc', 'short'), variants, 'short');
    expect(codes(plans, 'v1')).toEqual(['a', 'c']);
    expect(codes(plans, 'v2')).toEqual(['b']);
  });

  it('a "label:" prefix pins one record to that variant', () => {
    const plans = routeBulkRecords(
      parseBulkRecords('แพ็กเกจ B:secret1\nplain', 'short'),
      variants,
      'short',
    );
    expect(codes(plans, 'v2')).toEqual(['secret1']);
    expect(codes(plans, 'v1')).toEqual(['plain']);
  });

  it('variantId pins the whole paste; other variants still get an empty bucket', () => {
    const plans = routeBulkRecords(parseBulkRecords('a\nb', 'short'), variants, 'short', 'v2');
    expect(codes(plans, 'v2')).toEqual(['a', 'b']);
    expect(codes(plans, 'v1')).toEqual([]);
  });

  it('short format drops a whole reference-prefix line', () => {
    const plans = routeBulkRecords(
      parseBulkRecords('ID: 12345\nuser:pass', 'short'),
      variants,
      'short',
    );
    const all = [...codes(plans, 'v1'), ...codes(plans, 'v2')];
    expect(all).toEqual(['user:pass']);
  });

  it('no active variants = [] (route turns this into 400 NO_VARIANTS)', () => {
    expect(routeBulkRecords(['a'], [], 'short')).toEqual([]);
  });
});

describe('route + dialog both call the shared parser (single source, no drift)', () => {
  const ROUTE = readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'app',
      'api',
      'v1',
      'admin',
      'stock',
      'bulk',
      'route.ts',
    ),
    'utf8',
  );
  const DIALOG = readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'management', 'products', 'BulkStockDialog.tsx'),
    'utf8',
  );

  it('the route parses and routes through the lib, not a private copy', () => {
    expect(ROUTE).toContain('parseBulkRecords(raw, format)');
    expect(ROUTE).toContain('routeBulkRecords(');
    expect(ROUTE).not.toContain('blankRun');
    expect(ROUTE).not.toContain('REF_RE');
  });

  it('the dialog previews the distribution with the same routeBulkRecords', () => {
    expect(DIALOG).toContain('parseBulkRecords(raw, format)');
    expect(DIALOG).toContain('routeBulkRecords(');
    expect(DIALOG).toContain('onDrop');
    expect(DIALOG).toContain('PREVIEW_LIMIT');
  });

  it('counter comes from countBulkRecords, not a private regex split', () => {
    expect(DIALOG).toContain('countBulkRecords(raw, format)');
    expect(DIALOG).not.toContain('(?:\\r?\\n)[ \\t]*(?:\\r?\\n)');
  });

  it('both error handlers route through bulkErrorMessage', () => {
    expect(DIALOG.match(/bulkErrorMessage\(/g)?.length).toBe(2);
    expect(DIALOG).not.toContain('e instanceof Error ? e.message');
  });
});
