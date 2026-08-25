# قادر فود (Qadir Food) — صورة الباك إند للإنتاج
# ملاحظة مهمة: سياق البناء (build context) لازم يكون **جذر الريبو** مش apps/api،
# لأن الـ API يعتمد على حزمة الـ workspace اسمها @delivery/shared:
#   docker build -f apps/api/Dockerfile -t qadirfood-api .
# ملف docker-compose.prod.yml مظبوط على كده (context: . + dockerfile: apps/api/Dockerfile).
#
# multi-stage: (1) تنزيل الاعتماديات  (2) بناء shared + توليد Prisma + بناء الـ API
# (3) صورة تشغيل نحيفة (node:20-slim) بمستخدم غير root.

# syntax=docker/dockerfile:1.7

# ── Stage 1: deps — تنزيل كل الاعتماديات (بما فيها dev، محتاجينها للبناء) ─────
FROM node:20-slim AS deps
WORKDIR /app

# openssl مطلوب لـ Prisma · python3/make/g++ لبناء الحزم الأصلية (bcrypt/argon2)
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# ننسخ ملفات الـ manifest بس الأول عشان طبقة الكاش تفضل صالحة لو الكود اتغير
# من غير ما الاعتماديات تتغيّر (npm workspaces بيقرأ الجذر + الحزمتين).
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# npm ci بيثبّت من الـ lockfile بالظبط (بناء متكرّر ومضمون).
RUN npm ci

# ── Stage 2: build — بناء الحزمة المشتركة ثم توليد Prisma ثم بناء الـ API ──────
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules

# ننسخ الكود المصدري فقط (مش node_modules/dist المحليين — بننسخ باختيار دقيق
# عشان البناء ما يعتمدش على أي حاجة من جهاز المطوّر ولا على مكان ملف .dockerignore).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma

# 1) بناء @delivery/shared (الـ API بيعتمد عليها — نفس اللي بيعمله prebuild)
# 2) توليد Prisma Client (لازم قبل بناء الـ API عشان الأنواع)
# 3) بناء الـ API (nest build → dist/main.js)
RUN npm run build -w @delivery/shared \
 && npm run prisma:generate -w @delivery/api \
 && npm run build -w @delivery/api

# ── Stage 3: runtime — صورة تشغيل نحيفة بمستخدم غير root ───────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# openssl لـ Prisma · dumb-init لإدارة الإشارات (PID 1 سليم) · مستخدم غير root
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd  -u 1001 -g nodejs -m -s /usr/sbin/nologin nestjs

# ملاحظة عن حجم الصورة: بنحتفظ بالـ node_modules الكاملة (مش prod-only) عن قصد،
# لأن الـ Prisma CLI (devDependency) مطلوبة وقت النشر لتشغيل
# `prisma migrate deploy` / `prisma db push` من داخل الحاوية عبر
# `docker compose exec api ...` (شوف دليل النشر). التنحيف الحقيقي جاي من:
# صورة node:20-slim + استبعاد أدوات البناء (python/make/g++) + عدم نسخ الكود المصدري.
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /app/package-lock.json ./package-lock.json

# الحزمة المشتركة (المبنية فقط) — الـ symlink في node_modules/@delivery/shared
# بيشاور على المسار ده.
COPY --from=build --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json

# مخرجات الـ API + مخطط Prisma (مطلوب لـ migrate/generate وقت التشغيل).
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma

# مجلد الرفع المحلي (LocalStorageDriver) — بيتقدّم على /uploads.
# بيتربط بـ volume في docker-compose عشان الملفات تفضل بعد إعادة البناء.
RUN mkdir -p /app/apps/api/uploads && chown -R nestjs:nodejs /app/apps/api/uploads

USER nestjs
WORKDIR /app/apps/api
EXPOSE 3000

# فحص صحة: نقطة /health مستثناة من بادئة /api (شوف main.ts). Node 20 فيه fetch عام.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
