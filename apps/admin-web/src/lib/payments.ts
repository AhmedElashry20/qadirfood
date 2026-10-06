/**
 * أنواع الدفع والاسترداد + خرائط العرض.
 *
 * مشتركة بين «الطلبات» (لوح التفاصيل + نافذة الاسترداد) و«المالية والتسويات»
 * (قايمة الاستردادات) — متحطّة في lib عشان خريطة الحالات ماتتكتبش مرتين
 * وتتفرّع بعدين.
 *
 * المصدر: apps/api/src/payments/payments.service.ts + payment-gateway.ts
 * كل المبالغ بترجع أرقام (السيرفر بيعمل Number() على كل Decimal).
 */
import type { Tone } from '../components/ui';

export type PaymentMethod = 'CASH' | 'MADA' | 'APPLE_PAY' | 'CARD' | 'WALLET';

/** `PARTIALLY_REFUNDED` بتتحسب في السيرفر لوحدها — syncOrderPaymentStatus. */
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

/**
 * `AWAITING_APPROVAL` و`REJECTED` اتضافوا مع رقابة الاسترداد الكبير (maker-checker):
 * أي استرداد فوق الحد بيتحجز في `AWAITING_APPROVAL` وماينفّذش لحد ما أدمن **تاني**
 * يوافق (فصل مهام) — أو يرفضه فيبقى `REJECTED`.
 */
export type RefundStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'AWAITING_APPROVAL' | 'REJECTED';

/**
 * مين شايل تكلفة الاسترداد — القيمة دي بتحدّد حركة فلوس حقيقية في السيرفر
 * (رجوع العمولة للمطعم + الخصم من محفظة الكابتن)، فهي مش وسم وصفي.
 * بتتحدّد وقت إنشاء الاسترداد ومافيش مسار بيعدّلها بعد كده.
 */
export type RefundLiability = 'NONE' | 'RESTAURANT' | 'PLATFORM' | 'CAPTAIN';

export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  reasonAr: string;
  liability: RefundLiability;
  /**
   * العمولة اللي رجعت للمطعم مع الاسترداد ده — بتتحسب وقت التنفيذ بالتناسب
   * (المبلغ ÷ إجمالي الطلب × عمولة الطلب). صفر في PLATFORM و CAPTAIN.
   */
  commissionReversed: number;
  status: RefundStatus;
  /** اسم البوابة — `sandbox` أو `cash`. مافيش مزوّد حقيقي مربوط لسه. */
  provider: string;
  providerRefId: string | null;
  failReason: string | null;
  /** سبب رفض الموافقة — بيتحط لما أدمن تاني يرفض استرداد كبير. null لأي حالة تانية. */
  approvalRejectReason: string | null;
  createdAt: string;
  completedAt: string | null;
  /**
   * موجود بس في رد `POST …/refund` لما المبلغ فوق الحد — الاسترداد بيرجع
   * `AWAITING_APPROVAL` ومستني موافقة أدمن تاني. مش حقل متخزّن على الصف.
   */
  requiresApproval?: boolean;
}

/** صف قايمة الاستردادات — فيه حقول زيادة عن الـ Refund العادي. */
export interface RefundListItem extends Refund {
  orderNumber: string;
  paymentMethod: PaymentMethod;
  createdByName: string | null;
}

export interface PaymentTransaction {
  id: string;
  provider: string;
  providerRefId: string | null;
  status: PaymentStatus;
  amount: number;
  paidAt: string | null;
  createdAt: string;
}

/** GET /payments/orders/:orderId */
export interface PaymentDetail {
  orderId: string;
  orderNumber: string;
  method: PaymentMethod;
  status: PaymentStatus;
  /** قيمة الطلب — بتفضل زي ما هي حتى لو ماتحصّلش. */
  total: number;
  /** المحصّل فعلاً — صفر لو الدفع لسه معلّق أو فشل. */
  collectedTotal: number;
  refundedTotal: number;
  /** المحصّل ناقص المسترد — صفر للطلب اللي ماتدفعش. */
  refundableAmount: number;
  transaction: PaymentTransaction | null;
  refunds: Array<Refund & { createdByName: string | null }>;
}

