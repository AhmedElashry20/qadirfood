#!/usr/bin/env bash
# يبني كل ما يُرفع على الاستضافة في مجلد واحد جاهز.
#
# البنية الناتجة تطابق ما تتوقعه أكواد الـ QR وروابط صفحة البروفايل:
#   dist-site/
#     index.html          صفحة البروفايل
#     assets/qr/*.svg     أكواد QR
#     app/customer/       تطبيق العميل (ويب)
#     app/captain/        تطبيق الكابتن (ويب)
#     app/merchant/       تطبيق المطعم (ويب)
#     admin/              لوحة الإدارة
#
# يحتاج رابط الـ API حتى تعرف الواجهات أين ترسل طلباتها:
#   API_URL=https://xxx.onrender.com bash scripts/build-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# العنوان اختياري: الواجهات تقرؤه وقت التشغيل من config.js، فيمكن البناء الآن
# وضبط العنوان لاحقاً بتعديل ملف واحد بعد الرفع.
API_URL="${API_URL:-REPLACE_ME}"
if [ "$API_URL" = "REPLACE_ME" ]; then
  echo '• لم يُحدَّد API_URL — سيُبنى بعنوان نائب.'
  echo '  بعد نشر الخادم، عدّل العنوان في:  dist-site/app/*/config.js  و  dist-site/admin/config.js'
fi

OUT="dist-site"
say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }

rm -rf "$OUT"
mkdir -p "$OUT/app"

say 'صفحة البروفايل وأكواد QR'
node apps/landing/gen-qr.js
cp apps/landing/index.html "$OUT/index.html"
mkdir -p "$OUT/assets"
cp -R apps/landing/assets/qr "$OUT/assets/qr"

say 'لوحة الإدارة'
# base='/admin/' لأن اللوحة تُقدَّم من مجلد فرعي لا من الجذر؛ بدونه تطلب
# أصولها من '/assets/...' فتسقط بصفحة بيضاء.
npm run build -w @delivery/admin-web -- --base=/admin/
mkdir -p "$OUT/admin"
cp -R apps/admin-web/dist/* "$OUT/admin/"

for app in customer captain merchant; do
  say "تطبيق ${app} (ويب)"
  (
    cd "apps/${app}_app"
    flutter build web --release \
      --base-href "/app/${app}/" \
      --dart-define=API_URL="$API_URL"
  )
  mkdir -p "$OUT/app/${app}"
  cp -R "apps/${app}_app/build/web/"* "$OUT/app/${app}/"
  # اضبط العنوان في نسخة المخرجات (المصدر يبقى بالقيمة النائبة)
  printf "window.qadirConfig = { apiUrl: '%s' };\n" "$API_URL" > "$OUT/app/${app}/config.js"
done

say 'ملفات الخادم'
# InfinityFree يستخدم Apache. هذه القواعد تجعل التوجيه داخل التطبيقات يعمل:
# كل تطبيق SPA يتعامل مع مساره بنفسه، فأي مسار غير موجود يُعاد إلى index.html
# الخاص بذلك التطبيق — وإلا يعطي 404 عند تحديث الصفحة في أي مسار داخلي.
for d in admin app/customer app/captain app/merchant; do
  cat > "$OUT/$d/.htaccess" <<'HT'
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]
HT
done

say 'تم'
echo "  المجلد: $OUT"
du -sh "$OUT" 2>/dev/null
echo
echo '  ارفع *محتويات* هذا المجلد إلى  qadirfood.ct.ws/htdocs'
echo '  (المحتويات نفسها، لا المجلد — أي index.html يقع مباشرة داخل htdocs)'
echo
echo '  تنبيه: حد حجم الملف الواحد على الاستضافة ١٠ ميجابايت.'
echo '  للتحقق قبل الرفع:'
echo "      find $OUT -type f -size +10M"
