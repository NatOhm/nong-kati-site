import { cn } from '@/utils/cn';

/**
 * Custom 3D clay-styled icons for the cozy hamster theme.
 * Each is drawn with dual lighting (top-left highlight, bottom-right shade)
 * so it reads as squishy volume, not a flat glyph. All accept a `size` prop.
 */

interface ClayIconProps {
  size?: number;
  className?: string;
  /** Accepted for interchangeability with lucide icons; visually ignored. */
  strokeWidth?: number;
}

/** Acorn — Home. Brown cap, tan nut, glossy highlight. */
export function AcornIcon({ size = 22, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* nut */}
      <ellipse cx="12" cy="15.5" rx="6.5" ry="6" fill="#D9A05B" />
      <ellipse cx="12" cy="15.5" rx="6.5" ry="6" fill="url(#acornShade)" />
      {/* cap */}
      <path
        d="M4.5 11.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5c0 1-0.6 1.5-1.6 1.5H6.1c-1 0-1.6-0.5-1.6-1.5Z"
        fill="#8C5A2B"
      />
      <path
        d="M4.5 11.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5c0 1-0.6 1.5-1.6 1.5H6.1c-1 0-1.6-0.5-1.6-1.5Z"
        fill="url(#capShade)"
      />
      {/* stem */}
      <rect x="11" y="3.5" width="2" height="2.6" rx="1" fill="#6B421C" />
      {/* gloss */}
      <ellipse
        cx="9"
        cy="8.6"
        rx="2.6"
        ry="1.3"
        fill="#FFFFFF"
        opacity="0.35"
        transform="rotate(-18 9 8.6)"
      />
      <ellipse cx="9.5" cy="14.5" rx="2.2" ry="3" fill="#FFFFFF" opacity="0.28" />
      <defs>
        <radialGradient id="acornShade" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#E8B76E" />
          <stop offset="1" stopColor="#C4853F" />
        </radialGradient>
        <radialGradient id="capShade" cx="0.35" cy="0.25" r="1">
          <stop offset="0" stopColor="#A06A35" />
          <stop offset="1" stopColor="#6B421C" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Sunflower seed — Rewards. Striped teardrop seed. */
export function SeedIcon({ size = 22, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.5c4 0 6.5 4.5 6.5 9.5s-2.5 9.5-6.5 9.5S5.5 17 5.5 12 8 2.5 12 2.5Z"
        fill="#4E3820"
      />
      <path
        d="M12 4.5c2.6 0 4.4 3.4 4.4 7.5S14.6 19.5 12 19.5 7.6 16.1 7.6 12 9.4 4.5 12 4.5Z"
        fill="#8C6D46"
      />
      {/* stripes */}
      <path d="M12 5v14" stroke="#4E3820" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path
        d="M9.6 6.5c-1 1.5-1.6 3.4-1.6 5.5s0.6 4 1.6 5.5"
        stroke="#4E3820"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M14.4 6.5c1 1.5 1.6 3.4 1.6 5.5s-0.6 4-1.6 5.5"
        stroke="#4E3820"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* gloss */}
      <ellipse
        cx="10"
        cy="8.5"
        rx="1.2"
        ry="2.4"
        fill="#FFFFFF"
        opacity="0.25"
        transform="rotate(14 10 8.5)"
      />
    </svg>
  );
}

/** Hamster wheel — Dashboard/Settings. Wheel with spokes. */
export function WheelIcon({ size = 22, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* rim */}
      <circle cx="12" cy="12" r="9" stroke="#C2A57F" strokeWidth="3" />
      <circle cx="12" cy="12" r="9" stroke="url(#wheelShade)" strokeWidth="3" opacity="0.5" />
      {/* spokes */}
      <path
        d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"
        stroke="#A98B63"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* hub */}
      <circle cx="12" cy="12" r="3" fill="#F97316" />
      <circle cx="11" cy="11" r="1" fill="#FFFFFF" opacity="0.5" />
      <defs>
        <linearGradient id="wheelShade" x1="4" y1="4" x2="20" y2="20">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#6B4F2E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Paw print — Profile. Four toe beans + pad. */
