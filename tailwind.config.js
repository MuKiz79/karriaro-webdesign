/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js}",
    "./dist/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#151516',
        surfaceHighlight: '#2c2c2e',
        primary: '#0071e3',
        text: '#f5f5f7',
        muted: '#a1a1a6'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 25px rgba(0, 113, 227, 0.4)',
        'card': '0 10px 30px -10px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 1s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'cursor': 'cursor .75s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        cursor: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        }
      }
    }
  },
  plugins: [],
}
