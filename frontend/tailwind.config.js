/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080c',
          900: '#0e0e16',
          850: '#14141f',
          800: '#1b1b29',
          700: '#272739',
          600: '#3a3a52',
        },
        accent: {
          DEFAULT: '#a855f7',
          soft: '#c084fc',
          glow: '#e879f9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(168,85,247,0.45)',
      },
    },
  },
  plugins: [],
};
