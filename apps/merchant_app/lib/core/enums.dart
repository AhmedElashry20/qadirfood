// نسخة Dart من OrderStatus وألوانها وأسماءها العربية — مطابقة لـ packages/shared/src/enums.ts
import 'package:flutter/material.dart';

import 'theme.dart';

enum OrderStatus {
  pending('PENDING', 'طلب جديد'),
  accepted('ACCEPTED', 'تم القبول'),
  preparing('PREPARING', 'قيد التحضير'),
  ready('READY', 'جاهز للاستلام'),
  captainAssigned('CAPTAIN_ASSIGNED', 'بانتظار الكابتن'),
  pickedUp('PICKED_UP', 'تم الاستلام'),
  onTheWay('ON_THE_WAY', 'في الطريق'),
  delivered('DELIVERED', 'مكتمل'),
  rejected('REJECTED', 'مرفوض'),
  cancelled('CANCELLED', 'ملغي');

  const OrderStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static OrderStatus fromWire(String value) =>
      OrderStatus.values.firstWhere((s) => s.wire == value, orElse: () => OrderStatus.pending);

  /// طلب جديد لسه محتاج رد من المطعم.
  bool get isIncoming => this == OrderStatus.pending;

  /// الطلب في المطبخ أو مستني الكابتن — يظهر في «الطلبات الجارية».
  bool get isActive => switch (this) {
        OrderStatus.accepted ||
        OrderStatus.preparing ||
        OrderStatus.ready ||
        OrderStatus.captainAssigned =>
          true,
        _ => false,
      };

  /// خرج من مسؤولية المطعم (اتسلّم للكابتن أو اتلغى).
  bool get isFinished => switch (this) {
        OrderStatus.delivered ||
        OrderStatus.rejected ||
        OrderStatus.cancelled ||
        OrderStatus.pickedUp ||
        OrderStatus.onTheWay =>
          true,
        _ => false,
      };

  /// لون الحالة في الشرائح وكروت الطلبات.
  Color get color => switch (this) {
        OrderStatus.pending => QColors.statusNew,
        OrderStatus.accepted || OrderStatus.preparing => QColors.statusPreparing,
        OrderStatus.ready => QColors.statusReady,
        OrderStatus.captainAssigned ||
        OrderStatus.pickedUp ||
        OrderStatus.onTheWay =>
          QColors.statusOnWay,
        OrderStatus.delivered => QColors.statusDone,
        OrderStatus.rejected || OrderStatus.cancelled => QColors.statusRejected,
      };
}

/// حالة الفرع — بتتحكم في استقبال الطلبات.
enum BranchStatus {
  open('OPEN', 'مفتوح'),
  busy('BUSY', 'مشغول'),
  paused('PAUSED', 'إيقاف مؤقت'),
  closed('CLOSED', 'مغلق');

  const BranchStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static BranchStatus fromWire(String value) =>
      BranchStatus.values.firstWhere((s) => s.wire == value, orElse: () => BranchStatus.closed);

  bool get isReceiving => this == BranchStatus.open || this == BranchStatus.busy;

  Color get color => switch (this) {
        BranchStatus.open => QColors.success,
        BranchStatus.busy || BranchStatus.paused => QColors.gold,
        BranchStatus.closed => QColors.danger,
      };
}

/// توفّر الصنف — مطابق لـ ItemAvailability في packages/shared.
enum ItemAvailability {
  available('AVAILABLE', 'متاح'),
  outOfStockToday('OUT_OF_STOCK_TODAY', 'نفد اليوم — يعود غداً'),
  outOfStock('OUT_OF_STOCK', 'موقوف');

  const ItemAvailability(this.wire, this.ar);

  final String wire;
  final String ar;

  static ItemAvailability fromWire(String value) => ItemAvailability.values
      .firstWhere((a) => a.wire == value, orElse: () => ItemAvailability.available);

  bool get isOn => this == ItemAvailability.available;
}

/// أسباب رفض الطلب — إلزامية، مطابقة لـ REJECT_REASONS_AR في packages/shared.
const kRejectReasons = <String>[
  'الصنف غير متوفر حالياً',
  'ضغط شديد على المطبخ',
  'المطعم على وشك الإغلاق',
  'خطأ في بيانات الطلب',
  'سبب آخر',
];

/// خيارات وقت التحضير في شاشة قبول الطلب.
const kPrepTimeOptions = <int>[10, 15, 20, 30];

/// طريقة استلام الطلب — بتغيّر شكل الكارت وزر «جاهز».
enum OrderChannel {
  delivery('توصيل'),
  pickup('استلام من الفرع');

  const OrderChannel(this.ar);
  final String ar;
}
