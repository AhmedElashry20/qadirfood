// الطلب + الكابتن + الكوبون + طريقة الدفع + الإشعار — موديلات العرض.
import '../core/enums.dart';
import '../core/format.dart';
import 'address.dart';

class Order {
  const Order({
    required this.id,
    required this.number,
    required this.restaurantId,
    required this.restaurantName,
    this.restaurantImageUrl = '',
    required this.status,
    required this.lines,
    required this.subtotal,
    required this.deliveryFee,
    required this.vat,
    required this.discount,
    required this.address,
    required this.paymentLabel,
    required this.placedAtLabel,
    this.orderNumber,
    this.pickupCode,
    this.paymentMethod,
    this.customerNotes,
    this.placedAt,
    this.deliveredAt,
    this.branchLat,
    this.branchLng,
    this.etaLabel,
    this.deliveredAtLabel,
    this.couponCode,
    this.captain,
    this.rating,
    this.checkoutUrl,
    this.paymentStatus,
    this.tipAmount = 0,
    this.scheduledFor,
    this.awaitingRelease = false,
  });

  /// إكرامية المندوب — برّه الإجمالي، بتتضاف على المبلغ المدفوع.
  final double tipAmount;

  /// وقت التسليم المطلوب لو الطلب مجدول. null = طلب فوري.
  final DateTime? scheduledFor;

  /// مجدول ولسه ماوصلش المطعم — بنعرض «مجدول» مش «بانتظار قبول المطعم»،
  /// وإلا العميل يفتكر إن فيه مشكلة في طلب لبكرة.
  final bool awaitingRelease;

  /// الاسم المعروض للحالة.
  ///
  /// الطلب المجدول اللي لسه ماوصلش المطعم حالته `PENDING`، واسمها «طلب جديد» —
  /// اللي بيخلّي عميل جادول لبكرة يفتكر إن طلبه معلّق. فبنعرض وقت التسليم بدلها.
  String get statusLabel => awaitingRelease && scheduledFor != null
      ? 'مجدول · ${scheduleLabel(scheduledFor!)}'
      : status.ar;

  final String id;

  /// «#A-1010» — رقم العرض (بالشرطة المائلة).
  final String number;

  /// رقم الطلب الخام من الـ API («A-1010»).
  final String? orderNumber;

  /// كود الاستلام اللي بيتقال للكابتن.
  final String? pickupCode;

  /// معرّف **الفرع** — نفس اللي الراوتس والمنيو بيستخدموه.
  final String restaurantId;
  final String restaurantName;
  final String restaurantImageUrl;
  final OrderStatus status;
  final List<OrderLine> lines;
  final double subtotal;
  final double deliveryFee;
  final double vat;

  /// خصم الكوبون (رقم موجب يتخصم).
  final double discount;
  final Address address;

  /// «مدى •••• 4382»
  final String paymentLabel;
  final PaymentType? paymentMethod;
  final String? customerNotes;

  /// «أمس» / «الثلاثاء» / «اليوم 9:12 PM»
  final String placedAtLabel;
  final DateTime? placedAt;
  final DateTime? deliveredAt;

  /// إحداثيات الفرع — نقطة البداية في خريطة التتبّع.
  final double? branchLat;
  final double? branchLng;

  /// «9:15 PM» — الوصول المتوقع للطلبات الجارية.
  final String? etaLabel;
  final String? deliveredAtLabel;
  final String? couponCode;
  final Captain? captain;
  final int? rating;

  /// رابط صفحة الدفع الإلكتروني — بيرجع من POST /orders لو الطلب بطاقة ومحتاج دفع.
  /// `null` للكاش أو لو التحصيل خلص فوراً. التطبيق بيفتحه في webview.
  final String? checkoutUrl;

  /// حالة الدفع الخام من الـ API (PENDING/PAID/FAILED/…) — بنستقرأها بعد الدفع
  /// الإلكتروني عشان نتأكّد إن البوابة أكّدت التحصيل.
  final String? paymentStatus;

  /// نفس `restaurantId` — بالاسم اللي الـ API بيستخدمه.
  String get branchId => restaurantId;

  double get total => subtotal + deliveryFee + vat - discount;
  int get itemCount => lines.fold(0, (sum, l) => sum + l.quantity);

  /// «تشيز برجر دبل + بطاطس ترافل»
  String get itemsSummary => lines.map((l) => l.name).join(' + ');

