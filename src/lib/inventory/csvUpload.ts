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
 */
export function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n').filter((line) => line.trim());
  const rows: CsvRow[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',').map((p) => p.trim());
    const code = parts[0] ?? '';
    const expiresAt = parts[1];

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
    const { ciphertext, nonce } = encryptCode(code);

    // Accept
    seenHashes.add(hashHex);
    results.push({
      rowNumber: row.rowNumber,
      codeHash: hash,
      codeEncrypted: ciphertext,
      nonce,
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
