/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        arabic: ['"IBM Plex Sans Arabic"', '"IBM Plex Sans"', 'Tahoma', 'sans-serif'],
      },
      colors: {
        // Deep Omani green with a red accent (flag colours), tuned for contrast (WCAG AA).
        brand: { 50: '#ecf8f1', 100: '#d1efdd', 200: '#a5dfbd', 300: '#6fc795', 400: '#3fa96f', 500: '#1f8b53', 600: '#167043', 700: '#135a38', 800: '#0f5132', 900: '#0c3a25', 950: '#062116' },
        accent: { 50: '#fdeeee', 100: '#fbd5d5', 500: '#db2c2c', 600: '#b91f1f', 700: '#951a1a' },
      },
    },
  },
  plugins: [],
};
