/**
 * Magic Link email — content + delivery via the Resend client.
 *
 * Subject/body are Thai-first (the storefront's language) with the sign-in
 * URL as the only call to action. Delivery failures are returned honestly
 * to the caller (the API route still answers uniformly to the client).
 */

import { sendEmail } from '@/lib/email/resend';

export async function sendMagicLinkEmail(params: {
  to: string;
  url: string;
  expiresAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const expiryTh = params.expiresAt.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });

  const html = `
<div style="font-family:'Noto Sans Thai',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="color:#4E3820;margin:0 0 8px;">เข้าสู่ระบบ Nong-Kati</h2>
  <p style="color:#6B4F2E;margin:0 0 20px;">กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ — ไม่ต้องใช้รหัสผ่าน</p>
  <a href="${params.url}"
     style="display:inline-block;background:#C2410C;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;">
    เข้าสู่ระบบ
  </a>
  <p style="color:#8C6D46;font-size:13px;margin:20px 0 4px;">
    ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุ ${expiryTh} (น. ไทย)
  </p>
  <p style="color:#8C6D46;font-size:13px;margin:0;">
    ถ้าคุณไม่ได้ขอลิงก์นี้ ไม่ต้องทำอะไร — อีเมลฉบับนี้ปลอดภัยที่จะลบทิ้ง
  </p>
</div>`;

  const text = `เข้าสู่ระบบ Nong-Kati: ${params.url}\nลิงก์ใช้ได้ครั้งเดียว หมดอายุ ${expiryTh} น. ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร`;

  const result = await sendEmail({
    to: params.to,
    subject: 'ลิงก์เข้าสู่ระบบ Nong-Kati (หมดอายุใน 15 นาที)',
    html,
    text,
  });

  return result.success ? { ok: true } : { ok: false, error: result.error ?? 'EMAIL_SEND_FAILED' };
}