export interface RefundsPage {
  data: RefundListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_AR: Record<PaymentMethod, string> = {
  CASH: 'كاش',
  MADA: 'مدى',
  APPLE_PAY: 'Apple Pay',
  CARD: 'بطاقة',
  WALLET: 'محفظة',
};

export const PAYMENT_STATUS_AR: Record<PaymentStatus, string> = {
  PENDING: 'غير مدفوع',
  PAID: 'مدفوع',
  FAILED: 'فشل الدفع',
  PARTIALLY_REFUNDED: 'مسترد جزئياً',
  REFUNDED: 'مسترد',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'neutral',
  PAID: 'ok',
  FAILED: 'bad',
  PARTIALLY_REFUNDED: 'warn',
  REFUNDED: 'warn',
};

export interface RefundStatusMeta {
  label: string;
  tone: Tone;
  /** شرح بيظهر تحت الحالة — موجود للحالات اللي شكلها بيلخبط. */
  note?: string;
}

const REFUND_STATUS_META: Record<RefundStatus, RefundStatusMeta> = {
  PENDING: { label: 'قيد التنفيذ', tone: 'warn' },
  COMPLETED: { label: 'تم الاسترداد', tone: 'ok' },
  FAILED: { label: 'فشل الاسترداد', tone: 'bad' },
  AWAITING_APPROVAL: {
    label: 'بانتظار موافقة مسؤول آخر',
    tone: 'warn',
    note: 'استرداد فوق الحد — محجوز ولا يُنفَّذ حتى يوافق عليه مسؤول **آخر** (فصل المهام).',
  },
  REJECTED: { label: 'مرفوضة الموافقة', tone: 'bad' },
};

/**
 * الكاش مالوش مسار إلكتروني يرجّع الفلوس: `CashGateway.refund` بترجّع
 * `settled: false` دايماً، فالصف بيفضل PENDING للأبد لحد ما المحاسب يسوّيه
 * بالإيد. من غير التفرقة دي الصف بيبان كأنه استرداد واقف أو فشل.
 *
 * والمرفوض بيعرض سببه في الملاحظة — عشان الأدمن يعرف اترفض ليه من غير ما يفتح صف.
 */
export function refundStatusMeta(refund: {
  status: RefundStatus;
  provider: string;
  approvalRejectReason?: string | null;
}): RefundStatusMeta {
  if (refund.status === 'PENDING' && refund.provider === 'cash') {
    return {
      label: 'بانتظار تسوية يدوية',
      tone: 'warn',
      note: 'الكاش مالوش بوابة ترجّعه إلكترونياً — بيفضل معلّق لحد ما المحاسب يسلّم العميل ويقفل الصف في التسوية.',
    };
  }

  if (refund.status === 'REJECTED' && refund.approvalRejectReason) {
    return { ...REFUND_STATUS_META.REJECTED, note: `سبب الرفض: ${refund.approvalRejectReason}` };
  }

  return REFUND_STATUS_META[refund.status];
}

// ────────────────────────────────────────────────────────────
// جهة التحمّل
//
// المصدر: apps/api/src/payments/payments.service.ts#commissionToReverse
// + executeRefund (الخصم من الكابتن). الشرح تحت هو نص السياسة زي ما هي —
// أي تعديل هنا لازم يتطابق مع السيرفر، ده مش نص تسويقي.
// ────────────────────────────────────────────────────────────

export interface RefundLiabilityMeta {
  label: string;
  tone: Tone;
  /** سطر واحد بيقول الفلوس بتتحرك إزاي — بيبان للمشغّل قبل ما يأكّد. */
  note: string;
}

/** الترتيب اللي بيتعرض بيه الاختيار — من «مافيش غلطان» لأتقل قرار. */
export const REFUND_LIABILITY_ORDER: RefundLiability[] = ['NONE', 'RESTAURANT', 'PLATFORM', 'CAPTAIN'];

export const REFUND_LIABILITY_AR: Record<RefundLiability, string> = {
  NONE: 'بدون طرف مسؤول',
  RESTAURANT: 'على المطعم',
  PLATFORM: 'على المنصة',
  CAPTAIN: 'على الكابتن',
};

export const REFUND_LIABILITY_META: Record<RefundLiability, RefundLiabilityMeta> = {
  NONE: {
    label: REFUND_LIABILITY_AR.NONE,
    tone: 'neutral',
    note: 'لم يتم البيع أساساً (إلغاء قبل التحضير). لا طرف مخطئ، والعمولة ترجع للمطعم بالتناسب.',
  },
  RESTAURANT: {
    label: REFUND_LIABILITY_AR.RESTAURANT,
    tone: 'warn',
    note: 'خطأ المطعم (صنف ناقص، جودة). المطعم يتحمّل، والمنصة بترجّع عمولتها على الجزء المسترد.',
  },
  PLATFORM: {
    label: REFUND_LIABILITY_AR.PLATFORM,
    tone: 'bad',
    note: 'خطأ المنصة أو استرضاء عميل. المنصة تتحمّل بالكامل، المطعم بياخد مستحقه كامل والعمولة زي ما هي.',
  },
  CAPTAIN: {
    label: REFUND_LIABILITY_AR.CAPTAIN,
    tone: 'brand',
    note: 'خطأ الكابتن (طلب ضاع/اتأخر). بيتخصم من محفظة الكابتن بحركة في دفتره، والمطعم والعمولة مايتأثروش.',
  },
};

/** الجهة اللي بترجّع عمولة — نفس شرط `commissionToReverse` في السيرفر. */
export function reversesCommission(liability: RefundLiability): boolean {
  return liability === 'NONE' || liability === 'RESTAURANT';
}

/**
 * العمولة اللي هترجع للمطعم لو اتنفّذ استرداد بالمبلغ ده.
 *
 * نسخة من `commissionToReverse` في السيرفر — موجودة عشان المشغّل يشوف نتيجة
 * اختياره قبل ما يضغط، مش عشان تتخزّن. الرقم اللي بيتسجّل هو بتاع السيرفر.
 */
export function previewCommissionReversed(
  liability: RefundLiability,
  refundAmount: number,
  orderTotal: number,
  orderCommission: number,
): number {
  if (!reversesCommission(liability)) return 0;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return 0;
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) return 0;

  return Number(((refundAmount / orderTotal) * orderCommission).toFixed(2));
}

/**
 * تنبيه عن البوابة — مهم يبان جنب أي مرجع عملية عشان محدش يفتكر إن المرجع
 * ده ليه وجود عند مزوّد حقيقي.
 */
export function providerNote(provider: string): string | null {
  if (provider === 'sandbox') {
    return 'بوابة تجريبية — عملية صورية للتطوير. هذا المرجع لا وجود له عند أي مزوّد ولم تتحرك أي مبالغ فعلاً.';
  }
  if (provider === 'cash') {
    return 'نقداً — لا توجد بوابة أساساً. التحصيل يحدث عند الباب والاسترداد يتم يدوياً في التسوية.';
  }
  return null;
}

/** اسم البوابة زي ما بيتخزّن — بيتعرض لاتيني عشان يطابق اللي في قاعدة البيانات. */
export function providerLabel(provider: string): string {
  if (provider === 'cash') return 'كاش (بدون بوابة)';
  return provider;
}
