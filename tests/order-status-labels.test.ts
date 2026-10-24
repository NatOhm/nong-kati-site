/**
 * Order-status label consolidation gates (source-level scan + lib pins).
 *
 * Every admin page carried its own copy of the order-status Thai label map
 * and the copies drifted (review 2026-10-24): reconciliation said
 * "ยืนยันการชำระ" / "รอส่งมอบมือ" / "คืนเงินแล้ว" while
 * orders/customers/dashboard said "ชำระแล้ว" / "รอส่งโค้ด" / "คืนเงิน" for
 * the SAME status — one order read differently on every screen a staff
 * member opened. The words now live once in src/lib/orderStatus.ts;
 * badge pages keep only their per-status colours via `withStatusColors`.
 *
 *  G1 — no management page may declare a Thai label for a known order
 *       status. Sentinel: a known status key defined with Thai text on
 *       the same line, or a `label:` carrying Thai within the next six
 *       lines of a multi-line definition (the `{ label, color }` shape).
 *       Colour/class maps are ASCII, so they pass untouched. Files whose
 *       map belongs to a DIFFERENT domain are allowlisted with a reason —
 *       the key names overlap (`completed`, `expired`, `failed`…), the
 *       entities do not.
 *  G2 — the canonical map carries the unified wording (the reconciliation
 *       drift strings must not exist in the lib), the four badge pages
 *       actually import it, and reconciliation's drifted copies are gone.
 *
 * Out of scope on purpose: the customer-facing /account/orders badge
 * (`src/components/order/OrderStatusBadge.tsx` — different audience and
 * tone) and the audit page's action labels (a different domain).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ORDER_STATUS_LABELS, orderStatusLabel, withStatusColors } from '@/lib/orderStatus';

const ROOT = path.join(__dirname, '..');
const MANAGEMENT_DIR = path.join(ROOT, 'src', 'app', 'management');

/** Thai codepoints — a label is Thai text; a Tailwind class never is. */
const THAI = /[\u0E00-\u0E7F]/;

/**
 * Files allowed to define a colliding key with a Thai value because the
 * map is a different domain whose key names merely overlap. Every entry
 * is a reviewed exception; anything new fails G1.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'audit/page.tsx',
    why: 'audit ACTION labels — `code_delivered` is an audit action name, not an order status',
  },
  {
    file: 'inventory/VariantCodesDialog.tsx',
    why: 'gift-code statuses (available/reserved/delivered/voided/expired) — a different entity than orders',
  },
  {
    file: 'pdpa/page.tsx',
    why: 'PDPA data-request statuses (DataRequestStatus), not order statuses',
  },
  {
    file: 'topups/page.tsx',
    why: 'wallet top-up statuses (completed/pending/failed), not order statuses',
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

/** Comment lines cannot define anything — blank them before matching. */
function stripComments(src: string): string[] {
  return src.split(/\r?\n/).map((l) => (l.trimStart().startsWith('//') ? '' : l));
}

describe('order-status label consolidation', () => {
  it('G1: no management page declares its own Thai label for a known order status', () => {
    const allow = new Set(ALLOWLIST.map((a) => a.file));
    // Longest key first so pending_payment never yields to pending.
    const keys = Object.keys(ORDER_STATUS_LABELS).sort((a, b) => b.length - a.length);
    const violations: string[] = [];

    for (const abs of walk(MANAGEMENT_DIR)) {
      const relInMgmt = path.relative(MANAGEMENT_DIR, abs).split(path.sep).join('/');
      if (allow.has(relInMgmt)) continue;
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      const lines = stripComments(readFileSync(abs, 'utf8'));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const key of keys) {
          const m = line.match(new RegExp(`^\\s*${key}\\s*:`));
          if (!m) continue;
          if (THAI.test(line.slice(m[0].length))) {
            violations.push(`${rel}:${i + 1} — \`${key}\` declares a Thai label inline`);
            continue;
          }
          // Multi-line shape: `key: {` … the label may sit lines below.
          for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
            const next = lines[j]!;
            if (/^\s*\};?\s*$/.test(next)) break;
            if (/label\s*:/.test(next) && THAI.test(next)) {
              violations.push(`${rel}:${j + 1} — \`${key}\` declares a Thai label on line ${j + 1}`);
              break;
            }
          }
        }
      }
    }

    expect(
      violations,
      'order-status words belong in src/lib/orderStatus.ts — join the shared map instead',
    ).toEqual([]);
  });

  it('G2a: the canonical map is unified — no reconciliation drift in the lib', () => {
    expect(ORDER_STATUS_LABELS['payment_confirmed']).toBe('ชำระแล้ว');
    expect(ORDER_STATUS_LABELS['pending_manual_fulfilment']).toBe('รอส่งโค้ด');
    expect(ORDER_STATUS_LABELS['refunded']).toBe('คืนเงิน');
    const dump = JSON.stringify(ORDER_STATUS_LABELS);
    expect(dump, 'the drifted wording must not resurface anywhere in the lib').not.toContain(
      'ยืนยันการชำระ',
    );
    expect(dump).not.toContain('รอส่งมอบมือ');
    expect(dump).not.toContain('คืนเงินแล้ว');
  });

  it('G2b: every order-status badge surface joins the shared map', () => {
    for (const page of ['orders', 'customers', 'reconciliation', 'dashboard']) {
      const src = readFileSync(path.join(MANAGEMENT_DIR, page, 'page.tsx'), 'utf8');
      expect(src, `${page} must import @/lib/orderStatus`).toContain('@/lib/orderStatus');
    }
    const recon = readFileSync(path.join(MANAGEMENT_DIR, 'reconciliation', 'page.tsx'), 'utf8');
    expect(recon, 'reconciliation must spread the shared map, not redeclare it').toContain(
      '...ORDER_STATUS_LABELS',
    );
    expect(recon).not.toContain('ยืนยันการชำระ');
    expect(recon).not.toContain('รอส่งมอบมือ');
    expect(recon).not.toContain('คืนเงินแล้ว');
  });

  it('helpers: unknown statuses fall back to the raw enum; colours map through unchanged', () => {
    expect(orderStatusLabel('pending_payment')).toBe('รอชำระเงิน');
    expect(orderStatusLabel('brand_new_status')).toBe('brand_new_status');
    const joined = withStatusColors({ pending_payment: 'text-amber-600' });
    expect(joined).toEqual({ pending_payment: { label: 'รอชำระเงิน', color: 'text-amber-600' } });
  });
});
