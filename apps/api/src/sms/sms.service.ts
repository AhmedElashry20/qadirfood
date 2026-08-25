// إرسال الرسائل النصية (OTP) — نفس فكرة الواجهات المجرّدة في المشروع: الكود اللي
// بينده مايهمّوش المزوّد. المتاح: **Unifonic** (سعودي) الحقيقي، ويرجع للـ«log»
// (تطوير) لو المفاتيح مش متظبّطة — فمافيش نص إعداد يوقّع النظام.
//
// تفعيله: `SMS_PROVIDER=unifonic` + `SMS_API_KEY` (AppSid) + `SMS_SENDER_ID`.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const UNIFONIC_ENDPOINT = 'https://el.cloud.unifonic.com/rest/SMS/messages';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  /** المزوّد الفعّال — «unifonic» لو مظبوط بمفتاح، وإلا «log» (تطوير). */
  private provider(): 'unifonic' | 'log' {
    const provider = this.config.get<string>('SMS_PROVIDER');
    const key = this.config.get<string>('SMS_API_KEY');
    return provider === 'unifonic' && key ? 'unifonic' : 'log';
  }

  /**
   * تحويل الرقم لصيغة دولية بدون «+» زي ما Unifonic بتطلب.
   * `05xxxxxxxx` → `9665xxxxxxxx` · `+9665...` → `9665...` · `9665...` كما هي.
   */
  private normalize(phone: string): string {
    let p = phone.trim().replace(/[\s-]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = '966' + p.slice(1);
    return p;
  }

  /**
   * إرسال رسالة. بترجّع `true` لو اتبعتت فعلاً. الفشل **مابيرميش استثناء** —
   * بيتسجّل بس عشان مايوقّفش مسار الدخول (المستخدم يقدر يعيد الطلب).
   */
  async send(phone: string, message: string): Promise<boolean> {
    if (this.provider() === 'log') {
      this.logger.warn(`[SMS/log] إلى ${phone}: ${message} — مافيش مزوّد حقيقي مظبوط`);
      return false;
    }

    try {
      const body = new URLSearchParams({
        AppSid: this.config.get<string>('SMS_API_KEY')!,
        Recipient: this.normalize(phone),
        Body: message,
        ...(this.config.get<string>('SMS_SENDER_ID')
          ? { SenderID: this.config.get<string>('SMS_SENDER_ID')! }
          : {}),
      });

      const res = await fetch(UNIFONIC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        // مهلة — لو المزوّد علّق مانراكمش اتصالات مفتوحة.
        signal: AbortSignal.timeout(10_000),
      });

      const json = (await res.json().catch(() => ({}))) as { success?: string | boolean; message?: string };
      const ok = res.ok && (json.success === true || json.success === 'true');
      if (!ok) {
        this.logger.error(`فشل إرسال SMS لـ ${phone}: ${json.message ?? res.statusText}`);
      }
      return ok;
    } catch (error) {
      this.logger.error(`خطأ في إرسال SMS لـ ${phone}: ${(error as Error).message}`);
      return false;
    }
  }
}
