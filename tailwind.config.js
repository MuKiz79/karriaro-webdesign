/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js}",
    "./dist/**/*.html"
  ],
  safelist: [
    'group-hover:text-orange-400',
    'group-hover:bg-orange-600',
    'group-hover:text-emerald-400',
    'group-hover:bg-emerald-600',
    'group-hover:text-blue-400',
    'group-hover:bg-blue-600',
    'group-hover:text-amber-400',
    'group-hover:bg-amber-600',
    'group-hover:text-rose-400',
    'group-hover:text-red-400',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#fafafa',
        surface: '#ffffff',
        muted: '#86868b',
        accent: '#1d1d1f',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    }
  },
  plugins: [],
}
