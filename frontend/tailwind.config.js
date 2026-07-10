/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        vignette: {
          50:  '#E8F5EE',
          100: '#C8E8D5',
          200: '#9DD4B5',
          600: '#1B6B40',
          700: '#155432',
          800: '#0F3D25',
        },
        encre: '#1A2332',
        alerte: {
          50:  '#FEF3EB',
          100: '#FDE3CC',
          600: '#C05621',
          700: '#9A4218',
        },
      },
    },
  },
  plugins: [],
}
