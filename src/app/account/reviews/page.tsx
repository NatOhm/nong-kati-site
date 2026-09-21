/**
 * My Reviews Page — 12-dashboard.md §10.
 * Customer's review history. NOTE: the schema has no Review table yet
 * (product reviews are a planned feature — RBAC permissions exist but no
 * storage). Showing fabricated reviews here would be dishonest; until the
 * table exists this page renders a truthful coming-soon state.
 */

import { Star } from 'lucide-react';

export default function AccountReviewsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">รีวิวของฉัน</h1>

      <div className="rounded-md border border-line-subtle bg-surface p-8 text-center">
        <div className="mb-3 flex justify-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={18} className="text-fg-placeholder" />
          ))}
        </div>
        <p className="text-sm text-fg-muted">ระบบรีวิวกำลังจะมาเร็ว ๆ นี้</p>
        <p className="mt-1 text-xs text-fg-placeholder">
          เมื่อเปิดใช้งาน รีวิวที่คุณเขียนจะแสดงที่นี่ทั้งหมด
        </p>
      </div>
    </div>
  );
}
