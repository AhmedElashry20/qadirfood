/// <reference types="vite/client" />

/** متغيّرات البناء التي تقرؤها اللوحة. */
interface ImportMetaEnv {
  /**
   * عنوان الـ API الكامل عند النشر على استضافة ثابتة (بلا بروكسي).
   * يُترك فارغاً في التطوير فيستعمل '/api' عبر بروكسي Vite.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
