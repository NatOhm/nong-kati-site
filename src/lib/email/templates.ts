/**
 * Email Templates — Order confirmation and manual fulfilment alert.
 * 17-folder.md §14 — lib/email/templates/
 *
 * Templates are HTML strings with Thai content.
 * In production, these would use React Email or similar.
 */

import { formatThb } from '@/lib/pricing';

export interface OrderConfirmationData {
  orderNumber: string;
  customerEmail: string;
  items: Array<{
    productNameTh: string;
    denomination: number;
    quantity: number;
    code?: string;
  }>;
  subtotalThb: number;
  vatAmountThb: number;
  totalAmountThb: number;
  confirmationUrl: string;
}

export interface ManualFulfilmentData {
  orderNumber: string;
  customerEmail: string;
  items: Array<{
    productNameTh: string;
    denomination: number;
    quantity: number;
  }>;
}

/**
 * Order confirmation email — sent after code delivery.
 * Includes gift codes and receipt download link.
 */
export function orderConfirmationTemplate(data: OrderConfirmationData): {
  subject: string;
  html: string;
} {
  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.productNameTh}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatThb(item.denomination * item.quantity)}</td>
    </tr>
    ${item.code ? `
    <tr>
      <td colspan="3" style="padding: 8px 12px; background: #f8f8f8; font-family: monospace; font-size: 14px; letter-spacing: 0.1em;">
        โค้ด: ${item.code}
      </td>
    </tr>
    ` : ''}
  `,
    )
    .join('');

  return {
    subject: `ยืนยันคำสั่งซื้อ ${data.orderNumber} — Nong-Kati`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'IBM Plex Sans Thai', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #f0a020; text-align: center;">✅ ชำระเงินสำเร็จ!</h1>

        <p>คำสั่งซื้อ <strong>${data.orderNumber}</strong></p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 12px; text-align: left;">สินค้า</th>
              <th style="padding: 12px; text-align: center;">จำนวน</th>
              <th style="padding: 12px; text-align: right;">ราคา</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin: 20px 0;">
          <p>ยอดรวม: ${formatThb(data.subtotalThb)}</p>
          <p>VAT 7%: ${formatThb(data.vatAmountThb)}</p>
          <p style="font-size: 18px; font-weight: bold; color: #f0a020;">รวมทั้งสิ้น: ${formatThb(data.totalAmountThb)}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.confirmationUrl}" style="display: inline-block; padding: 12px 24px; background: #f0a020; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ดูคำสั่งซื้อและโค้ด
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="font-size: 12px; color: #888; text-align: center;">
          Nong-Kati — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ ออนไลน์
        </p>
      </body>
      </html>
    `,
  };
}

/**
 * Manual fulfilment alert email — sent when code delivery fails.
 * 10-digital-code.md §9.1 — Admin alert for pending_manual_fulfilment.
 */
export function manualFulfilmentAlertTemplate(data: ManualFulfilmentData): {
  subject: string;
  html: string;
} {
  return {
    subject: `⚠ คำสั่งซื้อ ${data.orderNumber} ต้องการส่งโค้ดด้วยตนเอง`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'IBM Plex Sans Thai', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #c41230;">⚠ คำสั่งซื้อต้องการส่งโค้ดด้วยตนเอง</h1>

        <p>คำสั่งซื้อ <strong>${data.orderNumber}</strong></p>
        <p>อีเมลลูกค้า: ${data.customerEmail}</p>

        <h3>สินค้า:</h3>
        <ul>
          ${data.items.map((item) => `<li>${item.productNameTh} × ${item.quantity} — ${formatThb(item.denomination * item.quantity)}</li>`).join('')}
        </ul>

        <p style="color: #c41230; font-weight: bold;">
          สาเหตุ: ไม่มีโค้ดในคลัง ณ เวลาชำระเงิน
        </p>

        <p>กรุณาเข้าสู่ระบบ admin เพื่อมอบหมายโค้อด้วยตนเอง</p>
      </body>
      </html>
    `,
  };
}
