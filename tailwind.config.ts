// tailwind.config.ts
// Source of truth: 04-design-system.md §13. Do not hand-edit token values here —
// amend 04-design-system.md first, then mirror the change into this file.
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B14', 900: '#0D1424', 850: '#111B30',
          800: '#162038', 700: '#1E2D4E', 600: '#2A3D66',
          400: '#5A6F99', 300: '#8A9BBF', 200: '#B8C4D9',
          100: '#DDE3EF', 50: '#F2F5FA',
        },
        amber: {
          950: '#2A1A00', 900: '#3D2600', 700: '#8A5200',
          500: '#D4820A', 400: '#F0A020', 300: '#F5B840',
          200: '#FAD070', 100: '#FDE8A8',
        },
        jade: {
          900: '#052213', 700: '#0A5C30', 500: '#16A257',
          400: '#22C76E', 200: '#86EBB4',
        },
        crimson: {
          900: '#220408', 700: '#6B0A18', 500: '#C41230',
          400: '#E8203C', 200: '#F8A0AB',
        },
        sapphire: {
          900: '#050E22', 700: '#0A236B',
          400: '#2C6EF0', 200: '#9CBCF8',
        },
        topaz: {
          900: '#1A1000', 400: '#E8A020', 200: '#F8D890',
        },
      },
      fontFamily: {
        display: ['var(--font-noto-serif-thai)', 'Noto Serif', 'Georgia', 'serif'],
        ui: ['var(--font-ibm-plex-sans-thai)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'Fira Code', 'Courier New', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.5', letterSpacing: '+0.02em' }],
        sm: ['0.875rem', { lineHeight: '1.5', letterSpacing: '+0.01em' }],
        base: ['1rem', { lineHeight: '1.6', letterSpacing: '0' }],
        lg: ['1.125rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        xl: ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.03em' }],
        '4xl': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.03em' }],
        '5xl': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.04em' }],
        '6xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
      },
      spacing: {
        px: '1px',
        '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
        '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem',
        '4': '1rem', '5': '1.25rem', '6': '1.5rem',
        '8': '2rem', '10': '2.5rem', '12': '3rem',
        '16': '4rem', '20': '5rem', '24': '6rem',
        '32': '8rem',
      },
      borderRadius: {
        none: '0', xs: '4px', sm: '6px',
        md: '8px', lg: '12px', xl: '16px',
        '2xl': '20px', '3xl': '24px', full: '9999px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(7,11,20,0.4)',
        sm: '0 2px 4px rgba(7,11,20,0.5), 0 1px 2px rgba(7,11,20,0.4)',
        md: '0 4px 8px rgba(7,11,20,0.6), 0 2px 4px rgba(7,11,20,0.4)',
        lg: '0 8px 24px rgba(7,11,20,0.7), 0 4px 8px rgba(7,11,20,0.5)',
        xl: '0 16px 40px rgba(7,11,20,0.8), 0 8px 16px rgba(7,11,20,0.6)',
        'brand-glow': '0 0 0 1px rgba(240,160,32,0.15), 0 4px 16px rgba(240,160,32,0.25), 0 8px 32px rgba(240,160,32,0.12)',
        'brand-glow-hover': '0 0 0 1px rgba(240,160,32,0.25), 0 4px 20px rgba(240,160,32,0.40), 0 12px 40px rgba(240,160,32,0.20)',
        'code-glow': '0 0 0 1px rgba(240,160,32,0.20), 0 2px 12px rgba(240,160,32,0.15), inset 0 1px 0 rgba(240,160,32,0.10)',
        'focus-ring': '0 0 0 2px var(--bg-base), 0 0 0 4px rgba(240,160,32,0.60)',
      },
      transitionDuration: {
        instant: '80ms', fast: '150ms', default: '200ms',
        moderate: '300ms', slow: '400ms', deliberate: '600ms',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'in-quart': 'cubic-bezier(0.5, 0, 0.75, 0)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      screens: {
        xs: '320px', sm: '480px', md: '768px',
        lg: '1024px', xl: '1280px', '2xl': '1536px',
      },
      maxWidth: {
        content: '1280px',
        prose: '680px',
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s cubic-bezier(0.4,0,0.2,1) infinite',
        shimmer: 'shimmer 1.5s linear infinite',
        'page-enter': 'page-enter 300ms cubic-bezier(0.25,1,0.5,1)',
        'modal-enter': 'modal-enter 300ms cubic-bezier(0.25,1,0.5,1)',
        'toast-enter': 'toast-enter 300ms cubic-bezier(0.25,1,0.5,1)',
        'copy-bounce': 'copy-bounce 300ms cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(240,160,32,0.15), 0 4px 16px rgba(240,160,32,0.25), 0 8px 32px rgba(240,160,32,0.12)' },
          '50%': { boxShadow: '0 0 0 1px rgba(240,160,32,0.25), 0 4px 20px rgba(240,160,32,0.40), 0 12px 40px rgba(240,160,32,0.20)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'page-enter': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-enter': {
          from: { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-enter': {
          from: { opacity: '0', transform: 'translateY(100%) scale(0.95)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'copy-bounce': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.15)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
