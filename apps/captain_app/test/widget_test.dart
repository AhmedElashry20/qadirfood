// اختبارات دخان لتطبيق الكابتن — منطق الحالات والرحلة (من غير شبكة).
import 'package:captain_app/core/enums.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('مراحل الرحلة بترتيبها الصحيح', () {
    expect(OrderStatus.captainAssigned.tripStep, 0);
    expect(OrderStatus.pickedUp.tripStep, 1);
    expect(OrderStatus.onTheWay.tripStep, 2);
    expect(OrderStatus.delivered.tripStep, 3);
  });

  test('الرحلة النشطة هي اللي الكابتن ماسكها', () {
    for (final s in [OrderStatus.captainAssigned, OrderStatus.pickedUp, OrderStatus.onTheWay]) {
      expect(s.isActiveTrip, isTrue, reason: s.wire);
    }
    for (final s in [OrderStatus.pending, OrderStatus.ready, OrderStatus.delivered]) {
      expect(s.isActiveTrip, isFalse, reason: s.wire);
    }
  });

  test('قيم الحالات مطابقة للباك إند', () {
    expect(OrderStatus.fromWire('ON_THE_WAY'), OrderStatus.onTheWay);
    expect(CaptainStatus.fromWire('ONLINE'), CaptainStatus.online);
    expect(CaptainStatus.online.isOnline, isTrue);
    expect(CaptainStatus.offline.isOnline, isFalse);
  });

  test('وثائق التفعيل الأربعة موجودة', () {
    expect(DocumentType.values.length, 4);
    expect(DocumentType.identity.ar, 'الهوية / الإقامة');
  });
}
