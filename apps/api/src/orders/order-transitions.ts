import { OrderStatus } from '@prisma/client';

/**
 * المرجع الوحيد للانتقالات المسموح بيها. لازم يفضل مطابق لنسخة
 * packages/shared/src/enums.ts (اللي التطبيقات واللوحات بتقراها).
 * OrdersService.assertTransition() بيرفض أي انتقال مش هنا.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.CAPTAIN_ASSIGNED, OrderStatus.CANCELLED],
  [OrderStatus.CAPTAIN_ASSIGNED]: [OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
  // الأدمن يقدر يلغي في أي وقت (حالة استثنائية) — cancelOrder بيرجّع الكابتن
  // ONLINE ويسترد الفلوس. من غير كده طلب اتسرق/اتعطّل بعد الاستلام كان بيفضل عالق.
  [OrderStatus.PICKED_UP]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** هل الانتقال من `from` لـ `to` مسموح؟ نقي ومختبَر. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
