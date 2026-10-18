import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

import { getOgShareSettings } from '@/lib/data';
import { DEFAULT_OG_SHARE } from '@/lib/ogShareSettings';

/**
 * Sitewide default OG/Twitter card (file convention — Next also emits
 * twitter:image from this when no twitter-image is defined).
 *
 * v3 (client ask — 17 Oct 2026): full claymorphism + hamster pass.
 *  - One pillowy clay panel using the site's .clay-card recipe (dual outer
 *    shadow + white top-left / peach bottom-right inset light).
 *  - The real mascot: HamsterMascot from ClayIcons, same viewBox coordinates,
 *    layered ears → flat body → CSS radial-gradient volume → features so the
 *    card still looks right if satori drops either gradient form.
 *  - Gift card wears hamster ears; faint PawIcon prints decorate the panel.
 *
 * Thai glyphs need an explicit satori font — the display face (Mitr, the same
 * family the site ships as woff2) is vendored as TTF in public/fonts/ and
 * read from disk; if missing, the card falls back to next/og's built-in
 * Latin font (pass `fonts` only when the read succeeds).
 *
 * Individual product pages still override og:image with the product artwork.
 */
export const alt = 'Nong-Kati — แอคดูหนัง ซีรีส์ ส่งถึงอีเมลทันที';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The copy comes from SiteSetting['ogShare'] at request time (admin edits it
// live at /management/og-share), so the card must never be prerendered at
// build time — that would bake the defaults in and need a DB during build.
export const dynamic = 'force-dynamic';

type MitrFace = { name: string; data: Buffer; weight: 500 | 600 | 700; style: 'normal' };

let mitrFaces: MitrFace[] | null = null;

function loadMitrFaces(): MitrFace[] {
  if (mitrFaces) return mitrFaces;
  const weights: Array<[string, 500 | 600 | 700]> = [
    ['Mitr-Medium.ttf', 500],
    ['Mitr-SemiBold.ttf', 600],
    ['Mitr-Bold.ttf', 700],
  ];
  const faces: MitrFace[] = [];
  for (const [file, weight] of weights) {
    try {
      faces.push({
        name: 'Mitr',
        data: readFileSync(path.join(process.cwd(), 'public', 'fonts', file)),
        weight,
        style: 'normal',
      });
    } catch {
      // Font unavailable — fall back to the built-in Latin face below.
      return (mitrFaces = []);
    }
  }
  return (mitrFaces = faces);
}

/** Faint paw print — PawIcon from ClayIcons, same paths/coordinates. */
function PawPrint({ size, opacity }: { size: number; opacity: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      opacity={opacity}
      style={{ display: 'flex' }}
      aria-hidden="true"
    >
      <ellipse cx="6.2" cy="9.5" rx="2.3" ry="2.9" fill="#C2A57F" transform="rotate(-18 6.2 9.5)" />
      <ellipse
        cx="17.8"
        cy="9.5"
        rx="2.3"
        ry="2.9"
        fill="#C2A57F"
        transform="rotate(18 17.8 9.5)"
      />
      <ellipse cx="10" cy="6.4" rx="2.2" ry="2.8" fill="#C2A57F" transform="rotate(-6 10 6.4)" />
      <ellipse cx="14" cy="6.4" rx="2.2" ry="2.8" fill="#C2A57F" transform="rotate(6 14 6.4)" />
      <path
        d="M12 11c3.6 0 6.2 2.4 6.2 5.2 0 2.3-1.9 3.8-4 3.8-0.9 0-1.5-0.3-2.2-0.3s-1.3 0.3-2.2 0.3c-2.1 0-4-1.5-4-3.8C5.8 13.4 8.4 11 12 11Z"
        fill="#A98B63"
      />
      <circle cx="9.2" cy="5.6" r="0.7" fill="#FFFFFF" opacity="0.5" />
      <circle cx="13.2" cy="5.6" r="0.7" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}

/**
 * The site mascot (HamsterMascot from ClayIcons — viewBox 0 0 120 108).
 * Layered: ears svg (behind) → flat body → radial-gradient volume → features
 * svg, so a dropped gradient form degrades to the flat clay fill.
 */
function Mascot({ width }: { width: number }): React.JSX.Element {
  const height = width * 0.9; // 120 × 108 aspect
  return (
    <div style={{ position: 'relative', width, height, display: 'flex' }}>
      {/* ears — behind the head */}
      <svg
        width={width}
        height={height}
        viewBox="0 0 120 108"
        fill="none"
        style={{ position: 'absolute', left: 0, top: 0 }}
        aria-hidden="true"
      >
        <circle cx="30" cy="18" r="11" fill="#FDBA74" />
        <circle cx="90" cy="18" r="11" fill="#FDBA74" />
        <circle cx="30" cy="18" r="5.5" fill="#FFEDD5" />
        <circle cx="90" cy="18" r="5.5" fill="#FFEDD5" />
      </svg>
      {/* body — flat clay base */}
      <div
        style={{
          position: 'absolute',
          left: width * (16 / 120),
          top: height * (20 / 108),
          width: width * (88 / 120),
          height: height * (80 / 108),
          borderRadius: '50%',
          background: '#FDBA74',
          display: 'flex',
        }}
      />
      {/* body — clay volume (dual lighting like hamsterFaceBody/hamsterBody) */}
      <div
        style={{
          position: 'absolute',
          left: width * (16 / 120),
          top: height * (20 / 108),
          width: width * (88 / 120),
          height: height * (80 / 108),
          borderRadius: '50%',
          background: 'radial-gradient(circle at 34% 26%, #FFF1E2 0%, #FED7AA 44%, #FB923C 100%)',
          display: 'flex',
        }}
      />
      {/* features */}
      <svg
        width={width}
        height={height}
        viewBox="0 0 120 108"
        fill="none"
        style={{ position: 'absolute', left: 0, top: 0 }}
        aria-hidden="true"
      >
        {/* belly */}
        <ellipse cx="60" cy="74" rx="24" ry="20" fill="#FFF7ED" />
        {/* cheeks */}
        <circle cx="32" cy="62" r="9" fill="#FED7AA" />
        <circle cx="88" cy="62" r="9" fill="#FED7AA" />
        {/* eyes */}
        <circle cx="44" cy="50" r="5.2" fill="#4E3820" />
        <circle cx="76" cy="50" r="5.2" fill="#4E3820" />
        <circle cx="45.8" cy="48.2" r="1.7" fill="#FFFFFF" />
        <circle cx="77.8" cy="48.2" r="1.7" fill="#FFFFFF" />
        {/* nose + mouth */}
        <ellipse cx="60" cy="58" rx="3.4" ry="2.5" fill="#FB7185" />
        <path d="M56 63 q4 3.4 8 0" stroke="#4E3820" strokeWidth="2" strokeLinecap="round" />
        {/* whiskers */}
        <g stroke="#C2A57F" strokeWidth="1" strokeLinecap="round" opacity="0.7">
          <path d="M32 60 Q18 56 4 53" />
          <path d="M32 65 Q18 66 5 68" />
          <path d="M32 70 Q19 74 8 78" />
          <path d="M88 60 Q102 56 116 53" />
          <path d="M88 65 Q102 66 115 68" />
          <path d="M88 70 Q101 74 112 78" />
        </g>
        {/* buck teeth */}
        <rect
          x="53.8"
          y="67"
          width="5.6"
          height="9.2"
          rx="2"
          fill="#FFFFFF"
          stroke="#EADCC3"
          strokeWidth="0.8"
        />
        <rect
          x="60.6"
          y="67"
          width="5.6"
          height="9.2"
          rx="2"
          fill="#FFFFFF"
          stroke="#EADCC3"
          strokeWidth="0.8"
        />
        {/* paws on the ledge */}
        <ellipse cx="46" cy="94" rx="8" ry="5.5" fill="#FDBA74" />
        <ellipse cx="74" cy="94" rx="8" ry="5.5" fill="#FDBA74" />
        {/* blush */}
        <ellipse cx="26" cy="66" rx="5" ry="3" fill="#FECDD3" opacity="0.8" />
        <ellipse cx="94" cy="66" rx="5" ry="3" fill="#FECDD3" opacity="0.8" />
      </svg>
    </div>
  );
}

/** One claymorphic ear (outer + inner) — used on the mascot and gift card. */
function Ear({ diameter }: { diameter: number }): React.JSX.Element {
  return (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        background: '#FDBA74',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `inset ${diameter * 0.08}px ${diameter * 0.08}px ${
          diameter * 0.12
        }px rgba(255, 255, 255, 0.7)`,
      }}
    >
      <div
        style={{
          width: diameter * 0.5,
          height: diameter * 0.5,
          borderRadius: '50%',
          background: '#FFEDD5',
          display: 'flex',
        }}
      />
    </div>
  );
}

