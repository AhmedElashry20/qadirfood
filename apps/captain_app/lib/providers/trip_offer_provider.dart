// استقبال عروض المهام والرد عليها.
//
// العرض بيوصل عبر السوكيت بس (`trip:offer`) — **مافيش endpoint** يجيب العروض
// المعلّقة، فلو التطبيق كان مقفول وقت العرض الكابتن مش هيشوفه أبداً ومافيش
// طريقة نلحقه بعدين.
//
// ⚠️ ملاحظة على `raw`:
// [TripOffer.fromEvent] بياخد باراميتر `raw` (الـ Map الخام) عشان يسدّ الحقول
// اللي الـ event ممكن يفوّتها. بس [SocketService] بيفك الـ JSON جوّه
// (`TripOfferEvent.fromJson`) و**بيرمي الـ Map الخام** — الـ stream بيطلّع
// `TripOfferEvent` مجرّد، ومالناش حق نعدّل core/socket_service.dart. راجعنا
// `TripOfferEvent.fromJson` وهو فعلاً بيقرا شكل السيرفر الحالي صح (`branch`،
// `branch.location`، `dropoff.district`، `dropoff.location`، `distanceKm`)،
// فالحقل الوحيد اللي بيضيع هو `branch.address` (عنوان الفرع النصي) وشاشة العرض
// مابتستخدموش أصلاً. عشان كده بننادي `fromEvent` من غير `raw`.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/socket_service.dart';
import '../models/trip_offer.dart';

/// أقصى انتظار لنتيجة القبول (`trip:offer_result`) قبل ما نعتبرها ضايعة.
/// القبول سباق بين الكباتن والسيرفر بيرد فوراً؛ الـ timeout ده شبكة بس.
const _kResultTimeout = Duration(seconds: 12);

class TripOfferNotifier extends Notifier<TripOffer?> {
  @override
  TripOffer? build() {
    final socket = ref.watch(socketServiceProvider);

    final subscriptions = <StreamSubscription<void>>[
      // عرض جديد — بيستبدل أي عرض قديم لسه معروض (السيرفر مابيبعتش اتنين مع بعض).
      socket.tripOffers.listen((event) {
        state = TripOffer.fromEvent(event, receivedAt: DateTime.now());
      }),

      // انتهت المهلة أو الطلب اتلغى — بنمسح العرض لو هو نفسه اللي معروض.
      socket.offerExpired.listen((orderId) {
        if (state?.orderId == orderId) state = null;
      }),
    ];

    ref.onDispose(() {
      for (final subscription in subscriptions) {
        subscription.cancel();
      }
    });

    return null;
  }

  /// قبول العرض — بيبعت الرد وبيستنى نتيجة السباق من السيرفر.
  ///
  /// بيرجّع `true` لو الكابتن كسب الطلب، و`false` لو كابتن تاني سبقه أو الرد ضاع.
  /// بنجهّز الاستماع للنتيجة **قبل** ما نبعت الرد عشان مانفوّتش رد سريع.
  Future<bool> accept() async {
    final offer = state;
    if (offer == null) return false;

    final socket = ref.read(socketServiceProvider);

    final result = socket.offerResults.firstWhere((r) => r.orderId == offer.orderId).timeout(
          _kResultTimeout,
          onTimeout: () => (orderId: offer.orderId, accepted: true, won: false),
        );

    socket.respondToOffer(offer.orderId, accepted: true);

    final outcome = await result;
    state = null;
    return outcome.won;
  }

  /// رفض العرض — السيرفر بيوزّعه على كابتن تاني. مافيش نتيجة نستناها.
  ///
  /// ملاحظة: السيرفر **مابيسجّلش الرفض** في أي جدول، فنسبة القبول في الملف
  /// الشخصي مش قابلة للحساب (شوف Captain.acceptanceRate).
  Future<bool> reject() async {
    final offer = state;
    if (offer == null) return false;

    ref.read(socketServiceProvider).respondToOffer(offer.orderId, accepted: false);
    state = null;
    return false;
  }

  /// العدّاد وصل صفر على الجهاز — بنمسح العرض من غير ما نبعت حاجة.
  /// السيرفر عنده نفس المهلة وبيوزّعه لغيره لوحده.
  void expire() => state = null;

  void clear() => state = null;
}

final tripOfferProvider = NotifierProvider<TripOfferNotifier, TripOffer?>(TripOfferNotifier.new);
