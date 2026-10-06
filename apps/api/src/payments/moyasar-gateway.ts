// تكامل بوابة **ميسّر (Moyasar)** الحقيقي — بينفّذ نفس واجهة [PaymentGateway]،
// فربطه مايلمسش أي كود في الطلبات ولا الاسترداد. بيشتغل لحظة ما تحط المفاتيح في
// البيئة (`MOYASAR_SECRET_KEY` + `MOYASAR_WEBHOOK_SECRET`). من غير المفتاح
// `gatewayFor` بيرجع للـ sandbox (مش بيشتغل بنص إعداد).
//
// الطريقة: **فواتير ميسّر (Invoices API)** — بننشئ فاتورة بمبلغ الطلب، بترجّع
// رابط صفحة دفع مستضافة (بتدعم مدى/Apple Pay/فيزا/ماستر و 3-D Secure). العميل
// بيدفع هناك، وميسّر بتأكّد عندنا عبر الـ webhook. الاسترداد بيحلّ رقم الدفعة من
// الفاتورة وبيطلب استرداد عليها.
//
// وحدة المبلغ عند ميسّر = **هللة** (SAR × 100)، عدد صحيح.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import {
  ChargeRequest,
  ChargeResult,
  PaymentGateway,
  RefundRequest,
  RefundResult,
} from './payment-gateway';

const MOYASAR_BASE = 'https://api.moyasar.com/v1';

/** شكل الفاتورة اللي بترجع من ميسّر (الحقول اللي بنستعملها بس). */
interface MoyasarInvoice {
  id: string;
  status: string; // initiated | paid | failed | ...
  amount: number;
  url: string;
  payments?: { id: string; status: string; amount: number; refunded?: number }[];
}

@Injectable()
export class MoyasarGateway extends PaymentGateway {
  readonly name = 'moyasar';
  private readonly logger = new Logger(MoyasarGateway.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  /** المفتاح السري — بيتحقق منه هنا عشان الفشل يبان واضح مش كـ 401 غامض. */
  private secretKey(): string {
    const key = this.config.get<string>('MOYASAR_SECRET_KEY');
    if (!key) {
      throw new Error('MOYASAR_SECRET_KEY غير مضبوط — لا يصحّ التحصيل عبر ميسّر بدون مفتاح');
    }
    return key;
  }

  /** ميسّر بتستخدم Basic auth: المفتاح السري كـ username وباسورد فاضي. */
  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.secretKey()}:`).toString('base64');
  }

  private toHalalas(amountSar: number): number {
    return Math.round(amountSar * 100);
  }

  private async api<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${MOYASAR_BASE}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      // مهلة صارمة — من غيرها لو ميسّر علّقت الاتصال بيفضل مفتوح ويراكم sockets.
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text };
    }

    if (!res.ok) {
      const msg = (json as { message?: string })?.message ?? res.statusText;
      throw new Error(`ميسّر رجّعت خطأ ${res.status}: ${msg}`);
    }
    return json as T;
  }

  async charge(input: ChargeRequest): Promise<ChargeResult> {
    // رابط الرجوع للتطبيق بعد الدفع — الـ webhook هو اللي بيأكّد فعلاً، ده UX بس.
    const publicUrl = this.config.get<string>('PUBLIC_API_URL') ?? '';
    const invoice = await this.api<MoyasarInvoice>('/invoices', 'POST', {
      amount: this.toHalalas(input.amount),
      currency: 'SAR',
      description: `طلب ${input.orderNumber}`,
      callback_url: input.returnUrl || (publicUrl ? `${publicUrl}/api/payments/moyasar/callback` : undefined),
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
    });

    this.logger.log(`فاتورة ميسّر ${invoice.id} للطلب ${input.orderNumber} — ${input.amount} ر.س`);
    return {
      providerRefId: invoice.id,
      // الفاتورة بتتأكّد عبر الـ webhook — مش محصّلة لحظة الإنشاء.
      captured: false,
      redirectUrl: invoice.url,
      raw: invoice as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    // `providerRefId` بيبقى رقم الفاتورة — بنحلّ منها رقم الدفعة المدفوعة.
    const invoice = await this.api<MoyasarInvoice>(`/invoices/${input.providerRefId}`, 'GET');
    const paid = invoice.payments?.find((p) => p.status === 'paid');
    if (!paid) {
      throw new Error(`الفاتورة ${input.providerRefId} مالهاش دفعة مدفوعة نسترد منها`);
    }

    const refund = await this.api<{ id: string; status: string }>(
      `/payments/${paid.id}/refund`,
      'POST',
      { amount: this.toHalalas(input.amount) },
    );

    this.logger.log(`استرداد ميسّر ${input.amount} ر.س على الدفعة ${paid.id} (${refund.status})`);
    return {
      providerRefId: paid.id,
      // ميسّر بتعالج الاسترداد لحظياً غالباً؛ لو رجعت حالة مش نهائية نسيبه PENDING.
      settled: refund.status === 'refunded',
      raw: refund as unknown as Record<string, unknown>,
    };
  }

  /**
   * جلب حالة الفاتورة من ميسّر — بنستعملها في الـ webhook عشان **مانصدّقش جسم
   * الـ webhook لوحده**؛ بنرجع نتأكّد من المصدر الرسمي قبل ما نأكّد الدفع.
   * بترجّع 'PAID' أو 'FAILED' أو null (لسه معلّقة).
   */
  async resolveStatus(invoiceId: string): Promise<'PAID' | 'FAILED' | null> {
    const invoice = await this.api<MoyasarInvoice>(`/invoices/${invoiceId}`, 'GET');
    if (invoice.status === 'paid') return 'PAID';
    if (invoice.status === 'failed') return 'FAILED';
    return null;
  }

  static isOnline(method: PaymentMethod): boolean {
    return method !== PaymentMethod.CASH;
  }
}
