import type { Config } from 'tailwindcss'

// Los tokens del design system aprobado en Stitch (paleta por cuadrante,
// tipografía, espaciado) se incorporan en la Fase 2 (T020).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
