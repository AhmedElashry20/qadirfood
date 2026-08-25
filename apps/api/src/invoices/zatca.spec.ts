import { describe, it, expect } from 'vitest';
import { encodeZatcaQr, decodeZatcaQr, type ZatcaQrFields } from './zatca';

// فاتورة ZATCA — الـ QR لازم يبقى TLV صح عشان أي تطبيق تحقق رسمي يقراه. أهم
// نقطة: الطول **بالبايتات مش بالحروف** (العربي بايتين لكل حرف).

const sample: ZatcaQrFields = {
  sellerName: 'قادر فود للتوصيل',
  vatNumber: '300000000000003',
  timestamp: '2026-07-21T09:30:00Z',
  totalWithVat: '59.90',
  vatTotal: '9.30',
};

describe('ZATCA QR (TLV encoding)', () => {
  it('round-trips: decode(encode(x)) بيرجّع نفس الحقول الخمسة', () => {
    const decoded = decodeZatcaQr(encodeZatcaQr(sample));
    expect(decoded[1]).toBe(sample.sellerName);
    expect(decoded[2]).toBe(sample.vatNumber);
    expect(decoded[3]).toBe(sample.timestamp);
    expect(decoded[4]).toBe(sample.totalWithVat);
    expect(decoded[5]).toBe(sample.vatTotal);
  });

  it('الطول بالبايتات: اسم البائع العربي (١٦ حرف) بيتخزّن طوله ٢٩ بايت مش ١٦', () => {
    const buf = Buffer.from(encodeZatcaQr(sample), 'base64');
    // buf[0] = tag(1), buf[1] = length byte. القيمة UTF-8 للعربي أطول من عدد الحروف.
    const lengthByte = buf[1];
    const utf8Bytes = Buffer.from(sample.sellerName, 'utf8').length;
    expect(lengthByte).toBe(utf8Bytes);
    expect(lengthByte).toBeGreaterThan(sample.sellerName.length); // بايت > حرف
  });

  it('الترميز بيبدأ بالوسم ١ (اسم البائع) وبعده بايت الطول', () => {
    const buf = Buffer.from(encodeZatcaQr(sample), 'base64');
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(Buffer.from(sample.sellerName, 'utf8').length);
  });

  it('بيرمي لو القيمة أطول من ٢٥٥ بايت (طول الحقل بايت واحد)', () => {
    const tooLong = { ...sample, sellerName: 'ا'.repeat(200) }; // 200 حرف × 2 بايت = 400 > 255
    expect(() => encodeZatcaQr(tooLong)).toThrow();
  });

  it('الأرقام اللاتينية: كل بايت = حرف (طول الرقم الضريبي ١٥)', () => {
    const decoded = decodeZatcaQr(encodeZatcaQr(sample));
    expect(decoded[2]).toHaveLength(15);
  });
});
