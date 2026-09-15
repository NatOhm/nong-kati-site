/**
 * My Reviews Page — 12-dashboard.md §10.
 * Customer's review history.
 */

import { Star } from 'lucide-react';

const MOCK_REVIEWS = [
  {
    id: 'rev-001',
    product: 'Steam Wallet ฿100',
    rating: 5,
    body: 'ได้โค้ดเร็วมาก แนะนำเลย',
    createdAt: new Date('2026-08-21T10:00:00Z'),
  },
  {
    id: 'rev-002',
    product: 'Netflix ฿350',
    rating: 4,
    body: 'ใช้งานได้ปกติ แต่รอนานนิดหน่อย',
    createdAt: new Date('2026-08-16T14:30:00Z'),
  },
];

export default function AccountReviewsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">รีวิวของฉัน</h1>

      {MOCK_REVIEWS.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-white p-8 text-center">
          <p className="text-fg-placeholder">ยังไม่มีรีวิว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_REVIEWS.map((review) => (
            <div key={review.id} className="rounded-md border border-line-subtle bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-fg-secondary">{review.product}</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={14}
                      className={
                        star <= review.rating
                          ? 'fill-peach-500 text-fg-brand'
                          : 'text-fg-placeholder'
                      }
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-fg-muted">{review.body}</p>
              <p className="text-clay-9000 mt-2 text-xs">
                {review.createdAt.toLocaleDateString('th-TH')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
