/**
 * Stock Parser Regression Tests
 * Tests for the parseStockContent function covering:
 * - CRLF and LF line endings
 * - Consecutive blank lines
 * - Unicode and emoji
 * - Comma, semicolon, and tab separators
 * - Multiline mode
 * - Invalid and partially valid input
 * - Preview count matching saved count
 */

import { parseStockContent, parseCsv } from '../src/lib/inventory/csvUpload';

describe('parseCsv', () => {
  it('should parse basic CSV with LF line endings', () => {
    const csv = `code,expires_at,notes
TEST001,2026-12-31,Test code 1
TEST002,,Test code 2`;

    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('TEST001');
    expect(rows[0].expiresAt).toBe('2026-12-31');
    expect(rows[1].code).toBe('TEST002');
    expect(rows[1].expiresAt).toBeUndefined();
  });

  it('should parse CSV with CRLF line endings', () => {
    const csv = `code,expires_at,notes\r\nTEST001,2026-12-31,Test\r\nTEST002,,Test2`;

    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('TEST001');
    expect(rows[1].code).toBe('TEST002');
  });

  it('should skip blank lines', () => {
    const csv = `code,expires_at\n\nTEST001,2026-12-31\n\nTEST002,`;

    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('should handle empty content', () => {
    const rows = parseCsv('');
    expect(rows).toHaveLength(0);
  });
});

describe('parseStockContent - short format', () => {
  it('should parse short format with LF line endings', () => {
    const content = `user1:pass1
user2:pass2
user3:pass3`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3);
    expect(records[0].code).toBe('user1:pass1');
    expect(records[1].code).toBe('user2:pass2');
    expect(records[2].code).toBe('user3:pass3');
  });

  it('should parse short format with CRLF line endings', () => {
    const content = `user1:pass1\r\nuser2:pass2\r\nuser3:pass3`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3);
    expect(records[0].code).toBe('user1:pass1');
  });

  it('should parse comma-separated values', () => {
    const content = `ref1,code1\nref2,code2`;

    const records = parseStockContent(content, 'short', ',');
    expect(records).toHaveLength(2);
    expect(records[0].code).toBe('code1');
    expect(records[0].reference).toBe('ref1');
    expect(records[1].code).toBe('code2');
  });

  it('should parse semicolon-separated values', () => {
    const content = `ref1;code1\nref2;code2`;

    const records = parseStockContent(content, 'short', ';');
    expect(records).toHaveLength(2);
    expect(records[0].code).toBe('code1');
    expect(records[1].code).toBe('code2');
  });

  it('should parse tab-separated values', () => {
    const content = `ref1\tcode1\nref2\tcode2`;

    const records = parseStockContent(content, 'short', 'tab');
    expect(records).toHaveLength(2);
    expect(records[0].code).toBe('code1');
    expect(records[1].code).toBe('code2');
  });

  it('should handle Thai text', () => {
    const content = `ผู้ใช้ 1:รหัส 1
ผู้ใช้ 2:รหัส 2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].code).toContain('ผู้ใช้');
    expect(records[1].code).toContain('รหัส');
  });

  it('should handle emoji', () => {
    const content = `user1:🎮code1
user2:🎲code2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].code).toContain('🎮');
    expect(records[1].code).toContain('🎲');
  });

  it('should skip blank lines in short format', () => {
    const content = `code1

code2

code3`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3);
    expect(records[0].code).toBe('code1');
    expect(records[1].code).toBe('code2');
    expect(records[2].code).toBe('code3');
  });

  it('should handle consecutive blank lines', () => {
    const content = `code1


code2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
  });

  it('should handle reference prefixes', () => {
    const content = `id:user1:pass1
ref:user2:pass2
order:ORD001:code1`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3);
    expect(records[0].code).toBe('user1:pass1');
    expect(records[1].code).toBe('user2:pass2');
    expect(records[2].code).toBe('ORD001:code1');
  });

  it('should handle empty content', () => {
    const records = parseStockContent('', 'short', 'newline');
    expect(records).toHaveLength(0);
  });

  it('should handle whitespace-only lines', () => {
    const content = `   \ncode1\n\t\ncode2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
  });
});

