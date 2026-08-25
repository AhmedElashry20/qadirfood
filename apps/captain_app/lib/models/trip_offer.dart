// عرض المهمة — Dart عادي من غير freezed ولا codegen.
//
// العرض بيوصل عبر السوكيت بس (`trip:offer`) — **مافيش endpoint** يجيب العروض
// المعلّقة، فلو التطبيق كان مقفول وقت العرض الكابتن مش هيشوفه أبداً.
//
// ⚠️ فرق مهم بين شكل السيرفر وشكل TripOfferEvent:
// DispatchService بيبعت الشكل ده بالظبط —
//   { orderId, orderNumber,
//     branch: { id, nameAr, location: {lat,lng}, address },
//     dropoff: { location: {lat,lng}, district },
//     distanceKm, payout, expiresInSeconds }
// بينما `TripOfferEvent.fromJson` في core/socket_service.dart بيدوّر على
// `pickup` و `dropoff.label` و `dropoff.lat` — يعني مع الباك إند الحالي بيرجّع
// اسم مطعم فاضي وحي فاضي وإحداثيات null. الـ core ملناش حق نعدّله، عشان كده
// [TripOffer.fromJson] هنا بيقرا **الشكلين** ويطلّع بيانات صحيحة، و
// [TripOffer.fromEvent] بيسدّ الفراغات من الـ raw لو الـ provider مرّره.
//
// حقول مش موجودة في رسالة السيرفر أصلاً:
//   • itemCount → السيرفر مابيبعتش عدد الأصناف (بيفضل 0).
//   • paymentMethod → مابيتبعتش، فمافيش «نقدي/مدى» على كارت العرض.
//   • مسافة الكابتن للمطعم → مابتتبعتش؛ الشاشة تحسبها من موقعها + [pickupPoint].
import '../core/format.dart';
import '../core/location_service.dart' as geo;
import '../core/socket_service.dart';