export function PawIcon({ size = 22, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* toes */}
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
      {/* pad */}
      <path
        d="M12 11c3.6 0 6.2 2.4 6.2 5.2 0 2.3-1.9 3.8-4 3.8-0.9 0-1.5-0.3-2.2-0.3s-1.3 0.3-2.2 0.3c-2.1 0-4-1.5-4-3.8C5.8 13.4 8.4 11 12 11Z"
        fill="#A98B63"
      />
      {/* highlights */}
      <circle cx="9.2" cy="5.6" r="0.7" fill="#FFFFFF" opacity="0.5" />
      <circle cx="13.2" cy="5.6" r="0.7" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}

/**
 * Clay hamster FACE — round avatar crop for logo/toast scale.
 * Pure claymorphism: radial-gradient volume, dual lighting, glossy highlight.
 */
export function HamsterFace({ size = 40, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      className={cn('rounded-full', className)}
      aria-hidden="true"
    >
      {/* ears */}
      <circle cx="19" cy="15" r="9" fill="#FB923C" />
      <circle cx="61" cy="15" r="9" fill="#FB923C" />
      <circle cx="19" cy="15" r="4.5" fill="#FFEDD5" />
      <circle cx="61" cy="15" r="4.5" fill="#FFEDD5" />
      {/* head — clay volume via radial gradient light from top-left */}
      <circle cx="40" cy="44" r="34" fill="url(#hamsterFaceBody)" />
      {/* glossy highlight */}
      <ellipse
        cx="28"
        cy="28"
        rx="10"
        ry="6"
        fill="#FFFFFF"
        opacity="0.45"
        transform="rotate(-24 28 28)"
      />
      {/* cheeks */}
      <circle cx="21" cy="50" r="8" fill="#FED7AA" />
      <circle cx="59" cy="50" r="8" fill="#FED7AA" />
      {/* eyes */}
      <circle cx="29" cy="40" r="4.6" fill="#4E3820" />
      <circle cx="51" cy="40" r="4.6" fill="#4E3820" />
      <circle cx="30.6" cy="38.4" r="1.5" fill="#FFFFFF" />
      <circle cx="52.6" cy="38.4" r="1.5" fill="#FFFFFF" />
      {/* nose + mouth */}
      <ellipse cx="40" cy="49" rx="3" ry="2.2" fill="#FB7185" />
      <path d="M36 53.5 q4 3 8 0" stroke="#4E3820" strokeWidth="1.8" strokeLinecap="round" />
      {/* blush */}
      <ellipse cx="16" cy="54" rx="4.4" ry="2.6" fill="#FECDD3" opacity="0.85" />
      <ellipse cx="64" cy="54" rx="4.4" ry="2.6" fill="#FECDD3" opacity="0.85" />
      <defs>
        <radialGradient id="hamsterFaceBody" cx="0.32" cy="0.24" r="1.15">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Clay hamster mascot. `cheeksPuff` grows the cheek circles — wire it to a
 * parent group's hover via CSS (see HamsterMascot wrapper below).
 */
export function HamsterMascot({ size = 120, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 120 108"
      fill="none"
      className={cn('group-hover:mascot-cheeks', className)}
      aria-hidden="true"
    >
      {/* ears */}
      <circle cx="30" cy="18" r="11" fill="#FDBA74" />
      <circle cx="90" cy="18" r="11" fill="#FDBA74" />
      <circle cx="30" cy="18" r="5.5" fill="#FFEDD5" />
      <circle cx="90" cy="18" r="5.5" fill="#FFEDD5" />
      {/* body/head */}
      <ellipse cx="60" cy="60" rx="44" ry="40" fill="#FDBA74" />
      <ellipse cx="60" cy="60" rx="44" ry="40" fill="url(#hamsterBody)" />
      {/* belly */}
      <ellipse cx="60" cy="74" rx="24" ry="20" fill="#FFF7ED" />
      {/* cheeks — puff via CSS class below */}
      <circle className="cheek-l" cx="32" cy="62" r="9" fill="#FED7AA" />
      <circle className="cheek-r" cx="88" cy="62" r="9" fill="#FED7AA" />
      {/* eyes */}
      <circle cx="44" cy="50" r="5.2" fill="#4E3820" />
      <circle cx="76" cy="50" r="5.2" fill="#4E3820" />
      <circle cx="45.8" cy="48.2" r="1.7" fill="#FFFFFF" />
      <circle cx="77.8" cy="48.2" r="1.7" fill="#FFFFFF" />
      {/* nose + mouth */}
      <ellipse cx="60" cy="58" rx="3.4" ry="2.5" fill="#FB7185" />
      <path d="M56 63 q4 3.4 8 0" stroke="#4E3820" strokeWidth="2" strokeLinecap="round" />
      {/* paws on the ledge */}
      <ellipse cx="46" cy="94" rx="8" ry="5.5" fill="#FDBA74" />
      <ellipse cx="74" cy="94" rx="8" ry="5.5" fill="#FDBA74" />
      {/* blush */}
      <ellipse cx="26" cy="66" rx="5" ry="3" fill="#FECDD3" opacity="0.8" />
      <ellipse cx="94" cy="66" rx="5" ry="3" fill="#FECDD3" opacity="0.8" />
      <defs>
        <radialGradient id="hamsterBody" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Loading spinner: clay hamster wheel with a little hamster running inside.
 * Pure CSS rotation — reduced-motion handled by the global rule.
 */
export function HamsterWheelSpinner({ size = 72, className }: ClayIconProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="กำลังโหลด"
      className={cn('relative inline-flex items-center justify-center', className)}
    >
      {/* running hamster (counter-rotates to stay upright-ish) */}
      <svg
        viewBox="0 0 40 30"
        width={size * 0.45}
        className="absolute bottom-[18%] left-1/2 -translate-x-1/2 animate-spin"
        style={{ animationDuration: '1.6s', animationDirection: 'reverse' }}
        aria-hidden="true"
      >
        <ellipse cx="20" cy="18" rx="13" ry="10" fill="#FDBA74" />
        <circle cx="14" cy="10" r="4" fill="#FDBA74" />
        <circle cx="26" cy="10" r="4" fill="#FDBA74" />
        <circle cx="14.5" cy="15" r="1.4" fill="#4E3820" />
        <circle cx="25.5" cy="15" r="1.4" fill="#4E3820" />
        <ellipse cx="20" cy="20" rx="6" ry="4.5" fill="#FFF7ED" />
      </svg>
      {/* wheel spins over it */}
      <svg
        viewBox="0 0 80 80"
        width={size}
        className="animate-spin"
        style={{ animationDuration: '2.2s' }}
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="34" stroke="#EADCC3" strokeWidth="7" fill="none" />
        <circle
          cx="40"
          cy="40"
          r="34"
          stroke="#C2A57F"
          strokeWidth="7"
          fill="none"
          strokeDasharray="160 60"
          strokeLinecap="round"
        />
        <path
          d="M40 8v64M8 40h64M18 18l44 44M62 18L18 62"
          stroke="#E3C39C"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="40" cy="40" r="8" fill="#F97316" />
        <circle cx="37.5" cy="37.5" r="2.5" fill="#FFFFFF" opacity="0.55" />
      </svg>
    </div>
  );
}

/** Sleeping hamster — lying on its side, eyes closed, for 404/error pages. */
export function HamsterSleeping({ size = 120, className }: ClayIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 120 74"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* body lying down */}
      <ellipse cx="62" cy="48" rx="44" ry="24" fill="#FDBA74" />
      <ellipse cx="62" cy="48" rx="44" ry="24" fill="url(#hamsterSleep)" />
      {/* ear */}
      <circle cx="30" cy="30" r="9" fill="#FDBA74" />
      <circle cx="30" cy="30" r="4.5" fill="#FFEDD5" />
      {/* closed eye: gentle arc */}
      <path d="M52 42 q5 4 10 0" stroke="#4E3820" strokeWidth="2.4" strokeLinecap="round" />
      {/* nose */}
      <ellipse cx="30" cy="50" rx="3" ry="2.2" fill="#FB7185" />
      {/* belly patch */}
      <ellipse cx="70" cy="56" rx="22" ry="12" fill="#FFF7ED" />
      {/* paw tucked out */}
      <ellipse cx="44" cy="64" rx="7" ry="4.5" fill="#FED7AA" />
      {/* blush */}
      <ellipse cx="24" cy="55" rx="4.5" ry="2.6" fill="#FECDD3" opacity="0.8" />
      <defs>
        <radialGradient id="hamsterSleep" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
      </defs>
    </svg>
  );
}
