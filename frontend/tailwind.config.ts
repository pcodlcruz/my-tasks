import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

// Tokens of the design system approved in Stitch — docs/design/DESIGN.md (T011,
// approved in T018). Keys follow that document's semantic names, not Tailwind's
// default numeric scale. Every color is a CSS variable (src/index.css) so the dark theme is
// a second set of values, not a second set of classes; `<alpha-value>` keeps `bg-error/10`.
function color(name: string): string {
  return `rgb(var(--color-${name}) / <alpha-value>)`
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        quadrant: {
          'do-now': {
            accent: color('do-now-accent'),
            surface: color('do-now-surface'),
            border: color('do-now-border'),
          },
          schedule: {
            accent: color('schedule-accent'),
            surface: color('schedule-surface'),
            border: color('schedule-border'),
          },
          delegate: {
            accent: color('delegate-accent'),
            surface: color('delegate-surface'),
            border: color('delegate-border'),
          },
          eliminate: {
            accent: color('eliminate-accent'),
            surface: color('eliminate-surface'),
            border: color('eliminate-border'),
          },
        },
        scope: {
          work: {
            DEFAULT: color('scope-work'),
            surface: color('scope-work-surface'),
            border: color('scope-work-border'),
          },
          personal: {
            DEFAULT: color('scope-personal'),
            surface: color('scope-personal-surface'),
            border: color('scope-personal-border'),
          },
        },
        text: {
          DEFAULT: color('text'),
          muted: color('text-muted'),
        },
        surface: {
          DEFAULT: color('surface'),
          alt: color('surface-alt'),
        },
        border: {
          DEFAULT: color('border'),
        },
        primary: {
          DEFAULT: color('primary'),
          hover: color('primary-hover'),
        },
        // Text on a filled primary button / on a quadrant accent: white on the light
        // palette, dark on the dark one (whose accents are light).
        on: {
          primary: color('on-primary'),
          accent: color('on-accent'),
          gold: color('on-gold'),
        },
        // Arcade look of feature 007: energy bar, gold rewards and the streak.
        energy: {
          fill: color('energy-fill'),
          extra: color('energy-extra'),
          'empty-border': color('energy-empty-border'),
        },
        gold: color('gold'),
        streak: color('streak'),
        error: {
          DEFAULT: color('error'),
          surface: color('error-surface'),
        },
        success: color('success'),
        disabled: {
          bg: color('disabled-bg'),
          text: color('disabled-text'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        // Only for figures and short arcade labels; Inter while it loads (font-display: swap).
        pixel: ['"Press Start 2P"', 'Inter', 'monospace'],
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
      // Arcade celebrations: at most 600 ms, and only with `motion-safe:` (DESIGN.md).
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        pop: 'pop 600ms ease-out',
      },
    },
  },
  plugins: [
    // `compact:` styles apply only with the compact density (`data-density` on <html>).
    plugin(({ addVariant }) => {
      addVariant('compact', ":root[data-density='compact'] &")
    }),
  ],
} satisfies Config
