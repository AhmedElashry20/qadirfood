# دليل النشر للإنتاج والمتاجر

المنصة **جاهزة على العمل** دلوقتي (تطوير/عرض كامل، داتا لايف). عشان **تنشرها
للإنتاج والمتاجر** فيه خطوات محتاجة **حسابات ومفاتيح خارجية** (مش ممكن أعملها
لأنها بتخصّك إنت). الدليل ده بيمشّيك خطوة خطوة، وبيقولك بالظبط كل مفتاح بيتحطّ فين.

القاعدة اللي المنصة اتبنت عليها: كل تكامل خارجي وراه **واجهة مجرّدة** (زي
`PaymentGateway`, `StorageDriver`, `TgaGateway`, `FaceGateway`) — فربط المزوّد
الحقيقي بيتم في **ملف واحد** من غير ما يلمس باقي النظام.

---

## ١) البنية التحتية

| المكوّن | التطوير الحالي | الإنتاج المطلوب |
|---|---|---|
| قاعدة البيانات | Postgres+PostGIS في Docker محلي | Postgres 16 مُدار بـ PostGIS (RDS/Cloud SQL/Supabase) + نسخ احتياطي |
| الكاش | Redis محلي | Redis مُدار (ElastiCache/Upstash) |
| الباك إند | `node dist/main.js` محلي | حاوية على (ECS/Cloud Run/VPS) خلف Nginx + **HTTPS** |
| الملفات | `uploads/` محلي (`LocalStorageDriver`) | S3/GCS — بدّل `StorageDriver` في `apps/api/src/uploads` |
| الدومين | localhost | دومين حقيقي بشهادة TLS (السوكيت والـ REST على HTTPS/WSS) |

خطوات: جهّز Postgres+PostGIS و Redis → `npx prisma migrate deploy` (بدل `db push`)
→ ابنِ صورة الـ API → انشرها خلف Nginx/HTTPS → وجّه الدومين.

## ٢) أسرار البيئة (`.env` الإنتاج)

`JWT_SECRET` (سرّ قوي جديد) · `JWT_REFRESH_SECRET` (سرّ تاني مختلف) · `DATABASE_URL`
· `REDIS_URL` · `CORS_ORIGINS` (دومين اللوحة) · `VAT_PERCENT` · `DEFAULT_DELIVERY_FEE`
· `REFUND_APPROVAL_THRESHOLD`.

**علمي العرض لازم يتقفلوا:** `DEMO_FLOW=0` · `LIVE_SIM=0` · `OTP_DEV_ECHO=0` (أو شيله).
**علمي الاشتراط (فعّلهم لما التكامل يجهز):** `TGA_ENFORCE` · `FACE_CHECK_ENFORCE` ·
`TGA_ESTABLISHMENT_NUMBER`.

> **فحص إقلاع تلقائي (fail-fast):** السيرفر بيرفض يقوم أصلاً لو أي سرّ إلزامي ناقص،
> ولو `NODE_ENV=production` بيرفض الأسرار الافتراضية/الضعيفة، أو `CORS_ORIGINS` ناقص،
> أو `OTP_DEV_ECHO`/`DEMO_FLOW`/`LIVE_SIM` لسه مفتوحين. يعني مستحيل تنشر بإعداد
> غير آمن من غير ما تاخد بالك. Swagger كمان بيتقفل في الإنتاج إلا بـ `ENABLE_SWAGGER=1`.

## ٣) التكاملات الخارجية (محتاجة حساباتك)

| التكامل | ليه | فين يتربط | محتاج منك |
|---|---|---|---|
| **بوابة دفع** (ميسر/HyperPay/نون) | تحصيل إلكتروني حقيقي بدل الـ sandbox | `apps/api/src/payments/payment-gateway.ts` (نفّذ `charge/refund`) + `POST /payments/webhook` | مفاتيح API + Merchant ID + إعداد Webhook |
| **ZATCA المرحلة الثانية** | التوقيع التشفيري والاعتماد المسبق (المرحلة الأولى/التوليد جاهزة) | موديول `invoices` | CSID + شهادة من الهيئة |
| **API هيئة النقل** | تحقّق بطاقة التوصيل آلياً (دلوقتي يدوي `manual`) | `apps/api/src/tga/tga-gateway.ts` (نفّذ `verify`) | رقم منشأة + مفتاح API من الهيئة |
| **مطابقة الوجه البيومترية** | تأكيد شخص الكابتن آلياً (دلوقتي `stub`) | `apps/api/src/face/face-gateway.ts` (نفّذ `match`) | AWS Rekognition / Azure Face keys |
| **Firebase FCM** | إشعارات Push (`User.fcmTokens` موجود) | موديول إشعارات جديد + استدعاء عند تغيّر الحالة | مشروع Firebase + مفتاح خادم |
| **مزوّد SMS** | OTP حقيقي (دلوقتي الرمز بيرجع في الرد للتطوير) | `apps/api/src/auth` (مسار OTP) | حساب SMS (Unifonic/Twilio) |
| **الخرائط** | حالياً OSM مجاني بدون مفتاح — شغّال. للتحويل لـ Google Maps | `live_map.dart` في كل تطبيق | مفتاح Google Maps (اختياري) |
| **التخزين S3** | ملفات الوثائق/السيلفي على سحابة | `apps/api/src/uploads` (`StorageDriver`) | S3 bucket + مفاتيح |

