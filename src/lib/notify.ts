/**
 * Discord notification — client ask: "แจ้งเตือนการสั่งซื้อ (เช่น แจ้งเตือน
 * ผ่าน Discord)" and low-stock alerts. Fire-and-forget: failures must never
 * break the checkout or admin flow, so every send is swallowed.
 *
 * Config lives in SiteSetting key 'notifications' (editable in admin):
 * { discordWebhookUrl: string, lowStockThreshold: number }
 */

import { prisma } from '@/lib/db';

const SETTING_KEY = 'notifications';

export interface NotificationSettings {
  discordWebhookUrl?: string;
  lowStockThreshold?: number;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return {};
    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed === 'object' && parsed !== null) return parsed as NotificationSettings;
    return {};
  } catch {
    return {};
  }
}

async function sendDiscord(content: string): Promise<void> {
  try {
    const cfg = await getNotificationSettings();
    const url = cfg.discordWebhookUrl;
    if (!url || !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(url))
      return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, username: 'Nong-Kati แจ้งเตือน' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Notification failures never break business flows.
  }
}

export async function notifyNewOrder(params: {
  orderNumber: string;
  email: string;
  totalThb: number;
  itemCount: number;
  paymentMethod: string;
}): Promise<void> {
  await sendDiscord(
    `🛒 **ออเดอร์ใหม่** ${params.orderNumber}\n` +
      `ยอด ฿${params.totalThb.toLocaleString()} (${params.itemCount} รายการ)\n` +
      `ชำระผ่าน: ${params.paymentMethod === 'promptpay' ? 'พร้อมเพย์' : params.paymentMethod}\n` +
      `ลูกค้า: ${params.email}`,
  );
}

export async function notifyStockLow(params: {
  productName: string;
  variantLabel: string;
  stock: number;
}): Promise<void> {
  await sendDiscord(
    `⚠️ **สต๊อกใกล้หมด** ${params.productName} (${params.variantLabel})\nเหลือเพียง ${params.stock} ชิ้น`,
  );
}

export async function notifyPaymentConfirmed(params: {
  orderNumber: string;
  totalThb: number;
}): Promise<void> {
  await sendDiscord(
    `✅ **ชำระเงินสำเร็จ** ${params.orderNumber} — ฿${params.totalThb.toLocaleString()} กำลังส่งโค้ด`,
  );
}
