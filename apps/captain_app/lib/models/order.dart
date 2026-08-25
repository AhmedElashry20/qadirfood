// الطلب من وجهة نظر الكابتن — Dart عادي من غير freezed ولا codegen.
//
// مصادر الـ JSON وفروقها (مهم جداً):
//   • GET /orders و GET /orders/:id → بيعدّوا على mapOrder() في السيرفر، يعني
//     المبالغ **أرقام** والفرع والعنوان معاهم lat/lng.
//   • PATCH /orders/:id/pickup و ‎/on-the-way و ‎/delivered → بيرجّعوا نتيجة
//     transition() وهي صف Prisma خام: المبالغ **نصوص** (Decimal) و **مافيش lat/lng**
//     على الفرع ولا العنوان خالص.
// عشان كده كل قراءة مبلغ بتعدّي على asMoney، وكل الإحداثيات nullable —
// الشاشة لازم تتحمّل إن الخريطة تيجي فاضية بعد أي PATCH وتعتمد على آخر نسخة من GET.
import '../core/enums.dart';
import '../core/format.dart';
import '../core/location_service.dart' as geo;

/// صنف داخل الطلب — snapshot وقت الطلب مش الصنف الحالي في المنيو.
class TripItem {
  const TripItem({
    required this.nameAr,
    required this.quantity,
    this.optionsLabel = '',
    this.notes,
  });

  final String nameAr;
  final int quantity;

  /// الخيارات في سطر واحد: «وسط + جبنة».
  final String optionsLabel;

  /// ملاحظة العميل على الصنف — الكابتن بيقراها للمطعم عند الاستلام.
  final String? notes;

  bool get hasOptions => optionsLabel.isNotEmpty;

  factory TripItem.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((option) => asText(option['nameAr']))
        .where((name) => name.isNotEmpty)
        .toList();

    return TripItem(
      nameAr: asText(json['nameAr']),
      quantity: asInt(json['quantity'], 1),
      optionsLabel: options.join(' + '),
      notes: json['notes'] as String?,
    );
  }
}

/// رحلة الكابتن = طلب مسند له.
class CaptainTrip {
  const CaptainTrip({
    required this.id,
    required this.number,
    required this.pickupCode,
    required this.status,
    required this.restaurantName,
    required this.customerName,
    required this.addressLabel,
    required this.addressDetails,
    required this.items,
    required this.total,
    required this.payout,
    required this.paymentMethod,
    required this.paymentLabel,
    required this.isPrepaid,
    required this.placedAt,
    this.restaurantAddress = '',
    this.pickupLat,
    this.pickupLng,
    this.customerPhone,
    this.addressNotes,
    this.customerNotes,
    this.dropoffLat,
    this.dropoffLng,
    this.assignedAt,
    this.pickedUpAt,
    this.deliveredAt,
    this.distanceKm,
    this.requiresRelay = false,
    this.handoffCode,
    this.deliveryCode,
  });

  final String id;

  /// `orderNumber` — «A-1010». رقم قصير للمطابقة الصوتية مع المطعم.
  final String number;

  /// كود الاستلام — الكابتن بيدخّله في PATCH /orders/:id/pickup ولازم يطابق الطلب.
  final String pickupCode;

  final OrderStatus status;

  // ── المطعم (نقطة الاستلام) ──
  final String restaurantName;

  /// عنوان الفرع النصي (`branch.address`).
  final String restaurantAddress;

  /// إحداثيات الفرع — null في ردود الـ PATCH (شوف تعليق أول الملف).
  final double? pickupLat;
  final double? pickupLng;

  // ── العميل (نقطة التسليم) ──
  final String customerName;

  /// جوال العميل — من `customer.user.phone`.
  final String? customerPhone;

  /// «البيت» / «الشغل» — `address.label`.
  final String addressLabel;

  /// «النرجس · شارع الأمير سلطان · مبنى ١٢».
  final String addressDetails;

  /// ملاحظات العنوان للكابتن — `address.notes`.
  final String? addressNotes;

