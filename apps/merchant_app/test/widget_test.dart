// اختبارات دخان لتطبيق المطعم — منطق الحالات (من غير شبكة).
import 'package:flutter_test/flutter_test.dart';
import 'package:merchant_app/core/enums.dart';

void main() {
  test('تصنيف حالات الطلب بين وارد / جاري / منتهي', () {
    expect(OrderStatus.pending.isIncoming, isTrue);
    expect(OrderStatus.pending.isActive, isFalse);

    for (final s in [
      OrderStatus.accepted,
      OrderStatus.preparing,
      OrderStatus.ready,
      OrderStatus.captainAssigned,
    ]) {
      expect(s.isActive, isTrue, reason: s.wire);
      expect(s.isFinished, isFalse, reason: s.wire);
    }

    for (final s in [
      OrderStatus.pickedUp,
      OrderStatus.onTheWay,
      OrderStatus.delivered,
      OrderStatus.rejected,
      OrderStatus.cancelled,
    ]) {
      expect(s.isFinished, isTrue, reason: s.wire);
      expect(s.isActive, isFalse, reason: s.wire);
    }
  });

  test('قيم الحالات مطابقة للباك إند', () {
    expect(OrderStatus.fromWire('CAPTAIN_ASSIGNED'), OrderStatus.captainAssigned);
    expect(OrderStatus.fromWire('غير معروف'), OrderStatus.pending);
    expect(BranchStatus.fromWire('BUSY'), BranchStatus.busy);
    expect(ItemAvailability.fromWire('OUT_OF_STOCK_TODAY'), ItemAvailability.outOfStockToday);
  });

  test('الفرع بيستقبل طلبات وهو مفتوح أو مشغول بس', () {
    expect(BranchStatus.open.isReceiving, isTrue);
    expect(BranchStatus.busy.isReceiving, isTrue);
    expect(BranchStatus.paused.isReceiving, isFalse);
    expect(BranchStatus.closed.isReceiving, isFalse);
  });

  test('أسباب الرفض وأوقات التحضير مطابقة للتصميم', () {
    expect(kRejectReasons.length, 5);
    expect(kRejectReasons.last, 'سبب آخر');
    expect(kPrepTimeOptions, [10, 15, 20, 30]);
  });
}
