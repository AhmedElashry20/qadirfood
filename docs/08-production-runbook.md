# دليل النشر للإنتاج — قادر فود (Qadir Food)

دليل عملي خطوة بخطوة لنشر باك إند **قادر فود** على سيرفر إنتاج حقيقي (VPS واحد + Docker).
مكتوب ليكون صادقاً: بيقولك بالظبط أي خطوة تقدر تعملها لوحدك، وأي خطوة **محتاجة حساب/مفتاح
خارجي يخصّك إنت** (دفع، إشعارات، SMS، سحابة) — والمكان اللي بتحطّ فيه كل مفتاح.

الملفات المرجعية:
- `docker-compose.prod.yml` — تشكيل الإنتاج (db + redis + api + nginx).
- `apps/api/Dockerfile` — صورة الباك إند (multi-stage، مستخدم غير root).
- `deploy/nginx.conf` — واجهة عكسية + HTTPS + ترقية WebSocket.
- `.env.example` — قالب متغيّرات البيئة.

> ملخّص المعمار: كل تكامل خارجي وراه **واجهة مجرّدة** (`PaymentGateway`, `StorageDriver`,
> `TgaGateway`, `FaceGateway`)، فربط المزوّد الحقيقي بيتم في **ملف واحد** من غير ما يمس
> باقي النظام. المنصة **بتشتغل من غير** التكاملات دي (تخزين محلي، OTP للتطوير، دفع
> sandbox) — التكاملات بتفعّل الوضع الحقيقي بس.

---

## ٠) نظرة سريعة على المسار

```
1. جهّز VPS (Docker + جدار ناري)          ← تقدر تعمله لوحدك
2. دومين + سجلّات DNS                      ← تحتاج تشتري دومين
3. شهادة TLS (certbot)                     ← مجاني، تقدر لوحدك
4. املأ .env الإنتاج                        ← بعض المفاتيح تحتاج حساباتك (§4)
5. docker compose ... up -d --build         ← تقدر لوحدك
6. تهيئة قاعدة البيانات (schema + PostGIS)  ← تقدر لوحدك
7. أنشئ حساب الأدمن                          ← تقدر لوحدك
8. نسخ احتياطي + مراقبة                      ← تقدر لوحدك
9. قائمة تأمين نهائية                        ← إلزامية قبل الإطلاق
```

---

## ١) تجهيز السيرفر (VPS)

**المواصفات المقترحة للبداية:** 2 vCPU / 4 GB RAM / 40 GB SSD، Ubuntu 22.04 أو 24.04.
منطقة قريبة من السوق (الرياض/جدة) لأقل زمن استجابة — مثلاً منطقة سعودية/خليجية من
مزوّدك (AWS me-central-1، أو مزوّد محلي).

```bash
# 1) مستخدم غير root بصلاحية sudo
adduser deploy && usermod -aG sudo deploy
# بعدها ادخل بالمستخدم ده، مش بـ root.

# 2) تثبيت Docker + إضافة Compose (الطريقة الرسمية)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy   # اعمل logout/login بعدها
docker compose version           # تأكّد إن الإضافة موجودة

# 3) الجدار الناري — نفتح SSH و HTTP و HTTPS فقط
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 4) (مستحسن على 4GB) ملف swap عشان البناء ما يقعش
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

> قاعدة البيانات و Redis **مش مكشوفين** على الإنترنت في `docker-compose.prod.yml`
> (مافيش `ports:` ليهم — على الشبكة الداخلية بس). ده مقصود. مانفتحش 5432/6379 في الجدار.

**انسخ الكود على السيرفر** (git clone للريبو، أو rsync). لازم يبقى معاك الجذر كامل لأن
البناء monorepo:
```bash
git clone <رابط-الريبو> /home/deploy/qadirfood
cd /home/deploy/qadirfood
```

---

## ٢) الدومين وسجلّات DNS

اشترِ دومين (مثلاً `qadirfood.sa` أو `.com`) ووجّه سجل **A** لعنوان IP السيرفر:

| النوع | الاسم | القيمة |
|---|---|---|
| A | `api.qadirfood.sa` | IP السيرفر |
| A | `admin.qadirfood.sa` | IP السيرفر (لو هتستضيف لوحة الأدمن هنا) |

الدومين المستخدم في الأمثلة هو `api.qadirfood.sa` — **بدّله بدومينك** في:
- `deploy/nginx.conf` (سطرين: `server_name` ومسارات الشهادة).
- `.env` → `PUBLIC_API_URL` و `CORS_ORIGINS`.
- بناء تطبيقات الموبايل: `--dart-define=API_URL=https://api.qadirfood.sa`.