class TripOffer {
  TripOffer({
    required this.orderId,
    required this.orderNumber,
    required this.restaurantName,
    required this.dropoffLabel,
    required this.payout,
    required this.itemCount,
    required this.expiresInSeconds,
    required this.receivedAt,
    this.restaurantAddress = '',
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

  /// عنوان الفرع النصي (`branch.address`) — بيوصل من السيرفر لكن TripOfferEvent
  /// مابيقراهوش، فمتاح هنا بس.
  final String restaurantAddress;

  /// «حي النرجس» — الحي اللي هيتوصّل له (`dropoff.district`).
  final String dropoffLabel;

  /// مستحق الكابتن من الرحلة — محسوب من المسافة (٨ ر.س حد أدنى + ١.٥ لكل كم).
  final double payout;

  /// عدد الأصناف — **السيرفر مابيبعتوش**، فبيفضل صفر إلا لو الشاشة جابته من مكان تاني.
  final int itemCount;

  /// المهلة اللي السيرفر محددها للرد (TRIP_OFFER_TIMEOUT_SECONDS، افتراضي ٣٠ ثانية).
  final int expiresInSeconds;

  /// لحظة استلام العرض على الجهاز — منها بيتحسب العدّاد التنازلي.
  /// مابنعتمدش على وقت السيرفر لأنه مابيبعتش طابع زمني مع العرض.
  final DateTime receivedAt;

  /// **مابيوصلش من السيرفر** — دايماً null مع الباك إند الحالي.
  final String? paymentLabel;

  /// مسافة الكابتن للمطعم — **مابتوصلش من السيرفر**.
  final double? pickupDistanceKm;

  /// مسافة المطعم للعميل — دي هي `distanceKm` اللي السيرفر بيبعتها.
  final double? dropoffDistanceKm;

  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;

  // ── مساعدات للشاشات ──

  /// لحظة انتهاء المهلة — الشاشة بتقارن بيها كل ثانية.
  DateTime get expiresAt => receivedAt.add(Duration(seconds: expiresInSeconds));

  /// الوقت الفاضل — صفر لو المهلة عدّت.
  Duration get remaining {
    final left = expiresAt.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  int get remainingSeconds => remaining.inSeconds;

  bool get isExpired => remaining == Duration.zero;

  /// نسبة الوقت الفاضل من ١ لـ ٠ — للشريط الدائري في كارت العرض.
  double get progress => expiresInSeconds <= 0
      ? 0
      : (remaining.inMilliseconds / (expiresInSeconds * 1000)).clamp(0.0, 1.0);

  /// مسافة الرحلة الكلية المعروفة — للأسف من غير رجل الكابتن→المطعم.
  double? get tripDistanceKm => dropoffDistanceKm;

  geo.LatLngPoint? get pickupPoint =>
      (pickupLat != null && pickupLng != null) ? geo.LatLngPoint(pickupLat!, pickupLng!) : null;

  geo.LatLngPoint? get dropoffPoint =>
      (dropoffLat != null && dropoffLng != null) ? geo.LatLngPoint(dropoffLat!, dropoffLng!) : null;

  /// من حدث السوكيت اللي فكّه core/socket_service.dart.
  ///
  /// [raw] هو الـ Map الخام لو الـ provider احتفظ بيه — بنستخدمه نسدّ الحقول اللي
  /// `TripOfferEvent.fromJson` بيفوّتها مع شكل السيرفر الحالي (اسم المطعم، الحي،
  /// الإحداثيات، المسافة). من غيره بنستخدم الحدث زي ما هو.
  factory TripOffer.fromEvent(
    TripOfferEvent event, {
    Map<String, dynamic>? raw,
    DateTime? receivedAt,
  }) {
    final patch = raw == null ? null : TripOffer.fromJson(raw, receivedAt: receivedAt);

    return TripOffer(
      orderId: event.orderId,
      orderNumber: event.orderNumber.isNotEmpty ? event.orderNumber : (patch?.orderNumber ?? ''),
      restaurantName:
          event.restaurantName.isNotEmpty ? event.restaurantName : (patch?.restaurantName ?? ''),
      restaurantAddress: patch?.restaurantAddress ?? '',
      dropoffLabel:
          event.dropoffLabel.isNotEmpty ? event.dropoffLabel : (patch?.dropoffLabel ?? ''),
      payout: event.payout != 0 ? event.payout : (patch?.payout ?? 0),
      itemCount: event.itemCount != 0 ? event.itemCount : (patch?.itemCount ?? 0),
      expiresInSeconds: event.expiresInSeconds,
      receivedAt: receivedAt ?? DateTime.now(),
      paymentLabel: event.paymentLabel ?? patch?.paymentLabel,
      pickupDistanceKm: event.pickupDistanceKm ?? patch?.pickupDistanceKm,
      dropoffDistanceKm: event.dropoffDistanceKm ?? patch?.dropoffDistanceKm,
      pickupLat: event.pickupLat ?? patch?.pickupLat,
      pickupLng: event.pickupLng ?? patch?.pickupLng,
      dropoffLat: event.dropoffLat ?? patch?.dropoffLat,
      dropoffLng: event.dropoffLng ?? patch?.dropoffLng,
    );
  }

  /// بيقرا شكل السيرفر الحالي (`branch` / `dropoff.location` / `dropoff.district`)
  /// وكمان الشكل المسطّح (`pickup` / `dropoff.lat` / `dropoffLabel`) لو اتغيّر بعدين.
  factory TripOffer.fromJson(Map<String, dynamic> json, {DateTime? receivedAt}) {
    Map<String, dynamic> map(Object? value) =>
        value is Map ? Map<String, dynamic>.from(value) : const {};

    final branch = map(json['branch'] ?? json['pickup']);
    final dropoff = map(json['dropoff']);
    final branchPoint = map(branch['location']);
    final dropoffPoint = map(dropoff['location']);

    return TripOffer(
      orderId: asText(json['orderId']),
      orderNumber: asText(json['orderNumber']),
      restaurantName:
          asText(branch['nameAr'], asText(branch['name'], asText(json['restaurantName']))),
      restaurantAddress: asText(branch['address']),
      dropoffLabel: asText(
        dropoff['district'],
        asText(dropoff['label'], asText(json['dropoffLabel'])),
      ),
      payout: asMoney(json['payout'] ?? json['captainPayout']),
      itemCount: asInt(json['itemCount']),
      expiresInSeconds: asInt(json['expiresInSeconds'], 30),
      receivedAt: receivedAt ?? DateTime.now(),
      paymentLabel: json['paymentMethod'] as String?,
      pickupDistanceKm: asMoneyOrNull(json['pickupDistanceKm'] ?? branch['distanceKm']),
      // السيرفر بيبعت مسافة واحدة (الفرع → العميل) في `distanceKm`.
      dropoffDistanceKm: asMoneyOrNull(
        json['dropoffDistanceKm'] ?? dropoff['distanceKm'] ?? json['distanceKm'],
      ),
      pickupLat: asMoneyOrNull(branchPoint['lat'] ?? branch['lat']),
      pickupLng: asMoneyOrNull(branchPoint['lng'] ?? branch['lng']),
      dropoffLat: asMoneyOrNull(dropoffPoint['lat'] ?? dropoff['lat']),
      dropoffLng: asMoneyOrNull(dropoffPoint['lng'] ?? dropoff['lng']),
    );
  }
}
