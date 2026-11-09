/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edfff0',
          100: '#d5ffe0',
          200: '#a8ffc0',
          300: '#6bf690',
          400: '#2de85f',
          500: '#00C30A',
          600: '#00a108',
          700: '#007d06',
          800: '#006305',
          900: '#004f04',
          950: '#003700',
        },
        esg: { e: '#00a108', s: '#6366f1', g: '#f59e0b' },
      },
    },
  },
  plugins: [],
};
