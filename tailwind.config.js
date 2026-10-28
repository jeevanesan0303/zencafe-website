/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Cormorant Garamond', 'serif'],
        display: ['Anton', 'sans-serif'],
      },
      boxShadow: {
        zen: '0 28px 75px rgba(65, 31, 20, 0.16)',
        soft: '0 16px 40px rgba(101, 39, 27, 0.12)',
      },
    },
  },
  plugins: [],
}
