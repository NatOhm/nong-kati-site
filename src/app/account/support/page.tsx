'use client';

/**
 * Support Page — 12-dashboard.md §11.
 * Customer support ticket form.
 */

import { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';

export default function AccountSupportPage(): React.JSX.Element {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock: submit support ticket
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-clay-900">สนับสนุน</h1>
        <div className="rounded-md border border-jade-500/40 bg-jade-500/10 p-6 text-center">
          <CheckCircle size={32} className="text-jade-600 mx-auto mb-3" />
          <h3 className="mb-2 text-lg font-semibold text-clay-900">ส่งข้อความสำเร็จ</h3>
          <p className="text-sm text-clay-500">
            เราจะตอบกลับภายใน 24 ชั่วโมง ผ่านอีเมลที่คุณลงทะเบียนไว้
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">สนับสนุน</h1>

      <div className="rounded-md border border-clay-200 bg-white p-6">
        <p className="mb-4 text-sm text-clay-500">
          มีปัญหา? ส่งข้อความหาเรา เราจะตอบกลับภายใน 24 ชั่วโมง
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-clay-600">หัวข้อ</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
              placeholder="ปัญหาเกี่ยวกับ..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-clay-600">รายละเอียด</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
              placeholder="อธิบายปัญหาของคุณ..."
            />
          </div>

          <button
            type="submit"
            disabled={loading || !subject || !message}
            className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
          >
            <Send size={14} />
            {loading ? 'กำลังส่ง...' : 'ส่งข้อความ'}
          </button>
        </form>
      </div>

      {/* Contact Info */}
      <div className="rounded-md border border-clay-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-clay-900">ช่องทางอื่น</h2>
        <div className="space-y-2 text-sm text-clay-600">
          <p>
            อีเมล:{' '}
            <a
              href="mailto:support@nong-kati.co.th"
              className="text-peach-600 hover:text-peach-700"
            >
              support@nong-kati.co.th
            </a>
          </p>
          <p>เวลาทำการ: จันทร์-ศุกร์ 9:00-18:00</p>
        </div>
      </div>
    </div>
  );
}
