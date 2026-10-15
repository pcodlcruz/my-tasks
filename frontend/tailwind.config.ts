import type { Config } from 'tailwindcss'

// Tokens of the design system approved in Stitch — docs/design/DESIGN.md (T011,
// approved in T018). Keys follow that document's semantic names, not Tailwind's
// default numeric scale.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        quadrant: {
          'do-now': { accent: '#B91C1C', surface: '#FEF2F2' },
          schedule: { accent: '#1D4ED8', surface: '#EFF6FF' },
          delegate: { accent: '#B45309', surface: '#FFFBEB' },
          eliminate: { accent: '#475569', surface: '#F8FAFC' },
        },
        scope: {
          work: '#7C3AED',
          personal: '#0F766E',
        },
        text: {
          DEFAULT: '#0F172A',
          muted: '#475569',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F8FAFC',
        },
        border: {
          DEFAULT: '#CBD5E1',
        },
        primary: {
          DEFAULT: '#1D4ED8',
          hover: '#1E40AF',
        },
        error: {
          DEFAULT: '#B91C1C',
          surface: '#FEF2F2',
        },
        success: '#15803D',
        disabled: {
          bg: '#E2E8F0',
          text: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '36px', fontWeight: '700' }],
        heading: ['20px', { lineHeight: '28px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-strong': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        caption: ['13px', { lineHeight: '18px', fontWeight: '400' }],
      },
      spacing: {
        '4.5': '18px',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.08)',
        modal: '0 8px 24px rgba(15, 23, 42, 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config
