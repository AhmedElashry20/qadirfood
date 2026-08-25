// OrderStatus وألوانها وأسماءها العربية — مطابق لـ packages/shared/src/enums.ts
import 'package:flutter/material.dart';

import 'theme.dart';

enum OrderStatus {
  pending('PENDING', 'طلب جديد'),
  accepted('ACCEPTED', 'تم التأكيد'),
  preparing('PREPARING', 'جاري التجهيز'),
  ready('READY', 'جاهز للاستلام'),
  captainAssigned('CAPTAIN_ASSIGNED', 'في انتظار الكابتن'),
  pickedUp('PICKED_UP', 'تم الاستلام'),
  onTheWay('ON_THE_WAY', 'في الطريق إليك'),
  delivered('DELIVERED', 'تم التوصيل'),
  rejected('REJECTED', 'مرفوض'),
  cancelled('CANCELLED', 'ملغي');

  const OrderStatus(this.wire, this.ar);

  /// القيمة المتبادلة مع الـ API (نفس نص الـ enum في packages/shared).
  final String wire;

  /// الاسم المعروض للعميل.
  final String ar;

  static OrderStatus fromWire(String value) =>
      OrderStatus.values.firstWhere((s) => s.wire == value, orElse: () => OrderStatus.pending);

  /// الطلب لسه شغال (يظهر في تبويب «الحالي» ويسمح بالتتبّع).
  bool get isActive => switch (this) {
        OrderStatus.delivered || OrderStatus.rejected || OrderStatus.cancelled => false,
        _ => true,
      };

  bool get isCancelledOrRejected => this == OrderStatus.cancelled || this == OrderStatus.rejected;

  /// لون الحالة في واجهة العميل (أخضر تم/أحمر ملغي/ذهبي جاري).
  Color get color => switch (this) {
        OrderStatus.delivered => QColors.success,
        OrderStatus.rejected || OrderStatus.cancelled => QColors.danger,
        _ => QColors.gold,
      };

  /// ترتيب المرحلة في شريط التتبّع (٤ مراحل في تصميم شاشة التتبّع).
  int get trackingStep => switch (this) {
        OrderStatus.pending => 0,
        OrderStatus.accepted => 1,
        OrderStatus.preparing || OrderStatus.ready => 2,
        OrderStatus.captainAssigned || OrderStatus.pickedUp || OrderStatus.onTheWay => 3,
        OrderStatus.delivered => 4,
        _ => 0,
      };
}

enum PaymentType {
  mada('MADA', 'مدى'),
  applePay('APPLE_PAY', 'Apple Pay'),
  card('CARD', 'فيزا'),
  cash('CASH', 'كاش عند الاستلام'),
  wallet('WALLET', 'محفظة قادر');

  const PaymentType(this.wire, this.ar);
  final String wire;
  final String ar;
}

enum AddressLabel {
  home('منزل', '🏠'),
  work('عمل', '💼'),
  other('آخر', '📍');

  const AddressLabel(this.ar, this.emoji);
  final String ar;
  final String emoji;
}
