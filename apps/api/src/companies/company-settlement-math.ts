// حساب تسوية شركة أسطول — دالة نقية مختبَرة. النموذج الطرفين:
//   • المنصة → الشركة: تجمّع أجور مناديب الشركة، تخصم عمولة المنصة، والباقي
//     (`netPayout`) بيتحوّل للشركة.
//   • الشركة → المناديب: صف توزيع لكل مندوب بحصته (اللي الشركة بتدفعهاله).
//
// ثوابت مضمونة رياضياً هنا:
//   grossPayout = مجموع سطور الطلبات = مجموع توزيعات المناديب
//   netPayout   = grossPayout − commission

import Decimal from 'decimal.js';

export interface CompanyOrderInput {
  id: string;
  orderNumber: string;
  captainId: string;
  captainName: string;
  captainPayout: Decimal.Value;
}

export interface CompanyLine {
  orderId: string;
  captainId: string;
  amount: string;
  descriptionAr: string;
}

export interface CompanyDistribution {
  captainId: string;
  amount: string;
  tripCount: number;
}

export interface CompanySettlementComputation {
  grossPayout: Decimal;
  commission: Decimal;
  netPayout: Decimal;
  tripCount: number;
  lines: CompanyLine[];
  distributions: CompanyDistribution[];
}

export function computeCompanySettlement(
  orders: CompanyOrderInput[],
  commissionRate: Decimal.Value,
): CompanySettlementComputation {
  let grossPayout = new Decimal(0);
  const lines: CompanyLine[] = [];
  // حصة كل مندوب في نفس المرور — صف توزيع واحد لكل مندوب.
  const perCaptain = new Map<string, { amount: Decimal; trips: number }>();

  for (const order of orders) {
    const amount = new Decimal(order.captainPayout);
    grossPayout = grossPayout.plus(amount);
    lines.push({
      orderId: order.id,
      captainId: order.captainId,
      amount: amount.toFixed(2),
      descriptionAr: `أجر ${order.captainName} — الطلب ${order.orderNumber}`,
    });
    const acc = perCaptain.get(order.captainId) ?? { amount: new Decimal(0), trips: 0 };
    acc.amount = acc.amount.plus(amount);
    acc.trips += 1;
    perCaptain.set(order.captainId, acc);
  }

  const commission = grossPayout.times(commissionRate).dividedBy(100).toDecimalPlaces(2);
  const netPayout = grossPayout.minus(commission);

  const distributions: CompanyDistribution[] = [...perCaptain.entries()].map(([captainId, v]) => ({
    captainId,
    amount: v.amount.toFixed(2),
    tripCount: v.trips,
  }));

  return { grossPayout, commission, netPayout, tripCount: orders.length, lines, distributions };
}
