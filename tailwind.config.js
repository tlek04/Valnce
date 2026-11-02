/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        val: {
          bg: '#0b0f14',
          panel: '#121821',
          line: '#243044',
          red: '#ff4655',
          cream: '#ece8e1',
          muted: '#8b95a5',
        },
      },
      fontFamily: {
        display: ['Barlow Condensed', 'Noto Sans KR', 'sans-serif'],
        sans: ['Noto Sans KR', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
