import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@prisma/client';
import { canTransition, ORDER_TRANSITIONS } from './order-transitions';

// آلة حالات الطلب — البوابة اللي بتحمي كل تغيير حالة (والفلوس المربوطة بيه).
describe('انتقالات حالة الطلب', () => {
  it('المسار الطبيعي الكامل مسموح خطوة بخطوة', () => {
    const path = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.CAPTAIN_ASSIGNED,
      OrderStatus.PICKED_UP,
      OrderStatus.ON_THE_WAY,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('ممنوع القفز فوق مراحل (READY → PICKED_UP لازم يعدّي على CAPTAIN_ASSIGNED)', () => {
    expect(canTransition(OrderStatus.READY, OrderStatus.PICKED_UP)).toBe(false);
  });

  it('ممنوع القفز من PENDING مباشرة لـ DELIVERED', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.DELIVERED)).toBe(false);
  });

  it('الحالات النهائية مالهاش أي مخرج (DELIVERED/REJECTED/CANCELLED)', () => {
    for (const terminal of [OrderStatus.DELIVERED, OrderStatus.REJECTED, OrderStatus.CANCELLED]) {
      expect(ORDER_TRANSITIONS[terminal]).toHaveLength(0);
      expect(canTransition(terminal, OrderStatus.PENDING)).toBe(false);
    }
  });

  it('ممنوع الرجوع للخلف (DELIVERED → ON_THE_WAY)', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.ON_THE_WAY)).toBe(false);
  });

  it('الإلغاء متاح من أي حالة نشطة (الأدمن يقدر يلغي في أي وقت قبل التسليم)', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.CAPTAIN_ASSIGNED, OrderStatus.CANCELLED)).toBe(true);
    // بعد الاستلام كمان — الأدمن لازم يقدر يلغي (سرقة/عطل)، و cancelOrder بيرجّع
    // الكابتن ONLINE ويسترد الفلوس. صلاحية الدور نفسها بتتفرض في cancelOrder.
    expect(canTransition(OrderStatus.PICKED_UP, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED)).toBe(true);
    // لكن مافيش إلغاء بعد التسليم أو من حالة نهائية.
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });

  it('كل حالة مصدر ليها مدخل في الخريطة (مافيش undefined بيكسر الفحص)', () => {
    for (const s of Object.values(OrderStatus)) {
      expect(ORDER_TRANSITIONS[s]).toBeDefined();
    }
  });
});