استنى انتشار الـ DNS (دقايق لساعات). تأكّد: `dig +short api.qadirfood.sa`.

---

## ٣) شهادة TLS (Let's Encrypt / certbot)

إحنا بنستخدم أسلوب **webroot** عشان تجديد الشهادة يتم من غير إيقاف nginx. الـ compose
بيربط `/etc/letsencrypt` (للقراءة) و `./deploy/certbot/www` (تحدّي ACME).

**أول إصدار للشهادة** (nginx لسه ما اشتغلش بـ 443، فنصدر بأسلوب standalone سريع):

```bash
# ثبّت certbot على المضيف
sudo apt-get update && sudo apt-get install -y certbot

# لازم البورت 80 يكون فاضي وقت الإصدار الأول
# (لو الـ compose شغّال، أوقف nginx مؤقتاً: docker compose -f docker-compose.prod.yml stop nginx)
sudo certbot certonly --standalone -d api.qadirfood.sa \
  --agree-tos -m ahmedelashry6020@gmail.com --no-eff-email
```

الشهادة بتتكتب في `/etc/letsencrypt/live/api.qadirfood.sa/`. بعد كده شغّل الـ compose
(§5) والـ nginx هيلاقيها.

**التجديد التلقائي** (كل شهرين، Let's Encrypt عمرها 90 يوم): certbot بينصّب مؤقّت
systemd. عشان nginx يلقط الشهادة الجديدة بعد التجديد، ضيف hook لإعادة التحميل:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo 'docker compose -f /home/deploy/qadirfood/docker-compose.prod.yml exec nginx nginx -s reload' \
  | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run   # اختبار
```

---

## ٤) ملء `.env` الإنتاج

انسخ القالب واملأه على السيرفر (الملف **مايتحطّش في git** — موجود في `.gitignore`):

```bash
cp .env.example .env
nano .env
```

### ٤-أ) مفاتيح تقدر تولّدها بنفسك (مطلوبة فوراً)

| المفتاح | الوصف | إزاي تولّده |
|---|---|---|
| `NODE_ENV` | لازم = `production` | اكتبه يدوي |
| `JWT_SECRET` | سرّ توقيع توكن الدخول | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | سرّ توقيع توكن التجديد (مختلف عن اللي فوق) | `openssl rand -base64 48` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | بيانات قاعدة البيانات | اختر اسم + `openssl rand -hex 24` للباسورد |
| `REDIS_PASSWORD` | كلمة سر Redis (إلزامية في compose الإنتاج) | `openssl rand -hex 24` |

> **⚠️ باسوردات القاعدة و Redis لازم آمنة في الـ URL:** استخدم `openssl rand -hex 24`
> (حروف وأرقام بس). `base64` بيطلّع أحياناً `/` أو `+` أو `=` اللي بتكسر
> `DATABASE_URL`/`REDIS_URL` (compose بيركّبهم كـ URL). الـ JWT secrets ممكن base64 عادي
> لأنها مابتدخلش في URL.
| `CORS_ORIGINS` | دومينات اللوحات المسموح لها (مفصولة بفاصلة) | مثال: `https://admin.qadirfood.sa` |
| `PUBLIC_API_URL` | دومين الـ API العام (بيدخل في رابط رجوع ميسّر) | `https://api.qadirfood.sa` |
| `VAT_PERCENT` / `DEFAULT_COMMISSION_PERCENT` / `DEFAULT_DELIVERY_FEE` | قواعد العمل | حسب سياستك (VAT السعودية 15) |
| `REFUND_APPROVAL_THRESHOLD` | حد اعتماد الاسترداد | حسب سياستك |

> **مهم — `DATABASE_URL` و `REDIS_URL`:** مش محتاج تكتبهم في `.env`؛
> `docker-compose.prod.yml` بيبنيهم تلقائياً من بيانات القاعدة وكلمة سر Redis ويوجّههم
> لأسماء الخدمات الداخلية (`db:5432` / `redis:6379`).

**علمي العرض/التطوير — لازم تتقفل في الإنتاج** (السيرفر بيرفض الإقلاع لو مفتوحة):
```
DEMO_FLOW=0
LIVE_SIM=0
OTP_DEV_ECHO=      # شيله أو خليه فاضي — لو موجود بيرجّع رمز الـ OTP في الرد (خطر)
ENABLE_SWAGGER=    # سيبه فاضي عشان توثيق الـ API ما يتكشفش للعامة
```

### ٤-ب) تكاملات محتاجة **حسابات خارجية تخصّك** — فين تجيب كل مفتاح

كل واحد ده محتاج تفتح حساب عند المزوّد وتاخد منه المفاتيح. المنصة بتشتغل من غيرهم
(بوضع بديل)، بس الوضع الحقيقي محتاجهم:

| التكامل | المفاتيح في `.env` | فين تجيبها | مطلوب للإطلاق؟ |
|---|---|---|---|
| **الدفع — ميسّر (Moyasar)** | `PAYMENT_PROVIDER=moyasar` · `MOYASAR_SECRET_KEY` (sk_…) · `MOYASAR_PUBLISHABLE_KEY` (pk_…) · `MOYASAR_WEBHOOK_SECRET` | لوحة ميسّر → `dashboard.moyasar.com` → API Keys. الـ webhook secret من إعداد الـ Webhook. | **نعم** لو هتقبل مدى/Apple Pay/بطاقات. لو كاش-عند-الاستلام بس، تقدر تأجّله (سيب `PAYMENT_PROVIDER` فاضي = sandbox). |
| **Webhook الدفع** | `PAYMENTS_WEBHOOK_SECRET` | سرّ من عندك، وتحطّه كمان في إعداد الـ webhook بلوحة ميسّر. وجّه الـ webhook لـ `https://api.qadirfood.sa/api/payments/webhook`. | مع ميسّر: نعم |
| **إشعارات Push — Firebase (FCM)** | `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` · `FIREBASE_PRIVATE_KEY` | Firebase Console → إعدادات المشروع → **Service accounts** → *Generate new private key* (ملف JSON فيه القيم الثلاثة). | مستحسن جداً (تنبيه الطلبات/الكابتن). التطبيقات محتاجة كمان `google-services.json` / `GoogleService-Info.plist`. |
| **SMS / OTP — Unifonic** | `SMS_PROVIDER=unifonic` · `SMS_API_KEY` | حساب Unifonic (أو Twilio) → مفتاح الـ API + اعتماد اسم المرسل (Sender ID) من CITC. | **نعم** — من غيره تسجيل الدخول بـ OTP مش هيبعت رسائل حقيقية. |
| **التخزين — S3** | `AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` (+ اسم الـ bucket في `StorageDriver`) | AWS Console → IAM (مستخدم بصلاحية S3) + أنشئ Bucket. | اختياري — التخزين المحلي (`uploads/` على volume) شغّال. انقل لـ S3 لما الحجم يكبر أو تشغّل أكتر من نسخة. |
| **التحقّق بالوجه (بيومتري)** | نفس مفاتيح AWS + `FACE_CHECK_ENFORCE=1` | AWS Rekognition (أو Azure Face) — نفّذ `match` في `apps/api/src/face/face-gateway.ts`. | اشتراط الهيئة للكباتن. فعّله بعد ربط الخدمة. |
| **هيئة النقل (TGA)** | `TGA_ESTABLISHMENT_NUMBER` · `TGA_ENFORCE=1` | رقم منشأة + مفتاح API من الهيئة (لسه يدوي لحد ما يتوفّر اعتماد). نفّذ `verify` في `apps/api/src/tga/tga-gateway.ts`. | التحقّق يدوي دلوقتي. فعّل `TGA_ENFORCE` بعد الربط. |
| **الفوترة — ZATCA المرحلة الثانية** | `ZATCA_SELLER_NAME` · `ZATCA_VAT_NUMBER` (+ CSID/شهادة) | بوابة **فاتورة (Fatoora)** من هيئة الزكاة والضريبة → onboarding واستخراج CSID والشهادة. | المرحلة الأولى/التوليد جاهزة. التوقيع التشفيري (المرحلة الثانية) محتاج شهادتك. |
| **الخرائط** | `GOOGLE_MAPS_API_KEY` (اختياري) | Google Cloud → Maps API. | اختياري — حالياً OSM مجاني وشغّال. |

> **الخلاصة الصادقة:** أقل حاجة مطلوبة **لإطلاق حقيقي** = مزوّد SMS للـ OTP + (ميسّر لو
> فيه دفع إلكتروني). الباقي (S3، وجه بيومتري، TGA API، ZATCA-2، Google Maps) الهيكل جاهز
> والمنصة شغّالة من غيرهم، وتفعّلهم بالتدريج.

---

## ٥) البناء والتشغيل

```bash
cd /home/deploy/qadirfood
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # لازم كلهم healthy
docker compose -f docker-compose.prod.yml logs -f api
```

الـ API نفسه بيعمل **فحص إقلاع (fail-fast):** بيرفض يقوم لو أي سرّ إلزامي ناقص، أو لو
`NODE_ENV=production` مع سرّ ضعيف/افتراضي، أو `CORS_ORIGINS` ناقص، أو
`OTP_DEV_ECHO`/`DEMO_FLOW`/`LIVE_SIM` مفتوحين. لو الـ API وقع بعد التشغيل، اقرأ الـ logs —
الرسالة عربي وبتقولك المشكلة بالظبط.

اختبار سريع من برّه:
```bash
curl https://api.qadirfood.sa/health
# {"status":"ok","db":"up","redis":"up","at":"..."}
```

---

## ٦) تهيئة قاعدة البيانات (schema + PostGIS)

> **مهم وصادق:** الريبو حالياً **مافيهوش migrations متولّدة** لـ Prisma (مجلد
> `apps/api/prisma/migrations/` فيه `postgis.sql` بس). عشان كده أول تهيئة ليها مسارين:

**المسار (أ) — الموصى به لأول إطلاق (الريبو بيشتغل بيه على طول):** زامن الـ schema
مباشرة بأمر واحد. ده بيبني **كل** الجداول من `schema.prisma`:
```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db push
```
> ⚠️ **ماتشغّلش `prisma migrate deploy` على القاعدة زي ما هي** — الريبو مافيهوش
> مجلد migrations متولّد، فـ `migrate deploy` **مش هيبني أي جدول** والتطبيق هيفشل.
> استخدم `db push` (فوق) أو ولّد migration الأول (المسار ب).

**المسار (ب) — لو عايز تاريخ migrations (فرق أكبر/تحديثات متكررة):** على جهاز
التطوير ولّد migration أولية والتزم بها، وبعدها انشر بـ deploy:
```bash
# على قاعدة تطوير (مش السيرفر):
npm run prisma:migrate -w @delivery/api -- --name init
git add apps/api/prisma/migrations && git commit -m "chore: initial prisma migration"
# على السيرفر بعد سحب الكود:
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

**في الحالتين — طبّق امتداد PostGIS والفهارس الجغرافية** (Prisma بيعرّف أعمدة الموقع
كـ Unsupported، فالفهارس دي لازم يدوي — بدونها البحث عن أقرب مطعم/كابتن هيكون بطيء):
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < apps/api/prisma/migrations/postgis.sql
```

تأكّد: `docker compose -f docker-compose.prod.yml exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dx"` — لازم تلاقي `postgis`.

---

## ٧) إنشاء حساب الأدمن

> **تحذير:** `apps/api/prisma/seed.ts` هو **بذرة عرض (demo)** — بيزرع مطاعم وكباتن وطلبات
> وهمية وحسابات بباسورد `123456`. **ماتشغّلوش على إنتاج.** لو اتشغّل بالغلط، امسح حسابات
> الديمو فوراً (خصوصاً `0575420596` و `admin@delivery.sa`).

بدل كده، أنشئ **أدمن واحد بباسورد قوي** عبر أمر لمرة واحدة (بيستخدم `@prisma/client` و
`bcrypt` الموجودين في الصورة). مرّر البيانات كمتغيّرات بيئة عشان الباسورد ما يتسجّلش:

```bash
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_PHONE='0500000000' \
  -e ADMIN_EMAIL='admin@qadirfood.sa' \
  -e ADMIN_NAME='مدير المنصة' \
  -e ADMIN_PASSWORD='ضع-باسورد-قوي-هنا' \
  api node -e '
    const { PrismaClient } = require("@prisma/client");
    const bcrypt = require("bcrypt");
    (async () => {
      const p = new PrismaClient();
      const { ADMIN_PHONE, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
      if (!ADMIN_PHONE || !ADMIN_PASSWORD) { console.error("محتاج ADMIN_PHONE و ADMIN_PASSWORD"); process.exit(1); }
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      const u = await p.user.upsert({
        where:  { phone: ADMIN_PHONE },
        update: { passwordHash, role: "ADMIN", email: ADMIN_EMAIL || undefined },
        create: { phone: ADMIN_PHONE, email: ADMIN_EMAIL || null, fullName: ADMIN_NAME || "مدير المنصة", passwordHash, role: "ADMIN" },
      });
      console.log("تم تجهيز الأدمن:", u.id);
      await p.$disconnect();
    })().catch((e) => { console.error(e); process.exit(1); });
  '
```

الدخول للوحة بيتم بـ `identifier` (الجوال أو الإيميل) + الباسورد على `POST /api/auth/login`.
حساب الأدمن الفاضي الصلاحيات = **سوبر أدمن** (صلاحية كاملة)؛ لموظفين محدودين، امنح
`permissions` من الكتالوج في `src/common/permissions.ts`.

---

## ٨) النسخ الاحتياطي

### قاعدة البيانات (يومي)
`docker-compose.prod.yml` بيربط `./deploy/backups` جوّه حاوية القاعدة على `/backups`.

```bash
# نسخة يدوية
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > deploy/backups/qadirfood-$(date +%F-%H%M).dump
```

**جدولة يومية (cron على المضيف الساعة 3 فجراً):**
```bash
crontab -e
# أضف السطر:
0 3 * * * cd /home/deploy/qadirfood && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > deploy/backups/qadirfood-$(date +\%F).dump && find deploy/backups -name '*.dump' -mtime +14 -delete
```
> انقل النسخ لتخزين خارج السيرفر (S3/مساحة تانية) — نسخة على نفس القرص مش نسخة حقيقية.
> **اختبر الاستعادة فعلياً** مرة على الأقل قبل الإطلاق.

**الاستعادة:**
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < deploy/backups/الملف.dump
```

### Redis
`appendonly yes` مفعّل — البيانات بتفضل في volume `redis_data`. Redis عندنا كاش/طابور
(مش مصدر الحقيقة)، فنسخته أقل أهمية من القاعدة.

### الملفات المرفوعة
لو على التخزين المحلي (volume `uploads_data`)، خدله نسخة:
```bash
docker run --rm -v qadirfood_uploads_data:/data -v $(pwd)/deploy/backups:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```
> لما تنقل لـ S3، النسخ الاحتياطي بيبقى مسؤولية S3 (versioning) والـ volume ده بيبقى ملغي.

---

## ٩) المراقبة والصيانة

- **الصحة:** `GET /health` بيرجّع حالة القاعدة و Redis. وصّل مراقب خارجي (UptimeRobot أو
  ما شابه) يضربها كل دقيقة وينبّهك لو وقعت. الـ healthcheck داخل الحاويات مفعّل كمان.
- **السجلّات:** `docker compose -f docker-compose.prod.yml logs -f api`. فعّل تدوير السجلّات
  عشان القرص ما يمتلئش — في `/etc/docker/daemon.json`:
  ```json
  { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
  ```
  ثم `sudo systemctl restart docker`.
- **المساحة:** راقب القرص (`df -h`) والـ volumes. نظّف صور Docker القديمة: `docker system prune -f`.
- **إعادة التشغيل:** كل الخدمات `restart: unless-stopped` — بترجع لوحدها بعد إعادة تشغيل
  السيرفر.
- **التحديثات:** `git pull` ثم `docker compose -f docker-compose.prod.yml up -d --build`
  ثم `... exec api npx prisma migrate deploy` لو فيه migration جديدة.
- **تعدّد النسخ:** لو شغّلت أكتر من نسخة API، وصّل تخزين الـ throttler
  (`@nestjs/throttler`) بـ Redis (دلوقتي في الذاكرة — كافي لنسخة واحدة).

---

## ١٠) قائمة التأمين النهائية (إلزامية قبل الإطلاق)

- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` و `JWT_REFRESH_SECRET` جديدين وقويّين (`openssl rand`)، مش اللي في `.env.example`.
- [ ] `POSTGRES_PASSWORD` و `REDIS_PASSWORD` قويّين.
- [ ] `DEMO_FLOW=0` · `LIVE_SIM=0` · `OTP_DEV_ECHO` مشيل/فاضي · `ENABLE_SWAGGER` فاضي.
- [ ] `CORS_ORIGINS` = دومينات لوحاتك فقط (مش `*`).
- [ ] ماتشغّلش `seed.ts` على الإنتاج؛ ولو اتشغّل، امسح حسابات الديمو (`0575420596`، `admin@delivery.sa`) وكل الباسوردات `123456`.
- [ ] أدمن حقيقي واحد بباسورد قوي (§7).
- [ ] HTTPS شغّال والشهادة سليمة، والتجديد التلقائي متجرّب (`certbot renew --dry-run`).
- [ ] الجدار الناري: 22/80/443 بس؛ قاعدة البيانات و Redis **مش مكشوفين** (اتأكد مافيش `ports:` ليهم).
- [ ] النسخ الاحتياطي اليومي شغّال، ونسخة بتتنقل خارج السيرفر، والاستعادة **متجرّبة**.
- [ ] مراقب خارجي على `/health`، وتدوير السجلّات مفعّل.
- [ ] `.env` مش في git (اتأكد من `.gitignore`)، والمفاتيح الحقيقية على السيرفر بس.
- [ ] webhook ميسّر موجّه لـ `https://api.qadirfood.sa/api/payments/webhook` و `PAYMENTS_WEBHOOK_SECRET` مضبوط في المكانين.
- [ ] تطبيقات الموبايل مبنية بـ `--dart-define=API_URL=https://api.qadirfood.sa` (نسخة الإصدار بترفض أي HTTP).
- [ ] راجع صلاحيات موظفي اللوحة (RBAC) — امنح كل موظف اللي يحتاجه بس.

---

*آخر تحديث: 2026-07. للتفاصيل التقنية للتكاملات (فين يتربط كل مزوّد في الكود) شوف
`docs/07-deployment.md`.*
