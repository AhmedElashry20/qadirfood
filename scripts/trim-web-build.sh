#!/usr/bin/env bash
# يقلّص مخرجات بناء فلاتر للويب قبل الرفع على استضافة محدودة.
#
# فلاتر يصدّر كل بدائل محرّك الرسم (CanvasKit) ليختار المتصفح ما يناسبه وقت
# التشغيل، لكن المتصفح يحمّل واحداً فقط. الباقي يشغل مساحة ووقت رفع بلا فائدة:
#   · chromium/ و experimental_webparagraph/ — بدائل لا تُطلب في التشغيل العادي
#   · skwasm_heavy و wimp — مسارات تجريبية
#   · *.symbols — خرائط لتصحيح الأخطاء، لا يحتاجها المستخدم
#
# نُبقي canvaskit.js/.wasm و skwasm.js/.wasm — وهما ما يحمّله المتصفح فعلاً.
set -euo pipefail
DIR="${1:?الاستخدام: trim-web-build.sh <مجلد build/web>}"
[ -d "$DIR" ] || { echo "✗ غير موجود: $DIR"; exit 1; }

before=$(du -sm "$DIR" | cut -f1)

rm -rf "$DIR/canvaskit/chromium" "$DIR/canvaskit/experimental_webparagraph"
rm -f "$DIR/canvaskit/skwasm_heavy."* "$DIR/canvaskit/wimp."*
find "$DIR" -name '*.symbols' -delete

after=$(du -sm "$DIR" | cut -f1)
echo "  ${before}م ← ${after}م"
