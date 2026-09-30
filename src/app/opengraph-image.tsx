import { ImageResponse } from 'next/og';

/**
 * Sitewide default OG/Twitter card (file convention — Next also emits
 * twitter:image from this when no twitter-image is defined).
 *
 * Latin-only on purpose: satori renders without system fonts, so Thai glyphs
 * would fall back to tofu boxes. The brand wordmark + English tagline stays
 * readable in every social preview; individual product pages still override
 * og:image with the product artwork.
 */
export const alt = 'Nong-Kati — game, streaming and e-commerce gift cards';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 55%, #FDBA74 100%)',
        }}
      >
        {/* Brand mark — the clay hamster silhouette, kept simple for satori */}
        <div
          style={{
            width: 150,
            height: 130,
            borderRadius: '50% 50% 46% 46%',
            background: '#FB923C',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 66, height: 40, borderRadius: '46%', background: '#FFF7ED' }} />
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 88,
            fontWeight: 700,
            color: '#4E3820',
            letterSpacing: -2,
          }}
        >
          Nong-Kati
        </div>
        <div style={{ display: 'flex', fontSize: 38, color: '#8C6D46' }}>
          Game · Streaming · E-commerce gift cards
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 12,
            padding: '14px 46px',
            borderRadius: 999,
            background: '#F97316',
            color: '#FFFFFF',
            fontSize: 30,
            fontWeight: 600,
          }}
        >
          Pay by bank transfer · slip verified
        </div>
      </div>
    ),
    { ...size },
  );
}
