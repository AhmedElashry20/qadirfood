// التتبع اللحظي — Socket.IO حقيقي (مافيش محاكاة بتايمر).
// * الحالة بتيجي من `order:status_changed` (السيرفر بيضم العميل لغرفة customer:{id} تلقائياً).
// * موقع الكابتن بييجي من `captain:location` لغرفة `order:{id}` بس — لازم joinOrder.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../core/socket_service.dart';
import '../data/api_repository.dart';
import '../models/order.dart';
import 'orders_provider.dart';

class TrackingState {
  const TrackingState({
    required this.status,
    required this.captainLat,
    required this.captainLng,
    required this.destLat,
    required this.destLng,
    required this.etaMinutes,
  });

  final OrderStatus status;
  final double captainLat;
  final double captainLng;
  final double destLat;
  final double destLng;
  final int etaMinutes;

  TrackingState copyWith({
    OrderStatus? status,
    double? captainLat,
    double? captainLng,
    int? etaMinutes,
  }) =>
      TrackingState(
        status: status ?? this.status,
        captainLat: captainLat ?? this.captainLat,
        captainLng: captainLng ?? this.captainLng,
        destLat: destLat,
        destLng: destLng,
        etaMinutes: etaMinutes ?? this.etaMinutes,
      );
}

/// حالة الطلب + موقع الكابتن لحظياً. بتفضل شغالة طول ما شاشة التتبع مفتوحة.
class OrderTrackingNotifier extends AsyncNotifier<TrackingState> {
  OrderTrackingNotifier(this.orderId);

  final String orderId;

  StreamSubscription<OrderStatusEvent>? _statusSub;
  StreamSubscription<CaptainLocationEvent>? _locationSub;

  @override
  Future<TrackingState> build() async {
    final order = await ref.read(ordersRepositoryProvider).byId(orderId);

    final socket = ref.read(socketServiceProvider);
    socket.connect();
    socket.joinOrder(orderId); // بدونها موقع الكابتن ما يوصلش.

    _statusSub = socket.statusChanges.where((e) => e.orderId == orderId).listen(_onStatus);
    _locationSub = socket.captainLocations.where((e) => e.orderId == orderId).listen(_onLocation);

    ref.onDispose(() {
      _statusSub?.cancel();
      _locationSub?.cancel();
      socket.leaveOrder(orderId);
    });

    // نقطة البداية: الكابتن لو متعيّن، وإلا الفرع (وإلا العنوان نفسه).
    final destLat = order.address.lat;
    final destLng = order.address.lng;
    final captainLat = order.captain?.lat ?? order.branchLat ?? destLat;
    final captainLng = order.captain?.lng ?? order.branchLng ?? destLng;

    return TrackingState(
      status: order.status,
      captainLat: captainLat,
      captainLng: captainLng,
      destLat: destLat,
      destLng: destLng,
      etaMinutes: _seedEta(order, captainLat, captainLng),
    );
  }

  /// الحالة اتغيّرت — نحدّث الشاشة ونخلّي قائمة الطلبات وتفاصيله متزامنين.
  void _onStatus(OrderStatusEvent event) {
    final current = state.value;
    if (current == null) return;

    state = AsyncData(current.copyWith(status: OrderStatus.fromWire(event.status)));

    ref.invalidate(ordersProvider);
    ref.invalidate(orderProvider(orderId)); // بيجيب الكابتن أول ما يتعيّن.
  }

  /// موقع جديد للكابتن — نحرّك الماركر ونعيد حساب الوصول المتوقع من المسافة الباقية.
  void _onLocation(CaptainLocationEvent event) {
    final current = state.value;
    if (current == null) return;

    final remainingKm = _distanceKm(event.lat, event.lng, current.destLat, current.destLng);

    state = AsyncData(
      current.copyWith(
        captainLat: event.lat,
        captainLng: event.lng,
        etaMinutes: _etaFromKm(remainingKm),
      ),
    );
  }

  /// الوصول المتوقع الأولي: من `etaLabel` بتاع الطلب، وإلا تقدير من المسافة.
  static int _seedEta(Order order, double fromLat, double fromLng) {
    final fromLabel = _minutesUntil(order.etaLabel);
    if (fromLabel != null) return fromLabel;

    return _etaFromKm(_distanceKm(fromLat, fromLng, order.address.lat, order.address.lng));
  }

  /// «9:15 PM» → كام دقيقة من دلوقتي (null لو الوقت عدّى أو الصيغة مش مفهومة).
  static int? _minutesUntil(String? label) {
    if (label == null) return null;

    final match = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$').firstMatch(label.trim());
    if (match == null) return null;

    var hour = int.parse(match.group(1)!) % 12;
    if (match.group(3) == 'PM') hour += 12;

    final now = DateTime.now();
    final target = DateTime(now.year, now.month, now.day, hour, int.parse(match.group(2)!));
    final minutes = target.difference(now).inMinutes;

    return minutes <= 0 ? null : minutes.clamp(1, 60);
  }

  /// ~٣ دقايق لكل كيلومتر (≈ ٢٠ كم/س داخل المدينة).
  static int _etaFromKm(double km) => (km * 3).ceil().clamp(1, 60);

  /// مسافة تقريبية بالكيلومتر — تكفي لتقدير الوصول.
  static double _distanceKm(double lat1, double lng1, double lat2, double lng2) {
    const kmPerDegree = 111.0;
    final dLat = (lat2 - lat1) * kmPerDegree;
    final dLng = (lng2 - lng1) * kmPerDegree * 0.9; // تصحيح تقريبي لخط عرض الرياض
    return math.sqrt(dLat * dLat + dLng * dLng);
  }
}

final orderTrackingProvider =
    AsyncNotifierProvider.family<OrderTrackingNotifier, TrackingState, String>(
  OrderTrackingNotifier.new,
);
