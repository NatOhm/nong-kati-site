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

async function sendDiscordEmbed(embeds: Array<{
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
}>): Promise<void> {
  try {
    const cfg = await getNotificationSettings();
    const url = cfg.discordWebhookUrl;
    if (!url || !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(url))
      return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Nong-Kati แจ้งเตือน',
        embeds: embeds.map((e) => ({
          title: e.title,
          description: e.description,
          color: e.color ?? 5814783, // peach default
          fields: e.fields?.map((f) => ({
            name: f.name,
            value: f.value,
            inline: f.inline ?? false,
          })),
          footer: e.footer ? { text: e.footer.text } : undefined,
        })),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Notification failures never break business flows.
  }
}

/** Color constants for Discord embeds */
const COLORS = {
  SUCCESS: 0x2ecc71,       // green
  WARNING: 0xf39c12,       // orange
  ERROR: 0xe74c3c,         // red
  INFO: 0x3498db,          // blue
  PROMOTION: 0x9b59b6,     // purple
} as const;

export async function notifyNewOrder(params: {
  orderNumber: string;
  email: string;
  totalThb: number;
  itemCount: number;
  paymentMethod: string;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `🛒 ออเดอร์ใหม่: ${params.orderNumber}`,
      color: COLORS.INFO,
      fields: [
        { name: 'ยอดรวม', value: `฿${params.totalThb.toLocaleString('th-TH')}`, inline: true },
        { name: 'จำนวนรายการ', value: String(params.itemCount), inline: true },
        { name: 'ช่องทางชำระเงิน', value: params.paymentMethod === 'promptpay' ? 'พร้อมเพย์' : params.paymentMethod, inline: true },
        { name: 'ลูกค้า', value: params.email, inline: false },
      ],
      footer: { text: 'Nong-Kati — ระบบอัตโนมัติ' },
    },
  ]);
}

export async function notifyStockLow(params: {
  productName: string;
  variantLabel: string;
  stock: number;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `⚠️ สต๊อกใกล้หมด`,
      description: `**${params.productName}** (${params.variantLabel})\nเหลือเพียง **${params.stock}** ชิ้น`,
      color: COLORS.WARNING,
      footer: { text: 'กรุณาพิจารณาดำเนินการสต๊อก' },
    },
  ]);
}

export async function notifyStockOutOf(params: {
  productName: string;
  variantLabel: string;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `🚫 สต๊อกหมดอายุ`,
      description: `**${params.productName}** (${params.variantLabel})\nสต๊อกไม่เหลือแล้ว — ไม่สามารถขายได้`,
      color: COLORS.ERROR,
      footer: { text: 'พิจารณาจัดสต๊อกหรือระงับสินค้า' },
    },
  ]);
}

export async function notifyPaymentConfirmed(params: {
  orderNumber: string;
  totalThb: number;
  customerEmail?: string;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `✅ การชำระเงินสำเร็จ`,
      description: `ออเดอร์ **${params.orderNumber}** ได้รับการยืนยันการชำระเงินแล้ว\nกำลังดำเนินการส่งโค้ดให้ลูกค้า`,
      color: COLORS.SUCCESS,
      fields: [
        { name: 'ยอดเงิน', value: `฿${params.totalThb.toLocaleString('th-TH')}`, inline: true },
        ...(params.customerEmail ? [{ name: 'ลูกค้า', value: params.customerEmail, inline: true }] : []),
      ],
      footer: { text: 'โค้ดจะถูกส่งไปยังอีเมลของลูกค้าโดยอัตโนมัติ' },
    },
  ]);
}

export async function notifyPromotionPublished(params: {
  promotionName: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
  scope: 'all' | 'selected';
  expiresAt?: string;
}): Promise<void> {
  const now = new Date();
  const expires = params.expiresAt ? new Date(params.expiresAt) : null;
  
  await sendDiscordEmbed([
    {
      title: `🎉 โปรโมชันเปิดใช้งาน: ${params.promotionName}`,
      description: `ส่วนลด **${params.discountType === 'percent' ? `${params.discountValue}%` : `฿${params.discountValue.toLocaleString('th-TH')}`}** เริ่มใช้งานแล้ว`,
      color: COLORS.PROMOTION,
      fields: [
        { name: 'ประเภท', value: params.discountType === 'percent' ? 'ลดเปอร์เซ็นต์' : 'ลดจำนวนเงิน', inline: true },
        { name: 'ขอบเขต', value: params.scope === 'all' ? 'ทุกสินค้าในร้าน' : 'สินค้าเจาะจง', inline: true },
        ...(expires ? [{ name: 'หมดอายุ', value: expires.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), inline: true }] : []),
      ],
      footer: { text: `เปิดใช้งานเมื่อ ${now.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` },
    },
  ]);
}

export async function notifyPromotionExpired(params: {
  promotionName: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `⏰ โปรโมชันหมดอายุ: ${params.promotionName}`,
      description: `ส่วนลด **${params.discountType === 'percent' ? `${params.discountValue}%` : `฿${params.discountValue.toLocaleString('th-TH')}`}** ใช้งานไม่ได้แล้ว`,
      color: COLORS.ERROR,
      footer: { text: 'โปรโมชันนี้ไม่สามารถใช้ได้อีกต่อไป' },
    },
  ]);
}

export async function notifyPaymentPending(params: {
  orderNumber: string;
  totalThb: number;
  customerEmail: string;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `⏳ การชำระเงินรอดำเนินการ: ${params.orderNumber}`,
      description: `ออเดอร์นี้รอการยืนยันการชำระเงิน\nกรุณาตรวจสอบและดำเนินการให้เรียบร้อย`,
      color: COLORS.WARNING,
      fields: [
        { name: 'ยอดเงินที่ต้องชำระ', value: `฿${params.totalThb.toLocaleString('th-TH')}`, inline: true },
        { name: 'ลูกค้า', value: params.customerEmail, inline: true },
      ],
      footer: { text: 'กดตรวจสอบการชำระเงินในระบบ admin' },
    },
  ]);
}
