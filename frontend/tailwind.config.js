/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#050609',
          900: '#0a0d16',
          850: '#0e1220',
          800: '#12172a',
          700: '#1a2036',
        },
        accent: {
          300: '#8fe9ff',
          400: '#5fdcff',
          500: '#3fc6f5',
          600: '#22a3d6',
        },
        glow: {
          violet: '#8b7cff',
          pink: '#ff7cd6',
          mint: '#6ef7c8',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        head: ['Syne', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px -8px rgba(0,0,0,0.5)',
        'glass-lg': '0 24px 64px -12px rgba(0,0,0,0.6)',
        glow: '0 0 32px -6px rgba(63,198,245,0.55)',
        'glow-violet': '0 0 32px -6px rgba(139,124,255,0.5)',
        'inner-glass': 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
      },
      backdropBlur: {
        xs: '2px',
        '3xl': '48px',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(14px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both',
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
