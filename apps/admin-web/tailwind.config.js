/** نظام تصميم قادر فود — نفس هوية التطبيقات (أصفر/أسود) بمقاسات ديسكتوب. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#FFD200', deep: '#E8C400', light: '#FFE566' },
        ink: { DEFAULT: '#1C1C1C', soft: '#262626', card: '#2B2B2B', line: '#3A3A3A' },

        // خلفية اللوحة أغمق شوية من التطبيقات (شاشة كبيرة، تباين أعلى).
        canvas: '#F0EEE6',
        surface: '#FFFFFF',
        line: '#E8E6DE',
        hair: '#EFEDE5',
        chip: '#F4F2EA',
        soft: '#F7F6F1',

        muted: '#8A8A8A',
        label: '#6E6A5C',
        faint: '#A9A695',
        head: '#8A8368', // نص رؤوس الجداول
        dim: '#9C9C9C', // نص ثانوي فوق الأسود

        gold: { DEFAULT: '#B89A00', deep: '#8A7500' },
        tint: { DEFAULT: '#FFF9DE', strong: '#FFF3B8', soft: '#FFFDF2' },

        ok: { DEFAULT: '#0BA55B', bright: '#0BD97C', tint: '#E8F5EE' },
        bad: { DEFAULT: '#E23E3E', deep: '#C43030', tint: '#FDE8E8', row: '#FDF0F0', line: '#F0BEBE' },

        bar: '#EDE9DC', // عمود الرسم البياني غير المفعّل
      },
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
        num: ['Outfit', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', panel: '18px', pill: '99px' },
      boxShadow: {
        card: '0 1px 6px rgba(0,0,0,0.05)',
        float: '0 10px 34px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
