/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // KidTok brand
        primary: {
          DEFAULT: '#03BBE5',
          light: '#CCE6FA',
          dark: '#07375B',
          'semi-dark': '#0F75CE',
          container: '#E3F2FD',
        },
        secondary: {
          DEFAULT: '#F96286',
          container: '#FBE4D6',
        },
        complementary: '#f78f1e',
        gold: '#C6862B',
        // Neutrals
        neutral: {
          200: '#F5F7F9',
          300: '#EBEEF2',
          400: '#CCD4DF',
          700: '#6D8195',
          900: '#181B20',
        },
        // Status
        success: '#43A047',
        warning: '#FFB429',
        danger: '#E44E35',
        info: '#0F75CE',
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-primary': 'radial-gradient(circle at bottom left, #CCE6FA 0%, #0F75CE 40%, #07375B 100%)',
        'gradient-secondary': 'radial-gradient(circle at bottom left, #FBE4D6 0%, #F96286 12%)',
        'gradient-gold': 'linear-gradient(135deg, #FFD54F 0%, #C6862B 100%)',
      },
      borderRadius: {
        'pill': '9999px',
      },
    },
  },
  plugins: [],
}
