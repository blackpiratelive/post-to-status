/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html"
  ],
  theme: {
    extend: {
      colors: {
        paper: '#fdf6e3',
      },
      fontFamily: {
        'kalam': ['Kalam', 'cursive'],
      }
    },
  },
  plugins: [],
}