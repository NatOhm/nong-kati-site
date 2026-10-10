import { afterEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { siteSetting: { findUnique } } }));

import { getNotificationSettings } from '@/lib/notify';

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
