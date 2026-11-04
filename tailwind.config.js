/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        val: {
          bg: '#0F1923',
          panel: '#1C252E',
          line: '#2B353F',
          red: '#FF4655',
          sky: '#38BDF8',
          teal: '#0FDFC3',
          cream: '#ECE8E1',
          muted: '#A3AFA7',
          warn: '#E8C547',
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
