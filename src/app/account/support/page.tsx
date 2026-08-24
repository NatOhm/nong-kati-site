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
        <h1 className="text-2xl font-bold text-ink-100">สนับสนุน</h1>
        <div className="rounded-md border border-jade-700/50 bg-jade-900/10 p-6 text-center">
          <CheckCircle size={32} className="mx-auto mb-3 text-jade-400" />
          <h3 className="mb-2 text-lg font-semibold text-ink-100">ส่งข้อความสำเร็จ</h3>
          <p className="text-sm text-ink-400">
            เราจะตอบกลับภายใน 24 ชั่วโมง ผ่านอีเมลที่คุณลงทะเบียนไว้
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-100">สนับสนุน</h1>

      <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
        <p className="mb-4 text-sm text-ink-400">
          มีปัญหา? ส่งข้อความหาเรา เราจะตอบกลับภายใน 24 ชั่วโมง
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-ink-300">หัวข้อ</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
              placeholder="ปัญหาเกี่ยวกับ..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-ink-300">รายละเอียด</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
              placeholder="อธิบายปัญหาของคุณ..."
            />
          </div>

          <button
            type="submit"
            disabled={loading || !subject || !message}
            className="inline-flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
          >
            <Send size={14} />
            {loading ? 'กำลังส่ง...' : 'ส่งข้อความ'}
          </button>
        </form>
      </div>

      {/* Contact Info */}
      <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
        <h2 className="mb-3 text-lg font-semibold text-ink-100">ช่องทางอื่น</h2>
        <div className="space-y-2 text-sm text-ink-300">
          <p>อีเมล: <a href="mailto:support@nong-kati.co.th" className="text-amber-400 hover:text-amber-300">support@nong-kati.co.th</a></p>
          <p>เวลาทำการ: จันทร์-ศุกร์ 9:00-18:00</p>
        </div>
      </div>
    </div>
  );
}
