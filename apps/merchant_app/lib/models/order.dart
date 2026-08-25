// موديل الطلب من وجهة نظر المطعم — بيتبني من ردود /orders/incoming و /orders/active
// و /orders و /orders/:id.
//
// تحذير مهم على شكل الـ JSON: مسارَي incoming/active بيرجّعوا صفوف Prisma خام،
// يعني المبالغ (Decimal) بتوصل كـ String ومافيش lat/lng على الفرع والعنوان.
// بينما /orders و /orders/:id بيمرّوا على mapOrder() في السيرفر فبيرجّعوا أرقام.
// كل القراءات هنا بتعدّي على asMoney/asInt عشان الشكلين يشتغلوا مع بعض.
import '../core/enums.dart';
import '../core/format.dart';

/// الكابتن المرتبط بالطلب — بيظهر في كارت «جاهز للاستلام».
class MerchantCaptain {
  const MerchantCaptain({
    required this.id,
    required this.name,
    required this.phone,
    this.plateNumber,
    this.vehicleType,
    this.rating = 0,
  });

  final String id;
  final String name;
  final String phone;
  final String? plateNumber;
  final String? vehicleType;
  final double rating;

  /// الاسم والتليفون جايين من `captain.user` مش من `captain` نفسه.
  factory MerchantCaptain.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return MerchantCaptain(
      id: asText(json['id']),
      name: asText(user['fullName']),
      phone: asText(user['phone']),
      plateNumber: json['plateNumber'] as String?,
      vehicleType: json['vehicleType'] as String?,
      rating: asMoney(json['rating']),
    );
  }
}

/// صنف داخل الطلب — snapshot وقت الطلب، مش الصنف الحالي في المنيو.
class MerchantOrderItem {
  const MerchantOrderItem({
    required this.id,
    required this.nameAr,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.notes,
    this.optionsLabel = '',
  });

  final String id;
  final String nameAr;
  final int quantity;
  final double unitPrice;
  final double lineTotal;
  final String? notes;

  /// الخيارات مجمّعة في سطر واحد: «وسط + جبنة».
  final String optionsLabel;

  bool get hasOptions => optionsLabel.isNotEmpty;
  bool get hasNotes => notes != null && notes!.trim().isNotEmpty;

  factory MerchantOrderItem.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((o) => asText(o['nameAr']))
        .where((name) => name.isNotEmpty)
        .toList();

    return MerchantOrderItem(
      id: asText(json['id']),
      nameAr: asText(json['nameAr']),
      quantity: asInt(json['quantity'], 1),
      unitPrice: asMoney(json['unitPrice']),
      lineTotal: asMoney(json['lineTotal']),
      notes: json['notes'] as String?,
      optionsLabel: options.join(' + '),
    );
  }
}

class MerchantOrder {
  const MerchantOrder({
    required this.id,
    required this.number,
    required this.pickupCode,
    required this.status,
    required this.channel,
    required this.customerName,
    required this.customerPhone,
    required this.items,
    required this.subtotal,
    required this.deliveryFee,
    required this.discount,
    required this.vat,
    required this.total,
    required this.paymentMethod,
    required this.paymentLabel,
    required this.isPrepaid,
    required this.placedAt,
    this.customerNotes,
    this.prepMinutes,
    this.rejectReason,
    this.acceptedAt,
    this.readyAt,
    this.deliveredAt,
    this.captain,
    this.addressLine = '',
    this.addressNotes,
  });

  final String id;

  /// `orderNumber` — «A-1010».
  final String number;
  final String pickupCode;
  final OrderStatus status;
  final OrderChannel channel;
  final String customerName;
  final String customerPhone;
  final List<MerchantOrderItem> items;

  final double subtotal;
  final double deliveryFee;
  final double discount;
  final double vat;
  final double total;

  /// الكود الخام زي ما جه من السيرفر (CASH / MADA / …).
  final String paymentMethod;

  /// نفس الطريقة بالعربي — «نقدي» / «مدى».
  final String paymentLabel;

  /// مدفوع مقدماً: الحالة PAID أو أي وسيلة غير الكاش — المطعم مايحصّلش فلوس.
  final bool isPrepaid;

  final String? customerNotes;
  final int? prepMinutes;
  final String? rejectReason;

  final DateTime placedAt;
  final DateTime? acceptedAt;
  final DateTime? readyAt;
  final DateTime? deliveredAt;

  final MerchantCaptain? captain;

  /// سطر العنوان المختصر: «البيت · النرجس · شارع الأمير سلطان».
  final String addressLine;
  final String? addressNotes;

  // ── مساعدات للشاشات ──

  /// مجموع الكميات — مش عدد السطور.
  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  bool get hasNotes => customerNotes != null && customerNotes!.trim().isNotEmpty;

