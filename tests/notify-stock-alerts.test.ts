/**
 * notifyStockAlertsForVariants — first direct coverage (the helper owned the
 * threshold → query → out/low stock policy with no tests of its own, and as
 * of this change it is the ONLY implementation: slip-verify, admin
 * verify-payment and the omise webhook all delegate to it after their
 * confirmation transaction commits, so its contract is what protects those
 * routes' post-commit section).
 *
 * Contract pinned here:
 *  A. out/low split — stock 0 → "🚫 สินค้าหมดแล้ว", 0 < stock ≤ threshold →
 *     "⚠️ สต๊อกใกล้หมด", stock above threshold → nothing sent.
 *  B. threshold — from SiteSetting['notifications'].lowStockThreshold,
 *     defaulting to 5 when unset; asserted on the query actually issued.
 *  C. never throws — a rejected lookup resolves with nothing sent (the
 *     reason every payment route can await it post-commit without a try).
 *  D. empty input — no query at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    siteSetting: { findUnique: vi.fn() },
    productVariant: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import { notifyStockAlertsForVariants } from '@/lib/notify';

const WEBHOOK = 'https://discord.com/api/webhooks/123/test';

type Variant = { id: string; label: string; stock: number; product: { name: string } };

let variants: Variant[] = [];

/** Two-arg fetch stub so `calls[0]` destructures without casts. */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function embedTitle(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  const body = JSON.parse(String(init.body)) as { embeds: Array<{ title?: string }> };
  return body.embeds[0]?.title ?? '';
}

/**
 * The helper fires its Discord sends with `void` (by design — routes must not
 * wait on Discord), so the awaited helper can resolve a few microtasks BEFORE
 * the settings read → fetch chain lands. One macrotask tick drains the whole
 * microtask queue; asserting before it is a race, not a failure.
 */
async function flushSends(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  variants = [];
  process.env['NK_DISCORD_WEBHOOK_URL'] = WEBHOOK;
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  // Behave like the real query: honour id-in and stock <= threshold.
  prismaMock.productVariant.findMany.mockImplementation(
    async (args: { where: { id: { in: string[] }; stock: { lte: number } } }) =>
      variants.filter((v) => args.where.id.in.includes(v.id) && v.stock <= args.where.stock.lte),
  );
});

afterEach(() => {
  delete process.env['NK_DISCORD_WEBHOOK_URL'];
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('notifyStockAlertsForVariants', () => {
  it('stock 0 → one urgent “🚫 สินค้าหมดแล้ว” embed', async () => {
    variants = [{ id: 'v1', label: '4K แชร์', stock: 0, product: { name: 'Netflix Premium' } }];
    const fetchMock = stubFetch();

    await notifyStockAlertsForVariants(['v1']);
    await flushSends();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(WEBHOOK);
    expect(embedTitle(fetchMock)).toBe('🚫 สินค้าหมดแล้ว');
  });

  it('stock 3 → routine “⚠️ สต๊อกใกล้หมด” embed', async () => {
    variants = [{ id: 'v1', label: '1 เดือน', stock: 3, product: { name: 'Spotify' } }];
    const fetchMock = stubFetch();

    await notifyStockAlertsForVariants(['v1']);
    await flushSends();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(embedTitle(fetchMock)).toBe('⚠️ สต๊อกใกล้หมด');
  });

  it('stock above the threshold → the query filters it out, nothing sent', async () => {
    variants = [{ id: 'v1', label: '1 ปี', stock: 10, product: { name: 'Netflix' } }];
    const fetchMock = stubFetch();

    await notifyStockAlertsForVariants(['v1']);

    // Default threshold 5 — the simulated query filtered stock 10 out.
    expect(prismaMock.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stock: { lte: 5 } }) }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('threshold comes from SiteSetting, not the hardcoded default', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      key: 'notifications',
      value: JSON.stringify({ lowStockThreshold: 7 }),
    });
    variants = [{ id: 'v1', label: '1 เดือน', stock: 6, product: { name: 'Spotify' } }];
    const fetchMock = stubFetch();

    await notifyStockAlertsForVariants(['v1']);
    await flushSends();

    expect(prismaMock.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stock: { lte: 7 } }) }),
    );
    // 6 > default 5 but ≤ configured 7 — only an honoured threshold fetches.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(embedTitle(fetchMock)).toBe('⚠️ สต๊อกใกล้หมด');
  });

  it('never throws: a rejected lookup resolves with nothing sent', async () => {
    prismaMock.productVariant.findMany.mockRejectedValue(new Error('Connection terminated'));
    const fetchMock = stubFetch();

    await expect(notifyStockAlertsForVariants(['v1'])).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('empty / all-null id list → no query at all', async () => {
    const fetchMock = stubFetch();

    await expect(notifyStockAlertsForVariants([])).resolves.toBeUndefined();
    expect(prismaMock.productVariant.findMany).not.toHaveBeenCalled();

    // Route call sites null-filter before calling; a raw all-null batch must
    // also be a no-op rather than a query or a throw.
    await expect(
      notifyStockAlertsForVariants([null as unknown as string, null as unknown as string]),
    ).resolves.toBeUndefined();
    expect(prismaMock.productVariant.findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
