/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Source Serif Pro', 'Georgia', 'serif'],
        arabic: ['Scheherazade New', 'Traditional Arabic', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        gold: {
          50: '#fdf9ef',
          100: '#f9f0d4',
          200: '#f2dea8',
          300: '#eac872',
          400: '#e2ad44',
          500: '#d9942c',
          600: '#c07523',
          700: '#a0571f',
          800: '#834520',
          900: '#6c3a1e',
        },
      },
    },
  },
  plugins: [],
};
