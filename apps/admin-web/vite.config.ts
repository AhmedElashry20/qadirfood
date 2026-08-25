import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // الـ API على 3000 — البروكسي بيخلّي الكوكيز والسوكيت يشتغلوا من نفس الأصل.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // الملفات المرفوعة (وثائق الكباتن) بتتقدّم من الـ API على نفس البورت
      // بس برّه /api — من غير البروكسي ده صور الالتزام مش هتظهر في التطوير.
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
