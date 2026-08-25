#!/usr/bin/env bash
# بناء نسخ الإصدار (AAB لجوجل بلاي) للتطبيقات الثلاثة.
#
# الاستخدام:
#   API_URL=https://api.qadirfood.sa scripts/build-release.sh
#   (أو مرّر الدومين كأول وسيط)
#
# مهم: JAVA_TOOL_OPTIONS بيفرض أرقام لاتينية على كل الـ JVMs — من غيره bundletool
# بيكتب classes٢.dex بالأرقام العربية على نظام لغته عربية ويفشل البناء.
set -euo pipefail

API_URL="${1:-${API_URL:-}}"
if [ -z "$API_URL" ]; then
  echo "لازم تحدّد API_URL (دومين الـ API الإنتاجي بـ HTTPS)."
  echo "مثال: API_URL=https://api.qadirfood.sa $0"
  exit 1
fi
case "$API_URL" in
  https://*) ;;
  *) echo "API_URL لازم يبدأ بـ https:// (نسخة الإصدار بترفض غير HTTPS)."; exit 1;;
esac

export JAVA_TOOL_OPTIONS="-Duser.language=en -Duser.country=US"
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS=(customer_app captain_app merchant_app)

for app in "${APPS[@]}"; do
  echo "════════ بناء $app ════════"
  cd "$ROOT/apps/$app"
  flutter pub get
  flutter build appbundle --release --dart-define=API_URL="$API_URL"
  echo "✓ $app → build/app/outputs/bundle/release/app-release.aab"
done

echo ""
echo "تمّت كل النسخ. ارفع كل app-release.aab على Google Play Console."
echo "لبناء APK بدل AAB (للتجربة المباشرة): flutter build apk --release --dart-define=API_URL=$API_URL"
