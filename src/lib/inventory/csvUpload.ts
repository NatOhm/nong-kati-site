/**
 * CSV Upload Pipeline — 10-digital-code.md §4.
 *
 * 1. Stream-parse CSV rows
 * 2. Validate: empty check, format check
 * 3. Dedup: in-file Set + DB unique constraint (code_hash)
 * 4. Encrypt valid codes (AES-256-GCM)
 * 5. Batch insert (chunks of 500)
 *
 * Row count ≤ 200 → synchronous
 * Row count > 200 → async (BullMQ job)
 */

import { encryptCode, hashCode } from '@/lib/crypto/giftCode';

export interface CsvRow {
  rowNumber: number;
  code: string;
  expiresAt?: string;
}

export interface ProcessedRow {
  rowNumber: number;
  codeHash: Buffer;
  codeEncrypted: Buffer;
  nonce: Buffer;
  /** Key version used for the encryption (accepted rows only). */
  keyVersion?: number;
  expiresAt: Date | null;
  status: 'accepted' | 'rejected';
  rejectReason?: string;
  maskedCode?: string;
  value?: string;
}

export interface UploadResult {
  totalRows: number;
  importedCount: number;
  rejectedCount: number;
  rejectionDetails: Array<{
    row: number;
    codeMasked: string | null;
    reason: string;
    value?: string | null;
  }>;
}

/**
 * Parse CSV content into rows.
 * 10-digital-code.md §4.1 — CSV format: code,expires_at,notes
 *
 * Supports:
 * - CRLF and LF line endings
 * - Blank lines (skipped)
 * - Comma separator
 * - Multiline records when format permits
 */