  /// OrderDto → Order.
  /// الطلب الراجع من الـ API مافيهوش صور — [restaurantName]/[restaurantImageUrl]
  /// بيتمرروا من بيانات الفرع اللي التطبيق جايبها أصلاً (وإلا بنقع على اسم الفرع).
  factory Order.fromJson(
    Map<String, dynamic> json, {
    String? restaurantName,
    String? restaurantImageUrl,
  }) {
    final branch = json['branch'] as Map<String, dynamic>?;
    final branchLat = (branch?['lat'] as num?)?.toDouble();
    final branchLng = (branch?['lng'] as num?)?.toDouble();

    final status = OrderStatus.fromWire((json['status'] as String?) ?? 'PENDING');
    final placedAt = _parseDate(json['placedAt']);
    final acceptedAt = _parseDate(json['acceptedAt']);
    final deliveredAt = _parseDate(json['deliveredAt']);

    final orderNumber = json['orderNumber'] as String?;
    final discount = (json['discount'] as num?)?.toDouble() ?? 0;
    final coupon = json['coupon'] as Map<String, dynamic>?;

    final rawAddress = json['address'] as Map<String, dynamic>?;
    final captain = json['captain'] as Map<String, dynamic>?;

    // مدة التجهيز المتوقعة → وقت الوصول التقريبي (الـ API مابيرجعش ETA جاهز).
    final prepMinutes = (json['prepMinutes'] as num?)?.toInt() ??
        (branch?['avgPrepMinutes'] as num?)?.toInt() ??
        25;

    return Order(
      id: json['id'] as String,
      number: orderNumber == null ? '' : '#$orderNumber',
      orderNumber: orderNumber,
      pickupCode: json['pickupCode'] as String?,
      restaurantId: (json['branchId'] ?? branch?['id'] ?? '') as String,
      restaurantName:
          restaurantName ?? (branch?['nameAr'] as String?) ?? (branch?['nameEn'] as String?) ?? '',
      restaurantImageUrl: restaurantImageUrl ?? '',
      status: status,
      lines: [
        for (final raw in (json['items'] as List<dynamic>? ?? const []))
          OrderLine.fromJson(raw as Map<String, dynamic>),
      ],
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      deliveryFee: (json['deliveryFee'] as num?)?.toDouble() ?? 0,
      vat: (json['vat'] as num?)?.toDouble() ?? 0,
      discount: discount,
      address: rawAddress != null ? Address.fromJson(rawAddress) : _emptyAddress,
      paymentLabel: paymentLabelFromWire(json['paymentMethod'] as String?),
      paymentMethod: paymentTypeFromWire(json['paymentMethod'] as String?),
      customerNotes: json['customerNotes'] as String?,
      placedAtLabel: placedAt == null ? '' : _stampLabel(placedAt),
      placedAt: placedAt,
      deliveredAt: deliveredAt,
      deliveredAtLabel: deliveredAt == null ? null : _stampLabel(deliveredAt),
      etaLabel: status.isActive && placedAt != null
          ? _timeLabel((acceptedAt ?? placedAt).add(Duration(minutes: prepMinutes + 15)))
          : null,
      branchLat: branchLat,
      branchLng: branchLng,
      couponCode: (coupon?['code'] as String?) ?? (discount > 0 ? 'كوبون' : null),
      captain: captain == null
          ? null
          : Captain.fromJson(captain, fallbackLat: branchLat, fallbackLng: branchLng),
      rating: (json['review']?['restaurantStars'] as num?)?.toInt(),
      checkoutUrl: json['checkoutUrl'] as String?,
      paymentStatus: json['paymentStatus'] as String?,
      tipAmount: (json['tipAmount'] as num?)?.toDouble() ?? 0,
      scheduledFor: _parseDate(json['scheduledFor']),
      awaitingRelease: json['awaitingRelease'] as bool? ?? false,
    );
  }

  static const _emptyAddress = Address(
    id: '',
    label: AddressLabel.other,
    title: '',
    details: '',
    lat: 0,
    lng: 0,
  );

  /// «CASH» → «كاش عند الاستلام»
  static String paymentLabelFromWire(String? wire) =>
      paymentTypeFromWire(wire)?.ar ?? PaymentType.cash.ar;

  static PaymentType? paymentTypeFromWire(String? wire) {
    if (wire == null) return null;
    for (final t in PaymentType.values) {
      if (t.wire == wire) return t;
    }
    return null;
  }

