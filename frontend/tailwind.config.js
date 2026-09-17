export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Public website
        display: ['"Paytone One"', '"Arial Rounded MT Bold"', '"Arial Black"', 'sans-serif'],
        site: ['"Hanken Grotesk Variable"', '"Segoe UI"', 'system-ui', 'sans-serif']
      },
      colors: {
        // Public website palette ("Bändchen")
        band: {
          ink: '#25123A',
          'ink-soft': '#3A2356',
          soft: '#5B4A70',
          berry: '#C42A66',
          'berry-deep': '#B02459',
          leaf: '#157A4B',
          'leaf-light': '#1B8C57',
          sun: '#FFC933',
          'sun-deep': '#F2B91E',
          paper: '#FBFBFF',
          lilac: '#EFEAFB',
          mist: '#DCD2E8'
        }
      }
    }
  },
  plugins: []
};