export function parseCsv(content: string): CsvRow[] {
  // Normalize line endings: CRLF -> LF
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const rows: CsvRow[] = [];

  // Skip header row, start from line 1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip blank lines
    if (!line.trim()) continue;
    
    const parts = line.split(',').map((p) => p.trim());
    const code = parts[0] ?? '';
    const expiresAt = parts[1] ?? undefined;

    if (code) {
      const row: CsvRow = {
        rowNumber: i + 1,
        code,
      };
      if (expiresAt) {
        row.expiresAt = expiresAt;
      }
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse stock paste content for bulk stock upload.
 * Supports multiple formats:
 * - Short format: one account per line
 * - Long format: multiline blocks separated by blank lines
 * - Various separators: comma, semicolon, tab
 * - Thai text and emoji in content
 */
export interface ParsedStockRecord {
  raw: string;
  lines: string[];
  code: string;
  reference?: string;
}

export function parseStockContent(
  content: string,
  format: 'short' | 'long',
  separator: ',' | ';' | 'tab' | 'newline' = ',',
): ParsedStockRecord[] {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = normalized.split('\n');
  
  const records: ParsedStockRecord[] = [];
  
  if (format === 'long') {
    // Long format: blocks separated by 2+ consecutive blank lines
    // Single blank lines are preserved inside blocks
    let block: string[] = [];
    let pendingBlankCount = 0;
    
    for (const line of allLines) {
      if (line.trim() === '') {
        pendingBlankCount++;
        continue;
      }
      
      // Non-blank line encountered
      if (pendingBlankCount >= 2 && block.length > 0) {
        // 2+ blank lines = end of current block, save it
        records.push({
          raw: block.join('\n'),
          lines: block,
          code: block.join('\n').trim(),
        });
        block = [];
      } else if (pendingBlankCount === 1 && block.length > 0) {
        // Single blank line = preserved inside block
        block.push('');
      }
      // If block is empty, ignore leading blank lines
      
      pendingBlankCount = 0;
      block.push(line);
    }
    
    // Don't forget the last block
    if (block.length > 0) {
      records.push({
        raw: block.join('\n'),
        lines: block,
        code: block.join('\n').trim(),
      });
    }
  } else {
    // Short format: one record per non-blank line
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (!line.trim()) continue;
      
      // Strip reference prefix if present (e.g., "ref: code" or "id: code")
      const refMatch = line.match(/^[[(]?(?:id|ref|order|inv|refid)\s*[:：\-]\s*.*$/i);
      let code = line;
      let reference: string | undefined;
      
      if (refMatch) {
        // Extract the actual code after the prefix
        const parts = line.split(/[:：\-]/);
        if (parts.length >= 2) {
          reference = parts[0].trim();
          code = parts.slice(1).join(':').trim();
        }
      }
      
      // For separator-based formats, split the line
      if (separator !== 'newline') {
        const sepChar = separator === 'tab' ? '\t' : separator;
        const fields = code.split(sepChar).map(f => f.trim());
        if (fields.length > 1) {
          // Last field is the code, everything before is reference
          reference = fields.slice(0, -1).join(separator).trim();
          code = fields[fields.length - 1];
        }
      }
      
      if (code.trim()) {
        records.push({
          raw: line,
          lines: [line],
          code: code.trim(),
          reference,
        });
      }
    }
  }
  
  return records;
}

/**
 * Process a batch of CSV rows — validate, dedup, encrypt.
 * 10-digital-code.md §4.2 — Processing contract.
 */
export function processCsvRows(
  rows: CsvRow[],
  existingHashes: Set<string> = new Set(),
): ProcessedRow[] {
  const seenHashes = new Set<string>();
  const results: ProcessedRow[] = [];

  for (const row of rows) {
    const code = row.code.trim().toUpperCase();

    // Reject empty codes
    if (!code) {
      results.push({
        rowNumber: row.rowNumber,
        codeHash: Buffer.alloc(0),
        codeEncrypted: Buffer.alloc(0),
        nonce: Buffer.alloc(0),
        expiresAt: null,
        status: 'rejected',
        rejectReason: 'empty_code',
      });
      continue;
    }

    // Compute hash
    const hash = hashCode(code);
    const hashHex = hash.toString('hex');

    // Check in-file dedup
    if (seenHashes.has(hashHex)) {
      results.push({
        rowNumber: row.rowNumber,
        codeHash: hash,
        codeEncrypted: Buffer.alloc(0),
        nonce: Buffer.alloc(0),
        expiresAt: null,
        status: 'rejected',
        rejectReason: 'duplicate_in_file',
        maskedCode: maskCode(code),
      });
      continue;
    }

    // Check DB dedup
    if (existingHashes.has(hashHex)) {
      results.push({
        rowNumber: row.rowNumber,
        codeHash: hash,
        codeEncrypted: Buffer.alloc(0),
        nonce: Buffer.alloc(0),
        expiresAt: null,
        status: 'rejected',
        rejectReason: 'duplicate_code',
        maskedCode: maskCode(code),
      });
      continue;
    }

    // Parse expiry
    let expiresAt: Date | null = null;
    if (row.expiresAt) {
      const parsed = new Date(row.expiresAt);
      if (isNaN(parsed.getTime())) {
        results.push({
          rowNumber: row.rowNumber,
          codeHash: hash,
          codeEncrypted: Buffer.alloc(0),
          nonce: Buffer.alloc(0),
          expiresAt: null,
          status: 'rejected',
          rejectReason: 'invalid_expiry_format',
          maskedCode: maskCode(code),
          value: row.expiresAt,
        });
        continue;
      }
      expiresAt = parsed;
    }

    // Encrypt
    const { ciphertext, nonce, keyVersion } = encryptCode(code);

    // Accept
    seenHashes.add(hashHex);
    results.push({
      rowNumber: row.rowNumber,
      codeHash: hash,
      codeEncrypted: ciphertext,
      nonce,
      keyVersion,
      expiresAt,
      status: 'accepted',
    });
  }

  return results;
}

/**
 * Generate upload summary.
 */
export function generateUploadSummary(results: ProcessedRow[]): UploadResult {
  const accepted = results.filter((r) => r.status === 'accepted');
  const rejected = results.filter((r) => r.status === 'rejected');

  return {
    totalRows: results.length,
    importedCount: accepted.length,
    rejectedCount: rejected.length,
    rejectionDetails: rejected.map((r) => ({
      row: r.rowNumber,
      codeMasked: r.maskedCode ?? null,
      reason: r.rejectReason ?? 'unknown',
      value: r.value ?? null,
    })),
  };
}

/**
 * Mask a code for display (last 4 chars only).
 */
function maskCode(code: string): string {
  if (code.length <= 4) return code;
  return '*'.repeat(code.length - 4) + code.slice(-4);
}
