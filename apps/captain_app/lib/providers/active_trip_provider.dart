// المهمة الجارية ومراحلها.
//
// ══════════════════════════════════════════════════════════════════════════
//                 ليه كل تحويل بيعمل refetch بعد الـ PATCH
// ══════════════════════════════════════════════════════════════════════════
// ردود PATCH (/pickup، /on-the-way، /delivered) صفوف Prisma خام — المبالغ نصوص
// و**مافيش lat/lng** على الفرع ولا العنوان (شوف تعليقات data/captain_repository.dart).
// يعني لو اعتمدنا على رد الـ PATCH، الخريطة في الشاشة اللي بعدها هتفضى.
// عشان كده كل تحويل هنا: PATCH → GET /orders/:id (byId) → نحدّث الحالة من الـ GET.
//
// ⚠️ ومافيش تتبّع لحظي للحالة كمان: `order:status_changed` بيتبعت لغرف العميل
// والفرع والأدمن **مش لغرفة الكابتن**، و SocketService مالوش method يعمل join
// لغرفة `order:{id}`. فالتحديث هنا بالـ refetch بعد كل تحويل بس — مافيش push.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/captain_repository.dart';
import '../models/order.dart';

/// الرحلة الشغالة دلوقتي — null لو الكابتن فاضي.
class ActiveTripNotifier extends AsyncNotifier<CaptainTrip?> {
  @override
  Future<CaptainTrip?> build() => ref.watch(tripsRepositoryProvider).active();

  TripsRepository get _repo => ref.read(tripsRepositoryProvider);

  /// إعادة جلب الرحلة الجارية من GET /orders.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_repo.active);
  }

  /// PATCH /orders/:id/pickup — السيرفر بيرمي «كود الاستلام غير صحيح» لو غلط،
  /// والـ ApiException بتطلع للشاشة زي ما هي عشان تعرض رسالة السيرفر العربية.
  Future<CaptainTrip> pickup(String id, String code) =>
      _transition(id, () => _repo.pickup(id, code));

  /// PATCH /orders/:id/on-the-way — من PICKED_UP لـ ON_THE_WAY.
  Future<CaptainTrip> onTheWay(String id) => _transition(id, () => _repo.onTheWay(id));

  /// PATCH /orders/:id/delivered — بكود العميل + صورة إثبات.
  Future<CaptainTrip> delivered(String id, String code, {String? photoUrl}) =>
      _transition(id, () => _repo.delivered(id, code, photoUrl: photoUrl));

  /// مندوب المركبة وصل بوابة الحرم — بيفتح التسليم بالتناوب.
  Future<Map<String, dynamic>> relayArrive(String id, {String? photoUrl, double? lat, double? lng}) =>
      _repo.relayArrive(id, photoUrl: photoUrl, lat: lat, lng: lng);

  /// بينفّذ التحويل وبعدين **بيعيد الجلب بـ byId** — رد الـ PATCH مالوش إحداثيات.
  /// أي ApiException بتتسرّب للشاشة من غير ما نلمسها.
  Future<CaptainTrip> _transition(String id, Future<void> Function() action) async {
    await action();

    final fresh = await _repo.byId(id);
    // الرحلة بتخرج من الحالة أول ما تتسلّم أو تتلغي.
    state = AsyncValue.data(fresh.isActive ? fresh : null);
    // أي شاشة بتقرا الرحلة دي بالـ id لازم تشوف النسخة الجديدة.
    ref.invalidate(tripProvider(id));
    return fresh;
  }
}

final activeTripProvider =
    AsyncNotifierProvider<ActiveTripNotifier, CaptainTrip?>(ActiveTripNotifier.new);

/// رحلة واحدة بالـ id — GET /orders/:id (بيعدّي على mapOrder فبيرجّع إحداثيات).
/// دي المصدر اللي شاشات الرحلة والخريطة بتعتمد عليه.
final tripProvider = FutureProvider.family<CaptainTrip, String>(
  (ref, id) => ref.watch(tripsRepositoryProvider).byId(id),
);
