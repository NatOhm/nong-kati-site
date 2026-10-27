/**
 * Top-up Discord embed payload — "พบการเติมเงินเข้าระบบ" (client, 2026-10-27).
 *
 * The WIRING is pinned in tests/topup-notify.test.ts (route-level:
 * customers/[id] PATCH 'credit' → notifyTopUp once after commit, debits and
 * rejected credits silent). This file covers what that file mocks away — the
 * REAL notifyTopUp's wire output, i.e. what an operator actually sees in the
 * channel:
 *  - the exact status title + green money-in color + amount/balance fields
 *  - the webhook is resolved ONLY from the environment (never SiteSetting)
 *  - a poisoned env value that is not a Discord webhook sends NOTHING
 *  - the fire-and-forget contract: Discord being down resolves, never throws
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { siteSettingFindUnique } = vi.hoisted(() => ({
  siteSettingFindUnique: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { siteSetting: { findUnique: siteSettingFindUnique } } }));

import { notifyTopUp } from '@/lib/notify';

const WEBHOOK = 'https://discord.com/api/webhooks/123/token';

beforeEach(() => {
  vi.clearAllMocks();
  // No SiteSetting row → the env-fallback branch of getNotificationSettings.
  siteSettingFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env['NK_DISCORD_WEBHOOK_URL'];
  vi.unstubAllGlobals();
});

function stubFetch(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('notifyTopUp — the operator-visible embed', () => {
  it('posts the exact “พบการเติมเงินเข้าระบบ” embed to the env webhook', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = WEBHOOK;
    const fetchMock = stubFetch();

    await notifyTopUp({
      customerEmail: 'somchai@example.test',
      amountThb: 100,
      balanceAfterThb: 320.5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);

    const body = JSON.parse(String(init.body)) as {
      username: string;
      embeds: Array<{
        title?: string;
        description?: string;
        color?: number;
        fields?: Array<{ name: string; value: string }>;
      }>;
    };
    expect(body.username).toBe('Nong-Kati แจ้งเตือน');
    expect(body.embeds).toHaveLength(1);
    const embed = body.embeds[0]!;
    expect(embed.title).toBe('💰 พบการเติมเงินเข้าระบบ');
    expect(embed.description).toContain('somchai@example.test');
    expect(embed.color).toBe(0x2ecc71); // COLORS.SUCCESS — money in
    expect(embed.fields).toEqual([
      { name: 'ยอดเติม', value: '฿100', inline: true },
      { name: 'ยอดคงเหลือ', value: '฿320.5', inline: true },
    ]);
  });

  it('never sends to a non-Discord URL even if the env var is poisoned', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://evil.example.com/api/webhooks/x';
    const fetchMock = stubFetch();

    await notifyTopUp({ customerEmail: 'a@b.test', amountThb: 10, balanceAfterThb: 10 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is silent (no fetch) when the webhook is not configured', async () => {
    const fetchMock = stubFetch();
    await notifyTopUp({ customerEmail: 'a@b.test', amountThb: 10, balanceAfterThb: 10 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves — never rejects — when Discord is unreachable', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = WEBHOOK;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    await expect(
      notifyTopUp({ customerEmail: 'a@b.test', amountThb: 10, balanceAfterThb: 10 }),
    ).resolves.toBeUndefined();
  });
});
