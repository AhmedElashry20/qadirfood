#!/usr/bin/env bash
# يولّد PDF بيانات الدخول من ملف البذرة.
#
# الطريق: HTML (بخطوط المشروع مدمجة base64) ← Chrome بلا واجهة ← PDF.
# اختير هذا بدل مكتبات PDF لأن العربي يحتاج تشكيل حروف واتجاهاً صحيحاً، وChrome
# يتولّاهما أصلاً، بينما reportlab يلزمه arabic_reshaper و python-bidi يدوياً.
#
# التشغيل: bash docs/credentials/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="docs/credentials/بيانات-الدخول-قادر-فود.pdf"

python3 docs/credentials/render.py
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/$OUT" \
  "file://$PWD/docs/credentials/credentials.html" 2>/dev/null

echo "✅ $OUT"