كل واحد من دول **الهيكل جاهز والباقي كله مبني عليه** — بس التنفيذ الحقيقي محتاج المفاتيح.

## ٤) تأمين قبل النشر (إلزامي)

- [ ] غيّر **كل** الباسوردات المزروعة · شيل حساب الديمو `0575420596`.
- [ ] `JWT_SECRET` جديد قوي (مش اللي في `.env.example`).
- [ ] `DEMO_FLOW=0` و`LIVE_SIM=0`.
- [ ] فعّل `TGA_ENFORCE` و`FACE_CHECK_ENFORCE` بعد ربط تكاملهم.
- [ ] راجع صلاحيات موظفي اللوحة (RBAC) — امنح كل موظف اللي يحتاجه بس.
- [x] **Rate limiting** على الدخول/OTP — متعمل (`@nestjs/throttler`: طلب رمز ٣/دقيقة،
      تحقّق ٥/دقيقة، دخول ١٠/دقيقة، وسقف عام ٣٠٠/دقيقة لكل IP). للنشر على أكتر من
      نسخة، وصّل تخزين الـ throttler بـ Redis (دلوقتي في الذاكرة — كافي لنسخة واحدة).
- [ ] HTTPS إجباري (الأندرويد `network_security_config` بيسمح HTTP للمحلي بس). تطبيقات
      الموبايل في نسخة الإصدار **بترفض** أي عنوان غير HTTPS — لازم تبنيها بـ
      `--dart-define=API_URL=https://دومينك`.

## ٥) نشر تطبيقات الموبايل

### أندرويد (Google Play)
1. حساب **Google Play Developer** (رسوم لمرة واحدة).
2. مفتاح توقيع: `keytool -genkey ... upload-keystore.jks` وظبّط `key.properties` +
   `signingConfigs` في `android/app/build.gradle.kts` (دلوقتي بيوقّع بـ debug).
3. `flutter build appbundle --release` → ارفع الـ `.aab` + بيانات المتجر (أيقونة،
   لقطات، سياسة خصوصية، إفصاح صلاحية الكاميرا/الموقع).

> ملاحظة toolchain متأكدة: NDK **27.1** (28.2 بيتعارض مع CMake 3.22.1)، و Kotlin
> in-process (في `~/.gradle/gradle.properties`). البناء اتجرّب: الـ APKs بتطلع.

### iOS (App Store)
1. حساب **Apple Developer** (اشتراك سنوي).
2. شهادات + Provisioning Profile في Xcode، وظبّط الـ Bundle ID والفريق.
3. `flutter build ipa` → ارفع عبر Transporter/Xcode + بيانات المتجر.

> أوصاف الأذونات جاهزة في `Info.plist` (الكاميرا/الصور لتطبيق الكابتن) — بيمنع
> الرفض/الـ crash. باقي الشاشات اتجرّبت على المحاكي.

## ٦) الجاهزية — مصفوفة صادقة

| | الحالة |
|---|---|
| كل الشاشات والموديولات (٤ تطبيقات + لوحتين) | ✅ متبني وحقيقي |
| المنطق المالي | ✅ متبني + **٨٠ اختبار** |
| الداتا لايف + السوكيت | ✅ شغّال |
| بناء أندرويد (APK/AAB) | ✅ اتجرّب |
| بناء iOS | ✅ الإعداد جاهز — النشر يحتاج حساب Apple |
| بوابة دفع / ZATCA-2 / هيئة النقل / وجه بيومتري / FCM / SMS | 🔌 الهيكل جاهز — يحتاج **مفاتيحك** |
| بنية إنتاج (استضافة/HTTPS/DB مُدارة) | 🔌 يحتاج حسابك السحابي |

**الخلاصة:** الكود والمنطق والواجهات كلها جاهزة للعمل والنشر. اللي متبقّي هو ربط
**حساباتك ومفاتيحك** الخارجية (دفع/متاجر/استضافة) — وكل واحد منهم مكانه محدّد فوق.