  /// ملاحظات العميل على الطلب نفسه — `order.customerNotes`.
  final String? customerNotes;

  final double? dropoffLat;
  final double? dropoffLng;

  // ── الأصناف والمبالغ ──
  final List<TripItem> items;

  /// إجمالي الطلب — ده اللي الكابتن بيحصّله كاش لو الطلب مش مدفوع.
  final double total;

  /// مستحق الكابتن (`captainPayout`).
  ///
  /// تحذير: العمود ده بيفضل **صفر** لحد لحظة التسليم — السيرفر بيحسبه ويكتبه في
  /// markDelivered() بس. يعني رحلة جارية هتوصل بـ payout = 0، والرقم الحقيقي
  /// بيبان في عرض الرحلة (trip:offer) وبعد التسليم.
  final double payout;

  /// CASH / MADA / APPLE_PAY / CARD / WALLET.
  final String paymentMethod;

  /// نفس الطريقة بالعربي — «نقدي» / «مدى».
  final String paymentLabel;

  /// مدفوع مقدماً: الحالة PAID أو أي وسيلة غير الكاش — الكابتن مايحصّلش فلوس.
  final bool isPrepaid;

  // ── الطوابع الزمنية ──
  final DateTime placedAt;
  final DateTime? assignedAt;
  final DateTime? pickedUpAt;
  final DateTime? deliveredAt;

  /// المسافة من المطعم للعميل بالكيلومتر.
  /// السيرفر بيبعتها في عرض الرحلة بس؛ هنا بتتحسب تقريبياً من الإحداثيتين لو موجودين.
  final double? distanceKm;

  // ── التوصيل بالتناوب (الحرم) ──
  /// الوجهة داخل حرم ⇒ الطلب محتاج تسليم مندوب لمندوب عند بوابة الحرم.
  final bool requiresRelay;

  /// كود التسليم لمندوب المشي — بيظهر لمندوب المركبة بس (يقوله للمشي).
  final String? handoffCode;

  /// كود تسليم العميل — بيظهر للعميل بس (المندوب بيدخّله عند التسليم).
  final String? deliveryCode;

  // ── مساعدات للشاشات ──

  /// مجموع الكميات — مش عدد السطور.
  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  bool get isDelivered => status.isDelivered;

  bool get isActive => status.isActiveTrip;

  bool get hasNotes => customerNotes != null && customerNotes!.trim().isNotEmpty;

  /// المبلغ اللي الكابتن بيحصّله من العميل — صفر لو الطلب مدفوع مقدماً.
  double get cashToCollect => isPrepaid ? 0 : total;

  /// نقطة التسليم — null لو الإحداثيات مش موجودة في الرد.
  geo.LatLngPoint? get dropoffPoint =>
      (dropoffLat != null && dropoffLng != null) ? geo.LatLngPoint(dropoffLat!, dropoffLng!) : null;

  /// نقطة الاستلام (الفرع).
  geo.LatLngPoint? get pickupPoint =>
      (pickupLat != null && pickupLng != null) ? geo.LatLngPoint(pickupLat!, pickupLng!) : null;

  /// اسم المرحلة الحالية — العنوان اللي بيتعرض فوق شاشة الرحلة.
  String get stepLabel => switch (status) {
        OrderStatus.captainAssigned => 'في الطريق للمطعم',
        OrderStatus.pickedUp => 'استلمت الطلب',
        OrderStatus.onTheWay => 'في الطريق للعميل',
        OrderStatus.delivered => 'تم التسليم',
        OrderStatus.cancelled || OrderStatus.rejected => 'الطلب اتلغى',
        _ => status.ar,
      };

  /// الوجهة الحالية حسب المرحلة — الفرع قبل الاستلام، والعميل بعده.
  geo.LatLngPoint? get currentDestination => status.tripStep == 0 ? pickupPoint : dropoffPoint;

  /// الدقايق من لحظة الإسناد — عدّاد شاشة الرحلة.
  int get minutesSinceAssigned {
    final assigned = assignedAt;
    if (assigned == null) return 0;
    final minutes = DateTime.now().difference(assigned).inMinutes;
    return minutes < 0 ? 0 : minutes;
  }