  /// الدقايق اللي عدّت من لحظة القبول — صفر لو الطلب لسه ما اتقبلش.
  int get elapsedMinutes {
    final accepted = acceptedAt;
    if (accepted == null) return 0;
    final elapsed = DateTime.now().difference(accepted).inMinutes;
    return elapsed < 0 ? 0 : elapsed;
  }

  /// الدقايق الفاضلة من وقت التحضير — بتبقى بالسالب لو الطلب اتأخّر.
  int get remainingMinutes => (prepMinutes ?? 0) - elapsedMinutes;

  /// عدّى وقت التحضير المتفق عليه.
  bool get isLate => prepMinutes != null && remainingMinutes < 0;

  /// نسبة تقدّم التحضير من 0 لـ 1 — للشريط الدائري في كارت الطلب.
  double get progress {
    final planned = prepMinutes;
    if (planned == null || planned <= 0) return 0;
    return (elapsedMinutes / planned).clamp(0.0, 1.0);
  }

  /// الدقايق من لحظة وصول الطلب — عداد الطلبات الواردة.
  int get minutesSincePlaced {
    final since = DateTime.now().difference(placedAt).inMinutes;
    return since < 0 ? 0 : since;
  }

  factory MerchantOrder.fromJson(Map<String, dynamic> json) {
    final customer = (json['customer'] as Map<String, dynamic>?) ?? const {};
    // بيانات العميل الحقيقية على customer.user — موديل Customer نفسه مافيهوش اسم ولا تليفون.
    final customerUser = (customer['user'] as Map<String, dynamic>?) ?? const {};
    final address = json['address'] as Map<String, dynamic>?;
    final captain = json['captain'] as Map<String, dynamic>?;

    final method = asText(json['paymentMethod'], 'CASH');
    final paymentStatus = asText(json['paymentStatus']);
    final deliveryFee = asMoney(json['deliveryFee']);

    return MerchantOrder(
      id: asText(json['id']),
      number: asText(json['orderNumber']),
      pickupCode: asText(json['pickupCode']),
      status: OrderStatus.fromWire(asText(json['status'], 'PENDING')),
      channel: _channelOf(address: address, deliveryFee: deliveryFee),
      customerName: asText(customerUser['fullName'], asText(customer['fullName'])),
      customerPhone: asText(customerUser['phone'], asText(customer['phone'])),
      items: [
        for (final raw in (json['items'] as List<dynamic>? ?? const []))
          MerchantOrderItem.fromJson(raw as Map<String, dynamic>),
      ],
      subtotal: asMoney(json['subtotal']),
      deliveryFee: deliveryFee,
      discount: asMoney(json['discount']),
      vat: asMoney(json['vat']),
      total: asMoney(json['total']),
      paymentMethod: method,
      paymentLabel: _paymentLabel(method),
      isPrepaid: paymentStatus == 'PAID' || method != 'CASH',
      customerNotes: json['customerNotes'] as String?,
      prepMinutes: asIntOrNull(json['prepMinutes']),
      rejectReason: json['rejectReason'] as String?,
      placedAt: asDate(json['placedAt']) ?? DateTime.now(),
      acceptedAt: asDate(json['acceptedAt']),
      readyAt: asDate(json['readyAt']),
      deliveredAt: asDate(json['deliveredAt']),
      captain: captain == null ? null : MerchantCaptain.fromJson(captain),
      addressLine: _addressLine(address),
      addressNotes: address?['notes'] as String?,
    );
  }

  /// قاعدة تحديد نوع الاستلام:
  /// السيرفر لسه مافيهوش مفهوم «استلام من الفرع» — عمود `addressId` في جدول orders
  /// إلزامي، يعني كل طلب حالياً بيرجع ومعاه عنوان = توصيل. بنعتبره توصيل لو فيه
  /// عنوان أو رسوم توصيل أكبر من صفر، وغير كده استلام من الفرع. كده الموديل جاهز
  /// لو الباك إند ضاف الـ pickup بعدين من غير ما نلمس الشاشات.
  static OrderChannel _channelOf({
    required Map<String, dynamic>? address,
    required double deliveryFee,
  }) =>
      (address != null || deliveryFee > 0) ? OrderChannel.delivery : OrderChannel.pickup;

  static String _paymentLabel(String method) => switch (method) {
        'CASH' => 'نقدي',
        'MADA' => 'مدى',
        'APPLE_PAY' => 'Apple Pay',
        'CARD' => 'بطاقة',
        'WALLET' => 'المحفظة',
        _ => method,
      };

  /// «البيت · النرجس · شارع الأمير سلطان» — بنتخطى الأجزاء الفاضية.
  static String _addressLine(Map<String, dynamic>? address) {
    if (address == null) return '';
    return [
      asText(address['label']),
      asText(address['district']),
      asText(address['street']),
    ].where((part) => part.trim().isNotEmpty).join(' · ');
  }
}
