/**
 * My Reviews Page — 12-dashboard.md §10.
 * Customer's review history.
 */

import { Star } from 'lucide-react';

const MOCK_REVIEWS = [
  { id: 'rev-001', product: 'Steam Wallet ฿100', rating: 5, body: 'ได้โค้ดเร็วมาก แนะนำเลย', createdAt: new Date('2026-08-21T10:00:00Z') },
  { id: 'rev-002', product: 'Netflix ฿350', rating: 4, body: 'ใช้งานได้ปกติ แต่รอนานนิดหน่อย', createdAt: new Date('2026-08-16T14:30:00Z') },
];

export default function AccountReviewsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-100">รีวิวของฉัน</h1>

      {MOCK_REVIEWS.length === 0 ? (
        <div className="rounded-md border border-ink-700 bg-ink-850 p-8 text-center">
          <p className="text-ink-400">ยังไม่มีรีวิว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_REVIEWS.map((review) => (
            <div key={review.id} className="rounded-md border border-ink-700 bg-ink-850 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-200">{review.product}</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={14}
                      className={star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-ink-600'}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-ink-300">{review.body}</p>
              <p className="mt-2 text-xs text-ink-500">{review.createdAt.toLocaleDateString('th-TH')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