  factory CaptainTrip.fromJson(Map<String, dynamic> json) {
    final branch = (json['branch'] as Map<String, dynamic>?) ?? const {};
    final address = (json['address'] as Map<String, dynamic>?) ?? const {};
    final customer = (json['customer'] as Map<String, dynamic>?) ?? const {};
    // بيانات العميل الحقيقية على customer.user — موديل Customer نفسه مافيهوش اسم ولا تليفون.
    final customerUser = (customer['user'] as Map<String, dynamic>?) ?? const {};

    final method = asText(json['paymentMethod'], 'CASH');
    final paymentStatus = asText(json['paymentStatus']);

    final pickupLat = asMoneyOrNull(branch['lat']);
    final pickupLng = asMoneyOrNull(branch['lng']);
    final dropoffLat = asMoneyOrNull(address['lat']);
    final dropoffLng = asMoneyOrNull(address['lng']);

    return CaptainTrip(
      id: asText(json['id']),
      number: asText(json['orderNumber']),
      pickupCode: asText(json['pickupCode']),
      requiresRelay: json['requiresRelay'] == true,
      handoffCode: json['handoffCode'] as String?,
      deliveryCode: json['deliveryCode'] as String?,
      status: OrderStatus.fromWire(asText(json['status'], 'PENDING')),
      restaurantName: asText(branch['nameAr']),
      restaurantAddress: asText(branch['address']),
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      customerName: asText(customerUser['fullName']),
      customerPhone: customerUser['phone'] as String?,
      addressLabel: asText(address['label'], 'العنوان'),
      addressDetails: _addressDetails(address),
      addressNotes: address['notes'] as String?,
      customerNotes: json['customerNotes'] as String?,
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      items: [
        for (final raw in (json['items'] as List<dynamic>? ?? const []))
          TripItem.fromJson(raw as Map<String, dynamic>),
      ],
      total: asMoney(json['total']),
      payout: asMoney(json['captainPayout']),
      paymentMethod: method,
      paymentLabel: paymentLabelOf(method),
      isPrepaid: paymentStatus == 'PAID' || method != 'CASH',
      placedAt: asDate(json['placedAt']) ?? DateTime.now(),
      assignedAt: asDate(json['assignedAt']),
      pickedUpAt: asDate(json['pickedUpAt']),
      deliveredAt: asDate(json['deliveredAt']),
      distanceKm: _distance(
        pickupLat: pickupLat,
        pickupLng: pickupLng,
        dropoffLat: dropoffLat,
        dropoffLng: dropoffLng,
      ),
    );
  }

  /// «نقدي» / «مدى» — نفس خريطة تطبيق المطعم.
  static String paymentLabelOf(String method) => switch (method) {
        'CASH' => 'نقدي',
        'MADA' => 'مدى',
        'APPLE_PAY' => 'Apple Pay',
        'CARD' => 'بطاقة',
        'WALLET' => 'المحفظة',
        _ => method,
      };

  /// «النرجس · شارع الأمير سلطان · مبنى ١٢» — بنتخطى الأجزاء الفاضية.
  /// الـ label بيتشال من هنا لأنه بيتعرض لوحده في [addressLabel].
  static String _addressDetails(Map<String, dynamic> address) => [
        asText(address['district']),
        asText(address['street']),
        asText(address['building']),
        asText(address['city']),
      ].where((part) => part.trim().isNotEmpty).join(' · ');

  /// مسافة تقريبية بين الفرع والعميل — null لو أي إحداثية ناقصة.
  static double? _distance({
    required double? pickupLat,
    required double? pickupLng,
    required double? dropoffLat,
    required double? dropoffLng,
  }) {
    if (pickupLat == null || pickupLng == null || dropoffLat == null || dropoffLng == null) {
      return null;
    }
    return geo.distanceKm(
      geo.LatLngPoint(pickupLat, pickupLng),
      geo.LatLngPoint(dropoffLat, dropoffLng),
    );
  }
}
