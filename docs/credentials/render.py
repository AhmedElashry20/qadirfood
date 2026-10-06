# -*- coding: utf-8 -*-
"""يبني credentials.html بخطوط المشروع مدمجة — الخطوة الأولى في build.sh."""
import base64, io, pathlib

F = pathlib.Path('apps/customer_app/assets/fonts')
b64 = lambda n: base64.b64encode((F / n).read_bytes()).decode('ascii')
fonts = {
    'cairo400': b64('Cairo-400.ttf'),
    'cairo700': b64('Cairo-700.ttf'),
    'cairo900': b64('Cairo-900.ttf'),
    'outfit700': b64('Outfit-700.ttf'),
}

TEMPLATE = r"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>بيانات الدخول — قادر فود</title>
<style>
  @font-face { font-family:'Cairo'; font-weight:400; src:url(data:font/ttf;base64,{cairo400}) format('truetype'); }
  @font-face { font-family:'Cairo'; font-weight:700; src:url(data:font/ttf;base64,{cairo700}) format('truetype'); }
  @font-face { font-family:'Cairo'; font-weight:900; src:url(data:font/ttf;base64,{cairo900}) format('truetype'); }
  @font-face { font-family:'Outfit'; font-weight:700; src:url(data:font/ttf;base64,{outfit700}) format('truetype'); }

  @page { size: A4; margin: 14mm 13mm; }

  :root {
    --brand:#FFD200; --ink:#1C1C1C; --canvas:#F7F6F1; --line:#EFEDE5;
    --border:#E8E6DE; --label:#6E6A5C; --gold:#8A7500; --tint:#FFF9DE;
    --tintBorder:#F2E9B8; --danger:#C0392B; --dangerBg:#FDF0EE;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font-family:'Cairo',sans-serif; color:var(--ink);
    font-size:9.6pt; line-height:1.6; background:#fff;
  }
  .num { font-family:'Outfit',sans-serif; font-weight:700; direction:ltr; unicode-bidi:embed; }

  header { display:flex; align-items:center; gap:9px; padding-bottom:9px; border-bottom:2.5px solid var(--brand); }
  .mark { width:26px; height:26px; background:var(--brand); color:var(--gold);
           border-radius:7px; display:flex; align-items:center; justify-content:center;
           font-weight:900; font-size:14pt; }
  h1 { margin:0; font-size:15pt; font-weight:900; }
  .sub { margin:0; font-size:8.4pt; color:var(--label); font-weight:700; }
  .meta { margin-right:auto; text-align:left; font-size:8pt; color:var(--label); font-weight:700; }

  .pw { margin-top:11px; background:var(--tint); border:1.5px solid var(--tintBorder);
         border-radius:9px; padding:9px 12px; display:flex; align-items:center; gap:10px; }
  .pw b { font-size:10pt; }
  .pwv { font-family:'Outfit',sans-serif; font-weight:700; font-size:15pt;
          background:var(--ink); color:var(--brand); padding:2px 12px; border-radius:6px;
          letter-spacing:2px; direction:ltr; }
  .pw span { font-size:8.4pt; color:var(--gold); font-weight:700; }

  h2 { font-size:10.5pt; font-weight:900; margin:15px 0 7px; padding-bottom:4px;
        border-bottom:1.5px solid var(--border); }
  h2 small { font-weight:700; font-size:8.2pt; color:var(--label); }

  table { width:100%; border-collapse:collapse; }
  th { background:var(--canvas); font-size:7.8pt; font-weight:900; color:var(--label);
        text-align:right; padding:6px 8px; border:1px solid var(--border); }
  td { padding:6px 8px; border:1px solid var(--border); font-size:9pt; vertical-align:middle; }
  td.n { font-family:'Outfit',sans-serif; font-weight:700; direction:ltr; text-align:right; white-space:nowrap; }
  td.role { color:var(--label); font-size:8.4pt; font-weight:700; }
  tr:nth-child(even) td { background:#FCFCFA; }
  .tag { display:inline-block; background:var(--brand); color:var(--gold);
          font-size:7.4pt; font-weight:900; padding:1px 6px; border-radius:4px; }

  .note { margin-top:8px; background:var(--canvas); border-right:3px solid var(--brand);
           padding:7px 10px; font-size:8.4pt; color:var(--label); font-weight:700; border-radius:0 6px 6px 0; }
  .warn { margin-top:14px; background:var(--dangerBg); border:1.5px solid #F1C9C3;
           border-radius:9px; padding:9px 12px; font-size:8.6pt; font-weight:700; color:var(--danger); }
  .warn b { display:block; font-size:9.4pt; margin-bottom:3px; }
  footer { margin-top:13px; padding-top:7px; border-top:1px solid var(--line);
            font-size:7.6pt; color:var(--label); font-weight:700; display:flex; gap:12px; }
  footer span:last-child { margin-right:auto; }
</style>
</head>
<body>

<header>
  <div class="mark">ق</div>
  <div>
    <h1>بيانات الدخول</h1>
    <p class="sub">منصة قادر فود — بيئة التطوير المحلية</p>
  </div>
  <div class="meta">
    ٢٨ سبتمبر ٢٠٢٦<br>
    مصدر البيانات: <span class="num">prisma/seed.ts</span>
  </div>
</header>

<div class="pw">
  <b>كلمة المرور للجميع</b>
  <span class="pwv">123456</span>
  <span>تُضبط في البذرة عبر bcrypt — موحّدة لكل الحسابات التي تستخدم كلمة مرور</span>
</div>

<h2>١) الدخول ببريد إلكتروني وكلمة مرور <small>— لوحة الإدارة · تطبيق المطعم · لوحة الشركة</small></h2>
<table>
  <thead>
    <tr><th style="width:23%">الواجهة</th><th style="width:26%">البريد الإلكتروني</th><th style="width:16%">أو الجوال</th><th>الدور والملاحظات</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><b>لوحة الإدارة</b><br><span class="num" style="font-size:8pt;color:#6E6A5C">localhost:5174</span></td>
      <td class="n">admin@delivery.sa</td>
      <td class="n">0500000000</td>
      <td class="role">مدير المنصة — صلاحية كاملة</td>
    </tr>
    <tr>
      <td><b>لوحة الإدارة</b><br><span class="tag">حساب ثانٍ</span></td>
      <td class="n">reviewer@delivery.sa</td>
      <td class="n">0500000009</td>
      <td class="role">مدير المراجعة — لازم للموافقة المزدوجة على الاستردادات الكبيرة</td>
    </tr>
    <tr>
      <td><b>تطبيق المطعم</b></td>
      <td class="n">manager@aseel.sa</td>
      <td class="n">0511111111</td>
      <td class="role">أحمد المدير — مدير فرعين، يُطلب منه اختيار الفرع عند الدخول</td>
    </tr>
    <tr>
      <td><b>تطبيق المطعم</b></td>
      <td class="n">cashier@aseel.sa</td>
      <td class="n">0522222222</td>
      <td class="role">خالد الكاشير — فرع واحد، صلاحيات أقل</td>
    </tr>
    <tr>
      <td><b>لوحة شركة الأسطول</b></td>
      <td class="n">ops@suraa.sa</td>
      <td class="n">0553330001</td>
      <td class="role">مشغّل شركة «سرعة» — يرى مندوبيه وتسوياتهم فقط</td>
    </tr>
  </tbody>
