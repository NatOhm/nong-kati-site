import { afterEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { siteSetting: { findUnique } } }));

import { getNotificationSettings, sendTestDiscordMessage } from '@/lib/notify';

describe('Discord webhook remains an environment secret', () => {
  afterEach(() => {
    delete process.env['NK_DISCORD_WEBHOOK_URL'];
    vi.clearAllMocks();
  });

  it('ignores a legacy webhook stored in SiteSetting', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({ discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/secret', lowStockThreshold: 3 }),
    });
    const settings = await getNotificationSettings();
    expect(settings.discordWebhookUrl).toBeUndefined();
    expect(settings.lowStockThreshold).toBe(3);
  });

  it('uses only the protected environment value for delivery', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/env/secret';
    findUnique.mockResolvedValue({ value: JSON.stringify({ discordWebhookUrl: 'https://discord.com/api/webhooks/old/secret' }) });
    expect((await getNotificationSettings()).discordWebhookUrl).toBe(process.env['NK_DISCORD_WEBHOOK_URL']);
  });
});

describe('sendTestDiscordMessage — one-click webhook probe (settings page button)', () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    delete process.env['NK_DISCORD_WEBHOOK_URL'];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function stubFetch(impl: () => Promise<Response>): void {
    fetchMock.mockImplementation(impl);
    vi.stubGlobal('fetch', fetchMock);
  }

  it('reports WEBHOOK_NOT_CONFIGURED and never fetches when the env var is absent', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    const result = await sendTestDiscordMessage();
    expect(result).toEqual({ ok: false, error: 'WEBHOOK_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an env value that is not a Discord webhook (no fetch, no leak)', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://evil.example.com/api/webhooks/x';
    stubFetch(async () => new Response(null, { status: 204 }));
    const result = await sendTestDiscordMessage();
    expect(result).toEqual({ ok: false, error: 'WEBHOOK_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the test embed to the env webhook and reports ok on 2xx', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/123/abc';
    stubFetch(async () => new Response(null, { status: 204 }));
    const result = await sendTestDiscordMessage();
    expect(result).toEqual({ ok: true, status: 204 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(process.env['NK_DISCORD_WEBHOOK_URL']);
    const body = JSON.parse(String(init.body)) as {
      embeds: Array<{ title?: string }>;
    };
    expect(body.embeds[0]?.title).toContain('ทดสอบ');
  });

  it('reports Discord rejections with their status instead of claiming success', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/123/gone';
    stubFetch(async () => new Response(null, { status: 404 }));
    const result = await sendTestDiscordMessage();
    expect(result).toEqual({ ok: false, status: 404, error: 'HTTP_404' });
  });

  it('reports WEBHOOK_UNREACHABLE on network failure — the truth, not a swallow', async () => {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/123/abc';
    stubFetch(async () => {
      throw new Error('network down');
    });
    const result = await sendTestDiscordMessage();
    expect(result).toEqual({ ok: false, error: 'WEBHOOK_UNREACHABLE' });
  });
});
