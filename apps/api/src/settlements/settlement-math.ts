// حساب تسوية مطعم — دالة نقية مختبَرة. **كل رقم في التسوية ليه سطر**، و
// `netPayout` مش رقم مكتوب — هو المجموع الجبري لسطور التسوية. الثابت الأهم في
// المنصة: **مجموع أمانت السطور = netPayout** (ومجموعه عبر كل المطاعم = مستحقاتهم
// في التقرير). الدالة دي بتضمن الثابت ده رياضياً بمعزل عن قاعدة البيانات.

import Decimal from 'decimal.js';
import { SettlementLineType } from '@prisma/client';

export interface SettlementOrderInput {
  id: string;
  orderNumber: string;
  /** سعر الأكل قبل الخصم. */
  subtotal: Decimal.Value;
  /** خصم على الأكل. */
  discount: Decimal.Value;
  commission: Decimal.Value;
}

export interface SettlementRefundInput {
  id: string;
  amount: Decimal.Value;
  commissionReversed: Decimal.Value;
  /** إجمالي الطلب (أكل + توصيل + ضريبة) — لاستخراج حصة الأكل من الاسترداد. */
  orderTotal: Decimal.Value;
  /** إيراد المطعم من الطلب = subtotal − discount (أكل بس). */
  orderFoodRevenue: Decimal.Value;
  orderNumber: string;
  reasonAr: string;
}

export interface SettlementLine {
  type: SettlementLineType;
  orderId?: string;
  refundId?: string;
  /** نص بمنزلتين — موجب لمبيعات، سالب لاسترداد. */
  amount: string;
  descriptionAr: string;
}

export interface SettlementComputation {
  grossSales: Decimal;
  commission: Decimal;
  refundsBorne: Decimal;
  commissionReversed: Decimal;
  netPayout: Decimal;
  lines: SettlementLine[];
}

export function computeSettlement(
  orders: SettlementOrderInput[],
  refunds: SettlementRefundInput[],
): SettlementComputation {
  let grossSales = new Decimal(0);
  let commission = new Decimal(0);
  let refundsBorne = new Decimal(0);
  let commissionReversed = new Decimal(0);
  const lines: SettlementLine[] = [];

  for (const order of orders) {
    // إيراد المطعم = **الأكل بس** (subtotal − discount). رسوم التوصيل دخل
    // المنصة/الكابتن، والضريبة بتتورّد للهيئة — الاتنين مش من حق المطعم. قبل كده
    // كنا بنسوّي على `total` (اللي بيشمل التوصيل والضريبة) فالمطعم كان بياخد
    // فلوس مش بتاعته.
    const sales = new Decimal(order.subtotal).minus(order.discount);
    const comm = new Decimal(order.commission);
    grossSales = grossSales.plus(sales);
    commission = commission.plus(comm);
    lines.push({
      type: SettlementLineType.ORDER,
      orderId: order.id,
      amount: sales.minus(comm).toFixed(2),
      descriptionAr: `مبيعات الطلب ${order.orderNumber}`,
    });
  }

  for (const refund of refunds) {
    const amount = new Decimal(refund.amount);
    const total = new Decimal(refund.orderTotal);
    const food = new Decimal(refund.orderFoodRevenue);
    const reversed = new Decimal(refund.commissionReversed);

    // المطعم بيتحمّل **حصة الأكل** من الاسترداد بس — مش المبلغ الكامل. لو رجعنا
    // المبلغ الكامل كنا بنخصم منه رسوم التوصيل والضريبة اللي عمره ما استلمها
    // (ده كان بيخلّي التسوية غير متماثلة مع جانب المبيعات اللي بيدفع الأكل بس).
    // التقريب لمنزلتين قبل الجمع/السطر عشان الثابت «netPayout = مجموع السطور» يفضل صح.
    const foodRefunded = total.gt(0)
      ? amount.times(food).dividedBy(total).toDecimalPlaces(2)
      : amount;

    refundsBorne = refundsBorne.plus(foodRefunded);
    commissionReversed = commissionReversed.plus(reversed);
    // صافي أثر الاسترداد على المطعم = العمولة اللي رجعتله ناقص حصة الأكل المستردّة.
    lines.push({
      type: SettlementLineType.REFUND,
      refundId: refund.id,
      amount: reversed.minus(foodRefunded).toFixed(2),
      descriptionAr: `استرداد الطلب ${refund.orderNumber} — ${refund.reasonAr}`,
    });
  }

  const netPayout = grossSales.minus(commission).minus(refundsBorne).plus(commissionReversed);
  return { grossSales, commission, refundsBorne, commissionReversed, netPayout, lines };
}
