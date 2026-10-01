import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      boxShadow: {
        vault: '0 18px 60px rgba(0,0,0,.34)',
      },
    },
  },
  plugins: [],
};
export default config;

