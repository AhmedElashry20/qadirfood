// socket_io_client — غرفة captain:{id}، استقبال trip:offer و order:ready.
// السيرفر بيضم الكابتن تلقائياً لغرفته حسب التوكن، فمافيش join يدوي.
// الكابتن كمان **بيبعت** موقعه (captain:location_update) وحالته (captain:status_update).
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'env.dart';

/// عرض رحلة جديد (trip:offer) — للكابتن ثواني معدودة يقبله.
class TripOfferEvent {
  const TripOfferEvent({
    required this.orderId,
    required this.orderNumber,
    required this.restaurantName,
    required this.dropoffLabel,
    required this.payout,
    required this.itemCount,
    required this.expiresInSeconds,
    this.paymentLabel,
    this.pickupDistanceKm,
    this.dropoffDistanceKm,
    this.pickupLat,
    this.pickupLng,
    this.dropoffLat,
    this.dropoffLng,
  });

  final String orderId;
  final String orderNumber;
  final String restaurantName;

  /// «حي النرجس» — الحي اللي هيتوصّل له.
  final String dropoffLabel;

  /// مستحق الكابتن من الرحلة.
  final double payout;
  final int itemCount;

  /// المهلة اللي السيرفر محددها للرد (TRIP_OFFER_TIMEOUT_SECONDS).
  final int expiresInSeconds;
  final String? paymentLabel;
  final double? pickupDistanceKm;
  final double? dropoffDistanceKm;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;

  /// الشكل الحقيقي اللي `DispatchService.emitTripOffer` بيبعته:
  /// `{orderId, orderNumber, branch:{id,nameAr,location:{lat,lng},address},
  ///   dropoff:{location:{lat,lng},district}, distanceKm, payout, expiresInSeconds}`
  /// السيرفر مابيبعتش `itemCount` ولا طريقة الدفع، وبيبعت مسافة واحدة بس
  /// (من المطعم للعميل) — فالحقول دي بتفضل فاضية لحد ما الـ API يضيفها.
  static TripOfferEvent fromJson(Map<String, dynamic> json) {
    double? d(Object? v) => v == null ? null : (v as num).toDouble();
    Map<String, dynamic>? m(Object? v) => v == null ? null : Map<String, dynamic>.from(v as Map);

    final branch = m(json['branch']) ?? m(json['pickup']);
    final dropoff = m(json['dropoff']);
    final branchPoint = m(branch?['location']);
    final dropoffPoint = m(dropoff?['location']);

    return TripOfferEvent(
      orderId: json['orderId'] as String,
      orderNumber: (json['orderNumber'] as String?) ?? '',
      restaurantName: (branch?['nameAr'] ?? branch?['name'] ?? '') as String,
      dropoffLabel: (dropoff?['district'] ?? dropoff?['label'] ?? '') as String,
      payout: d(json['payout'] ?? json['captainPayout']) ?? 0,
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
      expiresInSeconds: (json['expiresInSeconds'] as num?)?.toInt() ?? 30,
      paymentLabel: json['paymentMethod'] as String?,
      // مسافة واحدة بس بتيجي من السيرفر — بنحطها على رجل التوصيل.
      pickupDistanceKm: d(json['pickupDistanceKm']),
      dropoffDistanceKm: d(json['distanceKm'] ?? json['dropoffDistanceKm']),
      pickupLat: d(branchPoint?['lat'] ?? branch?['lat']),
      pickupLng: d(branchPoint?['lng'] ?? branch?['lng']),
      dropoffLat: d(dropoffPoint?['lat'] ?? dropoff?['lat']),
      dropoffLng: d(dropoffPoint?['lng'] ?? dropoff?['lng']),
    );
  }
}

/// الطلب بقى جاهز في المطعم (order:ready) — بيوصل بكود الاستلام.
class OrderReadyEvent {
  const OrderReadyEvent({
    required this.orderId,
    required this.orderNumber,
    required this.pickupCode,
  });

  final String orderId;
  final String orderNumber;
  final String pickupCode;
}

/// حالة الطلب اتغيّرت (order:status_changed).
class OrderStatusEvent {
  const OrderStatusEvent({required this.orderId, required this.status});

  final String orderId;
  final String status;
}

/// نتيجة الرد على عرض (trip:offer_result) — القبول سباق بين الكباتن.
typedef OfferResult = ({String orderId, bool accepted, bool won});

class SocketService {
  SocketService(this._tokens);

  final TokenStore _tokens;
  io.Socket? _socket;

  final _offers = StreamController<TripOfferEvent>.broadcast();
  final _offerExpired = StreamController<String>.broadcast();
  final _offerResults = StreamController<OfferResult>.broadcast();
  final _ready = StreamController<OrderReadyEvent>.broadcast();
  final _statusChanges = StreamController<OrderStatusEvent>.broadcast();

  Stream<TripOfferEvent> get tripOffers => _offers.stream;

  /// انتهت مهلة العرض أو اتسند لكابتن تاني (trip:offer_expired / trip:cancelled).
  Stream<String> get offerExpired => _offerExpired.stream;
  Stream<OfferResult> get offerResults => _offerResults.stream;
  Stream<OrderReadyEvent> get orderReady => _ready.stream;
  Stream<OrderStatusEvent> get statusChanges => _statusChanges.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect() {
    final token = _tokens.accessToken;
    if (token == null || _socket != null) return;

    _socket = io.io(
      Env.socket,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );

    _socket!.on('trip:offer', (data) {
      _offers.add(TripOfferEvent.fromJson(Map<String, dynamic>.from(data as Map)));
    });

    _socket!.on('trip:offer_expired', (data) {
      _offerExpired.add(Map<String, dynamic>.from(data as Map)['orderId'] as String);
    });

    _socket!.on('trip:cancelled', (data) {
      _offerExpired.add(Map<String, dynamic>.from(data as Map)['orderId'] as String);
    });

    _socket!.on('trip:offer_result', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _offerResults.add((
        orderId: map['orderId'] as String,
        accepted: map['accepted'] as bool? ?? false,
        won: map['won'] as bool? ?? false,
      ));
    });

    _socket!.on('order:ready', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _ready.add(
        OrderReadyEvent(
          orderId: map['orderId'] as String,
          orderNumber: (map['orderNumber'] as String?) ?? '',
          pickupCode: (map['pickupCode'] as String?) ?? '',
        ),
      );
    });

    _socket!.on('order:status_changed', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _statusChanges.add(
        OrderStatusEvent(orderId: map['orderId'] as String, status: map['status'] as String),
      );
    });
  }

  /// بث موقع الكابتن — الـ [orderId] مهم: من غيره الموقع مايوصلش لشاشة تتبّع العميل.
  void sendLocation({
    required double lat,
    required double lng,
    String? orderId,
    double? heading,
    double? speedKmh,
  }) {
    _socket?.emit('captain:location_update', {
      'lat': lat,
      'lng': lng,
      if (orderId != null) 'orderId': orderId,
      if (heading != null) 'heading': heading,
      if (speedKmh != null) 'speedKmh': speedKmh,
    });
  }

  /// أونلاين/أوفلاين — السيرفر بيستخدمها في التوزيع.
  void sendStatus(String status, {double? lat, double? lng}) {
    _socket?.emit('captain:status_update', {
      'status': status,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
  }

  /// الرد على عرض الرحلة — النتيجة بترجع على [offerResults].
  void respondToOffer(String orderId, {required bool accepted}) {
    _socket?.emit('trip:offer_response', {'orderId': orderId, 'accepted': accepted});
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final service = SocketService(ref.watch(tokenStoreProvider));
  ref.onDispose(service.disconnect);
  return service;
});
