/**
 * PDF Generation — Receipts and Tax Invoices.
 * 01-prd.md FR-088-092 — Server-side PDF generation.
 * 06-database.md §12 — Tax invoice sequences.
 * 09-payment.md §8 — LD-13: PDF enqueued after webhook commit.
 *
 * In production: @react-pdf/renderer or puppeteer on Railway worker.
 * For M4/M5 mock: returns a placeholder buffer.
 */

import { formatThb } from '@/lib/pricing';

export interface InvoiceData {
  orderId: string;
  orderNumber: string;
  invoiceNumber: string;
  invoiceType: 'receipt' | 'tax_invoice';
  customerEmail: string;
  items: Array<{
    productNameTh: string;
    skuCode: string;
    denominationThb: number;
    quantity: number;
    unitPriceExVat: number;
    unitVatAmount: number;
    lineTotalThb: number;
  }>;
  subtotalThb: number;
  vatAmountThb: number;
  totalAmountThb: number;
  createdAt: string;
  // Tax invoice specific
  sellerName?: string;
  sellerTaxId?: string;
  sellerAddress?: string;
  buyerName?: string;
  buyerTaxId?: string;
}

export interface PdfGenerationResult {
  success: boolean;
  buffer?: Buffer;
  filename: string;
  contentType: string;
}

// In-memory invoice number sequences (mock)
const receiptSequences = new Map<string, number>();
const taxInvoiceSequences = new Map<string, number>();

/**
 * Generate next receipt number.
 * Format: REC-YYYY-NNNNNN
 */
export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const current = receiptSequences.get(String(year)) ?? 0;
  const next = current + 1;
  receiptSequences.set(String(year), next);
  return `REC-${year}-${String(next).padStart(6, '0')}`;
}

/**
 * Generate next tax invoice number.
 * Format: NK-YYYY-NNNNNN (sequential, non-guessable per FR-092)
 */
export function generateTaxInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const current = taxInvoiceSequences.get(String(year)) ?? 0;
  const next = current + 1;
  taxInvoiceSequences.set(String(year), next);
  return `NK-${year}-${String(next).padStart(6, '0')}`;
}

/**
 * Generate a receipt PDF.
 * 01-prd.md FR-088-089 — Receipt generated for every completed order.
 */
export async function generateReceiptPdf(data: InvoiceData): Promise<PdfGenerationResult> {
  // In production, this renders a real PDF server-side
  // For mock, return a placeholder

  const html = generateReceiptHtml(data);

  return {
    success: true,
    buffer: Buffer.from(html, 'utf8'),
    filename: `receipt-${data.invoiceNumber}.html`,
    contentType: 'text/html; charset=utf-8',
  };
}

/**
 * Generate a tax invoice PDF.
 * 01-prd.md FR-090-092 — Tax invoice only if customer requested at checkout.
 */
export async function generateTaxInvoicePdf(data: InvoiceData): Promise<PdfGenerationResult> {
  if (data.invoiceType !== 'tax_invoice') {
    return {
      success: false,
      filename: '',
      contentType: '',
    };
  }

  const html = generateTaxInvoiceHtml(data);

  return {
    success: true,
    buffer: Buffer.from(html, 'utf8'),
    filename: `tax-invoice-${data.invoiceNumber}.html`,
    contentType: 'text/html; charset=utf-8',
  };
}

/**
 * Generate receipt HTML (mock PDF).
 */
function generateReceiptHtml(data: InvoiceData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td>${item.productNameTh}</td>
        <td>${item.skuCode}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">${formatThb(item.lineTotalThb)}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'IBM Plex Sans Thai', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { color: #f0a020; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
        th { background: #f5f5f5; }
        .total { text-align: right; font-size: 18px; font-weight: bold; color: #f0a020; }
        .footer { margin-top: 40px; text-align: center; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>ใบเสร็จรับเงิน</h1>
      <p><strong>เลขที่:</strong> ${data.invoiceNumber}</p>
      <p><strong>วันที่:</strong> ${new Date(data.createdAt).toLocaleDateString('th-TH')}</p>
      <p><strong>คำสั่งซื้อ:</strong> ${data.orderNumber}</p>
      <p><strong>อีเมล:</strong> ${data.customerEmail}</p>

      <table>
        <thead>
          <tr>
            <th>สินค้า</th>
            <th>SKU</th>
            <th>จำนวน</th>
            <th style="text-align: right;">ราคา</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="total">
        <p>ยอดรวม: ${formatThb(data.subtotalThb)}</p>
        <p>VAT 7%: ${formatThb(data.vatAmountThb)}</p>
        <p>รวมทั้งสิ้น: ${formatThb(data.totalAmountThb)}</p>
      </div>

      <div class="footer">
        <p>Nong-Kati — ซื้อบัตรเกม สตรีมมิ่ง และอีคอมเมิร์ซ ออนไลน์</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate tax invoice HTML (mock PDF).
 * 06-database.md §12 — Includes seller/buyer fields.
 */
function generateTaxInvoiceHtml(data: InvoiceData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td>${item.productNameTh}</td>
        <td>${item.skuCode}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">${formatThb(item.unitPriceExVat)}</td>
        <td style="text-align: right;">${formatThb(item.unitVatAmount)}</td>
        <td style="text-align: right;">${formatThb(item.lineTotalThb)}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'IBM Plex Sans Thai', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
        th { background: #f5f5f5; }
        .total { text-align: right; font-size: 18px; font-weight: bold; }
        .seller-info { margin: 20px 0; padding: 15px; border: 1px solid #eee; }
      </style>
    </head>
    <body>
      <h1>ใบกำกับภาษี</h1>
      <p><strong>เลขที่:</strong> ${data.invoiceNumber}</p>
      <p><strong>วันที่:</strong> ${new Date(data.createdAt).toLocaleDateString('th-TH')}</p>

      <div class="seller-info">
        <h3>ผู้จำหน่าย</h3>
        <p>ชื่อ: ${data.sellerName ?? 'Nong-Kati'}</p>
        <p>เลขประจำตัวผู้เสียภาษี: ${data.sellerTaxId ?? '0-0000-00000-00-0'}</p>
        <p>ที่อยู่: ${data.sellerAddress ?? '-'}</p>
      </div>

      <div class="seller-info">
        <h3>ผู้ซื้อ</h3>
        <p>ชื่อ: ${data.buyerName ?? '-'}</p>
        <p>เลขประจำตัวผู้เสียภาษี: ${data.buyerTaxId ?? '-'}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th>สินค้า</th>
            <th>SKU</th>
            <th>จำนวน</th>
            <th style="text-align: right;">ราคา (ก่อน VAT)</th>
            <th style="text-align: right;">VAT</th>
            <th style="text-align: right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="total">
        <p>ยอดรวม (ก่อน VAT): ${formatThb(data.subtotalThb)}</p>
        <p>VAT 7%: ${formatThb(data.vatAmountThb)}</p>
        <p>รวมทั้งสิ้น: ${formatThb(data.totalAmountThb)}</p>
      </div>
    </body>
    </html>
  `;
}