export default async function OpengraphImage(): Promise<ImageResponse> {
  const fonts = loadMitrFaces();
  // Admin-editable share copy; reader already falls back internally, the
  // .catch keeps the card rendering even if data.ts itself blows up.
  const og = await getOgShareSettings().catch(() => ({ ...DEFAULT_OG_SHARE }));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          fontFamily: fonts.length ? 'Mitr' : undefined,
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFE8D0 48%, #FDBA74 100%)',
          color: '#431407',
        }}
      >
        {/* Ear-blob decor in the corners behind the panel */}
        <div
          style={{
            position: 'absolute',
            top: -190,
            left: -140,
            width: 420,
            height: 420,
            borderRadius: '50%',
            background: 'rgba(253, 186, 116, 0.38)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -150,
            right: -120,
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: 'rgba(254, 215, 170, 0.55)',
            display: 'flex',
          }}
        />

        {/* ── The clay panel — .clay-card recipe from globals.css ── */}
        <div
          style={{
            position: 'relative',
            width: 1132,
            height: 562,
            borderRadius: 44,
            background: '#FAF8F5',
            boxShadow:
              '6px 12px 30px rgba(124, 45, 18, 0.14), 2px 4px 10px rgba(124, 45, 18, 0.08), inset 5px 5px 10px rgba(255, 255, 255, 0.95), inset -3px -3px 8px rgba(217, 119, 6, 0.10)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 54px',
          }}
        >
          {/* Faint paw prints in the middle gutter */}
          <div style={{ position: 'absolute', left: 648, top: 54, display: 'flex' }}>
            <PawPrint size={74} opacity={0.14} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 664,
              top: 432,
              display: 'flex',
              transform: 'rotate(14deg)',
            }}
          >
            <PawPrint size={58} opacity={0.12} />
          </div>

          {/* ── Left: mascot + wordmark + headline ── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              width: 648,
            }}
          >
            {/* Brand row — the real mascot beside the wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <Mascot width={172} />
              <div
                style={{
                  display: 'flex',
                  fontSize: 52,
                  fontWeight: 700,
                  letterSpacing: -1,
                  color: '#4E3820',
                }}
              >
                Nong-Kati
              </div>
            </div>

            {/* Headline (Thai) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 60,
                fontWeight: 700,
                lineHeight: 1.22,
                color: '#431407',
              }}
            >
              <div style={{ display: 'flex' }}>{og.headingLine1}</div>
              <div style={{ display: 'flex' }}>{og.headingLine2}</div>
            </div>

            {/* Brands line */}
            <div
              style={{
                display: 'flex',
                fontSize: 31,
                fontWeight: 500,
                color: '#9A3412',
              }}
            >
              {og.channels}
            </div>

            {/* Trust pills — clay buttons */}
            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  padding: '13px 34px',
                  borderRadius: 999,
                  background: '#EA580C',
                  color: '#FFFFFF',
                  fontSize: 26,
                  fontWeight: 600,
                  boxShadow:
                    'inset 2px 3px 6px rgba(255, 255, 255, 0.30), inset -2px -3px 5px rgba(0, 0, 0, 0.16)',
                }}
              >
                {og.pill1}
              </div>
              <div
                style={{
                  display: 'flex',
                  padding: '13px 34px',
                  borderRadius: 999,
                  background: '#4E3820',
                  color: '#FFEDD5',
                  fontSize: 26,
                  fontWeight: 600,
                  boxShadow:
                    'inset 2px 3px 6px rgba(255, 255, 255, 0.18), inset -2px -3px 5px rgba(0, 0, 0, 0.22)',
                }}
              >
                {og.pill2}
              </div>
            </div>
          </div>

          {/* ── Right: hamster-eared gift card stack ── */}
          <div
            style={{
              position: 'relative',
              width: 372,
              height: 330,
              display: 'flex',
            }}
          >
            {/* Back card — cream clay */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                width: 316,
                height: 212,
                borderRadius: 30,
                background: '#FFF7ED',
                boxShadow:
                  '4px 8px 20px rgba(124, 45, 18, 0.13), inset 4px 4px 8px rgba(255, 255, 255, 0.95), inset -2px -2px 6px rgba(217, 119, 6, 0.10)',
                display: 'flex',
              }}
            />
            {/* Ears peeking out from behind the front card */}
            <div style={{ position: 'absolute', left: 118, top: 70, display: 'flex' }}>
              <Ear diameter={50} />
            </div>
            <div style={{ position: 'absolute', left: 260, top: 70, display: 'flex' }}>
              <Ear diameter={50} />
            </div>
            {/* Front card — dark clay */}
            <div
              style={{
                position: 'absolute',
                left: 56,
                top: 94,
                width: 316,
                height: 212,
                borderRadius: 30,
                background: '#4E3820',
                padding: 26,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow:
                  '6px 12px 26px rgba(78, 56, 32, 0.38), inset 3px 3px 8px rgba(255, 255, 255, 0.16), inset -3px -3px 8px rgba(0, 0, 0, 0.28)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#F97316',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow:
                      'inset 2px 3px 6px rgba(255, 255, 255, 0.35), inset -2px -3px 5px rgba(0, 0, 0, 0.18)',
                  }}
                >
                  <svg width="22" height="24" viewBox="0 0 24 26" style={{ display: 'flex' }}>
                    <path d="M4 3 L21 13 L4 23 Z" fill="#FFF7ED" />
                  </svg>
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    letterSpacing: 3,
                    fontWeight: 600,
                    color: '#FDBA74',
                  }}
                >
                  GIFT CARD
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  style={{
                    height: 2,
                    width: '100%',
                    background: 'rgba(255, 247, 237, 0.26)',
                    display: 'flex',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#FFEDD5',
                  }}
                >
                  <div style={{ display: 'flex' }}>NONG-KATI</div>
                  <div style={{ display: 'flex' }}>7254</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
