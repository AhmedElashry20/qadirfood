// ترميز QR بتاع فاتورة ZATCA المرحلة الأولى (المبسّطة).
//
// الـ QR مش صورة عشوائية — هو ٥ حقول مترمّزة TLV (Tag-Length-Value) وبعدين
// base64، بالظبط زي ما هيئة الزكاة والضريبة بتطلب. أي تطبيق تحقق رسمي (Fatoora)
// بيقدر يقرا الـ QR ده ويطلّع منه بيانات البائع والمبلغ والضريبة.
//
// ⚠️ ده **التوليد** (المرحلة الأولى) بس. الربط والاعتماد المسبق مع سيرفرات
// الهيئة (المرحلة الثانية) لسه مش موجود — مافيش توقيع تشفيري ولا CSID.

/**
 * حقل TLV واحد: بايت للوسم + بايت للطول + قيمة UTF-8.
 *
 * الطول **بالبايتات مش بالحروف** — مهم جداً للعربي لأن الحرف بياخد بايتين في
 * UTF-8، فلو حسبناه بالحروف الـ QR بيطلع غلط ومايتقراش.
 */
function tlv(tag: number, value: string): Buffer {
  const valueBuf = Buffer.from(value, 'utf8');
  if (valueBuf.length > 255) {
    // الطول بايت واحد (٠–٢٥٥). أسماء البائع أقصر من كده بكتير، بس نحمي الترميز.
    throw new Error(`قيمة حقل ZATCA أطول من ٢٥٥ بايت (الوسم ${tag})`);
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBuf.length]), valueBuf]);
}

export interface ZatcaQrFields {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 بتوقيت UTC — «2026-07-21T09:30:00Z». */
  timestamp: string;
  /** الإجمالي شامل الضريبة — نص بمنزلتين «59.90». */
  totalWithVat: string;
  /** إجمالي الضريبة — نص بمنزلتين «9.30». */
  vatTotal: string;
}

/**
 * بيرجّع محتوى الـ QR كـ base64 حسب مواصفة الهيئة:
 *   Tag 1 = اسم البائع · 2 = الرقم الضريبي · 3 = وقت الفاتورة ·
 *   4 = الإجمالي شامل الضريبة · 5 = إجمالي الضريبة.
 */
export function encodeZatcaQr(fields: ZatcaQrFields): string {
  return Buffer.concat([
    tlv(1, fields.sellerName),
    tlv(2, fields.vatNumber),
    tlv(3, fields.timestamp),
    tlv(4, fields.totalWithVat),
    tlv(5, fields.vatTotal),
  ]).toString('base64');
}

/**
 * بيفك ترميز base64 لـ TLV — للتحقق والاختبار. بيرجّع خريطة {tag: value}.
 * (نفس اللي تطبيق التحقق الرسمي بيعمله.)
 */
export function decodeZatcaQr(base64: string): Record<number, string> {
  const buf = Buffer.from(base64, 'base64');
  const out: Record<number, string> = {};
  let i = 0;
  while (i + 2 <= buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    const value = buf.subarray(i + 2, i + 2 + len).toString('utf8');
    out[tag] = value;
    i += 2 + len;
  }
  return out;
}
