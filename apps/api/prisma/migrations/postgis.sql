-- PostGIS: الامتداد + الفهارس الجغرافية.
-- شغّل الملف ده مرة واحدة بعد `prisma migrate dev` (أو حطه جوه مجلد migration يدوي):
--   psql "$DATABASE_URL" -f prisma/migrations/postgis.sql
--
-- Prisma بيعرّف أعمدة الـ geography كـ Unsupported، يعني مش بيعمل لها فهارس تلقائياً.
-- الفهارس دي ضرورية لأي استعلام ST_DWithin / ST_Distance (البحث عن أقرب فرع أو كابتن).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── فهارس GIST على أعمدة الموقع ──
CREATE INDEX IF NOT EXISTS addresses_location_gix
  ON "addresses" USING GIST ("location");

CREATE INDEX IF NOT EXISTS branches_location_gix
  ON "branches" USING GIST ("location");

CREATE INDEX IF NOT EXISTS captains_last_location_gix
  ON "captains" USING GIST ("lastLocation");

-- فهرس مركّب: البحث عن الكباتن المتاحين فقط (ONLINE) بيقل الصفوف اللي يمشي عليها GIST
CREATE INDEX IF NOT EXISTS captains_status_last_location_gix
  ON "captains" USING GIST ("lastLocation")
  WHERE "status" = 'ONLINE';

-- فهرس للفروع الشغالة فقط (للبحث عن المطاعم القريبة من العميل)
CREATE INDEX IF NOT EXISTS branches_active_location_gix
  ON "branches" USING GIST ("location")
  WHERE "isActive" = true;
