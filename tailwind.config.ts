/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens — charte tenant surcharge via CSS variables (A5)
        brand: 'var(--color-brand, #0f766e)',
      },
    },
  },
  plugins: [],
};
