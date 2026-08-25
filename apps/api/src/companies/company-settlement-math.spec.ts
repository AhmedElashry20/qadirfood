import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeCompanySettlement, type CompanyOrderInput } from './company-settlement-math';

const trip = (id: string, captainId: string, payout: number): CompanyOrderInput => ({
  id,
  orderNumber: id,
  captainId,
  captainName: captainId,
  captainPayout: payout,
});

const sumLines = (lines: { amount: string }[]) =>
  lines.reduce((s, l) => s.plus(new Decimal(l.amount)), new Decimal(0));

// النموذج الطرفين: المنصة → الشركة (gross − عمولة)، والشركة → المناديب (توزيعات).
describe('حساب تسوية الشركة', () => {
  it('الثابت: gross = مجموع سطور الطلبات = مجموع توزيعات المناديب', () => {
    const r = computeCompanySettlement([trip('A', 'saad', 10), trip('B', 'saad', 14), trip('C', 'fahd', 8)], 10);
    expect(sumLines(r.lines).toFixed(2)).toBe(r.grossPayout.toFixed(2));
    const distTotal = r.distributions.reduce((s, d) => s.plus(new Decimal(d.amount)), new Decimal(0));
    expect(distTotal.toFixed(2)).toBe(r.grossPayout.toFixed(2));
  });

  it('العمولة على إجمالي الأجور، والصافي = gross − عمولة', () => {
    const r = computeCompanySettlement([trip('A', 'saad', 100)], 10);
    expect(r.grossPayout.toFixed(2)).toBe('100.00');
    expect(r.commission.toFixed(2)).toBe('10.00'); // 10%
    expect(r.netPayout.toFixed(2)).toBe('90.00');
  });

  it('توزيع واحد لكل مندوب بمجموع رحلاته وعددها', () => {
    const r = computeCompanySettlement([trip('A', 'saad', 10), trip('B', 'saad', 14), trip('C', 'fahd', 8)], 10);
    expect(r.distributions).toHaveLength(2);
    const saad = r.distributions.find((d) => d.captainId === 'saad')!;
    expect(saad.amount).toBe('24.00'); // 10 + 14
    expect(saad.tripCount).toBe(2);
    const fahd = r.distributions.find((d) => d.captainId === 'fahd')!;
    expect(fahd.amount).toBe('8.00');
    expect(fahd.tripCount).toBe(1);
  });

  it('سطر لكل طلب (مش لكل مندوب)', () => {
    const r = computeCompanySettlement([trip('A', 'saad', 10), trip('B', 'saad', 14)], 10);
    expect(r.lines).toHaveLength(2); // طلبين
    expect(r.distributions).toHaveLength(1); // مندوب واحد
    expect(r.tripCount).toBe(2);
  });

  it('يطابق السيناريو الحيّ: سعد رحلتين ٢٤ إجمالي − ١٠٪ = ٢١.٦ صافي', () => {
    const r = computeCompanySettlement([trip('A', 'saad', 12), trip('B', 'saad', 12)], 10);
    expect(r.grossPayout.toFixed(2)).toBe('24.00');
    expect(r.netPayout.toFixed(2)).toBe('21.60');
  });

  it('دورة فاضية = صفر', () => {
    const r = computeCompanySettlement([], 10);
    expect(r.grossPayout.toFixed(2)).toBe('0.00');
    expect(r.netPayout.toFixed(2)).toBe('0.00');
    expect(r.distributions).toHaveLength(0);
  });
});
