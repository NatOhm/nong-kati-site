/**
 * Tax-invoice availability — one owner for "can we accept a ใบกำกับภาษี
 * request at all right now".
 *
 * The owner cannot issue tax invoices yet, so this is a store-wide switch
 * rather than a per-order choice: when it is off, checkout hides the toggle,
 * the order API drops a stale `requiresTaxInvoice: true` instead of storing a
 * promise nobody can keep, and the account nav stops offering the page.
 *
 * Default is ON when no row exists — the toggle has always been offered, and a
 * missing setting must not silently remove a feature someone relies on.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export const TAX_INVOICE_SETTING_KEY = 'tax_invoice';

export interface TaxInvoiceConfig {
  enabled: boolean;
}

export async function getTaxInvoiceConfig(
  db: Prisma.TransactionClient = prisma,
): Promise<TaxInvoiceConfig> {
  const row = await db.siteSetting.findUnique({ where: { key: TAX_INVOICE_SETTING_KEY } });
  if (!row) return { enabled: true };

  try {
    const parsed = JSON.parse(row.value) as { enabled?: unknown };
    // Only an explicit `false` turns it off; corrupt JSON keeps the default.
    return { enabled: parsed.enabled !== false };
  } catch {
    return { enabled: true };
  }
}
