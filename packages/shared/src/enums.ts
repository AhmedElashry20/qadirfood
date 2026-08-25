// الأنواع المشتركة بين الباك إند واللوحات — مصدر الحقيقة الوحيد لحالات الطلب.
// أي تغيير هنا لازم يتزامن مع prisma/schema.prisma ومع lib/core/enums.dart في تطبيقات Flutter.

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  CAPTAIN_ASSIGNED = 'CAPTAIN_ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** الانتقالات المسموح بيها فقط — أي انتقال غيرها يترفض في OrdersService. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  // المطعم ممكن يضغط «جاهز» على طول من غير ما يعدّي على «قيد التحضير»
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.CAPTAIN_ASSIGNED, OrderStatus.CANCELLED],
  [OrderStatus.CAPTAIN_ASSIGNED]: [OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
  [OrderStatus.PICKED_UP]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** ألوان الحالة المعتمدة في كل الواجهات (تطبيق المطعم بالذات). */
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '#F97316', // برتقالي — جديد
  [OrderStatus.ACCEPTED]: '#3B82F6',
  [OrderStatus.PREPARING]: '#3B82F6', // أزرق — قيد التحضير
  [OrderStatus.READY]: '#22C55E', // أخضر — جاهز
  [OrderStatus.CAPTAIN_ASSIGNED]: '#8B5CF6',
  [OrderStatus.PICKED_UP]: '#8B5CF6',
  [OrderStatus.ON_THE_WAY]: '#8B5CF6',
  [OrderStatus.DELIVERED]: '#16A34A',
  [OrderStatus.REJECTED]: '#EF4444', // أحمر
  [OrderStatus.CANCELLED]: '#EF4444',
};

export const ORDER_STATUS_AR: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'طلب جديد',
  [OrderStatus.ACCEPTED]: 'تم القبول',
  [OrderStatus.PREPARING]: 'قيد التحضير',
  [OrderStatus.READY]: 'جاهز للاستلام',
  [OrderStatus.CAPTAIN_ASSIGNED]: 'في انتظار الكابتن',
  [OrderStatus.PICKED_UP]: 'تم الاستلام',
  [OrderStatus.ON_THE_WAY]: 'في الطريق إليك',
  [OrderStatus.DELIVERED]: 'تم التسليم',
  [OrderStatus.REJECTED]: 'مرفوض',
  [OrderStatus.CANCELLED]: 'ملغي',
};

export enum RestaurantStatus {
  OPEN = 'OPEN',
  BUSY = 'BUSY',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
}

export enum CaptainStatus {
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  ON_TRIP = 'ON_TRIP',
}

export enum ItemAvailability {
  AVAILABLE = 'AVAILABLE',
  OUT_OF_STOCK_TODAY = 'OUT_OF_STOCK_TODAY',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export enum PaymentMethod {
  CASH = 'CASH',
  MADA = 'MADA',
  APPLE_PAY = 'APPLE_PAY',
  CARD = 'CARD',
  WALLET = 'WALLET',
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  CAPTAIN = 'CAPTAIN',
  MERCHANT = 'MERCHANT',
  ADMIN = 'ADMIN',
}

/** خيارات وقت التحضير في شاشة قبول الطلب (شاشة ٣ في تطبيق المطعم). */
export const PREP_TIME_OPTIONS = [10, 15, 20, 30] as const;

/** أسباب الرفض الجاهزة — الرفض بسبب إلزامي. */
export const REJECT_REASONS_AR = [
  'الصنف غير متوفر حالياً',
  'ضغط شديد على المطبخ',
  'المطعم على وشك الإغلاق',
  'خطأ في بيانات الطلب',
  'سبب آخر',
] as const;
