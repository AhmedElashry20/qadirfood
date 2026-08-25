// موديل الفرع وأوقات العمل — من GET /restaurants/branches/:id و
// GET /restaurants/branch/working-hours و PATCH /restaurants/branch/status.
//
// ردود المسارات دي صفوف Prisma خام، فالـ Decimal (deliveryFee/minOrderTotal/rating)
// بيوصل كـ String — القراءة كلها بتعدّي على asMoney.
import '../core/enums.dart';
import '../core/format.dart';

/// فترة عمل واحدة في يوم — اليوم ممكن يكون فيه أكتر من فترة (صباحي ومسائي).
class WorkingHour {
  const WorkingHour({
    required this.weekday,
    required this.opensAt,
    required this.closesAt,
    this.id,
    this.isClosed = false,
    this.isRamadan = false,
  });

  /// null للفترات الجديدة اللي لسه ما اتحفظتش (السيرفر بيستبدل الجدول كله).
  final String? id;

  /// 0 = الأحد … 6 = السبت.
  final int weekday;

  /// "11:00" بنظام ٢٤ ساعة زي ما هو متخزّن.
  final String opensAt;
  final String closesAt;
  final bool isClosed;
  final bool isRamadan;

  static const _days = <String>[
    'الأحد',
    'الإثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
  ];

  String get arabicName => (weekday >= 0 && weekday < 7) ? _days[weekday] : '';

  /// «11:00 AM — 2:00 AM» أو «مغلق» — معزول bidi عشان ما ينقلبش جوّه نص عربي.
  String get label => isClosed ? 'مغلق' : ltr('${_to12h(opensAt)} — ${_to12h(closesAt)}');

  /// "23:30" → "11:30 PM" — بيرجّع النص زي ما هو لو مش بالشكل المتوقع.
  static String _to12h(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length < 2) return hhmm;
    final hour = int.tryParse(parts[0]);
    final minute = parts[1];
    if (hour == null) return hhmm;
    final period = hour < 12 ? 'AM' : 'PM';
    final display = hour % 12 == 0 ? 12 : hour % 12;
    return '$display:$minute $period';
  }

  WorkingHour copyWith({
    int? weekday,
    String? opensAt,
    String? closesAt,
    bool? isClosed,
    bool? isRamadan,
  }) =>
      WorkingHour(
        id: id,
        weekday: weekday ?? this.weekday,
        opensAt: opensAt ?? this.opensAt,
        closesAt: closesAt ?? this.closesAt,
        isClosed: isClosed ?? this.isClosed,
        isRamadan: isRamadan ?? this.isRamadan,
      );

  factory WorkingHour.fromJson(Map<String, dynamic> json) => WorkingHour(
        id: json['id'] as String?,
        weekday: asInt(json['weekday']),
        opensAt: asText(json['opensAt'], '09:00'),
        closesAt: asText(json['closesAt'], '23:00'),
        isClosed: json['isClosed'] as bool? ?? false,
        isRamadan: json['isRamadan'] as bool? ?? false,
      );

  /// الشكل اللي PATCH /restaurants/branch/working-hours بيستقبله — بدون id.
  Map<String, dynamic> toJson() => {
        'weekday': weekday,
        'opensAt': opensAt,
        'closesAt': closesAt,
        'isClosed': isClosed,
        'isRamadan': isRamadan,
      };
}

/// مستخدم على الفرع — كاشير أو مدير فرع (شاشة الإعدادات).
class BranchUser {
  const BranchUser({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.role,
    this.email,
    this.isActive = true,
  });

  final String id;
  final String fullName;
  final String phone;

  /// BRANCH_MANAGER / CASHIER.
  final String role;
  final String? email;
  final bool isActive;

  String get roleAr => switch (role) {
        'BRANCH_MANAGER' => 'مدير فرع',
        'CASHIER' => 'كاشير',
        _ => role,
      };

