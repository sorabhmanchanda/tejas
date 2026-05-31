/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm dark base from the build guide.
        base: '#0B0E10',
        card: '#14181B',
        line: '#1F2428',
        saffron: '#F59E0B',
        // Agent accents.
        anna: '#84CC16',
        agni: '#F59E0B',
        bala: '#3B82F6',
        nidra: '#A855F7',
        sage: '#EC4899',
      },
      fontFamily: {
        head: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(245,158,11,0.15), 0 8px 30px rgba(0,0,0,0.4)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 2s ease-in-out infinite',
        slideUp: 'slideUp 0.28s cubic-bezier(0.16,1,0.3,1)',
        fadeIn: 'fadeIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
