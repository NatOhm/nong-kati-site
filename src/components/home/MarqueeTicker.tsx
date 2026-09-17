'use client';

const DEALS = [
  { icon: '🔥', text: 'HBO Max 7 วัน ฿25' },
  { icon: '📺', text: 'Netflix 30 วัน ฿120' },
  { icon: '🎵', text: 'Spotify Premium ฿45' },
  { icon: '▶️', text: 'YouTube Premium ฿7' },
  { icon: '🎮', text: 'Steam Wallet ฿107' },
  { icon: '📱', text: 'Google Play ฿107' },
  { icon: '🎬', text: 'WeTV 30 แชร์ 4 ฿23' },
  { icon: '🎥', text: 'iQIYI 30 แชร์ 4 ฿16' },
  { icon: '📹', text: 'Prime Video 7 ฿9' },
  { icon: '💻', text: 'Microsoft 365 ฿18' },
  { icon: '✂️', text: 'CapCut 7 วัน ฿59' },
  { icon: '📺', text: 'ONED 30 ส่วนตัว ฿120' },
];

export function MarqueeTicker() {
  return (
    <div className="overflow-hidden border-b border-line-subtle bg-surface py-2">
      <div className="animate-marquee flex whitespace-nowrap">
        {[...DEALS, ...DEALS].map((deal, i) => (
          <span
            key={i}
            className="mx-6 flex items-center gap-1.5 text-sm font-medium text-fg-secondary"
          >
            <span
              className="deal-emoji"
              style={{ animationDelay: `${(i % DEALS.length) * 0.18}s` }}
              aria-hidden="true"
            >
              {deal.icon}
            </span>
            {deal.text}
          </span>
        ))}
      </div>
    </div>
  );
}