describe('parseStockContent - long format', () => {
  it('should parse multiline records separated by 2+ blank lines', () => {
    // 2 blank lines separate blocks
    const content = 'line1a\nline1b\nline1c\n\n\nline2a\nline2b';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].lines).toEqual(['line1a', 'line1b', 'line1c']);
    expect(records[0].code).toBe('line1a\nline1b\nline1c');
    expect(records[1].lines).toEqual(['line2a', 'line2b']);
    expect(records[1].code).toBe('line2a\nline2b');
  });

  it('should preserve single blank lines inside multiline records', () => {
    // Single blank line is part of the record
    const content = 'line1a\nline1b\n\nline1c';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(1);
    expect(records[0].lines).toEqual(['line1a', 'line1b', '', 'line1c']);
    expect(records[0].code).toBe('line1a\nline1b\n\nline1c');
  });

  it('should preserve single blank lines inside records', () => {
    // Single blank lines are preserved inside blocks in long format
    const content = 'line1a\nline1b\n\nline1c\nline2a';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(1); // Only 1 blank line, so all in one block
    expect(records[0].lines).toEqual(['line1a', 'line1b', '', 'line1c', 'line2a']);
  });

  it('should split on 3+ lines with 2 blank lines between', () => {
    // line1a, line1b, blank, blank, line2a, line2b
    // 2 consecutive blank lines separate blocks
    const content = 'line1a\nline1b\n\n\nline2a\nline2b';

    const records = parseStockContent(content, 'long', 'newline');
    console.log('Records:', JSON.stringify(records, null, 2));
    expect(records).toHaveLength(2);
    expect(records[0].lines).toEqual(['line1a', 'line1b']);
    expect(records[1].lines).toEqual(['line2a', 'line2b']);
  });

  it('should handle CRLF in long format', () => {
    // Test with 2 CRLF between blocks: \r\n\r\n becomes \n\n (1 blank line after split)
    // To get 2 blank lines (which splits records), we need \r\n\r\n\r\n which becomes \n\n\n
    const content = 'line1a\r\nline1b\r\n\r\n\r\nline2a';
    
    const records = parseStockContent(content, 'long', 'newline');
    // 2 blank lines = split into 2 records
    expect(records).toHaveLength(2);
    expect(records[0].lines).toEqual(['line1a', 'line1b']);
    expect(records[1].lines).toEqual(['line2a']);
  });

  it('should handle mixed CRLF and LF in long format', () => {
    // Mixed line endings should all be normalized
    const content = 'line1a\r\nline1b\n\n\nline2a';
    
    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].lines).toEqual(['line1a', 'line1b']);
    expect(records[1].lines).toEqual(['line2a']);
  });

  it('should treat single blank line as part of content', () => {
    const content = 'line1a\nline1b\n\nline2a';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(1); // Single blank line = same block
    expect(records[0].lines).toEqual(['line1a', 'line1b', '', 'line2a']);
  });

  it('should split on double blank line in long format', () => {
    const content = 'line1a\nline1b\n\n\nline2a';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].lines).toHaveLength(2); // line1a, line1b
    expect(records[1].lines).toHaveLength(1); // line2a
  });

  it('should handle Thai text in multiline mode', () => {
    // Two blank lines to separate blocks
    const content = 'บรรทัดที่ 1\nบรรทัดที่ 2\n\n\nบล็อกที่ 2\nบรรทัด 2';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].code).toContain('บรรทัด');
  });

  it('should handle emoji in multiline mode', () => {
    // Two blank lines to separate blocks
    const content = '🎮 เกม\n🎲 ลูกเต๋า\n\n\n📺 ทีวี';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].code).toContain('🎮');
    expect(records[1].code).toContain('📺');
  });

  it('should treat single blank line as part of content', () => {
    const content = `line1\n\nline2`;

    const records = parseStockContent(content, 'long', 'newline');
    expect(records).toHaveLength(1);
    expect(records[0].lines).toHaveLength(3);
  });

  it('should handle empty content in long format', () => {
    const records = parseStockContent('', 'long', 'newline');
    expect(records).toHaveLength(0);
  });
});

describe('parseStockContent - edge cases', () => {
  it('should handle mixed valid and invalid lines', () => {
    const content = `valid1
invalid

valid2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3); // All non-blank lines are captured
  });

  it('should handle lines with only whitespace', () => {
    const content = `valid1
   
   

valid2`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
  });

  it('should handle Unicode characters', () => {
    const content = `test-α β γ
test-ภาษาไทย`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(2);
    expect(records[0].code).toContain('α');
    expect(records[1].code).toContain('ไทย');
  });

  it('should handle special characters in codes', () => {
    const content = `code-with-dashes
code_with_underscores
code.with.dots`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records).toHaveLength(3);
  });
});

describe('Parse count verification', () => {
  it('should return correct count for preview', () => {
    const content = `item1:pass1\nitem2:pass2\nitem3:pass3`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records.length).toBe(3);
  });

  it('should count long format records correctly', () => {
    // 2+ blank lines separate blocks
    const content = 'block1-line1\nblock1-line2\n\n\nblock2-line1';

    const records = parseStockContent(content, 'long', 'newline');
    expect(records.length).toBe(2);
    // First record has 2 lines, second has 1
    expect(records[0].lines).toHaveLength(2);
    expect(records[1].lines).toHaveLength(1);
    // Total lines across all records
    const totalLines = records.reduce((sum, r) => sum + r.lines.length, 0);
    expect(totalLines).toBe(3);
  });

  it('should count short format lines correctly', () => {
    const content = `line1\n\nline2\n\n\nline3`;

    const records = parseStockContent(content, 'short', 'newline');
    expect(records.length).toBe(3); // Blank lines are skipped in short format
  });
});
