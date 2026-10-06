// يولّد أكواد QR كملفات SVG لصفحة البروفايل.
//
// SVG بدل PNG عن قصد: متجهي فيطبع بأي مقاس بلا تشويش، وحجمه أقل من ٣ كيلوبايت،
// ويُدمج في الصفحة بلا طلب شبكة إضافي.
//
// التشغيل:  node apps/landing/gen-qr.js
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const SITE = 'https://qadirfood.ct.ws';
const RELEASES = 'https://github.com/AhmedElashry20/qadirfood/releases/latest/download';

const targets = [
  // نسخ الويب — تفتح في المتصفح مباشرة بلا تثبيت
  { name: 'web-customer', url: `${SITE}/app/customer/` },
  { name: 'web-captain', url: `${SITE}/app/captain/` },
  { name: 'web-merchant', url: `${SITE}/app/merchant/` },
  { name: 'web-admin', url: `${SITE}/admin/` },
  // تحميل أندرويد على GitHub Releases — حد الملف على الاستضافة ١٠ ميجا
  // وحزمة فلاتر أكبر من كده بكثير.
  { name: 'apk-customer', url: `${RELEASES}/qadirfood-customer.apk` },
  { name: 'apk-captain', url: `${RELEASES}/qadirfood-captain.apk` },
  { name: 'apk-merchant', url: `${RELEASES}/qadirfood-merchant.apk` },
];

const out = path.join(__dirname, 'assets', 'qr');
fs.mkdirSync(out, { recursive: true });

(async () => {
  for (const t of targets) {
    const svg = await QRCode.toString(t.url, {
      type: 'svg',
      errorCorrectionLevel: 'M', // يتحمّل تلفاً حتى ١٥٪ — يكفي للشاشة والطباعة
      margin: 1,
      color: { dark: '#1C1C1C', light: '#FFFFFF' },
    });
    fs.writeFileSync(path.join(out, `${t.name}.svg`), svg, 'utf8');
    console.log(`  ${t.name}.svg  ←  ${t.url}`);
  }
  console.log(`\n✅ ${targets.length} كود في ${path.relative(process.cwd(), out)}`);
})();