  /// البيانات الشخصية جوّه `user`، والدور على صف merchant_users نفسه.
  factory BranchUser.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return BranchUser(
      id: asText(json['id']),
      fullName: asText(user['fullName']),
      phone: asText(user['phone']),
      role: asText(json['role'], 'CASHIER'),
      email: user['email'] as String?,
      isActive: user['isActive'] as bool? ?? true,
    );
  }
}

class Branch {
  const Branch({
    required this.id,
    required this.nameAr,
    required this.status,
    this.restaurantNameAr = '',
    this.city = '',
    this.address = '',
    this.busyExtraMinutes = 15,
    this.avgPrepMinutes = 20,
    this.deliveryFee = 0,
    this.minOrderTotal = 0,
    this.rating = 0,
    this.ratingCount = 0,
    this.isActive = true,
    this.todayOrders,
    this.lat,
    this.lng,
    this.workingHours = const [],
  });

  final String id;
  final String nameAr;

  /// من `restaurant.nameAr` — بيرجع مع GET /restaurants/branches/:id بس.
  final String restaurantNameAr;
  final String city;
  final String address;
  final BranchStatus status;

  /// الدقايق اللي بتتضاف لوقت التحضير في وضع «مشغول» (١٥ لـ ٣٠).
  final int busyExtraMinutes;
  final int avgPrepMinutes;
  final double deliveryFee;
  final double minOrderTotal;
  final double rating;
  final int ratingCount;
  final bool isActive;

  /// عدد طلبات النهارده — الـ API مابيرجعوش مع الفرع، فبيفضل null لحد ما
  /// الشاشة تجيبه من تقرير اليوم (GET /reports/merchant?range=today).
  final int? todayOrders;

  /// من أعمدة PostGIS — بيرجعوا مع GET /restaurants/branches/:id بس،
  /// و null في رد PATCH /restaurants/branch/status.
  final double? lat;
  final double? lng;

  final List<WorkingHour> workingHours;

  bool get isReceiving => status.isReceiving;

  Branch copyWith({
    BranchStatus? status,
    int? busyExtraMinutes,
    int? todayOrders,
    List<WorkingHour>? workingHours,
  }) =>
      Branch(
        id: id,
        nameAr: nameAr,
        restaurantNameAr: restaurantNameAr,
        city: city,
        address: address,
        status: status ?? this.status,
        busyExtraMinutes: busyExtraMinutes ?? this.busyExtraMinutes,
        avgPrepMinutes: avgPrepMinutes,
        deliveryFee: deliveryFee,
        minOrderTotal: minOrderTotal,
        rating: rating,
        ratingCount: ratingCount,
        isActive: isActive,
        todayOrders: todayOrders ?? this.todayOrders,
        lat: lat,
        lng: lng,
        workingHours: workingHours ?? this.workingHours,
      );

  factory Branch.fromJson(Map<String, dynamic> json) {
    final restaurant = (json['restaurant'] as Map<String, dynamic>?) ?? const {};
    return Branch(
      id: asText(json['id']),
      nameAr: asText(json['nameAr']),
      restaurantNameAr: asText(restaurant['nameAr']),
      city: asText(json['city']),
      address: asText(json['address']),
      status: BranchStatus.fromWire(asText(json['status'], 'CLOSED')),
      busyExtraMinutes: asInt(json['busyExtraMinutes'], 15),
      avgPrepMinutes: asInt(json['avgPrepMinutes'], 20),
      deliveryFee: asMoney(json['deliveryFee']),
      minOrderTotal: asMoney(json['minOrderTotal']),
      rating: asMoney(json['rating']),
      ratingCount: asInt(json['ratingCount']),
      isActive: json['isActive'] as bool? ?? true,
      todayOrders: asIntOrNull(json['todayOrders']),
      lat: asMoneyOrNull(json['lat']),
      lng: asMoneyOrNull(json['lng']),
      workingHours: [
        for (final raw in (json['workingHours'] as List<dynamic>? ?? const []))
          WorkingHour.fromJson(raw as Map<String, dynamic>),
      ],
    );
  }
}