</table>
<div class="note">
  حقل الدخول يقبل البريد أو الجوال — الـ API يبحث بالاثنين. ومدير الفرعين يصل رداً بقائمة فروع ليختار منها قبل إتمام الدخول.
</div>

<h2>٢) الدخول بجوال ورمز تحقق (OTP) <small>— تطبيق العميل · تطبيق الكابتن</small></h2>
<table>
  <thead>
    <tr><th style="width:23%">التطبيق</th><th style="width:16%">الجوال</th><th style="width:20%">الاسم</th><th>ملاحظات</th></tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="4"><b>تطبيق العميل</b><br><span class="num" style="font-size:8pt;color:#6E6A5C">localhost:5180</span></td>
      <td class="n">0575420596</td><td>أحمد الأشرف</td>
      <td class="role"><span class="tag">مُوصى به</span> عليه الطلب الجاري والمفضلة وسجل الطلبات</td>
    </tr>
    <tr><td class="n">0555555555</td><td>محمد العميل</td><td class="role">حساب عادي</td></tr>
    <tr><td class="n">0566666666</td><td>نورة العميلة</td><td class="role">حي الملز</td></tr>
    <tr><td class="n">0577777777</td><td>عبدالله العميل</td><td class="role">حي السليمانية</td></tr>

    <tr>
      <td rowspan="3"><b>تطبيق الكابتن</b><br><span class="num" style="font-size:8pt;color:#6E6A5C">محاكي iPhone</span></td>
      <td class="n">0533333333</td><td>سعد الكابتن</td>
      <td class="role">تابع لشركة «سرعة» — يرى «شركتك هي التي تدفع لك» بلا محفظة</td>
    </tr>
    <tr>
      <td class="n">0544444444</td><td>فهد الكابتن</td>
      <td class="role"><span class="tag">مُوصى به</span> مستقل — يرى المحفظة والرصيد والسحب</td>
    </tr>
    <tr>
      <td class="n">0555111222</td><td>ماجد الكابتن</td>
      <td class="role">وثائقه ناقصة — لتجربة حجب التوزيع في لوحة الالتزام</td>
    </tr>
  </tbody>
