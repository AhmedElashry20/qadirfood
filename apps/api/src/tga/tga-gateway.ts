// واجهة الربط مع هيئة النقل — نفس فكرة [PaymentGateway] و[StorageDriver]:
// منطق التحقّق كله بيتعامل مع الواجهة دي بس، فربط API الهيئة الحقيقي بعدين
// مايلمسش أي كود في الكباتن أو التوزيع.
//
// ⚠️ المتاح دلوقتي [ManualTgaGateway] بس — **مافيش ربط API مباشر** مع أنظمة
// الهيئة (محتاج رقم منشأة ومفتاح API من الهيئة مش متوفّرين). التحقّق «يدوي»:
// الأدمن بيدخل رقم بطاقة التوصيل بعد ما يتأكّد منها على بوابة الهيئة، والنظام
// بيتأكّد إن البطاقة مش منتهية بس. `linked: false` و`provider: 'manual'` بيظهروا
// في كل رد عشان محدش يفتكر إن في تحقّق آلي بيحصل مع الهيئة.

import { Injectable, Logger } from '@nestjs/common';

export interface TgaVerifyRequest {
  cardNumber: string;
  nationalId: string;
  plateNumber?: string | null;
  expiresAt?: Date | null;
}

export interface TgaVerifyResult {
  /// النتيجة اللي بتتخزّن في `Captain.tgaStatus`.
  status: 'VERIFIED' | 'PENDING' | 'REJECTED';
  checkedAt: Date;
  /// سبب الرفض لو `REJECTED`.
  reason?: string;
  /// اسم مزوّد التحقّق — لازم يبان في اللوحة عشان نفرّق يدوي vs API حقيقي.
  provider: string;
  raw?: Record<string, unknown>;
}

export abstract class TgaGateway {
  abstract readonly name: string;
  /// `true` يعني المنصة مربوطة فعلاً بالهيئة (رقم منشأة + API). المانوال دايماً `false`.
  abstract readonly linked: boolean;
  abstract verify(input: TgaVerifyRequest): Promise<TgaVerifyResult>;
}

/**
 * التحقّق اليدوي — مافيش نداء API للهيئة. الأدمن بيتأكّد من البطاقة على بوابة
 * الهيئة بنفسه وبيسجّلها، والنظام بيتحقّق إن البطاقة مش منتهية بس. اعتماد
 * البطاقة نفسه إقرار من الأدمن (متسجّل في التدقيق بمين عمله)، مش نتيجة نظام
 * رسمي. لما يتوفّر ربط حقيقي، بيتبدّل `verify` هنا بس بينادي API الهيئة.
 */
@Injectable()
export class ManualTgaGateway extends TgaGateway {
  readonly name = 'manual';
  readonly linked = false;
  private readonly logger = new Logger(ManualTgaGateway.name);

  async verify(input: TgaVerifyRequest): Promise<TgaVerifyResult> {
    const now = new Date();

    if (!input.cardNumber?.trim()) {
      return { status: 'PENDING', checkedAt: now, reason: 'مافيش رقم بطاقة', provider: this.name };
    }
    if (input.expiresAt && input.expiresAt.getTime() < now.getTime()) {
      return { status: 'REJECTED', checkedAt: now, reason: 'بطاقة التوصيل منتهية', provider: this.name };
    }

    this.logger.warn(
      `تحقّق يدوي لبطاقة توصيل ${input.cardNumber} — مافيش ربط API مباشر مع الهيئة (إقرار أدمن)`,
    );
    return { status: 'VERIFIED', checkedAt: now, provider: this.name };
  }
}
