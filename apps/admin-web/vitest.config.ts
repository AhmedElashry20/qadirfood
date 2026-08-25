import { defineConfig } from 'vitest/config';

// اختبارات وحدة لدوال العرض (تنسيق الفلوس/الأرقام/التواريخ) — عربي وbidi.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.spec.ts'], globals: false },
});
