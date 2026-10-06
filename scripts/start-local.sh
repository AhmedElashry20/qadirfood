#!/usr/bin/env bash
# تشغيل المنصة كاملة محلياً: قاعدة البيانات ← الهجرة ← البذرة ← الـ API.
#
# يتوقف عند أول فشل بدل أن يكمل بخطوة ناقصة — بذرة على قاعدة بلا جداول
# تنتج أخطاء مربكة تخفي السبب الحقيقي.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }

say 'التحقق من محرّك Docker'
# هذا الجهاز يستخدم colima (محرّك خفيف بديل عن Docker Desktop). نشغّله تلقائياً
# إن كان متوقفاً، بدل أن نطلب من المستخدم فتح تطبيق غير مثبَّت أصلاً.
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    echo '• المحرّك متوقف — تشغيل colima (قد يستغرق دقيقة)'
    colima start --cpu 2 --memory 4 --disk 20
  else
    echo '✗ لا يوجد محرّك Docker. ثبّت colima:  brew install colima'
    exit 1
  fi
fi
docker info >/dev/null 2>&1 || { echo '✗ تعذّر تشغيل محرّك Docker'; exit 1; }

say 'تشغيل PostGIS و Redis'
docker compose up -d db redis

say 'انتظار جاهزية قاعدة البيانات'
# الحاوية تبدأ قبل أن يقبل Postgres الاتصالات — بلا الانتظار تفشل الهجرة.
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U delivery >/dev/null 2>&1; then
    echo '✓ قاعدة البيانات جاهزة'
    break
  fi
  [ "$i" = 60 ] && { echo '✗ انتهت المهلة'; exit 1; }
  sleep 1
done

say 'تطبيق الهجرة (schema)'
npm run db:migrate

say 'زراعة البيانات'
npm run db:seed

say 'كل شيء جاهز'
cat <<'EOF'

  شغّل الـ API في نافذة منفصلة:
      npm run dev:api

  الواجهات:
      لوحة الإدارة      http://localhost:5174
      تطبيق العميل      http://localhost:5180
      الموقع التعريفي   http://localhost:5175

  الدخول: admin@delivery.sa / 123456
  التفاصيل كاملة في docs/credentials/

EOF
