import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        av: {
          bg: '#0b0c0f',
          panel: '#1b1c22',
          panel2: '#14151a',
          border: '#2a2b33',
          muted: '#8b8d97',
          text: '#ffffff',
          red: '#e31c3d',
          red2: '#c41430',
          pink: '#ff2d55',
          green: '#28a909',
          green2: '#1e8a06',
          purple: '#7b61ff',
          gold: '#f5a623',
          blue: '#2a72ff',
          stage: '#0e1118',
        },
        sky: {
          950: '#0b0c0f',
          900: '#14151a',
          850: '#1b1c22',
        },
        accent: {
          red: '#e31c3d',
          gold: '#f5a623',
          cyan: '#4cc9f0',
          lime: '#28a909',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)',
        bet: '0 4px 16px rgba(0,0,0,0.35)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'flash-cash': 'flash-cash 0.45s ease',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'flash-cash': {
          '0%': { transform: 'scale(0.96)', filter: 'brightness(1.4)' },
          '100%': { transform: 'scale(1)', filter: 'brightness(1)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
