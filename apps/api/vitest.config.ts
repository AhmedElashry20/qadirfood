import { defineConfig } from 'vitest/config';

// اختبارات وحدة للمنطق النقي (فلوس + أمان + حالات) — من غير قاعدة بيانات ولا شبكة.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
  },
  esbuild: { target: 'es2022' },
});
