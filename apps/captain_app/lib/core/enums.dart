// OrderStatus + CaptainStatus — مطابق لـ packages/shared/src/enums.ts
import 'package:flutter/material.dart';

import 'theme.dart';

enum OrderStatus {
  pending('PENDING', 'طلب جديد'),
  accepted('ACCEPTED', 'تم القبول'),
  preparing('PREPARING', 'قيد التحضير'),
  ready('READY', 'جاهز للاستلام'),
  captainAssigned('CAPTAIN_ASSIGNED', 'في طريقي للمطعم'),
  pickedUp('PICKED_UP', 'استلمت الطلب'),
  onTheWay('ON_THE_WAY', 'في الطريق للعميل'),
  delivered('DELIVERED', 'تم التسليم'),
  rejected('REJECTED', 'مرفوض'),
  cancelled('CANCELLED', 'ملغي');

  const OrderStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static OrderStatus fromWire(String value) =>
      OrderStatus.values.firstWhere((s) => s.wire == value, orElse: () => OrderStatus.pending);

  /// الرحلة لسه شغالة مع الكابتن.
  bool get isActiveTrip => switch (this) {
        OrderStatus.captainAssigned || OrderStatus.pickedUp || OrderStatus.onTheWay => true,
        _ => false,
      };

  bool get isDelivered => this == OrderStatus.delivered;

  bool get isCancelled => this == OrderStatus.cancelled || this == OrderStatus.rejected;

  /// مرحلة الرحلة: 0 في الطريق للمطعم · 1 استلم · 2 في الطريق للعميل · 3 سلّم.
  int get tripStep => switch (this) {
        OrderStatus.captainAssigned => 0,
        OrderStatus.pickedUp => 1,
        OrderStatus.onTheWay => 2,
        OrderStatus.delivered => 3,
        _ => 0,
      };

  Color get color => switch (this) {
        OrderStatus.delivered => QColors.success,
        OrderStatus.rejected || OrderStatus.cancelled => QColors.danger,
        _ => QColors.gold,
      };
}

/// حالة الكابتن — بتتحكم في استقبال العروض.
enum CaptainStatus {
  offline('OFFLINE', 'غير متصل'),
  online('ONLINE', 'أونلاين — مستعد للطلبات'),
  onTrip('ON_TRIP', 'في رحلة');

  const CaptainStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static CaptainStatus fromWire(String value) =>
      CaptainStatus.values.firstWhere((s) => s.wire == value, orElse: () => CaptainStatus.offline);

  bool get isOnline => this != CaptainStatus.offline;

  Color get color => switch (this) {
        CaptainStatus.online => QColors.online,
        CaptainStatus.onTrip => QColors.gold,
        CaptainStatus.offline => QColors.faint,
      };
}

/// حالة وثيقة الكابتن — بتحدد شكل الصف في شاشة التوثيق.
enum DocumentStatus {
  accepted('✓ تم القبول'),
  underReview('⏳ قيد المراجعة — عادة 24 ساعة'),
  missing('لم تُرفَع بعد'),
  rejected('✕ مرفوضة — أعد الرفع');

  const DocumentStatus(this.ar);
  final String ar;

  Color get color => switch (this) {
        DocumentStatus.accepted => QColors.success,
        DocumentStatus.underReview => QColors.gold,
        DocumentStatus.rejected => QColors.danger,
        DocumentStatus.missing => QColors.textMuted,
      };
}

/// نوع وثيقة التفعيل (اشتراطات هيئة النقل).
enum DocumentType {
  identity('الهوية / الإقامة', '🪪'),
  license('رخصة القيادة', '🚗'),
  registration('استمارة المركبة', '📄'),
  photo('صورة شخصية', '🤳');

  const DocumentType(this.ar, this.emoji);
  final String ar;
  final String emoji;
}

/// طريقة إثبات التسليم.
enum DeliveryProof {
  otp('رمز OTP'),
  photo('صورة التسليم');

  const DeliveryProof(this.ar);
  final String ar;
}

/// فترة عرض الأرباح والسجل.
enum EarningsRange {
  today('اليوم'),
  week('الأسبوع'),
  month('الشهر');

  const EarningsRange(this.ar);
  final String ar;
}
