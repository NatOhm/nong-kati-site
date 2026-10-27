/**
 * Discord notification — client ask: "แจ้งเตือนการสั่งซื้อ (เช่น แจ้งเตือน
 * ผ่าน Discord)" and low-stock alerts. Fire-and-forget: failures must never
 * break the checkout or admin flow, so every send is swallowed.
 *
 * The webhook lives only in the server environment as
 * NK_DISCORD_WEBHOOK_URL. SiteSetting key 'notifications' stores the
 * non-secret lowStockThreshold, editable in admin.
 */

import { prisma } from '@/lib/db';

const SETTING_KEY = 'notifications';

/** The ONLY accepted webhook shape — env value must match it to be used. */
const DISCORD_WEBHOOK_RE = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//;

export interface NotificationSettings {
  discordWebhookUrl?: string;
  lowStockThreshold?: number;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) {
      const webhook = process.env['NK_DISCORD_WEBHOOK_URL'];
      return webhook ? { discordWebhookUrl: webhook } : {};
    }
    const parsed: unknown = JSON.parse(row.value);
    const lowStockThreshold =
      typeof parsed === 'object' && parsed !== null &&
      Number.isInteger((parsed as Record<string, unknown>)['lowStockThreshold'])
        ? Number((parsed as Record<string, unknown>)['lowStockThreshold'])
        : undefined;
    const webhook = process.env['NK_DISCORD_WEBHOOK_URL'];
    return {
      ...(webhook ? { discordWebhookUrl: webhook } : {}),
      ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
    };
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
    if (!url || !DISCORD_WEBHOOK_RE.test(url))
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

export interface DiscordTestResult {
  ok: boolean;
  /** Discord's HTTP status when the request went out. */
  status?: number;
  /** WEBHOOK_NOT_CONFIGURED | HTTP_<code> | WEBHOOK_UNREACHABLE */
  error?: string;
}

/**
 * Send a one-off test embed so an admin can confirm the webhook setup from
 * the settings page in one click (client ask 2026-10-16).
 *
 * Unlike the production notifications above (fire-and-forget — a Discord
 * outage must never break checkout), THIS function exists to report the
 * truth: configured or not, accepted or rejected, reachable or not. The
 * webhook URL itself is never included in the result — only the outcome.
 */
export async function sendTestDiscordMessage(): Promise<DiscordTestResult> {
  const url = process.env['NK_DISCORD_WEBHOOK_URL'];
  if (!url || !DISCORD_WEBHOOK_RE.test(url)) {
    return { ok: false, error: 'WEBHOOK_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Nong-Kati แจ้งเตือน',
        embeds: [
          {
            title: '🧪 ข้อความทดสอบ',
            description:
              'ตั้งค่า Discord webhook สำเร็จ — ต่อไปนี้การแจ้งเตือนออเดอร์ใหม่ การชำระเงิน และสต๊อกใกล้หมด จะเข้าห้องนี้อัตโนมัติ',
            color: COLORS.SUCCESS,
            footer: { text: 'Nong-Kati — ทดสอบจากหน้าตั้งค่าการแจ้งเตือน' },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP_${res.status}` };
  } catch {
    return { ok: false, error: 'WEBHOOK_UNREACHABLE' };
  }
}

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

/**
 * A deposit into a customer's wallet (admin top-up). Money arriving is the
 * one balance change an operator should not have to discover by opening the
 * customers list — same reasoning as notifyRefundIssued, opposite direction.
 * Fire-and-forget: a Discord outage must never fail the credit transaction.
 */
export async function notifyTopUp(params: {
  customerEmail: string;
  amountThb: number;
  balanceAfterThb: number;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `💰 พบการเติมเงินเข้าระบบ`,
      description: `ลูกค้า **${params.customerEmail}** เติมเงินเข้าระบบ`,
      color: COLORS.SUCCESS,
      fields: [
        {
          name: 'ยอดเติม',
          value: `฿${params.amountThb.toLocaleString('th-TH')}`,
          inline: true,
        },
        {
          name: 'ยอดคงเหลือ',
          value: `฿${params.balanceAfterThb.toLocaleString('th-TH')}`,
          inline: true,
        },
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
      // "หมดอายุ" means *expired* — wrong for a zero-balance alert. The
      // function had zero call sites, so nobody ever saw it. Fixed as the
      // first caller was added (2026-10-27).
      title: `🚫 สต๊อกหมด`,
      description: `**${params.productName}** (${params.variantLabel})\nสต๊อกไม่เหลือแล้ว — ไม่สามารถขายได้`,
      color: COLORS.ERROR,
      footer: { text: 'พิจารณาจัดสต๊อกหรือระงับสินค้า' },
    },
  ]);
}

/**
 * Refunds are money leaving the business — the one event an operator must not
 * learn about by opening the orders list. Fired after the refund transaction
 * COMMITS (never inside it): this is fire-and-forget, and a hung webhook must
 * not extend a serializable transaction that voids gift codes.
 */
export async function notifyRefundIssued(params: {
  orderNumber: string;
  amountThb: number;
  codesVoided: number;
  reasonCategory?: string;
}): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `↩️ คืนเงินออเดอร์`,
      description: `ออเดอร์ **${params.orderNumber}** ถูกคืนเงินแล้ว\nยกเลิกโค้ดไป **${params.codesVoided}** รหัส`,
      color: COLORS.ERROR,
      fields: [
        {
          name: 'ยอดเงิน',
          value: `฿${params.amountThb.toLocaleString('th-TH')}`,
          inline: true,
        },
        ...(params.reasonCategory
          ? [{ name: 'เหตุผล', value: params.reasonCategory, inline: true }]
          : []),
      ],
      footer: { text: 'Nong-Kati — ระบบอัตโนมัติ' },
    },
  ]);
}

/**
 * ONE message per sweep, never one per order: this tick runs every 10 minutes
 * and abandoned checkouts are common, so per-row messages would bury the
 * channel in noise — and an operator who mutes a noisy channel stops reading
 * the payment alerts in it too.
 */
export async function notifyOrderExpired(params: { count: number }): Promise<void> {
  await sendDiscordEmbed([
    {
      title: `⏳ ออเดอร์หมดเวลาชำระ`,
      description: `ครั้งนี้ระบบยกเลิกออเดอร์ที่ไม่ชำระเงิน **${params.count}** รายการ`,
      color: COLORS.WARNING,
      footer: { text: 'ไม่มีสต๊อกถูกกักไว้ — ตัดรอบทุก 10 นาที' },
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
