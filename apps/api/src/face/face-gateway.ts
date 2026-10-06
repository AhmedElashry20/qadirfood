// واجهة مطابقة الوجه — نفس فكرة [PaymentGateway] و[TgaGateway]: منطق التحقق
// اليومي بيتعامل مع الواجهة دي بس، فربط خدمة بيومترية حقيقية (AWS Rekognition /
// Azure Face / موديل داخلي) بعدين مايلمسش مسار الوردية ولا التوزيع.
//
// ⚠️ المتاح دلوقتي [StubFaceGateway] بس — **مافيش مطابقة بيومترية حقيقية**
// (محتاجة خدمة بمفاتيح مش متوفّرة). الـ stub بيتأكّد إن سيلفي اترفعت وبيعدّيها،
// و`biometricConfigured: false` و`provider: 'stub'` بيظهروا صريح في كل رد عشان
// محدش يفتكر إن في مطابقة وجه فعلية بتحصل. الخدمة الحقيقية بتتبدّل هنا بس.

import { Injectable, Logger } from '@nestjs/common';

export interface FaceMatchRequest {
  captainId: string;
  selfieUrl: string;
  /// الوجه المرجعي (وثيقة PHOTO المعتمدة) — null لو المندوب لسه مرفعش صورة مرجعية.
  referenceUrl: string | null;
}

export interface FaceMatchResult {
  /// النتيجة اللي بتتخزّن في `FaceCheck.status`.
  status: 'VERIFIED' | 'PENDING' | 'REJECTED';
  /// نسبة التطابق لو المزوّد رجّعها (0..1) — null للـ stub.
  confidence: number | null;
  reason?: string;
  provider: string;
  /// `true` يعني في خدمة بيومترية حقيقية موصولة. الـ stub دايماً `false`.
  biometricConfigured: boolean;
}

export abstract class FaceGateway {
  abstract readonly name: string;
  abstract readonly biometricConfigured: boolean;
  abstract match(input: FaceMatchRequest): Promise<FaceMatchResult>;
}

/**
 * مطابقة وهمية — مافيش نداء لخدمة بيومترية. بيتأكّد بس إن في سيلفي مرفوعة،
 * وبيعتبر الفحص «موثّق» عشان مسار التحقق اليومي والمنع يشتغلوا من الطرف للطرف.
 * ده **مش** تحقق شخص حقيقي — لما توصل خدمة بيومترية، `match` بينادي API الحقيقي
 * ويرجّع نسبة تطابق فعلية.
 */
@Injectable()
export class StubFaceGateway extends FaceGateway {
  readonly name = 'stub';
  readonly biometricConfigured = false;
  private readonly logger = new Logger(StubFaceGateway.name);

  async match(input: FaceMatchRequest): Promise<FaceMatchResult> {
    if (!input.selfieUrl?.trim()) {
      return {
        status: 'REJECTED',
        confidence: null,
        reason: 'لا توجد صورة ذاتية',
        provider: this.name,
        biometricConfigured: false,
      };
    }
    this.logger.warn(
      `فحص وجه (stub) للمندوب ${input.captainId} — **مافيش مطابقة بيومترية حقيقية**، بس اتأكدنا إن السيلفي اترفعت`,
    );
    return { status: 'VERIFIED', confidence: null, provider: this.name, biometricConfigured: false };
  }
}
