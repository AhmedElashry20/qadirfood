// واجهة بوابة الدفع — نفس فكرة [StorageDriver]: المنطق المالي كله بيتعامل مع
// الواجهة دي بس، فربط بوابة حقيقية (ميسر / HyperPay / نون بايمنتس) مايلمسش
// أي كود في الطلبات أو الاسترداد.
//
// ⚠️ المتاح دلوقتي [SandboxGateway] بس — بوابة وهمية للتطوير. مافيش تكامل
// حقيقي مع أي مزوّد، وده مكتوب صريح في كل رد بترجّعه (`provider: 'sandbox'`)
// عشان محدش يفتكر إن في فلوس بتتحرك فعلاً.

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';

export interface ChargeRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  method: PaymentMethod;
  /// بيتبعت للبوابة عشان ترجّع العميل بعد 3-D Secure.
  returnUrl?: string;
}

export interface ChargeResult {
  /// معرّف العملية عند المزوّد — بنخزّنه عشان الاسترداد والمطابقة.
  providerRefId: string;
  /// `true` يعني التحصيل اتم فوراً. البوابات الحقيقية بترجّع `false` مع
  /// `redirectUrl` وبتأكّد بعدين على الـ webhook.
  captured: boolean;
  redirectUrl?: string;
  raw?: Record<string, unknown>;
}

export interface RefundRequest {
  providerRefId: string;
  amount: number;
  reasonAr: string;
}

export interface RefundResult {
  providerRefId: string;
  /// `false` يعني اتسجّل عند المزوّد ولسه بيتنفّذ — نسيبه PENDING.
  settled: boolean;
  raw?: Record<string, unknown>;
}

export abstract class PaymentGateway {
  /// بيتخزّن في `Transaction.provider` — لازم يبان في اللوحة عشان نفرّق
  /// بين عملية sandbox وعملية حقيقية.
  abstract readonly name: string;
  abstract charge(input: ChargeRequest): Promise<ChargeResult>;
  abstract refund(input: RefundRequest): Promise<RefundResult>;
}

/**
 * بوابة التطوير — بتوافق على كل عملية فوراً.
 *
 * مابتحاولش تقلّد فشل عشوائي: الفشل بيتجرّب من مسار الـ webhook يدوي
 * (`POST /payments/webhook`) عشان يبقى قرار مننا مش مفاجأة في الديمو.
 */
@Injectable()
export class SandboxGateway extends PaymentGateway {
  readonly name = 'sandbox';
  private readonly logger = new Logger(SandboxGateway.name);

  async charge(input: ChargeRequest): Promise<ChargeResult> {
    const ref = `sbx_${randomUUID().slice(0, 12)}`;
    this.logger.warn(`تحصيل وهمي ${input.amount} ر.س للطلب ${input.orderNumber} (${ref}) — مافيش بوابة حقيقية`);
    return { providerRefId: ref, captured: true, raw: { sandbox: true, amount: input.amount } };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    const ref = `sbxr_${randomUUID().slice(0, 12)}`;
    this.logger.warn(`استرداد وهمي ${input.amount} ر.س على ${input.providerRefId} (${ref})`);
    return { providerRefId: ref, settled: true, raw: { sandbox: true, amount: input.amount } };
  }
}

/**
 * الكاش مالوش بوابة — بيتسجّل عشان الطلب يبقى ليه صف في الدفتر زي أي طلب تاني،
 * لكن التحصيل بيحصل عند الباب والاسترداد بيتعمل يدوي في التسوية.
 */
@Injectable()
export class CashGateway extends PaymentGateway {
  readonly name = 'cash';

  async charge(): Promise<ChargeResult> {
    // مافيش تحصيل دلوقتي — بيتحوّل PAID وقت التسليم.
    return { providerRefId: '', captured: false };
  }

  async refund(): Promise<RefundResult> {
    // بيفضل PENDING لحد ما المحاسب يسوّيه — مافيش مسار إلكتروني يرجّع كاش.
    return { providerRefId: '', settled: false };
  }
}
