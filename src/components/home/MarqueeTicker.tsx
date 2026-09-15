'use client';

const DEALS = [
  '🔥 HBO Max 7 วัน ฿25',
  '📺 Netflix 30 วัน ฿120',
  '🎵 Spotify Premium ฿45',
  '▶️ YouTube Premium ฿7',
  '🎮 Steam Wallet ฿107',
  '📱 Google Play ฿107',
  '🎬 WeTV 30 (÷)4 ฿23',
  '🎥 iQIYI 30 (÷)4 ฿16',
  '📹 Prime Video 7 ฿9',
  '💻 Microsoft 365 ฿18',
  '✂️ CapCut 7 วัน ฿59',
  '📺 ONED 30 ส่วนตัว ฿120',
];

export function MarqueeTicker() {
  return (
    <div className="overflow-hidden border-b border-line-subtle bg-surface py-2">
      <div className="animate-marquee flex whitespace-nowrap">
        {[...DEALS, ...DEALS].map((deal, i) => (
          <span key={i} className="mx-6 text-sm font-medium text-fg-secondary">
            {deal}
          </span>
        ))}
      </div>
    </div>
  );
}