  Order copyWith({
    OrderStatus? status,
    int? rating,
    Captain? captain,
    String? etaLabel,
    String? restaurantName,
    String? restaurantImageUrl,
    List<OrderLine>? lines,
  }) =>
      Order(
        id: id,
        number: number,
        orderNumber: orderNumber,
        pickupCode: pickupCode,
        restaurantId: restaurantId,
        restaurantName: restaurantName ?? this.restaurantName,
        restaurantImageUrl: restaurantImageUrl ?? this.restaurantImageUrl,
        status: status ?? this.status,
        lines: lines ?? this.lines,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        vat: vat,
        discount: discount,
        address: address,
        paymentLabel: paymentLabel,
        paymentMethod: paymentMethod,
        customerNotes: customerNotes,
        placedAtLabel: placedAtLabel,
        placedAt: placedAt,
        deliveredAt: deliveredAt,
        branchLat: branchLat,
        branchLng: branchLng,
        etaLabel: etaLabel ?? this.etaLabel,
        deliveredAtLabel: deliveredAtLabel,
        couponCode: couponCode,
        captain: captain ?? this.captain,
        rating: rating ?? this.rating,
        checkoutUrl: checkoutUrl,
        paymentStatus: paymentStatus,
      );
}

class OrderLine {
  const OrderLine({
    required this.name,
    required this.quantity,
    required this.lineTotal,
    this.optionsLabel,
    this.id,
    this.menuItemId,
    this.unitPrice,
    this.notes,
  });

  final String name;
  final int quantity;
  final double lineTotal;

  /// «وسط + جبنة»
  final String? optionsLabel;

  final String? id;
  final String? menuItemId;
  final double? unitPrice;
  final String? notes;

  factory OrderLine.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((o) => (o['nameAr'] ?? o['nameEn'] ?? '') as String)
        .where((n) => n.isNotEmpty)
        .toList();

    return OrderLine(
      id: json['id'] as String?,
      menuItemId: json['menuItemId'] as String?,
      name: (json['nameAr'] ?? json['nameEn'] ?? '') as String,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: (json['unitPrice'] as num?)?.toDouble(),
      lineTotal: (json['lineTotal'] as num?)?.toDouble() ?? 0,
      notes: json['notes'] as String?,
      optionsLabel: options.isEmpty ? null : options.join(' + '),
    );
  }
}

class Captain {
  const Captain({
    required this.name,
    required this.rating,
    required this.vehicle,
    required this.lat,
    required this.lng,
    this.id,
    this.phone,
  });

  final String name;
  final double rating;

  /// «هوندا PCX»
  final String vehicle;
  final double lat;
  final double lng;
  final String? id;
  final String? phone;

  /// أول حرف — يظهر في دايرة صورة الكابتن.
  String get initial => name.isEmpty ? '؟' : name.substring(0, 1);

  /// الكابتن في الطلب مالوش إحداثيات — بنبدأ من مكان الفرع لحد ما السوكيت يبعت موقعه.
  factory Captain.fromJson(
    Map<String, dynamic> json, {
    double? fallbackLat,
    double? fallbackLng,
  }) {
    final user = json['user'] as Map<String, dynamic>?;
    final plate = json['plateNumber'] as String?;
    final vehicle = _vehicleAr(json['vehicleType'] as String?);

    return Captain(
      id: json['id'] as String?,
      name: (user?['fullName'] as String?) ?? 'الكابتن',
      phone: user?['phone'] as String?,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      vehicle: [vehicle, if (plate != null && plate.isNotEmpty) plate].join(' · '),
      lat: (json['lat'] as num?)?.toDouble() ?? fallbackLat ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? fallbackLng ?? 0,
    );
  }

  static String _vehicleAr(String? type) => switch (type) {
        'MOTORCYCLE' => 'دباب',
        'CAR' => 'سيارة',
        'BICYCLE' => 'دراجة',
        _ => 'مركبة',
      };

  Captain copyWith({double? lat, double? lng}) => Captain(
        id: id,
        name: name,
        phone: phone,
        rating: rating,
        vehicle: vehicle,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
      );
}

/// كوبون في «الكوبونات والمحفظة».
class Coupon {
  const Coupon({
    required this.code,
    required this.title,
    required this.subtitle,
    required this.badge,
    this.percent,
    this.freeDelivery = false,
    this.isUsed = false,
    this.descriptionAr,
    this.amountOff,
    this.maxDiscount,
    this.minOrderTotal,
    this.expiresAt,
  });

  final String code;

  /// «QADIR20 — على كل المطاعم»
  final String title;

  /// «حد أقصى 15 ر.س · ينتهي بعد 3 أيام»
  final String subtitle;

  /// النص في العمود الجانبي: «20%» أو «توصيل مجاني».
  final String badge;
  final int? percent;
  final bool freeDelivery;
  final bool isUsed;

