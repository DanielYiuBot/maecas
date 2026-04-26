/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bone: {
          50: '#FBFAF7',
          100: '#F5F3EC',
          200: '#ECE8DE',
          300: '#DCD6C8',
        },
        ink: {
          50: '#F6F7F9',
          100: '#ECEEF1',
          200: '#D4D7DD',
          300: '#AAB0BB',
          400: '#828996',
          500: '#5A616D',
          700: '#2E333C',
          900: '#15181E',
          950: '#0C0E12',
        },
        accent: {
          50: '#F2F4FA',
          100: '#E4E8F1',
          300: '#8893B0',
          500: '#2B3D6B',
          700: '#1C2A4A',
          900: '#10182B',
        },
        bull: {
          50: '#F1F7F2',
          100: '#E3EFE6',
          500: '#3E9B68',
          700: '#2F7A50',
          900: '#1E4D33',
        },
        bear: {
          50: '#FAF1F1',
          100: '#F4E2E3',
          500: '#C24047',
          700: '#933036',
          900: '#5C1A1E',
        },
        warn: {
          50: '#FAF4E6',
          100: '#F2E7D0',
          500: '#B57A24',
          900: '#8A5A18',
        },
        info: {
          100: '#DDE7F0',
          500: '#3C6E9E',
          900: '#244A6E',
        },
        surface: {
          base: '#FBFAF7',
          card: '#FFFFFF',
          muted: '#F6F7F9',
        },
        text: {
          primary: '#15181E',
          secondary: '#5A616D',
          muted: '#828996',
        },
        border: {
          DEFAULT: '#ECEEF1',
          strong: '#D4D7DD',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      boxShadow: {
        soft: '0 1px 1px rgba(12,14,18,0.05), 0 6px 18px rgba(12,14,18,0.08)',
        card: '0 1px 1px rgba(12,14,18,0.04), 0 10px 24px rgba(12,14,18,0.06)',
      },
    },
  },
  plugins: [],
}
