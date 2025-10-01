/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan all HTML files in the 'public' directory
  content: [
    "./public/**/*.html",
    "./src/**/*.js",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}