  final String? descriptionAr;
  final double? amountOff;
  final double? maxDiscount;
  final double? minOrderTotal;
  final DateTime? expiresAt;

  factory Coupon.fromJson(Map<String, dynamic> json) {
    final code = (json['code'] as String?) ?? '';
    final description = (json['descriptionAr'] as String?) ?? '';
    final percent = (json['percentOff'] as num?)?.toInt();
    final amountOff = (json['amountOff'] as num?)?.toDouble();
    final maxDiscount = (json['maxDiscount'] as num?)?.toDouble();
    final minOrderTotal = (json['minOrderTotal'] as num?)?.toDouble();
    final expiresAt = _parseDate(json['expiresAt']);
    final freeDelivery = description.contains('توصيل مجاني');

    final parts = [
      if (maxDiscount != null && maxDiscount > 0) 'حد أقصى ${_money(maxDiscount)} ر.س',
      if (minOrderTotal != null && minOrderTotal > 0)
        'الحد الأدنى ${_money(minOrderTotal)} ر.س'
      else
        'بدون حد أدنى',
      if (expiresAt != null) _expiryLabel(expiresAt),
    ];

    return Coupon(
      code: code,
      title: description.isEmpty ? code : '$code — $description',
      subtitle: parts.join(' · '),
      badge: switch ((percent, freeDelivery, amountOff)) {
        (final int p, _, _) => '$p%',
        (_, true, _) => 'توصيل مجاني',
        (_, _, final double a) => '${_money(a)} ر.س',
        _ => 'خصم',
      },
      percent: percent,
      freeDelivery: freeDelivery,
      descriptionAr: description,
      amountOff: amountOff,
      maxDiscount: maxDiscount,
      minOrderTotal: minOrderTotal,
      expiresAt: expiresAt,
    );
  }

  static String _expiryLabel(DateTime expiresAt) {
    final days = expiresAt.difference(DateTime.now()).inDays;
    if (days < 0) return 'منتهي';
    if (days == 0) return 'ينتهي اليوم';
    if (days == 1) return 'ينتهي بكرة';
    return 'ينتهي بعد $days أيام';
  }

  static String _money(double value) =>
      value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
}

class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.type,
    required this.title,
    this.last4,
    this.subtitle,
  });

  final String id;
  final PaymentType type;
  final String title;

  /// آخر 4 أرقام في البطاقة.
  final String? last4;

  /// «الرصيد: 42.50 ر.س» للمحفظة.
  final String? subtitle;
}

class AppNotification {
  const AppNotification({
    required this.emoji,
    required this.title,
    required this.body,
    required this.timeLabel,
    this.isUnread = false,
    this.isToday = true,
  });

  final String emoji;
  final String title;
  final String body;
  final String timeLabel;
  final bool isUnread;
  final bool isToday;
}

// ── تنسيق التواريخ (عربي مختصر، من غير locale data) ──

DateTime? _parseDate(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.toLocal();
}

const _weekdaysAr = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

/// «9:12 PM»
String _timeLabel(DateTime dt) {
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final minute = dt.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${dt.hour < 12 ? 'AM' : 'PM'}';
}

/// «اليوم» / «أمس» / «الثلاثاء» / «3/7»
String _dayLabel(DateTime dt) {
  final now = DateTime.now();
  final days =
      DateTime(now.year, now.month, now.day).difference(DateTime(dt.year, dt.month, dt.day)).inDays;
  return switch (days) {
    0 => 'اليوم',
    1 => 'أمس',
    < 7 => _weekdaysAr[dt.weekday - 1],
    _ => '${dt.day}/${dt.month}',
  };
}

/// «اليوم 8:47 PM»
String _stampLabel(DateTime dt) => '${_dayLabel(dt)} ${_timeLabel(dt)}';

/// «غداً ٢:٣٠ م» — تسمية مختصرة لوقت تسليم مجدول.
/// عامة عشان شاشة إتمام الطلب وقائمة الطلبات يستخدموا نفس الصيغة.
String scheduleLabel(DateTime at) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(at.year, at.month, at.day);
  final diff = day.difference(today).inDays;

  final dayLabel = switch (diff) {
    0 => 'اليوم',
    1 => 'غداً',
    _ => '${at.day}/${at.month}',
  };

  final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final minute = at.minute.toString().padLeft(2, '0');
  final period = at.hour < 12 ? 'ص' : 'م';
  return '$dayLabel ${ltr('$hour12:$minute')} $period';
}
