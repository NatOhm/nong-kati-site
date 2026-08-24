'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, AlertTriangle } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { seedProducts } from '@/seed-data/products';
import { getAvailableCodeCount } from '@/lib/delivery/reservation';
import { parseCsv, processCsvRows, generateUploadSummary, type UploadResult } from '@/lib/inventory/csvUpload';
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
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'คลังสินค้า' }]}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink-100">คลังสินค้า</h1>

        {/* Inventory Table */}
        <div className="overflow-x-auto rounded-md border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800">
                <th className="px-4 py-3 text-left font-medium text-ink-300">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">สินค้า</th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">มูลค่า</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">พร้อมใช้</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {allVariants.map((variant) => (
                <tr key={variant.id} className="border-b border-ink-700/50 hover:bg-ink-850">
                  <td className="px-4 py-3 font-mono text-xs text-ink-300">{variant.skuCode}</td>
                  <td className="px-4 py-3 text-ink-100">{variant.productName}</td>
                  <td className="px-4 py-3 text-right text-ink-200">฿{variant.faceValue}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'font-medium',
                      variant.availableCount === 0 ? 'text-crimson-400' :
                      variant.availableCount <= 20 ? 'text-amber-400' : 'text-jade-400',
                    )}>
                      {variant.availableCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {variant.availableCount === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-crimson-400">
                        <AlertTriangle size={12} />
                        หมด
                      </span>
                    ) : variant.availableCount <= 20 ? (
                      <span className="text-xs text-amber-400">ใกล้หมด</span>
                    ) : (
                      <span className="text-xs text-jade-400">ปกติ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedVariant(variant.id)}
                      className="rounded bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/50"
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
          <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
            <h2 className="mb-4 text-lg font-semibold text-ink-100">
              อัปโหลดโค้ด — {allVariants.find((v) => v.id === selectedVariant)?.skuCode}
            </h2>

            <div className="mb-4 rounded-md border border-dashed border-ink-600 bg-ink-800 p-8 text-center">
              <FileText size={32} className="mx-auto mb-2 text-ink-400" />
              <p className="mb-2 text-sm text-ink-300">
                ลากไฟล์ CSV มาที่นี่ หรือคลิกเพื่อเลือกไฟล์
              </p>
              <p className="mb-4 text-xs text-ink-400">
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
                    ? 'bg-ink-700 text-ink-400'
                    : 'bg-amber-400 text-ink-900 hover:bg-amber-300',
                )}
              >
                <Upload size={16} />
                {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์ CSV'}
              </button>
            </div>

            {/* Upload Result */}
            {uploadResult && (
              <div className={cn(
                'rounded-md border p-4',
                uploadResult.rejectedCount > 0 ? 'border-amber-700/50 bg-amber-900/10' : 'border-jade-700/50 bg-jade-900/10',
              )}>
                <h3 className="mb-2 font-medium text-ink-100">ผลการอัปโหลด</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-ink-400">ทั้งหมด</p>
                    <p className="font-bold text-ink-100">{uploadResult.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">นำเข้าสำเร็จ</p>
                    <p className="font-bold text-jade-300">{uploadResult.importedCount}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">ปฏิเสธ</p>
                    <p className="font-bold text-crimson-300">{uploadResult.rejectedCount}</p>
                  </div>
                </div>

                {uploadResult.rejectionDetails.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-ink-300">รายละเอียดการปฏิเสธ:</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {uploadResult.rejectionDetails.map((detail, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-ink-400">
                          <span>Row {detail.row}:</span>
                          <span className="font-mono">{detail.codeMasked ?? '—'}</span>
                          <span className="text-crimson-400">{detail.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setSelectedVariant(null)}
              className="mt-4 text-sm text-ink-400 hover:text-ink-200"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
