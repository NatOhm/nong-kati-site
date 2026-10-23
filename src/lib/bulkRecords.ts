/**
 * Pure helpers for the admin account/stock paste dialog
 * (management/products/BulkStockDialog).
 *
 * Why this exists — the 2026-10-14 NO_VARIANTS repro: valid long-format text
 * pasted into the modal produced "ตอนนี้: 1 รายการ", "0 ไอดี", a disabled Save,
 * and a raw English error code on screen. Two separate defects:
 *   1. the route returned 400 NO_VARIANTS (all of the fixture product's
 *      variants are inactive) and the dialog rendered `e.message` verbatim —
 *      a raw upper-snake code, which the charter forbids (Thai-first copy);
 *   2. the client-side record estimate used a regex split that did not match
 *      the route's blank-run loop, so whitespace-only "blank" lines carrying
 *      paste artifacts (NBSP, tabs) could make the counter disagree with the
 *      server's actual split.
 *
 * countBulkRecords therefore mirrors the stock/bulk route's record split
 * line-for-line: short = one record per non-blank line; long = blocks
 * separated by 2+ consecutive blank lines (blank == trim()-empty, so NBSP and
 * friends count as blank exactly as the server treats them), with single
 * blank lines preserved INSIDE a record so vendor templates survive delivery.
 */

/** Long-format record split — identical semantics to the stock/bulk route. */
export function splitLongRecords(raw: string): string[] {
  const records: string[] = [];
  let block: string[] = [];
  let blankRun = 0;
  for (const l of raw.split(/\r?\n/)) {
    if (l.trim() === '') {
      blankRun += 1;
      if (blankRun === 1 && block.length > 0) block.push('');
      continue;
    }
    if (blankRun >= 2 && block.length > 0) {
      while (block.length > 0 && block[block.length - 1] === '') block.pop();
      records.push(block.join('\n'));
      block = [];
    }
    blankRun = 0;
    block.push(l);
  }
  if (block.length > 0) {
    while (block.length > 0 && block[block.length - 1] === '') block.pop();
    records.push(block.join('\n'));
  }
  return records;
}

/** Record estimate shown under the textarea ("ตอนนี้: N รายการ"). */
export function countBulkRecords(raw: string, format: 'short' | 'long'): number {
  return parseBulkRecords(raw, format).length;
}

/** One variant a pasted record can land in (active ones only, like the route). */
export interface BulkVariant {
  id: string;
  label: string;
}

/** Records routed to one variant — the shape preview and route share. */
export interface BulkPlan {
  variantId: string;
  label: string;
  codes: string[];
}

/** Reference-prefix/column cleanup (client list: Long/detailed format with refs). */
const REF_RE = /^[[(]?(?:id|ref|order|inv|refid)\s*[:：\-]\s*.*$/i;

/**
 * THE paste parser — the stock/bulk route and the dialog's live preview both
 * call this, so the record count under the textarea, the distribution chips,
 * and what the server actually writes can never drift apart (the 2026-10-14
 * counter/server split disagreement, once and for all).
 */
export function parseBulkRecords(raw: string, format: 'short' | 'long'): string[] {
  if (raw.trim() === '') return [];
  if (format === 'short') {
    return raw.split(/\r?\n/).map((l) => l.trim()).filter((t) => t !== '');
  }
  return splitLongRecords(raw);
}

/**
 * Round-robin records across variants: an explicit "label:" prefix pins one
 * record, `variantId` pins the whole paste, short format strips a reference
 * prefix. Shared so the dialog's live distribution preview shows exactly what
 * the route will write. Returns every variant's bucket (even empty ones) —
 * callers filter on count.
 */
export function routeBulkRecords(
  records: string[],
  variants: BulkVariant[],
  format: 'short' | 'long',
  variantId = '',
): BulkPlan[] {
  if (variants.length === 0) return [];
  const perVariant = new Map<string, BulkPlan>(
    variants.map((v) => [v.id, { variantId: v.id, label: v.label, codes: [] }]),
  );
  const order = variants.map((v) => v.id);
  let cursor = 0;

  for (const record of records) {
    let work = record;
    let pinned: string | null = null;

    const pin = work.match(/^([^,:;]+)\s*[:：]\s*(.+)$/);
    const pinLabel = pin?.[1]?.trim();
    if (pin && pinLabel && variants.some((v) => v.label === pinLabel)) {
      pinned = variants.find((v) => v.label === pinLabel)!.id;
      work = pin[2]!.trim();
    }

    if (format === 'long') {
      // Whole multi-line block = one account record, delivered as-is.
      push(work);
    } else {
      // Short format: strip a reference prefix, whole remainder is the code text.
      const code = work.replace(REF_RE, '').trim();
      if (code) push(code);
    }

    function push(code: string): void {
      // `variantId` is '' when absent — `??` would pass an empty string through
      // and miss the map, so branch on truthiness instead of nullishness.
      const target = pinned ?? (variantId || order[cursor % order.length]!);
      const bucket = perVariant.get(target)!;
      bucket.codes.push(code);
      if (!pinned && !variantId) cursor += 1;
    }
  }
  return [...perVariant.values()];
}

/** Route error codes → Thai-first copy (never leak a raw code on screen). */
const THAI_BY_CODE: Record<string, string> = {
  NO_VARIANTS:
    'สินค้านี้ยังไม่มีแพ็กเกจที่เปิดใช้งาน — ไปที่ สินค้า → แก้ไขสินค้า → เปิดแพ็กเกจ แล้วลองใหม่',
  MISSING_FIELDS: 'กรอกข้อมูลให้ครบถ้วนก่อน',
  UNAUTHENTICATED: 'เซสชันหมดอายุ — ออกจากระบบแล้วเข้าสู่ระบบใหม่',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์เพิ่มสต๊อก (ต้องมีสิทธิ์ products:write)',
  NOT_FOUND: 'ไม่พบสินค้านี้แล้ว — รีเฟรชหน้าแล้วลองใหม่',
};

/**
 * Map an error thrown by adminJson (which rethrows the route's `error` field
 * as Error.message) to user-facing Thai copy. Upper-snake messages are route
 * codes: known ones get their Thai text, unknown ones fall back to `fallback`
 * so a new code can never leak to the screen. Non-code messages (network
 * failures etc.) are kept as-is for diagnosability.
 */
export function bulkErrorMessage(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/^[A-Z][A-Z0-9_]*$/.test(msg)) return THAI_BY_CODE[msg] ?? fallback;
  return msg || fallback;
}
