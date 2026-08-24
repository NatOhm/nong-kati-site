'use client';

/**
 * DataRequestForm — 02-user-flow.md UF-17, 07-api.md §18.
 * PDPA data subject request form.
 */

import { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { submitDataRequest, type DataRequestType } from '@/api/dataRequests';

const REQUEST_TYPES: { value: DataRequestType; label: string; description: string }[] = [
  { value: 'access', label: 'ขอเข้าถึงข้อมูล', description: 'ขอรับสำเนาข้อมูลส่วนบุคคลของคุณ' },
  { value: 'correct', label: 'ขอแก้ไขข้อมูล', description: 'ขอแก้ไขข้อมูลส่วนบุคคลที่ไม่ถูกต้อง' },
  { value: 'delete', label: 'ขอลบข้อมูล', description: 'ขอให้ลบหรือทำให้ข้อมูลเป็นนิรนาม' },
  { value: 'port', label: 'ขอโอนย้ายข้อมูล', description: 'ขอรับข้อมูลในรูปแบบที่สามารถโอนย้ายได้' },
];

export function DataRequestForm(): React.JSX.Element {
  const [requestType, setRequestType] = useState<DataRequestType>('access');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await submitDataRequest({
      type: requestType,
      email,
      details,
    });

    if (result.success) {
      setSubmitted(true);
    } else {
      setError(
        result.error === 'INVALID_EMAIL'
          ? 'กรุณากรอกอีเมลที่ถูกต้อง'
          : result.error === 'DETAILS_TOO_SHORT'
          ? 'กรุณาระบุรายละเอียดอย่างน้อย 10 ตัวอักษร'
          : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
      );
    }

    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="rounded-md border border-jade-700/50 bg-jade-900/10 p-6 text-center">
        <CheckCircle size={32} className="mx-auto mb-3 text-jade-400" />
        <h3 className="mb-2 text-lg font-semibold text-ink-100">ส่งคำขอสำเร็จ</h3>
        <p className="text-sm text-ink-400">
          เราจะดำเนินการคำขอภายใน 30 วันทำการ
          ผลลัพธ์จะถูกส่งไปยังอีเมลที่คุณระบุ
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-ink-300">ประเภทคำขอ</label>
        <div className="space-y-2">
          {REQUEST_TYPES.map((type) => (
            <label
              key={type.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                requestType === type.value
                  ? 'border-amber-700 bg-amber-900/10'
                  : 'border-ink-700 hover:border-ink-600'
              )}
            >
              <input
                type="radio"
                name="requestType"
                value={type.value}
                checked={requestType === type.value}
                onChange={(e) => setRequestType(e.target.value as DataRequestType)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm text-ink-100">{type.label}</p>
                <p className="text-xs text-ink-500">{type.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-ink-300">อีเมล</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
          placeholder="your@email.com"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-ink-300">รายละเอียด</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          required
          rows={4}
          className="w-full rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
          placeholder="กรุณาระบุรายละเอียดเพิ่มเติม..."
        />
      </div>

      {error && (
        <p className="text-sm text-crimson-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !details}
        className="inline-flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
      >
        <Send size={14} />
        {loading ? 'กำลังส่ง...' : 'ส่งคำขอ'}
      </button>
    </form>
  );
}