</table>

<h2>٣) كباتن يتحركون على الخريطة <small>— للتجربة في لوحة الإدارة، جميعهم بوثائق معتمدة</small></h2>
<table>
  <thead>
    <tr><th style="width:16%">الجوال</th><th style="width:20%">الاسم</th><th style="width:16%">اللوحة</th><th style="width:14%">المركبة</th><th>بطاقة هيئة النقل</th></tr>
  </thead>
  <tbody>
    <tr><td class="n">0561000001</td><td>تركي المندوب</td><td class="n">AAA 1111</td><td class="role">دراجة نارية</td><td class="role">سارية ٤٢٠ يوماً</td></tr>
    <tr><td class="n">0561000002</td><td>عمر المندوب</td><td class="n">BBB 2222</td><td class="role">سيارة</td><td class="role">سارية ٣٦٥ يوماً</td></tr>
    <tr><td class="n">0561000003</td><td>سالم المندوب</td><td class="n">CCC 3333</td><td class="role">دراجة نارية</td><td class="role">سارية ٥٠٠ يوم</td></tr>
    <tr><td class="n">0561000004</td><td>بدر المندوب</td><td class="n">DDD 4444</td><td class="role">دراجة نارية</td><td class="role"><b style="color:#C0392B">تنتهي بعد ٢٥ يوماً</b> — لتجربة حالة «قرب الانتهاء»</td></tr>
    <tr><td class="n">0561000005</td><td>ناصر المندوب</td><td class="n">EEE 5555</td><td class="role">سيارة</td><td class="role">سارية ٣٠٠ يوم</td></tr>
  </tbody>
</table>

<h2>٤) كيف تحصل على رمز التحقق</h2>
<div class="note" style="border-right-color:#0BA55B">
  <b>الرمز أربعة أرقام عشوائية في كل مرة — ليس ثابتاً.</b> يُولَّد تشفيرياً ويصلح خمس دقائق.
  لكن المفتاح <span class="num">OTP_DEV_ECHO=1</span> مضبوط في ملف <span class="num">.env</span>،
  فيُرجع الـ API الرمز داخل الرد ويعرضه التطبيق لك مباشرة على شاشة إدخال الرمز. لن تحتاج للبحث عنه.
  <br><br>
  وإن لم يظهر، فهو مكتوب أيضاً في سجل الـ API بالصيغة: <span class="num">OTP لـ 0575420596: 1234</span>
</div>

<div class="warn">
  <b>بيانات تطوير — ليست للإنتاج</b>
  كلمة مرور موحّدة <span class="num">123456</span> وإظهار رمز التحقق في الرد مقبولان محلياً فقط.
  المفتاح <span class="num">OTP_DEV_ECHO</span> معطَّل تلقائياً عندما تكون <span class="num">NODE_ENV=production</span>،
  لكن كلمات المرور لن تتغيّر وحدها — بذرة الإنتاج <span class="num">seed-prod.ts</span> منفصلة ويلزم ضبط كلمات مرور قوية فيها.
  لا تشارك هذا الملف خارج فريق التطوير.
</div>

<footer>
  <span>قادر فود — بيانات الدخول</span>
  <span>كلمة المرور: <span class="num">123456</span></span>
  <span>مستخرَجة من <span class="num">apps/api/prisma/seed.ts</span></span>
</footer>

</body>
</html>
"""

# استبدال مباشر لا `.format()`: القالب فيه CSS بأقواس {} و`format` يفسّرها
# كحقول ويفشل. الاستبدال الصريح يمسّ العناصر الأربعة فقط.
html = TEMPLATE
for key, data in fonts.items():
    html = html.replace('{' + key + '}', data)

pathlib.Path('docs/credentials/credentials.html').write_text(html, encoding='utf-8')
print('credentials.html جاهز')
