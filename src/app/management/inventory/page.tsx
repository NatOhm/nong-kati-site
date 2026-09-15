'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, AlertTriangle } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { seedProducts } from '@/seed-data/products';
import { getAvailableCodeCount } from '@/lib/delivery/reservation';
import {
  parseCsv,
  processCsvRows,
  generateUploadSummary,
  type UploadResult,
} from '@/lib/inventory/csvUpload';
import { initMockCodes } from '@/lib/delivery/reservation';
import { cn } from '@/utils/cn';

/**
 * Admin Inventory Management page — 10-digital-code.md §4.
 * View stock levels, upload CSV codes, manual code entry.
 */
export default function AdminInventoryPage(): React.JSX.Element {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get all variants with stock info
  const allVariants = seedProducts.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      skuCode: v.skuCode,
      productName: p.nameTh,
      faceValue: v.faceValueThb,
      status: v.status,
      availableCount: getAvailableCodeCount(v.id),
    })),
  );

  // Handle CSV upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const content = await file.text();
      const rows = parseCsv(content);
      const results = processCsvRows(rows);
      const summary = generateUploadSummary(results);

      // Initialize mock codes for testing
      if (selectedVariant) {
        const acceptedRows = results.filter((r) => r.status === 'accepted');
        const codes = acceptedRows.map((_, idx) => `MOCK-CODE-${Date.now()}-${idx}`);
        initMockCodes(selectedVariant, codes);
      }

      setUploadResult(summary);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'คลังสินค้า' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-clay-900">คลังสินค้า</h1>

        {/* Inventory Table */}
        <div className="overflow-x-auto rounded-md border border-clay-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clay-200 bg-clay-100">
                <th className="px-4 py-3 text-left font-medium text-clay-600">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-clay-600">สินค้า</th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">มูลค่า</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">พร้อมใช้</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {allVariants.map((variant) => (
                <tr key={variant.id} className="border-b border-clay-200 hover:bg-white">
                  <td className="px-4 py-3 font-mono text-xs text-clay-600">{variant.skuCode}</td>
                  <td className="px-4 py-3 text-clay-900">{variant.productName}</td>
                  <td className="px-4 py-3 text-right text-clay-700">฿{variant.faceValue}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        'font-medium',
                        variant.availableCount === 0
                          ? 'text-coral-600'
                          : variant.availableCount <= 20
                            ? 'text-peach-600'
                            : 'text-jade-600',
                      )}
                    >
                      {variant.availableCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {variant.availableCount === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-coral-600">
                        <AlertTriangle size={12} />
                        หมด
                      </span>
                    ) : variant.availableCount <= 20 ? (
                      <span className="text-xs text-peach-600">ใกล้หมด</span>
                    ) : (
                      <span className="text-jade-600 text-xs">ปกติ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedVariant(variant.id)}
                      className="rounded bg-peach-100 px-3 py-1.5 text-xs font-medium text-peach-600 hover:bg-peach-200"
                    >
                      อัปโหลดโค้ด
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Upload Section */}
        {selectedVariant && (
          <div className="rounded-md border border-clay-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-clay-900">
              อัปโหลดโค้ด — {allVariants.find((v) => v.id === selectedVariant)?.skuCode}
            </h2>

            <div className="mb-4 rounded-md border border-dashed border-clay-300 bg-clay-100 p-8 text-center">
              <FileText size={32} className="mx-auto mb-2 text-clay-500" />
              <p className="mb-2 text-sm text-clay-600">
                ลากไฟล์ CSV มาที่นี่ หรือคลิกเพื่อเลือกไฟล์
              </p>
              <p className="mb-4 text-xs text-clay-500">
                รูปแบบ: code,expires_at,notes (คอลัมน์แรกเป็นโค้ด, คอลัมน์ที่สองเป็นวันหมดอายุ)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  uploading
                    ? 'bg-clay-300 text-clay-500'
                    : 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400',
                )}
              >
                <Upload size={16} />
                {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์ CSV'}
              </button>
            </div>

            {/* Upload Result */}
            {uploadResult && (
              <div
                className={cn(
                  'rounded-md border p-4',
                  uploadResult.rejectedCount > 0
                    ? 'border-peach-300 bg-peach-50'
                    : 'border-jade-500/40 bg-jade-500/10',
                )}
              >
                <h3 className="mb-2 font-medium text-clay-900">ผลการอัปโหลด</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-clay-500">ทั้งหมด</p>
                    <p className="font-bold text-clay-900">{uploadResult.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-clay-500">นำเข้าสำเร็จ</p>
                    <p className="font-bold text-jade-700">{uploadResult.importedCount}</p>
                  </div>
                  <div>
                    <p className="text-clay-500">ปฏิเสธ</p>
                    <p className="font-bold text-coral-600">{uploadResult.rejectedCount}</p>
                  </div>
                </div>

                {uploadResult.rejectionDetails.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-clay-600">รายละเอียดการปฏิเสธ:</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {uploadResult.rejectionDetails.map((detail, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-clay-500">
                          <span>Row {detail.row}:</span>
                          <span className="font-mono">{detail.codeMasked ?? '—'}</span>
                          <span className="text-coral-600">{detail.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setSelectedVariant(null)}
              className="mt-4 text-sm text-clay-500 hover:text-clay-900"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
